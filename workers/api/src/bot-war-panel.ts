import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { loadArchiveWars } from "./war-archive.js"
import { officialArchiveWar } from "./war-archive-model.js"
import { readBoundedJson } from "./request-body.js"

const snowflake = /^[0-9]{15,20}$/u
const clanTag = /^#[A-Z0-9]{3,15}$/u

// The signed Discord interaction supplies the guild, panel message, and clan.
// The bot token alone is insufficient: the panel must still be configured and
// bound to that exact message in the requesting guild.
export const dispatchBotWarPanel = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const path = new URL(request.url).pathname
  const match = /^\/v2\/bot\/war-panel\/([^/]+)\/([^/]+)\/([^/]+)$/u.exec(path)
  if (!match) return undefined
  const serverId = match[1]!, messageId = match[2]!
  let tag: string
  try { tag = decodeURIComponent(match[3]!) } catch { return yield* new InvalidRequest({ message: "Invalid clan tag" }) }
  if (!snowflake.test(serverId) || !snowflake.test(messageId) || !clanTag.test(tag)) {
    return yield* new InvalidRequest({ message: "Invalid war panel identity" })
  }
  const auth = yield* AuthIdentity
  yield* auth.requireBot(request)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ active_war_id: string }>`SELECT active_war_id FROM server_logs
    WHERE server_id = ${serverId} AND clan_tag = ${tag} AND type = 'war_panel'
      AND message_id = ${messageId} AND disabled = false AND active_war_id IS NOT NULL LIMIT 1`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "War panel lookup failed" })))
  const identity = rows[0]?.active_war_id
  if (!identity) return yield* new NotFound({ message: "War panel is no longer active" })
  const prep = Number(identity.slice(identity.lastIndexOf("-") + 1))
  if (!Number.isSafeInteger(prep) || prep <= 0 || !identity.startsWith(`${tag}v`)) {
    return yield* new NotFound({ message: "War panel identity is invalid" })
  }
  const archived = yield* sql<{ war_id: string }>`SELECT war_id::text FROM wars
    WHERE (clan_tag = ${tag} OR opponent_tag = ${tag})
      AND prep_time BETWEEN ${new Date((prep - 1) * 1000)} AND ${new Date((prep + 1) * 1000)}
    ORDER BY prep_time DESC LIMIT 1`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "War archive lookup failed" })))
  if (archived[0]) {
    const war = (yield* loadArchiveWars([archived[0].war_id])).get(archived[0].war_id)
    if (war) return Response.json({ war: officialArchiveWar(war, tag), identity })
  }
  const schedule = yield* sql<{ war_tag: string | null }>`SELECT war_tag FROM war_schedule
    WHERE source_clan_tag = ${tag}
      AND prep_time BETWEEN ${new Date((prep - 1) * 1000)} AND ${new Date((prep + 1) * 1000)}
    ORDER BY prep_time DESC LIMIT 1`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Current war lookup failed" })))
  const warTag = schedule[0]?.war_tag
  const upstreamPath = warTag
    ? `clanwarleagues/wars/${encodeURIComponent(warTag)}`
    : `clans/${encodeURIComponent(tag)}/currentwar`
  const upstream = yield* Effect.tryPromise({
    try: () => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy/v1/${upstreamPath}`)),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Current war fetch failed" }),
  })
  if (!upstream.ok) {
    yield* Effect.promise(() => upstream.body?.cancel().catch(() => undefined) ?? Promise.resolve())
    return yield* new NotFound({ message: "War is unavailable" })
  }
  const war = yield* readBoundedJson(upstream, 2_000_000)
  if (typeof war !== "object" || war === null || Array.isArray(war)) return yield* new NotFound({ message: "War is unavailable" })
  const payload = war as { preparationStartTime?: unknown; clan?: { tag?: unknown }; opponent?: { tag?: unknown } }
  const rawTime = payload.preparationStartTime
  const normalized = typeof rawTime === "string" ? rawTime.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.\d{3}Z$/u, "$1-$2-$3T$4:$5:$6.000Z") : ""
  const actualPrep = Date.parse(normalized) / 1000
  const opponentTag = identity.slice(tag.length + 1, identity.lastIndexOf("-"))
  if (actualPrep !== prep || ![payload.clan?.tag, payload.opponent?.tag].includes(tag)
    || ![payload.clan?.tag, payload.opponent?.tag].includes(opponentTag)) {
    return yield* new NotFound({ message: "War panel points to a different war" })
  }
  return Response.json({ war, identity })
})
