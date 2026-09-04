import { botEndpoints } from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { ServerAuthorization } from "./server-authorization.js"
import { readBoundedJson } from "./request-body.js"
import {
  DatabaseFailure,
  InvalidRequest,
  NotFound,
  PayloadTooLarge,
  type ApiFailure,
} from "./errors.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

export const botRuntimeRoutes = [
  { method: "GET", path: "/v2/server/:serverId/bans" },
  { method: "POST", path: "/v2/server/:serverId/bans/:tag" },
  { method: "DELETE", path: "/v2/server/:serverId/bans/:tag" },
  { method: "GET", path: "/v2/server/:serverId/strikes" },
  { method: "GET", path: "/v2/server/:serverId/strikes/player/:tag/summary" },
  { method: "POST", path: "/v2/server/:serverId/strikes/:tag" },
  { method: "DELETE", path: "/v2/server/:serverId/strikes/:strikeId" },
] as const

interface BanItem {
  readonly DateCreated: string
  readonly Notes: string
  readonly VillageName: string
  readonly VillageTag: string
  readonly added_by: string
  readonly clan_name?: string
  readonly clan_tag?: string
  readonly edited_by: ReadonlyArray<{
    readonly previous: { readonly reason: string }
    readonly user: string
  }>
  readonly image?: string
  readonly name?: string
  readonly server: string
  readonly town_hall?: number
  readonly trophies?: number
}

interface StrikeItem {
  readonly added_by: string
  readonly clan_name?: string
  readonly clan_tag?: string
  readonly date_created: string
  readonly image?: string
  readonly player_name?: string
  readonly reason: string
  readonly rollover_date?: number
  readonly server: string
  readonly strike_id: string
  readonly strike_weight: number
  readonly tag: string
  readonly town_hall?: number
  readonly trophies?: number
}

interface BanMutation {
  readonly player_name?: string
  readonly player_tag: string
  readonly server_id: string
  readonly status: string
}

interface StrikeMutation {
  readonly player_name?: string
  readonly player_tag: string
  readonly server_id: string
  readonly status: string
  readonly strike_id: string
  readonly total_strikes?: number
  readonly total_weight?: number
}

interface StrikeFilters {
  readonly playerTag?: string
  readonly viewExpired: boolean
}

export class BotModerationStore extends Context.Service<
  BotModerationStore,
  {
    readonly addStrike: (
      serverId: string,
      tag: string,
      body: typeof botEndpoints.addStrike.body.Type,
    ) => Effect.Effect<StrikeMutation, DatabaseFailure>
    readonly deleteBan: (
      serverId: string,
      tag: string,
    ) => Effect.Effect<BanMutation, DatabaseFailure | NotFound>
    readonly deleteStrike: (
      serverId: string,
      strikeId: string,
    ) => Effect.Effect<StrikeMutation, DatabaseFailure | NotFound>
    readonly listBans: (
      serverId: string,
    ) => Effect.Effect<{ readonly count: number; readonly items: readonly BanItem[] }, DatabaseFailure>
    readonly listStrikes: (
      serverId: string,
      filters: StrikeFilters,
    ) => Effect.Effect<{ readonly count: number; readonly items: readonly StrikeItem[] }, DatabaseFailure>
    readonly saveBan: (
      serverId: string,
      tag: string,
      body: typeof botEndpoints.saveBan.body.Type,
    ) => Effect.Effect<BanMutation, DatabaseFailure>
    readonly strikeSummary: (
      serverId: string,
      tag: string,
    ) => Effect.Effect<{
      readonly player_tag: string
      readonly server_id: string
      readonly strikes: readonly StrikeItem[]
      readonly total_strikes: number
      readonly total_weight: number
    }, DatabaseFailure>
  }
