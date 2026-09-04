import { Effect, Schema } from "effect"

import { NotFound, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { calculateRosterMaxPercent, rosterHeroLevelSum } from "./static-metadata.js"
import { readBoundedJson } from "./request-body.js"

const Unit = Schema.Struct({ name: Schema.String, level: Schema.Number, village: Schema.optionalKey(Schema.String) })
export const RosterClashPlayer = Schema.Struct({
  tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number, trophies: Schema.Number,
  clan: Schema.optionalKey(Schema.Struct({ tag: Schema.String, name: Schema.String })),
  leagueTier: Schema.optionalKey(Schema.Struct({ id: Schema.Number, name: Schema.String })),
  troops: Schema.Array(Unit), spells: Schema.Array(Unit), heroes: Schema.Array(Unit),
})

/** Only an authoritative Clash 404 is a missing player; outages and malformed
 * successful payloads stay explicit upstream failures. */
export const loadRosterClashPlayer = (bindings: Pick<WorkerBindings, "CLASH_PROXY">, tag: string) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy.internal/v1/players/${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(15_000) })),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash player lookup failed" }),
  })
  if (!response.ok) {
    // Release an unread upstream body without replacing the authoritative
    // missing-player/outage classification if cleanup itself fails.
    yield* Effect.promise(async () => { try { await response.body?.cancel() } catch { /* Best-effort cleanup. */ } })
    if (response.status === 404) return yield* new NotFound({ message: "Clash player not found" })
    return yield* new UpstreamUnavailable({ cause: response.status, message: "Clash player lookup failed" })
  }
  const value = yield* readBoundedJson(response).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash player returned invalid or oversized JSON" })),
  )
  const player = yield* Schema.decodeUnknownEffect(RosterClashPlayer)(value).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash player response failed validation" })),
  )
  if (player.tag !== tag) return yield* new UpstreamUnavailable({ cause: player.tag, message: "Clash player response did not match the requested tag" })
  return player
})

export const rosterPlayerSnapshot = (player: typeof RosterClashPlayer.Type) => ({
  tag: player.tag, name: player.name, townhall: player.townHallLevel, trophies: player.trophies,
  hero_level_sum: rosterHeroLevelSum(player.heroes), max_percent: calculateRosterMaxPercent(player),
  refreshed_at: new Date().toISOString(), current_clan: player.clan?.name ?? "", current_clan_tag: player.clan?.tag ?? "",
  ...(player.leagueTier === undefined ? {} : { league_id: player.leagueTier.id, league_name: player.leagueTier.name }),
})

/** The existing single-member and bulk-edit APIs retain the supplied snapshot
 * on a failed live lookup; canonical data refresh reports failures separately. */
export const hydrateRosterMember = (bindings: WorkerBindings, member: Readonly<Record<string, unknown>>) => {
  const tag = typeof member.tag === "string" ? `#${member.tag.trim().replace(/^#/u, "").toUpperCase()}` : ""
  return loadRosterClashPlayer(bindings, tag).pipe(
    Effect.map((player): Record<string, unknown> => ({ ...member, ...rosterPlayerSnapshot(player) })),
    Effect.catchTag("NotFound", () => Effect.succeed({ ...member, tag })),
    Effect.catchTag("UpstreamUnavailable", () => Effect.succeed({ ...member, tag })),
  )
}
