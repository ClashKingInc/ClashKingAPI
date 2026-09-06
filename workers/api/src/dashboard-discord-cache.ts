import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { WorkerBindings } from "./environment.js"

// The Gateway has no list-completeness marker. Only enrich parent IDs already
// returned by the live active-thread request; never derive a channel/role list
// or an authorization decision from these rows. This conservative display-only
// age limit is an explicit implementation choice, not a Gateway health signal.
export const dashboardDiscordParentMaxAgeMs = 60_000
const maximumDisplayItems = 2_000

const CachedItem = Schema.Struct({
  id: Schema.String,
  guild_id: Schema.String,
  updated_at: Schema.Unknown,
  data: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    guild_id: Schema.optionalKey(Schema.String),
  }),
})
const CachedItems = Schema.Array(CachedItem)

// Both the guild and requested parent IDs are bound values, never identifiers.
const statement = `SELECT id, guild_id, updated_at, data FROM discord_cache.channels
  WHERE guild_id = $1 AND id = ANY($2::text[]) LIMIT 2001`

const milliseconds = (value: unknown): number => value instanceof Date
  ? value.getTime()
  : typeof value === "string" ? Date.parse(value) : NaN

/** Gateway updated_at means last mutation, not a heartbeat. Cache a successful
 * live fallback separately with its observation time, so unchanged channels do
 * not force the same Discord list request on every Dashboard refresh. */
export const dashboardThreadParentNames = <E, R>(bindings: WorkerBindings, guildId: string, parentIds: ReadonlyArray<string>,
  live: () => Effect.Effect<ReadonlyMap<string, string>, E, R>) => Effect.gen(function* () {
  const wanted = [...new Set(parentIds)]
  if (wanted.length === 0) return new Map<string, string>()
  const key = `dashboard:thread-parent-names:v1:${bindings.DISCORD_CLIENT_ID}:${guildId}`
  const Snapshot = Schema.Struct({ observedAt: Schema.Number, guildId: Schema.String,
    names: Schema.Array(Schema.Tuple([Schema.String, Schema.String])).check(Schema.isMaxLength(maximumDisplayItems)) })
  const fromLive = yield* Effect.tryPromise({ try: () => bindings.API_CACHE.get(key, "json"), catch: () => undefined }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Snapshot)),
    Effect.timeoutOption("250 millis"), Effect.map(Option.getOrUndefined), Effect.catch(() => Effect.succeed(undefined)),
  )
  if (fromLive !== undefined && fromLive.guildId === guildId && fromLive.observedAt <= Date.now() &&
      Date.now() - fromLive.observedAt < dashboardDiscordParentMaxAgeMs) {
    const names = new Map(fromLive.names)
    if (wanted.every((id) => names.has(id))) return names
  }
  const gateway = yield* readDashboardThreadParentNames(guildId, wanted)
  if (gateway !== undefined) return gateway
  const names = yield* live()
  if (names.size <= maximumDisplayItems) yield* Effect.tryPromise({
    try: () => bindings.API_CACHE.put(key, JSON.stringify({ observedAt: Date.now(), guildId, names: [...names] }), { expirationTtl: 60 }),
    catch: () => undefined,
  }).pipe(Effect.timeoutOption("250 millis"), Effect.catch(() => Effect.void))
  return names
})

/** All requested parent names or a miss. Missing cache rows never mean absent channels. */
export const readDashboardThreadParentNames = (
  guildId: string,
  parentIds: ReadonlyArray<string>,
): Effect.Effect<ReadonlyMap<string, string> | undefined, never, SqlClient.SqlClient> => Effect.gen(function* () {
  const wanted = new Set(parentIds)
  if (wanted.size === 0) return new Map<string, string>()
  if (wanted.size > maximumDisplayItems || !/^\d+$/u.test(guildId) ||
      [...wanted].some((id) => !/^\d+$/u.test(id))) return undefined
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe(statement, [guildId, [...wanted]])
  const items = yield* Schema.decodeUnknownEffect(CachedItems)(rows)
  if (items.length !== wanted.size) return undefined
  const now = yield* Effect.sync(() => Date.now())
  const names = new Map<string, string>()
  for (const item of items) {
    const written = milliseconds(item.updated_at)
    if (item.guild_id !== guildId || !wanted.has(item.id) || names.has(item.id) ||
        !Number.isFinite(written) || written > now || now - written >= dashboardDiscordParentMaxAgeMs ||
        item.data.id !== item.id || item.data.guild_id !== undefined && item.data.guild_id !== guildId) return undefined
    names.set(item.id, item.data.name)
  }
  return names
}).pipe(
  Effect.timeoutOption("250 millis"),
  Effect.map((value) => Option.getOrUndefined(value)),
  Effect.catch(() => Effect.succeed(undefined)),
  Effect.catchDefect(() => Effect.succeed(undefined)),
)
