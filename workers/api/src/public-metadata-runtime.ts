import {
  GuildSummaryQuery, GuildSummaryResponse, publicEnumCatalog, publicMetadataEndpoints,
} from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"

export const publicMetadataRuntimeRoutes = [
  { method: "GET", path: "/v2/config/public" },
  { method: "GET", path: "/v2/public-config" },
  { method: "GET", path: "/v2/enums" },
  { method: "GET", path: "/v2/enums/role-types" },
  { method: "GET", path: "/v2/enums/role-modes" },
  { method: "GET", path: "/v2/enums/log-types" },
  { method: "GET", path: "/v2/enums/countdown-types" },
  { method: "GET", path: "/v2/activity/guild-summary" },
] as const

const Member = Schema.Struct({
  tag: Schema.String,
  trophies: Schema.optionalKey(Schema.Int),
  donations: Schema.optionalKey(Schema.Int),
  donationsReceived: Schema.optionalKey(Schema.Int),
})
const Clan = Schema.Struct({ memberList: Schema.optionalKey(Schema.Array(Member)) })
type SummaryClan = { readonly tag: string; readonly name: string; readonly members: readonly (typeof Member.Type)[] }

export class GuildActivityStore extends Context.Service<GuildActivityStore, {
  readonly summarize: (guildId: string, inactiveDays: number) => Effect.Effect<typeof GuildSummaryResponse.Type, ApiFailure>
}>()("clashking/GuildActivityStore") {
  static readonly layer = Layer.effect(GuildActivityStore, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const bindings = yield* WorkerEnvironment
    return GuildActivityStore.of({
      summarize: (guildId, inactiveDays) => Effect.gen(function* () {
        const server = yield* database(sql<{ id: string }>`SELECT id FROM servers WHERE id = ${guildId}`)
        if (server.length === 0) return yield* new NotFound({ message: "Server not found" })
        // server_clans.data no longer exists in the authoritative Goose schema;
        // the old handler only used tag/name from this join for the summary.
        const clans = yield* database(sql<{ tag: string; name: string }>`
          SELECT sc.tag, clan.name FROM server_clans sc
          JOIN basic_clan clan ON clan.tag = sc.tag
          WHERE sc.server_id = ${guildId} ORDER BY sc.tag
        `)
        const entries = yield* Effect.forEach(clans, (clan) => Effect.tryPromise({
          try: async () => {
            const response = await bindings.CLASH_PROXY.fetch(new Request(
              `https://clash-proxy/v1/clans/${encodeURIComponent(clan.tag)}`,
            ))
            if (!response.ok) {
              await response.body?.cancel()
              return undefined
            }
            const value = Schema.decodeUnknownSync(Clan)(await response.json())
            return { ...clan, members: value.memberList ?? [] }
          },
          catch: () => undefined,
        }).pipe(Effect.catch(() => Effect.succeed(undefined))), { concurrency: 5 })
        // Existing Go behavior omits clans whose upstream fetch/decode fails.
        const available = entries.filter((clan): clan is SummaryClan => clan !== undefined)
        const tags = [...new Set(available.flatMap((clan) => clan.members.map((member) => member.tag)))]
        const online = tags.length === 0 ? [] : yield* database(sql.unsafe<{ tag: string; last_online: number }>(`
          SELECT DISTINCT ON (tag) tag, floor(extract(epoch FROM seen_at))::float8 AS last_online
          FROM player_online_events WHERE tag = ANY($1::text[]) ORDER BY tag, seen_at DESC
        `, [tags]))
        return summarizeGuildActivity(guildId, available, new Map(online.map((row) => [row.tag, row.last_online])),
          Math.floor(Date.now() / 1000) - inactiveDays * 86400)
      }),
    })
  }))
}

