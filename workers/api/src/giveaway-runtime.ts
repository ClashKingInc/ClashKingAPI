import { DecimalSnowflake } from "@clashking/api-contracts"
import { GiveawayEnterResponse } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, Forbidden, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

interface Receipt {
  readonly giveaway_id: string; readonly server_id: string; readonly actor_user_id: string
  readonly channel_id: string; readonly message_id: string; readonly request_hash: string
  readonly outcome: "entered" | "already_entered" | "left" | "already_left"; readonly committed_entry_count: string | number
}
interface GiveawayScope {
  readonly id: string; readonly server_id: string; readonly channel_id: string | null; readonly message_id: string | null
  readonly status: string; readonly accepting: boolean; readonly roles_mode: string; readonly roles: readonly string[]
  readonly profile_picture_required: boolean; readonly coc_account_required: boolean
}
const Member = Schema.Struct({
  roles: Schema.Array(DecimalSnowflake),
  user: Schema.Struct({ id: DecimalSnowflake, avatar: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
})

export const giveawayRolesPermit = (mode: string, required: readonly string[], actual: readonly string[]) => {
  const match = required.some((role) => actual.includes(role))
  return mode === "none" || mode === "allow" && match || mode === "deny" && !match
}
const bindGiveaway = (row: GiveawayScope, proof: VerifiedRuntimeInteraction) =>
  row.server_id === proof.guildId && row.channel_id === proof.channelId && row.message_id === proof.messageId
    ? Effect.void : Effect.fail(new Forbidden({ message: "Interaction does not belong to this giveaway message", reason: "wrong_message" }))

const canLeaveGiveaway = (giveawayId: string, actorId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<{ can_leave: boolean }>`SELECT status='ongoing' AND NOT disabled
    AND start_time <= clock_timestamp() AND end_time > clock_timestamp()
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(entries) entry
      WHERE entry=to_jsonb(${actorId}::text) OR entry->>'user_id'=${actorId}) AS can_leave
    FROM giveaways WHERE id=${giveawayId}`)[0]
  return row?.can_leave === true
})

const receiptResult = (row: Receipt, giveawayId: string, proof: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  if (row.giveaway_id !== giveawayId || row.server_id !== proof.guildId || row.actor_user_id !== proof.actorId ||
    row.channel_id !== proof.channelId || row.message_id !== proof.messageId || row.request_hash !== proof.requestHash) {
    return yield* new Conflict({ message: "Interaction identity has already been used for a different request" })
  }
  return yield* Schema.decodeUnknownEffect(GiveawayEnterResponse)({
    giveawayId, outcome: row.outcome, entryCount: Number(row.committed_entry_count),
    canLeave: yield* canLeaveGiveaway(giveawayId, proof.actorId),
  }).pipe(Effect.mapError(() => new DatabaseFailure({ cause: undefined, message: "Stored giveaway receipt is invalid" })))
})

/** The entry and exact replay receipt commit together without changing the message revision. */
export const enterGiveaway = (giveawayId: string, proof: VerifiedRuntimeInteraction, applicationId: string): Effect.Effect<
  typeof GiveawayEnterResponse.Type, ApiFailure, SqlClient.SqlClient | DiscordApi
