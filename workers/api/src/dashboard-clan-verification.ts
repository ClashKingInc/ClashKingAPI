import { ClanVerification, type EndpointResponse, ClanVerificationEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { WorkerBindings } from "./environment.js"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { correctTag } from "./home.js"

export const verificationWords = ["apple", "tiger", "lemon", "mango", "peach", "berry", "panda", "zebra", "otter", "eagle", "maple", "river", "ocean", "beach", "cloud", "forest", "garden", "planet", "rocket", "candle"] as const
interface VerificationRow {
  server_id: string; clan_tag: string; challenge_id: string; marker: string; marker_index: number;
  state: "pending" | "verified" | "expired"; check_after: Date | string; expires_at: Date | string;
  last_checked_at: Date | string | null; verified_at: Date | string | null;
}
const timestamp = (value: Date | string | null) => value === null ? null : new Date(value).toISOString()
const status = (row?: VerificationRow): typeof ClanVerification.Type => row ? {
  state: row.state, marker: row.state === "pending" ? row.marker : null,
  checkAfter: timestamp(row.check_after), expiresAt: timestamp(row.expires_at),
  lastCheckedAt: timestamp(row.last_checked_at), verifiedAt: timestamp(row.verified_at),
} : { state: "unverified", marker: null, checkAfter: null, expiresAt: null, lastCheckedAt: null, verifiedAt: null }
const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Clan verification could not be saved" })
const description = (bindings: WorkerBindings, tag: string) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/clans/${encodeURIComponent(tag)}?verification=${crypto.randomUUID()}`, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15_000) })),
    catch: cause => new UpstreamUnavailable({ cause, message: "Clash of Clans is temporarily unavailable; verification will retry" }),
  })
  if (!response.ok) {
    yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: cause => new UpstreamUnavailable({ cause, message: "Clan verification lookup failed" }) })
    return yield* new UpstreamUnavailable({ cause: response.status, message: "Clan description could not be checked; verification will retry" })
  }
  const raw = yield* Effect.tryPromise({ try: () => response.json(), catch: cause => new UpstreamUnavailable({ cause, message: "Clan description lookup returned invalid JSON" }) })
  const clan = yield* Schema.decodeUnknownEffect(Schema.Struct({ tag: Schema.String, description: Schema.String }))(raw).pipe(Effect.mapError(cause => new UpstreamUnavailable({ cause, message: "Clan description lookup was invalid" })))
  if (clan.tag !== tag) return yield* new UpstreamUnavailable({ cause: "Clan tag mismatch", message: "Clan description lookup was invalid" })
  return clan.description
})
const scope = (serverId: string, rawTag: string) => Effect.gen(function* () {
  const tag = correctTag(rawTag)
  if (!/^#[0289PYLQGRJCUV]{3,15}$/u.test(tag)) return yield* new InvalidRequest({ message: "Invalid clan tag" })
  const sql = yield* SqlClient.SqlClient
  if (!(yield* sql`SELECT tag FROM server_clans WHERE server_id=${serverId} AND tag=${tag}`).length) return yield* new NotFound({ message: "Clan is not configured on this server" })
  return tag
})
export const readClanVerification = (serverId: string, rawTag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, tag = yield* scope(serverId, rawTag)
  yield* sql`UPDATE server_clan_verifications SET state='expired' WHERE server_id=${serverId} AND clan_tag=${tag} AND state='pending' AND expires_at<=clock_timestamp()`
  return status((yield* sql<VerificationRow>`SELECT * FROM server_clan_verifications WHERE server_id=${serverId} AND clan_tag=${tag}`)[0])
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))

export const startClanVerification = (bindings: WorkerBindings, serverId: string, rawTag: string, actor: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, tag = yield* scope(serverId, rawTag)
  return yield* sql.withTransaction(Effect.gen(function* () {
    // Serialize starts across servers for this clan so active words cannot collide.
    yield* sql`SELECT tag FROM basic_clan WHERE tag=${tag} FOR UPDATE`
    yield* sql`UPDATE server_clan_verifications SET state='expired' WHERE clan_tag=${tag} AND state='pending' AND expires_at<=clock_timestamp()`
    if (!(yield* sql`SELECT tag FROM server_clans WHERE server_id=${serverId} AND tag=${tag} FOR UPDATE`).length) return yield* new NotFound({ message: "Clan is not configured on this server" })
    const prior = (yield* sql<VerificationRow>`SELECT * FROM server_clan_verifications WHERE server_id=${serverId} AND clan_tag=${tag}`)[0]
    if (prior?.state === "verified" || (prior?.state === "pending" && Date.parse(timestamp(prior.expires_at)!) > Date.now())) return status(prior)
    const current = (yield* description(bindings, tag)).toLowerCase()
    const reserved = new Set((yield* sql<{marker:string}>`SELECT marker FROM server_clan_verifications WHERE clan_tag=${tag} AND state='pending' AND server_id<>${serverId}`).map(row => row.marker))
    let index = prior ? (prior.marker_index + 1) % verificationWords.length : crypto.getRandomValues(new Uint32Array(1))[0]! % verificationWords.length
    for (let n = 0; n < verificationWords.length && (current.includes(`${verificationWords[index]}ck`) || reserved.has(`${verificationWords[index]}ck`)); n++) index = (index + 1) % verificationWords.length
    const id = crypto.randomUUID(), marker = `${verificationWords[index]}ck`
    if (current.includes(marker) || reserved.has(marker)) return yield* new InvalidRequest({ message: "No unused verification word is available. Remove old verification words from the description or wait for pending checks to expire." })
    const rows = yield* sql<VerificationRow>`INSERT INTO server_clan_verifications(server_id,clan_tag,challenge_id,marker,marker_index,requested_by,check_after,next_check_at,expires_at)
      VALUES(${serverId},${tag},${id}::uuid,${marker},${index},${actor},now()+interval '2 minutes',now()+interval '2 minutes',now()+interval '30 minutes')
      ON CONFLICT(server_id,clan_tag) DO UPDATE SET challenge_id=EXCLUDED.challenge_id,marker=EXCLUDED.marker,marker_index=EXCLUDED.marker_index,
        requested_by=EXCLUDED.requested_by,state='pending',started_at=now(),check_after=EXCLUDED.check_after,next_check_at=EXCLUDED.next_check_at,
        expires_at=EXCLUDED.expires_at,last_checked_at=NULL,verified_at=NULL RETURNING *`
    return status(rows[0]!)
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))

export const checkClanVerification = (bindings: WorkerBindings, serverId: string, rawTag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, tag = yield* scope(serverId, rawTag)
  // Claim a one-minute lease before upstream I/O. Polls and cron cannot flood checks.
  const row = (yield* sql<VerificationRow>`UPDATE server_clan_verifications SET next_check_at=clock_timestamp()+interval '1 minute'
    WHERE server_id=${serverId} AND clan_tag=${tag} AND state='pending' AND next_check_at<=clock_timestamp() AND expires_at>clock_timestamp() RETURNING *`)[0]
  if (!row) return yield* readClanVerification(serverId, tag)
  const current = yield* description(bindings, tag)
  const matched = new RegExp(`(?:^|[^\\p{L}\\p{N}])${row.marker}(?:$|[^\\p{L}\\p{N}])`, "iu").test(current)
  // A late response cannot accept an expired, replaced or deleted challenge.
  yield* sql`UPDATE server_clan_verifications SET last_checked_at=clock_timestamp(),
    state=CASE WHEN ${matched} THEN 'verified' ELSE state END,
    verified_at=CASE WHEN ${matched} THEN clock_timestamp() ELSE verified_at END
    WHERE server_id=${serverId} AND clan_tag=${tag} AND challenge_id=${row.challenge_id}::uuid AND state='pending' AND expires_at>clock_timestamp()`
  return yield* readClanVerification(serverId, tag)
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))

export const runClanVerificationChecks = (bindings: WorkerBindings) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`UPDATE server_clan_verifications SET state='expired' WHERE state='pending' AND expires_at<=clock_timestamp()`
  const due = yield* sql<{server_id:string;clan_tag:string}>`SELECT server_id,clan_tag FROM server_clan_verifications WHERE state='pending' AND next_check_at<=clock_timestamp() ORDER BY next_check_at LIMIT 20`
  yield* Effect.forEach(due, row => checkClanVerification(bindings,row.server_id,row.clan_tag).pipe(Effect.catch(() => Effect.sync(() => console.error(JSON.stringify({ event: "clan_verification_check_failed", serverId: row.server_id, clanTag: row.clan_tag }))))), { concurrency: 4, discard: true })
})
export const executeClanVerification = (input: DashboardServerOperationInput): Effect.Effect<EndpointResponse<typeof ClanVerificationEndpoint>, ApiFailure, SqlClient.SqlClient> => {
  const serverId = String(input.path.serverId), tag = String(input.path.clanTag)
  if (input.endpoint.operationId === "clanVerification") return readClanVerification(serverId,tag)
  if (input.principal.kind !== "user") return Effect.fail(new Forbidden({ message: "An authenticated dashboard user is required" }))
  return input.endpoint.operationId === "startClanVerification" ? startClanVerification(input.bindings,serverId,tag,input.principal.userId) : checkClanVerification(input.bindings,serverId,tag)
}
