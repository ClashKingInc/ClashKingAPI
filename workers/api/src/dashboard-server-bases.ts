import { BaseCreateFailure, BaseDeleteFailure, BasesEndpoint, CreateBaseRequest, DecimalSnowflake, UpdateBaseRequest, type Base } from "@clashking/api-contracts"
import { Data, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, InvalidRequest, NotFound, PayloadTooLarge, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { MAX_DASHBOARD_UPLOAD, uploadMediaFile, validMediaFilename } from "./dashboard-upload.js"
import { serverMemberAvatar } from "./dashboard-server-reads.js"

export const dashboardServerBaseOperationIds = ["dashboardBases", "dashboardBase", "createDashboardBase", "updateDashboardBase", "deleteDashboardBase", "uploadDashboardBaseImage", "baseDownloader"] as const
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
  const value = raw.trim()
  if (!/^[1-9][0-9]*$/u.test(value) || BigInt(value) > 9_223_372_036_854_775_807n) {
    return Effect.fail(new InvalidRequest({ message: "Invalid base_id" }))
  }
  return Effect.succeed(value)
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
  if (!validBaseLink(body.baseLink)) return yield* new InvalidRequest({ message: "baseLink must be a canonical Clash layout link" })
  if ([...body.description].length > 1000) return yield* new InvalidRequest({ message: "description must be at most 1000 characters" })
  if (body.images.length > 4) return yield* new InvalidRequest({ message: "images must contain at most four URLs" })
  if (body.images.some((image) => !validUrl(image, true))) return yield* new InvalidRequest({ message: "images must use the ClashKing CDN" })
  return body
})
const validBaseLink = (raw: string) => {
  try {
    const url = new URL(raw)
    return url.origin === "https://link.clashofclans.com" && url.pathname === "/en" && url.hash === ""
      && [...url.searchParams.keys()].every((key) => key === "action" || key === "id")
      && url.searchParams.getAll("action").length === 1 && url.searchParams.get("action") === "OpenLayout"
      && url.searchParams.getAll("id").length === 1 && (url.searchParams.get("id")?.trim().length ?? 0) > 0
  } catch { return false }
}
export const validateBaseUpdate = (raw: unknown) => Effect.gen(function* () {
  const decoded = yield* decodeInput(UpdateBaseRequest, raw)
  const body = { ...decoded, baseLink: decoded.baseLink.trim(), images: decoded.images.map((image) => image.trim()) }
  if (!validBaseLink(body.baseLink)) return yield* new InvalidRequest({ message: "baseLink must be a canonical Clash layout link" })
  if ([...body.description].length > 1000) return yield* new InvalidRequest({ message: "description must be at most 1000 characters" })
  if (body.images.length > 4) return yield* new InvalidRequest({ message: "images must contain at most four URLs" })
  if (new Set(body.images).size !== body.images.length) return yield* new InvalidRequest({ message: "images must not contain duplicates" })
  if (body.images.some((image) => !validUrl(image, true))) return yield* new InvalidRequest({ message: "images must use the ClashKing CDN" })
  return body
})
interface BaseRow {
  readonly id: string; readonly server_id: string; readonly channel_id: string; readonly message_id: string
  readonly base_link: string; readonly images: ReadonlyArray<string> | null; readonly description: string
  readonly downloaders: ReadonlyArray<string> | null; readonly download_count: number; readonly upvote_count: number; readonly downvote_count: number
  readonly created_at: Date | string
}
const baseValue = (row: BaseRow): BaseValue => ({
  id: row.id, serverId: row.server_id, channelId: row.channel_id, messageId: row.message_id, baseLink: row.base_link,
  images: row.images ?? [], description: row.description, downloadCount: Number(row.download_count),
  upvotes: Number(row.upvote_count), downvotes: Number(row.downvote_count), downloaders: row.downloaders ?? [],
  createdAt: new Date(row.created_at).toISOString(), discordMessageUrl: `https://discord.com/channels/${row.server_id}/${row.channel_id}/${row.message_id}`,
})
const baseColumns = `base.id::text,base.server_id,base.channel_id,base.message_id,base.base_link,base.description,base.created_at,
  COALESCE((SELECT array_agg(image.image_url ORDER BY image.position) FROM base_images image WHERE image.base_id=base.id),'{}'::text[]) images,
  COALESCE((SELECT array_agg(downloader.user_id ORDER BY downloader.downloaded_at,downloader.user_id) FROM base_downloaders downloader WHERE downloader.base_id=base.id),'{}'::text[]) downloaders,
  COALESCE((SELECT count(*) FROM base_downloaders downloader WHERE downloader.base_id=base.id),0)::int download_count,
  COALESCE((SELECT count(*) FROM base_votes vote WHERE vote.base_id=base.id AND vote.vote=1),0)::int upvote_count,
  COALESCE((SELECT count(*) FROM base_votes vote WHERE vote.base_id=base.id AND vote.vote=-1),0)::int downvote_count`