export function summarizeGuildActivity(
  guildId: string, clans: readonly SummaryClan[], lastOnline: ReadonlyMap<string, number>, cutoff: number,
): typeof GuildSummaryResponse.Type {
  const summaries = clans.map((clan) => {
    const n = clan.members.length
    const active = clan.members.filter((member) => (lastOnline.get(member.tag) ?? 0) > cutoff).length
    const sent = clan.members.reduce((sum, member) => sum + (member.donations ?? 0), 0)
    const received = clan.members.reduce((sum, member) => sum + (member.donationsReceived ?? 0), 0)
    const trophies = clan.members.reduce((sum, member) => sum + (member.trophies ?? 0), 0)
    return {
      clan_tag: clan.tag, clan_name: clan.name, total_members: n, active_members: active,
      inactive_members: n - active, activity_rate: n ? active / n * 100 : 0,
      average_donations_sent: n ? sent / n : 0, average_donations_received: n ? received / n : 0,
      total_donations_sent: sent, total_donations_received: received, average_trophies: n ? trophies / n : 0,
    }
  })
  const totalMembers = summaries.reduce((sum, row) => sum + row.total_members, 0)
  const totalActive = summaries.reduce((sum, row) => sum + row.active_members, 0)
  return {
    guild_id: guildId, total_clans: summaries.length, total_members: totalMembers,
    total_active_members: totalActive, total_inactive_members: totalMembers - totalActive,
    overall_activity_rate: totalMembers ? totalActive / totalMembers * 100 : 0,
    total_donations_sent: summaries.reduce((sum, row) => sum + row.total_donations_sent, 0),
    total_donations_received: summaries.reduce((sum, row) => sum + row.total_donations_received, 0),
    clans: summaries,
  }
}

export function dispatchPublicMetadata(
  request: Request, bindings: Pick<WorkerBindings, "SENTRY_DSN_MOBILE">,
): Effect.Effect<Response | undefined, ApiFailure, GuildActivityStore> {
  return Effect.gen(function* () {
    if (request.method !== "GET") return undefined
    const url = new URL(request.url)
    switch (url.pathname) {
      case "/v2/config/public":
        return Response.json({ sentry_dsn_mobile: bindings.SENTRY_DSN_MOBILE ?? "" })
      case "/v2/public-config":
        return Response.json({ sentry_dsn: bindings.SENTRY_DSN_MOBILE ?? "" })
      case "/v2/enums": return Response.json(publicEnumCatalog)
      case "/v2/enums/role-types": return enumResponse(publicEnumCatalog.role_types)
      case "/v2/enums/role-modes": return enumResponse(publicEnumCatalog.role_modes)
      case "/v2/enums/log-types": return enumResponse(publicEnumCatalog.log_types)
      case "/v2/enums/countdown-types": return enumResponse(publicEnumCatalog.countdown_types)
      case "/v2/activity/guild-summary": {
        const raw = url.searchParams.get("inactive_threshold_days") ?? ""
        // Go's Atoi falls back to seven days for missing or malformed values.
        const parsed = /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN
        const inactiveDays = Number.isSafeInteger(parsed) ? parsed : 7
        const query = yield* Schema.decodeUnknownEffect(GuildSummaryQuery)({
          guild_id: url.searchParams.get("guild_id"), inactive_threshold_days: inactiveDays,
        }).pipe(Effect.mapError(() => new InvalidRequest({ message: "guild_id is required and must be a decimal Discord ID" })))
        if (BigInt(query.guild_id) === 0n) return yield* new InvalidRequest({ message: "guild_id is required" })
        const store = yield* GuildActivityStore
        const summary = yield* store.summarize(query.guild_id, inactiveDays)
        const encoded = yield* Schema.encodeEffect(publicMetadataEndpoints.guildSummary.response)(summary).pipe(
          Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Invalid guild activity response" })),
        )
        return Response.json(encoded)
      }
      default: return undefined
    }
  })
}

function enumResponse(values: readonly (typeof publicEnumCatalog.role_types[number] | typeof publicEnumCatalog.role_modes[number] | typeof publicEnumCatalog.log_types[number] | typeof publicEnumCatalog.countdown_types[number])[]) {
  return Response.json({ values, count: values.length })
}

function database<A, E>(effect: Effect.Effect<A, E>) {
  return effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Guild activity query failed" })))
}