> => Effect.gen(function* () {
  const leaveRoot = new RegExp(`^ck:giveaway:leave:${giveawayId}:([0-9]{1,20})$`, "u").exec(proof.data.custom_id ?? "")?.[1]
  const leaving = leaveRoot !== undefined
  if (proof.type !== 3 || proof.data.component_type !== 2 || proof.messageId === undefined ||
    (!leaving && proof.data.custom_id !== `ck:giveaway:enter:${giveawayId}`) ||
    (leaving && proof.messageAuthorId !== applicationId)) {
    return yield* new Forbidden({ message: "A matching giveaway button is required", reason: "wrong_message" })
  }
  // The leave button lives on our private response, not the public giveaway
  // post. Its signed custom ID carries that post ID; never trust a body actor.
  const bind = (row: GiveawayScope) => bindGiveaway(row, leaving ? { ...proof, messageId: leaveRoot } : proof)
  const sql = yield* SqlClient.SqlClient
  const readReceipt = () => sql<Receipt>`SELECT giveaway_id, server_id, actor_user_id, channel_id, message_id,
    request_hash, outcome, committed_entry_count FROM giveaway_entry_receipts WHERE interaction_id=${proof.id}`
  const previous = (yield* readReceipt())[0]
  if (previous !== undefined) return yield* receiptResult(previous, giveawayId, proof)
  yield* requireFreshInteraction(proof)
  // Verify scope before making any Discord request; repeat under the write lock.
  const current = (yield* sql<GiveawayScope>`SELECT id,server_id,channel_id,message_id,status,
    NOT disabled AND start_time <= clock_timestamp() AND end_time > clock_timestamp() AS accepting,
    roles_mode,roles,profile_picture_required,coc_account_required FROM giveaways WHERE id=${giveawayId}`)[0]
  if (current === undefined) return yield* new NotFound({ message: "Giveaway not found" })
  yield* bind(current)
  const wasEntered = (yield* sql<{ entered: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways,
    LATERAL jsonb_array_elements(entries) AS entry WHERE id=${giveawayId}
    AND (entry = to_jsonb(${proof.actorId}::text) OR entry->>'user_id'=${proof.actorId})) AS entered`)[0]?.entered === true
  const discord = yield* DiscordApi
  const member = leaving || wasEntered ? undefined : yield* discord.request(`/guilds/${proof.guildId}/members/${proof.actorId}`).pipe(
    Effect.catchTag("NotFound", () => Effect.fail(new Forbidden({ message: "You must be a current server member", reason: "not_member" }))),
    Effect.flatMap((value) => Schema.decodeUnknownEffect(Member)(value).pipe(
      Effect.mapError(() => new UpstreamUnavailable({ cause: undefined, message: "Discord member response is invalid" })),
    )),
  )
  if (member !== undefined && member.user.id !== proof.actorId) return yield* new Forbidden({ message: "Discord member identity mismatch" })
  return yield* sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<GiveawayScope>`SELECT id,server_id,channel_id,message_id,status,
      NOT disabled AND start_time <= clock_timestamp() AND end_time > clock_timestamp() AS accepting,
      roles_mode,roles,profile_picture_required,coc_account_required FROM giveaways WHERE id=${giveawayId} FOR UPDATE`)[0]
    if (row === undefined) return yield* new NotFound({ message: "Giveaway not found" })
    yield* bind(row)
    const replay = (yield* readReceipt())[0]
    if (replay !== undefined) return yield* receiptResult(replay, giveawayId, proof)
    yield* requireFreshInteraction(proof)
    const already = (yield* sql<{ entered: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways,
      LATERAL jsonb_array_elements(entries) AS entry WHERE id=${giveawayId}
      AND (entry = to_jsonb(${proof.actorId}::text) OR entry->>'user_id'=${proof.actorId})) AS entered`)[0]?.entered === true
    // Checking existing membership first lets repeat clicks confirm an entry
    // even after close. No join/leave mutation is allowed after closeout starts.
    if ((leaving && already) || (!leaving && !already)) {
      if (row.status !== "ongoing" || !row.accepting) return yield* new Conflict({ message: "Giveaway entries are closed", reason: "not_open" })
    }
    if (leaving && already) {
      yield* sql`UPDATE giveaways SET entries=COALESCE((SELECT jsonb_agg(entry ORDER BY ordinal)
        FROM jsonb_array_elements(entries) WITH ORDINALITY AS items(entry,ordinal)
        WHERE entry <> to_jsonb(${proof.actorId}::text) AND (entry->>'user_id') IS DISTINCT FROM ${proof.actorId}), '[]'::jsonb)
        WHERE id=${giveawayId}`
    }
    if (!leaving && !already) {
    if (member === undefined) return yield* new Conflict({ message: "Giveaway participation changed; please retry" })
    if (!["none", "allow", "deny"].includes(row.roles_mode)) return yield* new Conflict({ message: "Giveaway role configuration is invalid", reason: "invalid_configuration" })
    if (!giveawayRolesPermit(row.roles_mode, row.roles, member.roles)) return yield* new Forbidden({ message: "Your current roles do not meet the giveaway requirements", reason: "roles" })
    if (row.profile_picture_required && !member.user.avatar) return yield* new Forbidden({ message: "A Discord profile picture is required", reason: "avatar" })
    if (row.coc_account_required) {
      const linked = (yield* sql<{ linked: boolean }>`SELECT EXISTS(SELECT 1 FROM player_links WHERE user_id=${proof.actorId}) AS linked`)[0]?.linked
      if (!linked) return yield* new Forbidden({ message: "A linked Clash account is required", reason: "linked_account" })
    }
    yield* sql`UPDATE giveaways SET entries=entries || jsonb_build_array(${proof.actorId}::text) WHERE id=${giveawayId}`
    }
    const count = (yield* sql<{ count: number }>`SELECT jsonb_array_length(entries) AS count FROM giveaways WHERE id=${giveawayId}`)[0]?.count
    if (count === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Giveaway entry count is unavailable" })
    const outcome = leaving ? (already ? "left" as const : "already_left" as const) : (already ? "already_entered" as const : "entered" as const)
    yield* sql`INSERT INTO giveaway_entry_receipts(interaction_id,giveaway_id,server_id,actor_user_id,channel_id,message_id,
      request_hash,outcome,committed_entry_count) VALUES(${proof.id},${giveawayId},${proof.guildId},${proof.actorId},
      ${proof.channelId},${proof.messageId!},${proof.requestHash},${outcome},${count})`
    return { giveawayId, outcome, entryCount: count, canLeave: !leaving && row.status === "ongoing" && row.accepting }
  }))
}).pipe(Effect.catchTag("SqlError", () => Effect.fail(new DatabaseFailure({ cause: undefined, message: "Giveaway entry storage is unavailable" }))))