>()("clashking/BotModerationStore") {
  static readonly layer = Layer.effect(
    BotModerationStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const bindings = yield* WorkerEnvironment

      const listBans = Effect.fn("BotModerationStore.listBans")(function* (serverId: string) {
        const rows = yield* database("Unable to load server bans", sql<BanRow>`
          SELECT b.player_tag, b.player_name, b.reason, b.added_by, b.edited_by,
                 b.image, b.created_at, p.name AS current_name,
                 p.townhall_level, p.clan_tag, p.trophies, c.name AS clan_name
          FROM server_bans b
          LEFT JOIN basic_player p ON p.tag = b.player_tag
          LEFT JOIN basic_clan c ON c.tag = p.clan_tag
          WHERE b.server_id = ${serverId}
          ORDER BY b.created_at DESC
        `)
        const items = rows.map((row) => banItem(row, serverId))
        return { items, count: items.length }
      })

      const saveBan = Effect.fn("BotModerationStore.saveBan")(function* (
        serverId: string,
        tag: string,
        body: typeof botEndpoints.saveBan.body.Type,
      ) {
        const playerName = yield* proxyPlayerName(bindings, tag)
        const rows = yield* database("Unable to save server ban", sql<{
          readonly created: boolean
          readonly player_name: string
        }>`
          INSERT INTO server_bans
            (server_id, player_tag, player_name, reason, added_by, image, created_at, updated_at)
          VALUES
            (${serverId}, ${tag}, ${playerName}, ${body.reason}, ${body.added_by},
             NULLIF(${body.image}, ''), now(), now())
          ON CONFLICT (server_id, player_tag) DO UPDATE SET
            reason = EXCLUDED.reason,
            edited_by = server_bans.edited_by || jsonb_build_array(jsonb_build_object(
              'user', EXCLUDED.added_by,
              'previous', jsonb_build_object('reason', server_bans.reason)
            )),
            image = COALESCE(EXCLUDED.image, server_bans.image),
            updated_at = now()
          RETURNING (xmax = 0) AS created, player_name
        `)
        const row = rows[0]
        return {
          status: row?.created === true ? "created" : "updated",
          player_tag: tag,
          ...(row?.player_name ? { player_name: row.player_name } : {}),
          server_id: serverId,
        }
      })

      const deleteBan = Effect.fn("BotModerationStore.deleteBan")(function* (
        serverId: string,
        tag: string,
      ) {
        const rows = yield* database("Unable to delete server ban", sql<{ readonly player_name: string }>`
          DELETE FROM server_bans
          WHERE server_id = ${serverId} AND player_tag = ${tag}
          RETURNING player_name
        `)
        const row = rows[0]
        if (row === undefined) return yield* new NotFound({ message: "Ban not found" })
        return {
          status: "deleted",
          player_tag: tag,
          ...(row.player_name ? { player_name: row.player_name } : {}),
          server_id: serverId,
        }
      })

      const listStrikes = Effect.fn("BotModerationStore.listStrikes")(function* (
        serverId: string,
        filters: StrikeFilters,
      ) {
        const parameters: ReadonlyArray<unknown> = filters.playerTag === undefined
          ? [serverId]
          : [serverId, filters.playerTag]
        const filter = [
          "WHERE s.server_id = $1",
          ...(filters.playerTag === undefined ? [] : ["AND s.tag = $2"]),
          ...(filters.viewExpired ? [] : ["AND (s.rollover_date IS NULL OR s.rollover_date >= now())"]),
          "ORDER BY s.date_created DESC",
        ].join(" ")
        const rows = yield* database(
          "Unable to load server strikes",
          sql.unsafe<StrikeRow>(`${strikeSelect} ${filter}`, parameters),
        )
        const items = rows.map((row) => strikeItem(row, serverId))
        return { items, count: items.length }
      })

      const strikeSummary = Effect.fn("BotModerationStore.strikeSummary")(function* (
        serverId: string,
        tag: string,
      ) {
        const result = yield* listStrikes(serverId, { playerTag: tag, viewExpired: true })
        return {
          player_tag: tag,
          server_id: serverId,
          strikes: result.items,
          total_strikes: result.count,
          total_weight: result.items.reduce((total, item) => total + item.strike_weight, 0),
        }
      })

      const addStrike = Effect.fn("BotModerationStore.addStrike")(function* (
        serverId: string,
        tag: string,
        body: typeof botEndpoints.addStrike.body.Type,
      ) {
        const playerName = yield* proxyPlayerName(bindings, tag)
        const strikeId = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()
        const rolloverDate = body.rollover_days > 0
          ? new Date(Date.now() + body.rollover_days * 86_400_000)
          : null
        yield* database("Unable to add strike", sql`
          INSERT INTO strikes
            (id, server_id, tag, date_created, reason, added_by, strike_weight, rollover_date, image)
          VALUES
            (${strikeId}, ${serverId}, ${tag}, now(), ${body.reason}, ${body.added_by},
             ${body.strike_weight}, ${rolloverDate}, NULLIF(${body.image}, ''))
        `)
        const summary = yield* strikeSummary(serverId, tag)
        return {
          status: "created",
          strike_id: strikeId,
          player_tag: tag,
          player_name: playerName,
          server_id: serverId,
          total_strikes: summary.total_strikes,
          total_weight: summary.total_weight,
        }
      })

      const deleteStrike = Effect.fn("BotModerationStore.deleteStrike")(function* (
        serverId: string,
        strikeId: string,
      ) {
        const rows = yield* database("Unable to delete strike", sql<{ readonly tag: string }>`
          DELETE FROM strikes
          WHERE server_id = ${serverId} AND id = ${strikeId}
          RETURNING tag
        `)
        const row = rows[0]
        if (row === undefined) return yield* new NotFound({ message: "Strike not found" })
        return {
          status: "deleted",
          strike_id: strikeId,
          player_tag: row.tag,
          server_id: serverId,
        }
      })

      return BotModerationStore.of({
        addStrike,
        deleteBan,
        deleteStrike,
        listBans,
        listStrikes,
        saveBan,
        strikeSummary,
      })
    }),
  )
}

