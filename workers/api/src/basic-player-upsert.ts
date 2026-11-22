import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"

import type { WorkerBindings } from "./environment.js"
import { readBoundedJson } from "./request-body.js"

export const BasicClashPlayer = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  townHallLevel: Schema.Number,
  trophies: Schema.optionalKey(Schema.Number),
  clan: Schema.optionalKey(Schema.Struct({ tag: Schema.String })),
  leagueTier: Schema.optionalKey(Schema.Struct({ id: Schema.Number })),
})

export interface BasicPlayerObservation {
  readonly tag: string
  readonly name: string
  readonly townHallLevel: number
  readonly trophies?: number | undefined
  readonly clanTag?: string | null | undefined
  readonly clanTagKnown: boolean
  readonly leagueId?: number | null | undefined
  readonly observedAt: string
}

export const basicPlayerObservation = (
  player: typeof BasicClashPlayer.Type,
  observedAt: string,
): BasicPlayerObservation => ({
  tag: player.tag,
  name: player.name,
  townHallLevel: player.townHallLevel,
  trophies: player.trophies,
  clanTag: player.clan?.tag ?? null,
  clanTagKnown: player.clan !== undefined || player.trophies !== undefined,
  leagueId: player.leagueTier?.id ?? null,
  observedAt,
})

/** Observation-ordered upsert matching clashking_tracking/internal/utils/basic_players.go
 * so API writes never overwrite fresher tracking snapshots. */
export const upsertBasicPlayer = (sql: SqlClient.SqlClient, player: BasicPlayerObservation) => {
  const name = player.name.trim()
  if (player.tag.trim() === "" || name === "" || !Number.isInteger(player.townHallLevel) || player.townHallLevel <= 0) {
    return Effect.void
  }
  const trophies = typeof player.trophies === "number" && Number.isFinite(player.trophies)
    ? Math.max(0, Math.trunc(player.trophies)) : 0
  const leagueId = typeof player.leagueId === "number" && Number.isInteger(player.leagueId) && player.leagueId > 0
    ? player.leagueId : null
  const clanTag = player.clanTagKnown && typeof player.clanTag === "string" && player.clanTag.trim() !== ""
    ? player.clanTag.trim() : null
  return sql`
    INSERT INTO basic_player (tag, name, league_id, clan_tag, townhall_level, trophies, observed_at)
    VALUES (${player.tag}, ${player.name}, ${leagueId}, ${clanTag}, ${player.townHallLevel}, ${trophies}, ${player.observedAt}::timestamptz)
    ON CONFLICT (tag) DO UPDATE SET
      observed_at = EXCLUDED.observed_at,
      name = EXCLUDED.name,
      league_id = COALESCE(EXCLUDED.league_id, basic_player.league_id),
      clan_tag = CASE WHEN ${player.clanTagKnown} THEN EXCLUDED.clan_tag ELSE basic_player.clan_tag END,
      townhall_level = EXCLUDED.townhall_level,
      trophies = CASE WHEN EXCLUDED.trophies > 0 THEN EXCLUDED.trophies ELSE basic_player.trophies END
    WHERE basic_player.observed_at < EXCLUDED.observed_at
  `.pipe(Effect.asVoid)
}

type HydratedPlayerEntry = readonly [string, { readonly name: string; readonly townHallLevel: number }]

/** Bounded best-effort hydration for linked players missing from basic_player.
 * Never throws or blocks beyond the modal latency budget. */
export const hydrateMissingBasicPlayers = (
  sql: SqlClient.SqlClient,
  bindings: Pick<WorkerBindings, "CLASH_PROXY">,
  tags: ReadonlyArray<string>,
  options?: { readonly limit?: number; readonly timeoutMs?: number },
): Effect.Effect<Map<string, { readonly name: string; readonly townHallLevel: number }>> => {
  const unique = [...new Set(tags)].slice(0, options?.limit ?? 10)
  if (unique.length === 0) return Effect.succeed(new Map())
  const timeoutMs = options?.timeoutMs ?? 750
  return Effect.forEach(unique, (tag): Effect.Effect<HydratedPlayerEntry | undefined> => Effect.gen(function* () {
    const observedAt = new Date().toISOString()
    const response = yield* Effect.tryPromise(() =>
      bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/players/${encodeURIComponent(tag)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      })),
    )
    if (!response.ok) {
      yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve())
      return undefined
    }
    const raw = yield* readBoundedJson(response)
    const player = yield* Schema.decodeUnknownEffect(BasicClashPlayer)(raw)
    if (player.tag !== tag || player.name.trim() === "" || !Number.isInteger(player.townHallLevel) || player.townHallLevel <= 0) {
      return undefined
    }
    yield* upsertBasicPlayer(sql, basicPlayerObservation(player, observedAt)).pipe(Effect.catch(() => Effect.void))
    return [tag, { name: player.name, townHallLevel: player.townHallLevel }] as const
  }).pipe(
    Effect.timeout(`${timeoutMs} millis`),
    Effect.catch(() => Effect.succeed(undefined)),
  ), { concurrency: 10 }).pipe(
    Effect.map((entries) => {
      const hydrated = new Map<string, { readonly name: string; readonly townHallLevel: number }>()
      for (const entry of entries) if (entry !== undefined) hydrated.set(entry[0], entry[1])
      return hydrated
    }),
  )
}
