import { DecimalSnowflake, Giveaway, GiveawayBooster, GiveawayEntry, GiveawayRerollRequest } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { uploadMediaFile, mediaFileUrl } from "./dashboard-upload.js"
import { DiscordApi } from "./discord-api.js"
import { lockServerDiscordResources } from "./discord-managed-resources.js"
import { enqueueGiveawayPublication } from "./giveaway-publications.js"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable, RateLimited, Forbidden, Unauthenticated, PayloadTooLarge, type ApiFailure } from "./errors.js"

export const dashboardGiveawayOperationIds = ["serverGiveaways", "serverGiveaway", "createServerGiveaway", "updateServerGiveaway", "deleteServerGiveaway", "giveawayEntries", "rerollGiveaway"] as const
const StoredWinner = Schema.Struct({ user_id: DecimalSnowflake, status: Schema.optionalKey(Schema.Literals(["winner", "rerolled"])), timestamp: Schema.optionalKey(Schema.String), reason: Schema.optionalKey(Schema.String), username: Schema.optionalKey(Schema.String) })
const Member = Schema.Struct({ nick: Schema.optionalKey(Schema.NullOr(Schema.String)), avatar: Schema.optionalKey(Schema.NullOr(Schema.String)), user: Schema.Struct({ id: DecimalSnowflake, username: Schema.String, global_name: Schema.optionalKey(Schema.NullOr(Schema.String)), avatar: Schema.optionalKey(Schema.NullOr(Schema.String)), discriminator: Schema.optionalKey(Schema.String) }) })
interface Row { readonly id: string; readonly server_id: string; readonly prize: string; readonly channel_id: string | null; readonly status: string; readonly start_time: Date | string | null; readonly end_time: Date | string | null; readonly winners: number; readonly mentions: readonly string[]; readonly text_above_embed: string; readonly text_in_embed: string; readonly text_on_end: string; readonly image_url: string | null; readonly profile_picture_required: boolean; readonly coc_account_required: boolean; readonly roles_mode: string; readonly roles: readonly string[]; readonly boosters: unknown; readonly entries: unknown; readonly winners_list: unknown; readonly updated: boolean; readonly message_id: string | null; readonly event_pending: string | null; readonly event_pending_at: Date | string | null; readonly created_at: Date | string; readonly updated_at: Date | string }
const columns = "id,server_id,prize,channel_id,status,start_time,end_time,winners,mentions,text_above_embed,text_in_embed,text_on_end,image_url,profile_picture_required,coc_account_required,roles_mode,roles,boosters,entries,winners_list,updated,message_id,event_pending,event_pending_at,created_at,updated_at"
const omitUndefined = (value: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
const timestamp = (value: Date | string | null): string => value === null ? "" : value instanceof Date ? value.toISOString() : value
const stored = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Stored giveaway failed schema validation" })))
const requestValue = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid giveaway request" })))
const field = (form: FormData, key: string): string => typeof form.get(key) === "string" ? form.get(key) as string : ""
const bool = (value: string) => ["true", "1", "yes", "on"].includes(value.trim().toLowerCase())
const secureShuffle = <A>(values: A[]) => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const range = index + 1, limit = 0x1_0000_0000 - 0x1_0000_0000 % range
    let random: number
    do random = crypto.getRandomValues(new Uint32Array(1))[0]!
    while (random >= limit)
    const other = random % range, value = values[index]!
    values[index] = values[other]!
    values[other] = value
  }
}
const isoDate = (value: string, name: string) => Effect.gen(function* () {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/u.test(value)) return yield* new InvalidRequest({ message: `${name} must use ISO 8601` })
  const year = Number(value.slice(0,4)), month = Number(value.slice(5,7)), day = Number(value.slice(8,10))
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year,month,0)).getUTCDate()) return yield* new InvalidRequest({ message: `${name} must use a valid calendar date` })
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ? value : `${value}Z`)
  if (!Number.isFinite(date.getTime())) return yield* new InvalidRequest({ message: `${name} must use ISO 8601` })
  return date
})
const jsonField = <A>(form: FormData, key: string, schema: Schema.Codec<A, unknown, never, never>) => Effect.gen(function* () {
  const raw = field(form, key)
  const value = raw === "" ? [] : yield* Effect.try({ try: () => JSON.parse(raw) as unknown, catch: () => new InvalidRequest({ message: `${key} must contain valid JSON` }) })
  return yield* requestValue(schema, value)
})