export const dispatchBotRuntime = (
  request: Request,
  _bindings: WorkerBindings,
): Effect.Effect<
  Response | undefined,
  ApiFailure,
  ServerAuthorization | SqlClient.SqlClient | BotModerationStore
> => {
  const match = matchRoute(request.method, new URL(request.url).pathname)
  if (match === undefined) return Effect.succeed(undefined)

  return Effect.gen(function* () {
    const serverId = yield* routeInput(() => {
      const value = decodePath(match.params.serverId ?? "")
      validateServerId(value)
      return value
    })
    yield* (yield* ServerAuthorization).require(request, serverId, { section: "moderation", write: request.method !== "GET" })
    const store = yield* BotModerationStore

    switch (match.id) {
      case "listBans":
        return yield* encode(botEndpoints.bans.response, yield* store.listBans(serverId))
      case "saveBan": {
        const tag = yield* routeInput(() => normalizeTag(match.params.tag))
        const body = yield* decodeBody(request, botEndpoints.saveBan.body)
        return yield* encode(botEndpoints.saveBan.response, yield* store.saveBan(serverId, tag, body))
      }
      case "deleteBan": {
        const tag = yield* routeInput(() => normalizeTag(match.params.tag))
        return yield* encode(botEndpoints.deleteBan.response, yield* store.deleteBan(serverId, tag))
      }
      case "listStrikes": {
        const url = new URL(request.url)
        const rawTag = url.searchParams.get("player_tag")
        const viewExpired = yield* parseBoolean(url.searchParams.get("view_expired"))
        const result = yield* store.listStrikes(serverId, {
          ...(rawTag === null || rawTag.trim() === ""
            ? {}
            : { playerTag: yield* routeInput(() => normalizeTag(rawTag)) }),
          viewExpired,
        })
        return yield* encode(botEndpoints.strikes.response, result)
      }
      case "strikeSummary": {
        const tag = yield* routeInput(() => normalizeTag(match.params.tag))
        return yield* encode(
          botEndpoints.strikeSummary.response,
          yield* store.strikeSummary(serverId, tag),
        )
      }
      case "addStrike": {
        const tag = yield* routeInput(() => normalizeTag(match.params.tag))
        const body = yield* decodeBody(request, botEndpoints.addStrike.body)
        if (body.strike_weight < 1 || !Number.isSafeInteger(body.strike_weight)) {
          return yield* new InvalidRequest({ message: "strike_weight must be a positive integer" })
        }
        if (body.rollover_days < 0 || !Number.isSafeInteger(body.rollover_days)) {
          return yield* new InvalidRequest({ message: "rollover_days must be a non-negative integer" })
        }
        return yield* encode(
          botEndpoints.addStrike.response,
          yield* store.addStrike(serverId, tag, body),
        )
      }
      case "deleteStrike": {
        const strikeId = yield* routeInput(() => decodePath(match.params.strikeId ?? "").trim())
        if (strikeId === "") return yield* new InvalidRequest({ message: "strikeId is required" })
        return yield* encode(
          botEndpoints.deleteStrike.response,
          yield* store.deleteStrike(serverId, strikeId),
        )
      }
    }
  })
}

