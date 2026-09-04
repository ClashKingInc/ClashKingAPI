import { DecimalSnowflake, GiveawayEnterResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, Forbidden, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

interface Receipt {
  readonly giveaway_id: string; readonly server_id: string; readonly actor_user_id: string
  readonly channel_id: string; readonly message_id: string; readonly request_hash: string
  readonly outcome: "entered" | "already_entered"; readonly committed_entry_count: string | number
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

const receiptResult = (row: Receipt, giveawayId: string, proof: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  if (row.giveaway_id !== giveawayId || row.server_id !== proof.guildId || row.actor_user_id !== proof.actorId ||
    row.channel_id !== proof.channelId || row.message_id !== proof.messageId || row.request_hash !== proof.requestHash) {
    return yield* new Conflict({ message: "Interaction identity has already been used for a different request" })
  }
  return yield* Schema.decodeUnknownEffect(GiveawayEnterResponse)({
    giveawayId, outcome: row.outcome, entryCount: Number(row.committed_entry_count),
  }).pipe(Effect.mapError(() => new DatabaseFailure({ cause: undefined, message: "Stored giveaway receipt is invalid" })))
})

/** The entry, count-dirty flag, and exact replay receipt commit together. */
export const enterGiveaway = (giveawayId: string, proof: VerifiedRuntimeInteraction): Effect.Effect<
  typeof GiveawayEnterResponse.Type, ApiFailure, SqlClient.SqlClient | DiscordApi
> => Effect.gen(function* () {
  if (proof.type !== 3 || proof.data.component_type !== 2 || proof.data.custom_id !== `ck:giveaway:enter:${giveawayId}` || proof.messageId === undefined) {
    return yield* new Forbidden({ message: "A matching giveaway entry button is required", reason: "wrong_message" })
  }
  const sql = yield* SqlClient.SqlClient
  const readReceipt = () => sql<Receipt>`SELECT giveaway_id, server_id, actor_user_id, channel_id, message_id,
    request_hash, outcome, committed_entry_count FROM giveaway_entry_receipts WHERE interaction_id=${proof.id}`
  const previous = (yield* readReceipt())[0]
  if (previous !== undefined) return yield* receiptResult(previous, giveawayId, proof)
  yield* requireFreshInteraction(proof)
  // Verify scope before making any Discord request; repeat under the write lock.
  const current = (yield* sql<GiveawayScope>`SELECT id,server_id,channel_id,message_id,status,
    start_time <= clock_timestamp() AND end_time > clock_timestamp() AS accepting,
    roles_mode,roles,profile_picture_required,coc_account_required FROM giveaways WHERE id=${giveawayId}`)[0]
  if (current === undefined) return yield* new NotFound({ message: "Giveaway not found" })
  yield* bindGiveaway(current, proof)
  const wasEntered = (yield* sql<{ entered: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways,
    LATERAL jsonb_array_elements(entries) AS entry WHERE id=${giveawayId}
    AND (entry = to_jsonb(${proof.actorId}::text) OR entry->>'user_id'=${proof.actorId})) AS entered`)[0]?.entered === true
  const discord = yield* DiscordApi
  const member = wasEntered ? undefined : yield* discord.request(`/guilds/${proof.guildId}/members/${proof.actorId}`).pipe(
    Effect.catchTag("NotFound", () => Effect.fail(new Forbidden({ message: "You must be a current server member", reason: "not_member" }))),
    Effect.flatMap((value) => Schema.decodeUnknownEffect(Member)(value).pipe(
      Effect.mapError(() => new UpstreamUnavailable({ cause: undefined, message: "Discord member response is invalid" })),
    )),
  )
  if (member !== undefined && member.user.id !== proof.actorId) return yield* new Forbidden({ message: "Discord member identity mismatch" })
  return yield* sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<GiveawayScope>`SELECT id,server_id,channel_id,message_id,status,
      start_time <= clock_timestamp() AND end_time > clock_timestamp() AS accepting,
      roles_mode,roles,profile_picture_required,coc_account_required FROM giveaways WHERE id=${giveawayId} FOR UPDATE`)[0]
    if (row === undefined) return yield* new NotFound({ message: "Giveaway not found" })
    yield* bindGiveaway(row, proof)
    const replay = (yield* readReceipt())[0]
    if (replay !== undefined) return yield* receiptResult(replay, giveawayId, proof)
    yield* requireFreshInteraction(proof)
    if (row.status !== "ongoing" || !row.accepting) return yield* new Conflict({ message: "Giveaway is not accepting entries", reason: "not_open" })
    const already = (yield* sql<{ entered: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways,
      LATERAL jsonb_array_elements(entries) AS entry WHERE id=${giveawayId}
      AND (entry = to_jsonb(${proof.actorId}::text) OR entry->>'user_id'=${proof.actorId})) AS entered`)[0]?.entered === true
    if (!already) {
    if (member === undefined) return yield* new Conflict({ message: "Giveaway participation changed; please retry" })
    if (!["none", "allow", "deny"].includes(row.roles_mode)) return yield* new Conflict({ message: "Giveaway role configuration is invalid", reason: "invalid_configuration" })
    if (!giveawayRolesPermit(row.roles_mode, row.roles, member.roles)) return yield* new Forbidden({ message: "Your current roles do not meet the giveaway requirements", reason: "roles" })
    if (row.profile_picture_required && !member.user.avatar) return yield* new Forbidden({ message: "A Discord profile picture is required", reason: "avatar" })
    if (row.coc_account_required) {
      const linked = (yield* sql<{ linked: boolean }>`SELECT EXISTS(SELECT 1 FROM player_links WHERE user_id=${proof.actorId}) AS linked`)[0]?.linked
      if (!linked) return yield* new Forbidden({ message: "A linked Clash account is required", reason: "linked_account" })
    }
    yield* sql`UPDATE giveaways SET entries=entries || jsonb_build_array(${proof.actorId}::text),
      updated=true,updated_at=clock_timestamp() WHERE id=${giveawayId}`
    }
    const count = (yield* sql<{ count: number }>`SELECT jsonb_array_length(entries) AS count FROM giveaways WHERE id=${giveawayId}`)[0]?.count
    if (count === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Giveaway entry count is unavailable" })
    const outcome = already ? "already_entered" as const : "entered" as const
    yield* sql`INSERT INTO giveaway_entry_receipts(interaction_id,giveaway_id,server_id,actor_user_id,channel_id,message_id,
      request_hash,outcome,committed_entry_count) VALUES(${proof.id},${giveawayId},${proof.guildId},${proof.actorId},
      ${proof.channelId},${proof.messageId!},${proof.requestHash},${outcome},${count})`
    return { giveawayId, outcome, entryCount: count }
  }))
}).pipe(Effect.catchTag("SqlError", () => Effect.fail(new DatabaseFailure({ cause: undefined, message: "Giveaway entry storage is unavailable" }))))