const list = (serverId: string, raw: unknown) => Effect.gen(function* () {
  const query = yield* decodeInput(BasesEndpoint.query, raw)
  const limit = query.limit === undefined || !Number.isSafeInteger(query.limit) || query.limit <= 0 ? 50 : Math.min(query.limit, 100)
  const offset = query.offset === undefined || !Number.isSafeInteger(query.offset) ? 0 : Math.max(query.offset, 0)
  const sql = yield* SqlClient.SqlClient
  const total = yield* db(sql<{ count: number }>`SELECT count(*)::int AS count FROM bases WHERE server_id = ${serverId} AND channel_id IS NOT NULL`, "Failed to list bases")
  const rows = yield* db(sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base
    WHERE base.server_id=$1 AND base.channel_id IS NOT NULL ORDER BY base.created_at DESC,base.id DESC LIMIT $2 OFFSET $3`, [serverId, limit, offset]), "Failed to list bases")
  return { items: rows.map(baseValue), total: total[0]?.count ?? 0, limit, offset }
})
const get = (serverId: string, id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* db(sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base
    WHERE base.id=$1::bigint AND base.server_id=$2 AND base.channel_id IS NOT NULL`, [id, serverId]), "Failed to load base")
  if (rows[0] === undefined) return yield* new NotFound({ message: "Base not found" })
  return baseValue(rows[0])
})
const update = (serverId: string, id: string, raw: unknown) => Effect.gen(function* () {
  const body = yield* validateBaseUpdate(raw)
  const sql = yield* SqlClient.SqlClient
  const row = yield* db(sql.withTransaction(Effect.gen(function* () {
    const updated = yield* sql.unsafe<{ id: string }>(`UPDATE bases SET base_link=$1,description=$2
      WHERE id=$3::bigint AND server_id=$4 AND channel_id IS NOT NULL RETURNING id::text`, [body.baseLink, body.description, id, serverId])
    if (updated[0] === undefined) return undefined
    yield* sql.unsafe("DELETE FROM base_images WHERE base_id=$1::bigint", [id])
    if (body.images.length > 0) yield* sql.unsafe(`INSERT INTO base_images(base_id,position,image_url)
      SELECT $1::bigint,image.position::smallint,image.url FROM unnest($2::text[]) WITH ORDINALITY image(url,position)`, [id, body.images])
    return (yield* sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base WHERE base.id=$1::bigint`, [id]))[0]
  })), "Failed to update base")
  if (row === undefined) return yield* new NotFound({ message: "Base not found" })
  return baseValue(row)
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
  const sql = yield* SqlClient.SqlClient
  const reserved = yield* db(sql.unsafe<{ id: string }>("SELECT nextval(pg_get_serial_sequence('bases','id'))::text id", []), "Failed to allocate base ID")
  const id = reserved[0]?.id
  if (id === undefined) return yield* new DatabaseFailure({ cause: reserved, message: "Failed to allocate base ID" })
  const embeds = [{ title: "ClashKing Base Layout", url: body.baseLink, description: body.description,
    fields: [{ name: "Layout Link", value: `[Open in Clash of Clans](${body.baseLink})` }],
    ...(body.images[0] === undefined ? {} : { image: { url: body.images[0] } }) },
    ...body.images.slice(1).map((url) => ({ url: body.baseLink, image: { url } }))]
  const components = [{ type: 1, components: [
    { type: 2, style: 1, label: "Open Layout", custom_id: `base:link:${id}` },
    { type: 2, style: 2, label: "Upvote", custom_id: `base:upvote:${id}` },
    { type: 2, style: 2, label: "Downvote", custom_id: `base:downvote:${id}` },
  ] }]
  const posted = yield* discord.request(`/channels/${body.channelId}/messages`, { method: "POST", body: { embeds, components } }).pipe(Effect.result)
  if (posted._tag === "Failure") {
    if (posted.failure._tag === "UpstreamUnavailable") return yield* new UpstreamUnavailable({
      cause: posted.failure, message: "Discord message creation outcome is unknown. Do not retry automatically",
    })
    return classifyCreate(posted.failure)
  }
  const message = yield* decodeDiscord(Message, posted.success).pipe(Effect.result)
  if (message._tag === "Failure" || !positiveId(message.success.id)) return createFailure(502, "Discord created the base message but did not return a valid ID", { discordMessageCreated: true, discordMessageCleanup: "failed" })
  const messageId = message.success.id
  const inserted = yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe(`INSERT INTO bases(id,server_id,channel_id,message_id,base_link,description)
      OVERRIDING SYSTEM VALUE VALUES ($1::bigint,$2,$3,$4,$5,$6)`, [id, serverId, body.channelId, messageId, body.baseLink, body.description])
    if (body.images.length > 0) yield* sql.unsafe(`INSERT INTO base_images(base_id,position,image_url)
      SELECT $1::bigint,image.position::smallint,image.url FROM unnest($2::text[]) WITH ORDINALITY image(url,position)`, [id, body.images])
    return (yield* sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base WHERE base.id=$1::bigint`, [id]))[0]
  })).pipe(Effect.result)
  if (inserted._tag === "Success" && inserted.success !== undefined) return baseValue(inserted.success)
  // An error can be a lost commit acknowledgement. Reconcile before claiming failure;
  // never delete the newly created Discord message merely because INSERT threw.
  const persisted = yield* db(sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base
    WHERE base.id=$1::bigint AND base.server_id=$2 AND base.channel_id=$3 AND base.message_id=$4`, [id, serverId, body.channelId, messageId]), "Base persistence outcome is unknown; the Discord message was retained for reconciliation. Do not retry automatically")
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
  const rows = yield* db(sql.unsafe<BaseRow>(`SELECT ${baseColumns} FROM bases base
    WHERE base.id=$1::bigint AND base.server_id=$2 AND base.channel_id IS NOT NULL`, [id, serverId]), "Failed to load base")
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
  const result = yield* sql.unsafe("DELETE FROM bases WHERE id=$1::bigint AND server_id=$2", [id, serverId]).pipe(Effect.result)
  if (result._tag === "Failure") {
    const retained = yield* db(sql.unsafe<{ id: string }>("SELECT id::text FROM bases WHERE id=$1::bigint AND server_id=$2", [id, serverId]), "Base deletion outcome is unknown; Discord message cleanup completed. Do not retry automatically")
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
  const rows = yield* db(sql.unsafe<{ exists: boolean }>(`SELECT EXISTS (
    SELECT 1 FROM bases base JOIN base_downloaders downloader ON downloader.base_id=base.id
    WHERE base.id=$1::bigint AND base.server_id=$2 AND base.channel_id IS NOT NULL AND downloader.user_id=$3
  ) AS exists`, [id, serverId, userId]), "Failed to load base downloader")
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
    case "updateDashboardBase": return yield* update(serverId, yield* baseId(operation.path.baseId), operation.body)
    case "deleteDashboardBase": return yield* remove(serverId, yield* baseId(operation.path.baseId))
    case "baseDownloader": return yield* downloader(serverId, yield* baseId(operation.path.baseId), yield* decodeInput(DecimalSnowflake, operation.path.userId))
    default: return yield* new NotFound({ message: "Base operation not found" })
  }
})