type RouteId =
  | "addStrike"
  | "deleteBan"
  | "deleteStrike"
  | "listBans"
  | "listStrikes"
  | "saveBan"
  | "strikeSummary"

const routePatterns: ReadonlyArray<{
  readonly id: RouteId
  readonly method: string
  readonly pattern: RegExp
  readonly names: readonly string[]
}> = [
  { id: "listBans", method: "GET", pattern: /^\/v2\/server\/([^/]+)\/bans$/u, names: ["serverId"] },
  { id: "saveBan", method: "POST", pattern: /^\/v2\/server\/([^/]+)\/bans\/([^/]+)$/u, names: ["serverId", "tag"] },
  { id: "deleteBan", method: "DELETE", pattern: /^\/v2\/server\/([^/]+)\/bans\/([^/]+)$/u, names: ["serverId", "tag"] },
  { id: "strikeSummary", method: "GET", pattern: /^\/v2\/server\/([^/]+)\/strikes\/player\/([^/]+)\/summary$/u, names: ["serverId", "tag"] },
  { id: "listStrikes", method: "GET", pattern: /^\/v2\/server\/([^/]+)\/strikes$/u, names: ["serverId"] },
  { id: "addStrike", method: "POST", pattern: /^\/v2\/server\/([^/]+)\/strikes\/([^/]+)$/u, names: ["serverId", "tag"] },
  { id: "deleteStrike", method: "DELETE", pattern: /^\/v2\/server\/([^/]+)\/strikes\/([^/]+)$/u, names: ["serverId", "strikeId"] },
]

function matchRoute(method: string, path: string): {
  readonly id: RouteId
  readonly params: Readonly<Record<string, string>>
} | undefined {
  for (const route of routePatterns) {
    if (route.method !== method) continue
    const matched = route.pattern.exec(path)
    if (matched === null) continue
    const params: Record<string, string> = {}
    route.names.forEach((name, index) => {
      params[name] = matched[index + 1] ?? ""
    })
    return { id: route.id, params }
  }
  return undefined
}

function decodeBody<A>(
  request: Request,
  schema: Schema.Codec<A, unknown, never, never>,
): Effect.Effect<A, InvalidRequest | PayloadTooLarge> {
  return Effect.gen(function* () {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return yield* new InvalidRequest({
        message: "Content-Type must be application/json",
        status: 415,
      })
    }
    const body = yield* readBoundedJson(request)
    return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError(() => new InvalidRequest({ message: "Request body failed schema validation" })),
    )
  })
}

function encode<A>(
  schema: Schema.Codec<A, unknown, never, never>,
  value: A,
): Effect.Effect<Response, DatabaseFailure> {
  return Schema.encodeUnknownEffect(schema)(value).pipe(
    Effect.map((body) => Response.json(body, {
      headers: { "content-type": "application/json; charset=utf-8" },
    })),
    Effect.mapError((cause) => new DatabaseFailure({
      cause,
      message: "Bot response failed its contract",
    })),
  )
}

function database<A>(
  message: string,
  effect: Effect.Effect<A, unknown>,
): Effect.Effect<A, DatabaseFailure> {
  return effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message })))
}

function parseBoolean(value: string | null): Effect.Effect<boolean, InvalidRequest> {
  if (value === null || value === "false") return Effect.succeed(false)
  if (value === "true") return Effect.succeed(true)
  return Effect.fail(new InvalidRequest({ message: "view_expired must be true or false" }))
}

function routeInput<A>(evaluate: () => A): Effect.Effect<A, InvalidRequest> {
  return Effect.try({
    try: evaluate,
    catch: (cause) => new InvalidRequest({
      message: cause instanceof Error ? cause.message : "Invalid route input",
    }),
  })
}

function validateServerId(value: string): void {
  const decoded = decodePath(value)
  if (!/^\d+$/u.test(decoded)) throw new Error("serverId must contain only digits")
}