export const parseGiveawayForm = (form: FormData, now = new Date()) => Effect.gen(function* () {
  const prize = field(form, "prize"), channelId = yield* requestValue(DecimalSnowflake, field(form, "channel_id")), winnersText = field(form, "winners")
  if (!prize || !/^\d+$/u.test(winnersText) || Number(winnersText) < 1 || Number(winnersText) > 2147483647) return yield* new InvalidRequest({ message: "A prize and positive integer winners count are required" })
  const start = ["true", "1"].includes(field(form, "now").toLowerCase()) ? now : yield* isoDate(field(form, "start_time"), "start_time")
  const end = yield* isoDate(field(form, "end_time"), "end_time")
  if (end <= start) return yield* new InvalidRequest({ message: "end_time must be after start_time" })
  const mentions = yield* jsonField(form, "mentions_json", Schema.Array(Schema.String))
  const roles = yield* jsonField(form, "roles_json", Schema.Array(DecimalSnowflake))
  const boosters = yield* jsonField(form, "boosters_json", Schema.Array(GiveawayBooster))
  for (const booster of boosters) for (const role of booster.roles) yield* requestValue(DecimalSnowflake, role)
  return { prize, channelId, winners: Number(winnersText), start, end, mentions, roles, boosters: boosters.filter((booster) => booster.roles.length > 0), rolesMode: ["allow", "deny"].includes(field(form, "roles_mode")) ? field(form, "roles_mode") : "none", textAboveEmbed: field(form, "text_above_embed"), textInEmbed: field(form, "text_in_embed"), textOnEnd: field(form, "text_on_end"), profilePictureRequired: bool(field(form, "profile_picture_required")), cocAccountRequired: bool(field(form, "coc_account_required")), removeImage: bool(field(form, "remove_image")) }
})

export const giveawayEntrants = (entries: readonly Schema.Schema.Type<typeof GiveawayEntry>[]) => {
  const counts = new Map<string, number>()
  for (const entry of entries) { const id = typeof entry === "string" ? entry : entry.user_id; counts.set(id, (counts.get(id) ?? 0) + 1) }
  return { totalEntries: entries.length, uniqueUsers: counts.size, entrants: [...counts].map(([userId, count]) => ({ userId, entries: count, winChance: entries.length === 0 ? 0 : Math.round(count / entries.length * 10000) / 100 })) }
}
export const giveawayWinnerValue = (serverId: string, winner: Schema.Schema.Type<typeof StoredWinner>) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const member = yield* discord.request(`/guilds/${serverId}/members/${winner.user_id}`).pipe(Effect.flatMap((value) => Schema.decodeUnknownEffect(Member)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord member response failed schema validation" })))), Effect.catch((failure) => failure instanceof NotFound ? Effect.succeed(undefined) : Effect.fail(failure)))
  const user = member?.user, avatar = member?.avatar ?? user?.avatar
  const extension = avatar?.startsWith("a_") ? "gif" : "png"
  const discriminator = user?.discriminator ?? "0"
  const legacyIndex = /^\d+$/u.test(discriminator) ? Number(BigInt(discriminator) % 5n) : 0
  // Match the pinned Go Disgo effective-avatar behavior, including remainder zero.
  const defaultAvatar = legacyIndex === 0 ? Number((BigInt(winner.user_id) >> 22n) % 6n) : legacyIndex
  const avatarUrl = member === undefined ? undefined : member.avatar ? `https://cdn.discordapp.com/guilds/${serverId}/users/${winner.user_id}/avatars/${member.avatar}.${extension}` : user?.avatar ? `https://cdn.discordapp.com/avatars/${winner.user_id}/${user.avatar}.${extension}` : `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`
  return omitUndefined({ userId: winner.user_id, username: member?.nick ?? user?.global_name ?? user?.username ?? winner.username, avatarUrl, inServer: member !== undefined, status: winner.status ?? "winner", timestamp: winner.timestamp, reason: winner.reason })
})
const rowValue = (row: Row) => Effect.gen(function* () {
  const winners = yield* stored(Schema.Array(StoredWinner), row.winners_list)
  const winnersList = yield* Effect.forEach(winners, (winner) => giveawayWinnerValue(row.server_id, winner), { concurrency: 10 })
  const imageUrl = row.image_url && /^[^/\\]+$/u.test(row.image_url) ? mediaFileUrl(`giveaway_${row.image_url}`) : undefined
  return yield* stored(Giveaway, omitUndefined({ id: row.id, serverId: row.server_id, prize: row.prize, channelId: row.channel_id ?? undefined, status: row.status, start: timestamp(row.start_time), end: timestamp(row.end_time), winners: row.winners, mentions: row.mentions, textAboveEmbed: row.text_above_embed, textInEmbed: row.text_in_embed, textOnEnd: row.text_on_end, imageUrl, profilePictureRequired: row.profile_picture_required, cocAccountRequired: row.coc_account_required, rolesMode: row.roles_mode, roles: row.roles, boosters: row.boosters, entries: row.entries, winnersList, updated: row.updated, messageId: row.message_id ?? undefined, eventPending: row.event_pending ?? undefined, eventPendingAt: row.event_pending_at === null ? undefined : timestamp(row.event_pending_at), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) }))
})

