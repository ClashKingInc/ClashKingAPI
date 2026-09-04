import { BaseCreateFailure, BaseDeleteFailure, BasesEndpoint, CreateBaseRequest, DecimalSnowflake, type Base } from "@clashking/api-contracts"
import { Data, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, InvalidRequest, NotFound, PayloadTooLarge, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { MAX_DASHBOARD_UPLOAD, uploadMediaFile, validMediaFilename } from "./dashboard-upload.js"
import { serverMemberAvatar } from "./dashboard-server-reads.js"

export const dashboardServerBaseOperationIds = ["dashboardBases", "dashboardBase", "createDashboardBase", "deleteDashboardBase", "uploadDashboardBaseImage", "baseDownloader"] as const
type BaseValue = typeof Base.Type
type CreateFailure = typeof BaseCreateFailure.Type
type DeleteFailure = typeof BaseDeleteFailure.Type
export class DashboardBaseFailure extends Data.Class<{
  readonly kind: "create" | "delete"
  readonly status: 409 | 500 | 502 | 503
  readonly body: CreateFailure | DeleteFailure
}> {}

/** Custom Go failure envelopes are deliberately encoded separately from success data. */
export const encodeDashboardBaseFailure = (value: unknown): Effect.Effect<Response> | undefined => value instanceof DashboardBaseFailure
  ? Schema.encodeUnknownEffect(value.kind === "create" ? BaseCreateFailure : BaseDeleteFailure)(value.body).pipe(
    Effect.map((body) => Response.json(body, { status: value.status, headers: { "cache-control": "no-store" } })), Effect.orDie)
  : undefined

const createFailure = (status: DashboardBaseFailure["status"], message: string, extra: Partial<CreateFailure> = {}) => new DashboardBaseFailure({
  kind: "create", status, body: { code: status === 409 ? "conflict" : status === 500 ? "internal_error" : "upstream_unavailable", message,
    databaseInserted: false, discordMessageCreated: false, discordMessageCleanup: "notNeeded", retryable: status === 503, ...extra },
})
const deleteFailure = (baseId: string, status: DashboardBaseFailure["status"], message: string, extra: Partial<DeleteFailure> = {}) => new DashboardBaseFailure({
  kind: "delete", status, body: { code: status === 409 ? "conflict" : status === 500 ? "internal_error" : "upstream_unavailable", message,
    baseId, databaseDeleted: false, discordMessageCleanup: "failed", retryable: status === 503, ...extra },
})
const db = <A>(effect: Effect.Effect<A, unknown>, message: string) => effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message })))
const decodeInput = <A>(schema: Schema.Codec<A, unknown, never, never>, raw: unknown) => Schema.decodeUnknownEffect(schema)(raw).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid base request" })))
const decodeDiscord = <A>(schema: Schema.Codec<A, unknown, never, never>, raw: unknown) => Schema.decodeUnknownEffect(schema)(raw).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord response failed schema validation" })))
const positiveId = (id: string) => /^\d+$/u.test(id) && BigInt(id) > 0n && BigInt(id) <= 18_446_744_073_709_551_615n
const baseId = (raw: unknown) => {
  if (typeof raw !== "string") return Effect.fail(new InvalidRequest({ message: "Invalid base_id" }))
  const normalized = raw.trim().replace(/^urn:uuid:/iu, "").replace(/^\{(.+)\}$/u, "$1")
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/iu.test(normalized)) return Effect.fail(new InvalidRequest({ message: "Invalid base_id" }))
  const value = normalized.replaceAll("-", "")
  if (!/^[a-f0-9]{32}$/iu.test(value)) return Effect.fail(new InvalidRequest({ message: "Invalid base_id" }))
  const lower = value.toLowerCase()
  return Effect.succeed(`${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`)
}
const validUrl = (raw: string, cdn = false) => {
  try { const url = new URL(raw); return raw.startsWith("https://") && url.host !== "" && (!cdn ||
    url.origin === "https://api.clashk.ing" && url.search === "" && url.hash === "" && url.pathname.startsWith("/v2/media/") && validMediaFilename(url.pathname.slice(10))) }
  catch { return false }
}
export const validateBaseCreate = (raw: unknown) => Effect.gen(function* () {
  const decoded = yield* decodeInput(CreateBaseRequest, raw)
  const body = { ...decoded, channelId: decoded.channelId.trim(), baseLink: decoded.baseLink.trim(), images: decoded.images.map((image) => image.trim()) }
  if (!positiveId(body.channelId)) return yield* new InvalidRequest({ message: "channelId must be a valid Discord channel ID" })
  if (!validUrl(body.baseLink)) return yield* new InvalidRequest({ message: "baseLink must be a valid HTTPS URL" })
  if ([...body.description].length > 1000) return yield* new InvalidRequest({ message: "description must be at most 1000 characters" })
  if (body.images.length > 4) return yield* new InvalidRequest({ message: "images must contain at most four URLs" })
  if (body.images.some((image) => !validUrl(image, true))) return yield* new InvalidRequest({ message: "images must use the ClashKing CDN" })
  return body
})
interface BaseRow {
  readonly id: string; readonly server_id: string; readonly channel_id: string; readonly message_id: string
  readonly base_link: string; readonly images: ReadonlyArray<string> | null; readonly description: string
  readonly downloaders: ReadonlyArray<string> | null; readonly upvoter_ids: ReadonlyArray<string>; readonly downvoter_ids: ReadonlyArray<string>
  readonly created_at: Date | string
}
const baseValue = (row: BaseRow): BaseValue => ({
  id: row.id, serverId: row.server_id, channelId: row.channel_id, messageId: row.message_id, baseLink: row.base_link,
  images: row.images ?? [], description: row.description, downloadCount: row.downloaders?.length ?? 0,
  upvotes: row.upvoter_ids.length, downvotes: row.downvoter_ids.length, downloaders: row.downloaders ?? [],
  createdAt: new Date(row.created_at).toISOString(), discordMessageUrl: `https://discord.com/channels/${row.server_id}/${row.channel_id}/${row.message_id}`,
})
const list = (serverId: string, raw: unknown) => Effect.gen(function* () {
  const query = yield* decodeInput(BasesEndpoint.query, raw)
  const limit = query.limit === undefined || !Number.isSafeInteger(query.limit) || query.limit <= 0 ? 50 : Math.min(query.limit, 100)
  const offset = query.offset === undefined || !Number.isSafeInteger(query.offset) ? 0 : Math.max(query.offset, 0)
  const sql = yield* SqlClient.SqlClient
  const total = yield* db(sql<{ count: number }>`SELECT count(*)::int AS count FROM bases WHERE server_id = ${serverId} AND channel_id IS NOT NULL`, "Failed to list bases")
  const rows = yield* db(sql<BaseRow>`SELECT * FROM bases WHERE server_id = ${serverId} AND channel_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, "Failed to list bases")
  return { items: rows.map(baseValue), total: total[0]?.count ?? 0, limit, offset }
})
const get = (serverId: string, id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* db(sql<BaseRow>`SELECT * FROM bases WHERE id = ${id}::uuid AND server_id = ${serverId} AND channel_id IS NOT NULL`, "Failed to load base")
  if (rows[0] === undefined) return yield* new NotFound({ message: "Base not found" })
  return baseValue(rows[0])
})
const Channel = Schema.Struct({ id: DecimalSnowflake, guild_id: Schema.optionalKey(DecimalSnowflake), type: Schema.Number })
const Message = Schema.Struct({ id: DecimalSnowflake })
// Only an explicit PostgreSQL data/constraint/syntax rejection proves the statement
// did not commit. Transport errors and missing RETURNING data prove nothing.
const rejectedStatement = (error: unknown): boolean => {
  let current = error
  for (let depth = 0; depth < 8; depth++) {
    if (typeof current !== "object" || current === null) return false
    if ("code" in current && typeof current.code === "string" && /^(?:22|23|42)[A-Z0-9]{3}$/u.test(current.code)) return true
    current = "cause" in current ? current.cause : undefined
  }
  return false
}
const classifyCreate = (error: ApiFailure) => error._tag === "NotFound"
  ? createFailure(409, "Selected Discord channel is not available for this server")
  : error._tag === "Forbidden" ? createFailure(502, "Discord rejected message creation because the bot lacks access")
  : error._tag === "InvalidRequest" ? createFailure(502, "Discord rejected message creation")
  : createFailure(503, "Discord message creation is temporarily unavailable")

const create = (serverId: string, raw: unknown) => Effect.gen(function* () {
  const body = yield* validateBaseCreate(raw)
  const discord = yield* DiscordApi
  const channel = yield* discord.request(`/channels/${body.channelId}`).pipe(Effect.flatMap((raw) => decodeDiscord(Channel, raw)), Effect.result)
  if (channel._tag === "Failure") return classifyCreate(channel.failure)
  if (channel.success.guild_id !== serverId || ![0, 2, 5, 10, 11, 12, 13].includes(channel.success.type)) return createFailure(409, "Selected Discord channel is not available for this server")
  const embeds = [{ title: "ClashKing Base Layout", url: body.baseLink, description: body.description,
    fields: [{ name: "Layout Link", value: `[Open in Clash of Clans](${body.baseLink})` }],
    ...(body.images[0] === undefined ? {} : { image: { url: body.images[0] } }) },
    ...body.images.slice(1).map((url) => ({ url: body.baseLink, image: { url } }))]
  const posted = yield* discord.request(`/channels/${body.channelId}/messages`, { method: "POST", body: { embeds } }).pipe(Effect.result)
  if (posted._tag === "Failure") {
    if (posted.failure._tag === "UpstreamUnavailable") return yield* new UpstreamUnavailable({
      cause: posted.failure, message: "Discord message creation outcome is unknown. Do not retry automatically",
    })
    return classifyCreate(posted.failure)
  }
  const message = yield* decodeDiscord(Message, posted.success).pipe(Effect.result)
  if (message._tag === "Failure" || !positiveId(message.success.id)) return createFailure(502, "Discord created the base message but did not return a valid ID", { discordMessageCreated: true, discordMessageCleanup: "failed" })
  const messageId = message.success.id
  const sql = yield* SqlClient.SqlClient
  const inserted = yield* sql<BaseRow>`INSERT INTO bases (server_id, channel_id, message_id, base_link, images, description, downloaders, upvoter_ids, downvoter_ids)
    VALUES (${serverId}, ${body.channelId}, ${messageId}, ${body.baseLink}, ${body.images}::text[], ${body.description}, '{}'::text[], '{}'::text[], '{}'::text[]) RETURNING *`.pipe(Effect.result)
  if (inserted._tag === "Success" && inserted.success[0] !== undefined) return baseValue(inserted.success[0])
  // An error can be a lost commit acknowledgement. Reconcile before claiming failure;
  // never delete the newly created Discord message merely because INSERT threw.
  const persisted = yield* db(sql<BaseRow>`SELECT * FROM bases WHERE server_id = ${serverId} AND channel_id = ${body.channelId} AND message_id = ${messageId}`, "Base persistence outcome is unknown; the Discord message was retained for reconciliation. Do not retry automatically")
  if (persisted[0] !== undefined) return baseValue(persisted[0])
  // Absence alone cannot exclude an in-flight commit after a transport failure. Keep
  // the resource even after a definite rejection; cleanup requires reconciliation.
  if (inserted._tag !== "Failure" || !rejectedStatement(inserted.failure)) return yield* new DatabaseFailure({
    cause: inserted, message: "Base persistence outcome is unknown; the Discord message was retained for reconciliation. Do not retry automatically",
  })
  return createFailure(500, "Base was not saved; the Discord message was retained for reconciliation", {
    discordMessageCreated: true, discordMessageId: messageId, discordMessageCleanup: "failed", retryable: false,
  })
})

const remove = (serverId: string, id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* db(sql<BaseRow>`SELECT * FROM bases WHERE id = ${id}::uuid AND server_id = ${serverId} AND channel_id IS NOT NULL`, "Failed to load base")
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Base not found" })
  if (![row.server_id, row.channel_id, row.message_id].every(positiveId)) return deleteFailure(id, 409, "Base has an invalid stored Discord message location")
  const discord = yield* DiscordApi
  const deleted = yield* discord.request(`/channels/${row.channel_id}/messages/${row.message_id}`, { method: "DELETE" }).pipe(Effect.result)
  if (deleted._tag === "Failure" && deleted.failure._tag !== "NotFound") {
    const error = deleted.failure
    return error._tag === "Forbidden" ? deleteFailure(id, 502, "Discord rejected message cleanup because the bot lacks access")
      : error._tag === "InvalidRequest" ? deleteFailure(id, 502, "Discord rejected message cleanup")
      : deleteFailure(id, 503, "Discord message cleanup is temporarily unavailable")
  }
  const cleanup = deleted._tag === "Failure" ? "alreadyMissing" as const : "deleted" as const
  const result = yield* sql`DELETE FROM bases WHERE id = ${id}::uuid AND server_id = ${serverId}`.pipe(Effect.result)
  if (result._tag === "Failure") {
    const retained = yield* db(sql<{ id: string }>`SELECT id FROM bases WHERE id = ${id}::uuid AND server_id = ${serverId}`, "Base deletion outcome is unknown; Discord message cleanup completed. Do not retry automatically")
    if (retained.length > 0) {
      if (!rejectedStatement(result.failure)) return yield* new DatabaseFailure({ cause: result.failure, message: "Base deletion outcome is unknown; Discord message cleanup completed. Do not retry automatically" })
      return deleteFailure(id, 500, "Discord message cleanup completed, but the base record could not be deleted", { discordMessageCleanup: cleanup, retryable: true })
    }
  }
  return { baseId: id, databaseDeleted: true as const, discordMessageCleanup: cleanup }
})
const Member = Schema.Struct({ user: Schema.Struct({ id: DecimalSnowflake, username: Schema.String, discriminator: Schema.String,
  global_name: Schema.optionalKey(Schema.NullOr(Schema.String)), avatar: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
  roles: Schema.Array(DecimalSnowflake), nick: Schema.optionalKey(Schema.NullOr(Schema.String)), avatar: Schema.optionalKey(Schema.NullOr(Schema.String)) })
const downloader = (serverId: string, id: string, userId: string) => Effect.gen(function* () {
  if (!positiveId(userId)) return yield* new InvalidRequest({ message: "Invalid Discord ID" })
  const sql = yield* SqlClient.SqlClient
  const rows = yield* db(sql<{ exists: boolean }>`SELECT EXISTS (SELECT 1 FROM bases WHERE id = ${id}::uuid AND server_id = ${serverId} AND channel_id IS NOT NULL AND ${userId} = ANY(downloaders)) AS exists`, "Failed to load base downloader")
  if (rows[0]?.exists !== true) return yield* new NotFound({ message: "Base downloader not found" })
  const discord = yield* DiscordApi
  const member = yield* discord.request(`/guilds/${serverId}/members/${userId}`).pipe(Effect.flatMap((raw) => decodeDiscord(Member, raw)), Effect.result)
  if (member._tag === "Failure") {
    // Go's GetMemberDirect is deliberately best-effort after ownership proof.
    yield* Effect.logWarning("Base downloader Discord profile unavailable", { failure: member.failure._tag })
    return { userId, displayName: null, avatarUrl: null }
  }
  return { userId, displayName: (member.success.nick ?? member.success.user.global_name ?? member.success.user.username).trim() || null,
    avatarUrl: serverMemberAvatar(serverId, member.success).trim() || null }
})
export const executeDashboardServerBases = (operation: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  const serverId = yield* decodeInput(DecimalSnowflake, operation.path.serverId)
  if (!positiveId(serverId)) return yield* new InvalidRequest({ message: "Invalid Discord ID" })
  switch (operation.endpoint.operationId) {
    case "dashboardBases": return yield* list(serverId, operation.query)
    case "createDashboardBase": return yield* create(serverId, operation.body)
    case "uploadDashboardBaseImage": {
      const form = yield* decodeInput(Schema.FormData, operation.body)
      const file = form.get("file")
      if (file === null || typeof file === "string") return yield* new InvalidRequest({ message: "A 'file' field is required" })
      if (file.size > MAX_DASHBOARD_UPLOAD) return yield* new PayloadTooLarge({ message: "File too large (max 25 MB)" })
      const extension = file.name.split(".").slice(1).at(-1)?.toLowerCase()
      if (extension === undefined || !["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) return yield* new InvalidRequest({ message: "Unsupported base image type", status: 415 })
      return yield* uploadMediaFile(operation.bindings, `base_${crypto.randomUUID()}.${extension}`, file).pipe(
        Effect.mapError((cause) => cause instanceof UpstreamUnavailable ? new DatabaseFailure({ cause, message: "Failed to upload base image" }) : cause),
      )
    }
    case "dashboardBase": return yield* get(serverId, yield* baseId(operation.path.baseId))
    case "deleteDashboardBase": return yield* remove(serverId, yield* baseId(operation.path.baseId))
    case "baseDownloader": return yield* downloader(serverId, yield* baseId(operation.path.baseId), yield* decodeInput(DecimalSnowflake, operation.path.userId))
    default: return yield* new NotFound({ message: "Base operation not found" })
  }
})