function normalizeTag(value: string | undefined): string {
  const tag = decodePath(value ?? "").trim().toUpperCase().replace(/^#/u, "").replaceAll("O", "0")
  if (!/^[0289PYLQGRJCUV]+$/u.test(tag)) throw new Error("Invalid Clash tag")
  return `#${tag}`
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error("Path parameter is not valid percent encoding")
  }
}

interface BanRow {
  readonly added_by: string
  readonly clan_name: string | null
  readonly clan_tag: string | null
  readonly created_at: Date | string
  readonly current_name: string | null
  readonly edited_by: unknown
  readonly image: string | null
  readonly player_name: string
  readonly player_tag: string
  readonly reason: string
  readonly townhall_level: number | null
  readonly trophies: number | null
}

const EditedBy = Schema.Array(Schema.Struct({
  user: Schema.String,
  previous: Schema.Struct({ reason: Schema.String }),
}))

function banItem(row: BanRow, server: string): BanItem {
  let editedBy: typeof EditedBy.Type = []
  try {
    editedBy = Schema.decodeUnknownSync(EditedBy)(row.edited_by)
  } catch {
    editedBy = []
  }
  return {
    VillageTag: row.player_tag,
    VillageName: row.player_name,
    DateCreated: timestamp(row.created_at),
    Notes: row.reason,
    server,
    added_by: row.added_by,
    edited_by: editedBy,
    ...(row.image === null ? {} : { image: row.image }),
    ...(row.current_name === null ? {} : { name: row.current_name }),
    ...(row.townhall_level === null ? {} : { town_hall: row.townhall_level }),
    ...(row.clan_tag === null ? {} : { clan_tag: row.clan_tag }),
    ...(row.clan_name === null ? {} : { clan_name: row.clan_name }),
    ...(row.trophies === null ? {} : { trophies: row.trophies }),
  }
}

interface StrikeRow {
  readonly added_by: string
  readonly clan_name: string | null
  readonly clan_tag: string | null
  readonly date_created: Date | string
  readonly id: string
  readonly image: string | null
  readonly player_name: string | null
  readonly reason: string
  readonly rollover_date: Date | string | null
  readonly strike_weight: number | null
  readonly tag: string
  readonly townhall_level: number | null
  readonly trophies: number | null
}

const strikeSelect = `
  SELECT s.id, s.tag, s.date_created, s.reason, s.added_by, s.strike_weight,
         s.rollover_date, s.image, p.name AS player_name, p.townhall_level,
         p.clan_tag, p.trophies, c.name AS clan_name
  FROM strikes s
  LEFT JOIN basic_player p ON p.tag = s.tag
  LEFT JOIN basic_clan c ON c.tag = p.clan_tag
`

function strikeItem(row: StrikeRow, server: string): StrikeItem {
  return {
    strike_id: row.id,
    tag: row.tag,
    server,
    reason: row.reason,
    added_by: row.added_by,
    strike_weight: row.strike_weight ?? 1,
    date_created: timestamp(row.date_created),
    ...(row.rollover_date === null ? {} : {
      rollover_date: Math.floor(new Date(row.rollover_date).getTime() / 1000),
    }),
    ...(row.image === null ? {} : { image: row.image }),
    ...(row.player_name === null ? {} : { player_name: row.player_name }),
    ...(row.townhall_level === null ? {} : { town_hall: row.townhall_level }),
    ...(row.clan_tag === null ? {} : { clan_tag: row.clan_tag }),
    ...(row.clan_name === null ? {} : { clan_name: row.clan_name }),
    ...(row.trophies === null ? {} : { trophies: row.trophies }),
  }
}

function timestamp(value: Date | string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 19)
}

function proxyPlayerName(bindings: WorkerBindings, tag: string): Effect.Effect<string> {
  return Effect.tryPromise({
    try: async () => {
      const response = await bindings.CLASH_PROXY.fetch(new Request(
        `https://clash-proxy/v1/players/${encodeURIComponent(tag)}`,
        { headers: { accept: "application/json" } },
      ))
      if (!response.ok) return tag
      const decoded = await Schema.decodeUnknownPromise(
        Schema.Struct({ name: Schema.String }),
      )(await response.json())
      return decoded.name
    },
    catch: () => tag,
  }).pipe(Effect.catch(() => Effect.succeed(tag)))
}