export const executeDashboardGiveaways = (input: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, operation = input.endpoint.operationId
  const serverId = typeof input.path.serverId === "string" ? input.path.serverId : "", id = typeof input.path.giveawayId === "string" ? input.path.giveawayId : crypto.randomUUID()
  if (operation === "serverGiveaways") {
    const rows = yield* sql.unsafe<Row>(`SELECT ${columns} FROM giveaways WHERE server_id=$1 ORDER BY COALESCE(end_time,updated_at) DESC`, [serverId])
    const items = yield* Effect.forEach(rows, rowValue)
    return { ongoing: items.filter((item) => item.status === "ongoing"), upcoming: items.filter((item) => item.status === "scheduled"), ended: items.filter((item) => item.status === "ended"), total: items.length }
  }
  if (operation === "giveawayEntries" || operation === "serverGiveaway") {
    const row = (yield* sql.unsafe<Row>(`SELECT ${columns} FROM giveaways WHERE server_id=$1 AND id=$2`, [serverId, id]))[0]
    if (row === undefined) return yield* new NotFound({ message: "Giveaway not found" })
    if (operation === "serverGiveaway") return yield* rowValue(row)
    return { giveawayId: id, serverId, ...giveawayEntrants(yield* stored(Schema.Array(GiveawayEntry), row.entries)) }
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    const existing = operation === "createServerGiveaway" ? undefined : (yield* sql.unsafe<Row>(`SELECT ${columns} FROM giveaways WHERE server_id=$1 AND id=$2 FOR UPDATE`, [serverId,id]))[0]
    if (operation !== "createServerGiveaway" && existing === undefined) return yield* new NotFound({ message: "Giveaway not found" })
    if (operation === "deleteServerGiveaway") {
      yield* sql`DELETE FROM giveaways WHERE server_id=${serverId} AND id=${id}`
      // Existing Bunny objects lack creation provenance; removing config must not delete an arbitrary stored filename.
      return { message: "Giveaway deleted successfully", giveawayId: id, serverId }
    }
    if (operation === "rerollGiveaway") {
      const body = yield* requestValue(GiveawayRerollRequest, input.body)
      if (existing?.status !== "ended" || body.user_ids_to_replace.length === 0) return yield* new InvalidRequest({ message: "Select current winners from an ended giveaway" })
      for (const userId of body.user_ids_to_replace) yield* requestValue(DecimalSnowflake, userId)
      const winners = yield* stored(Schema.Array(StoredWinner), existing.winners_list), entries = yield* stored(Schema.Array(GiveawayEntry), existing.entries)
      const initial = (yield* sql<{ governed: boolean; published: boolean }>`SELECT
        (EXISTS(SELECT 1 FROM giveaway_outcome_runs WHERE giveaway_id=${id}) OR
          EXISTS(SELECT 1 FROM giveaway_publication_effects WHERE giveaway_id=${id} AND kind='end')) AS governed,
        EXISTS(SELECT 1 FROM giveaway_publication_effects WHERE giveaway_id=${id} AND kind='end' AND state='succeeded') AS published`)[0]
      if (initial?.governed && !initial.published) return yield* new InvalidRequest({ message: "The initial giveaway outcome must be published before rerolling" })
      const current = new Set(winners.filter((winner) => winner.status === "winner").map((winner) => winner.user_id))
      if (body.user_ids_to_replace.some((userId) => !current.has(userId))) return yield* new InvalidRequest({ message: "Replacement target is not a current winner" })
      const eligible = [...new Set(entries.map((entry) => typeof entry === "string" ? entry : entry.user_id).filter((userId) => !current.has(userId)))]
      if (eligible.length < body.user_ids_to_replace.length) return yield* new InvalidRequest({ message: "Not enough eligible participants" })
      secureShuffle(eligible)
      const newWinners = eligible.slice(0, body.user_ids_to_replace.length), now = new Date().toISOString(), replace = new Set(body.user_ids_to_replace)
      const updated = [...winners.map((winner) => replace.has(winner.user_id) ? { ...winner, status: "rerolled", timestamp: now, reason: "dashboard_reroll" } : winner), ...newWinners.map((user_id) => ({ user_id, status: "winner", timestamp: now }))]
      yield* sql`UPDATE giveaways SET winners_list=${JSON.stringify(updated)}::jsonb,updated_at=now() WHERE server_id=${serverId} AND id=${id}`
      yield* enqueueGiveawayPublication(id,"reroll",{
        operationId:crypto.randomUUID(),winnerIds:newWinners,replacedIds:body.user_ids_to_replace,
        actorLabel:input.principal.kind === "user" ? input.principal.userId : "bot",occurredAt:now,
      })
      return { message: "Winners rerolled successfully", giveawayId: id, serverId, newWinners }
    }
    if (!(input.body instanceof FormData)) return yield* new InvalidRequest({ message: "Multipart form data is required" })
    const body = yield* parseGiveawayForm(input.body)
    let image = body.removeImage ? null : existing?.image_url ?? null
    const file = input.body.get("image")
    if (file instanceof File && file.name !== "") {
      const filename = `giveaway_${id}_${crypto.randomUUID()}.png`
      yield* uploadMediaFile(input.bindings, filename, file)
      image = filename.slice("giveaway_".length)
    }
    const values = [id,serverId,body.prize,body.channelId,body.start.toISOString(),body.end.toISOString(),body.winners,body.mentions,body.textAboveEmbed,body.textInEmbed,body.textOnEnd,image,body.profilePictureRequired,body.cocAccountRequired,body.rolesMode,body.roles,JSON.stringify(body.boosters)]
    if (operation === "createServerGiveaway") yield* sql.unsafe(`INSERT INTO giveaways (id,server_id,prize,channel_id,status,start_time,end_time,winners,mentions,text_above_embed,text_in_embed,text_on_end,image_url,profile_picture_required,coc_account_required,roles_mode,roles,boosters) VALUES ($1,$2,$3,$4,'scheduled',$5::timestamptz,$6::timestamptz,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`, values)
    else yield* sql.unsafe(`UPDATE giveaways SET prize=$3,channel_id=$4,start_time=$5::timestamptz,end_time=$6::timestamptz,winners=$7,mentions=$8,text_above_embed=$9,text_in_embed=$10,text_on_end=$11,image_url=$12,profile_picture_required=$13,coc_account_required=$14,roles_mode=$15,roles=$16,boosters=$17::jsonb,updated=true,updated_at=now() WHERE id=$1 AND server_id=$2`, values)
    return { message: operation === "createServerGiveaway" ? "Giveaway created successfully" : "Giveaway updated successfully", giveawayId: id, serverId }
  }))
}).pipe(Effect.mapError((cause) => cause instanceof DatabaseFailure || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof UpstreamUnavailable || cause instanceof RateLimited || cause instanceof Forbidden || cause instanceof Unauthenticated || cause instanceof PayloadTooLarge ? cause : new DatabaseFailure({ cause, message: "Giveaway database operation failed" })))
