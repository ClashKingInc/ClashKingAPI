import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { compareRosterValues, normalizeRosterMetricParameters, presentRosterView, queryDynamicRosterMetric, validateRosterViewSpec } from "./dashboard-roster-metrics.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

// These recipe tests exercise pending JSON archive records, not the independent
// Workers-only WASM frame decoder.
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected archive frame decoding") } }))

describe("roster metric recipes", () => {
  it("normalizes bounded replay windows and drops unrelated parameters", () => {
    expect(normalizeRosterMetricParameters("war.hit_rate", { windowDays: 15.9, arbitrary: "x" })).toEqual({ windowDays: 15 })
    expect(normalizeRosterMetricParameters("trophies.delta", { windowDays: 400, seasonOffset: 2.5 })).toEqual({ windowDays: 7, seasonOffset: 2 })
    expect(normalizeRosterMetricParameters("cwl.stars")).toEqual({})
  })

  it("uses real archived pending war attacks and excludes non-CWL attacks for CWL stars", async () => {
    const clan = (tag: string, stars: number) => ({ tag, name: "Clan", badgeToken: "", clanLevel: 1, attacks: 1, stars, destructionPercentage: 100,
      members: [{ tag: "#P", name: "Player", townhallLevel: 17, mapPosition: 1, attacks: [{ defenderTag: "#D", stars, destructionPercentage: 100, duration: 100, order: 1 }] }] })
    const war = (stars: number) => ({ state: "warEnded", teamSize: 1, attacksPerMember: 2, battleModifier: "none",
      preparationStartTime: "2026-08-31T00:00:00Z", startTime: "2026-09-01T00:00:00Z", endTime: "2026-09-02T00:00:00Z",
      clan: clan("#C", stars), opponent: { tag: "#O", name: "Opponent", badgeToken: "", clanLevel: 1, attacks: 0, stars: 0, destructionPercentage: 0,
        members: [{ tag: "#D", name: "Defender", townhallLevel: 17, mapPosition: 1, attacks: null }] },
    })
    const sql = ((strings: TemplateStringsArray, ...parameters: unknown[]) => {
      const query = strings.join("?")
      if (query.includes("SELECT tag FROM roster_members")) return Effect.succeed([{ tag: "#P" }, { tag: "#NONE" }])
      if (query.includes("player_war_history")) return Effect.succeed([{ war_id: 1 }, { war_id: 2 }])
      if (query.includes("LEFT JOIN war_archive_pending")) return Effect.succeed([parameters[0] === "1"
        ? { war_id: "1", war_type: "cwl", payload: war(3) }
        : { war_id: "2", war_type: "random", payload: war(1) }])
      if (query.includes("WITH packed")) return Effect.succeed([{ townhall: 17, attacks: "2", triples: "1" }])
      return Effect.die(`Unexpected SQL: ${query}`)
    }) as unknown as SqlClient.SqlClient
    const deps = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(WorkerEnvironment, {} as WorkerBindings))
    const hitRate = await Effect.runPromise(queryDynamicRosterMetric("roster", "war.hit_rate", {}, new Date("2026-09-03T00:00:00Z")).pipe(Effect.provide(deps)))
    expect(hitRate.get("#P")).toBe(50)
    expect(hitRate.get("#NONE")).toBeNull()
    const cwlStars = await Effect.runPromise(queryDynamicRosterMetric("roster", "cwl.stars", {}, new Date("2026-09-03T00:00:00Z")).pipe(Effect.provide(deps)))
    expect(cwlStars.get("#P")).toBe(3)
    const benchmark = await Effect.runPromise(queryDynamicRosterMetric("roster", "benchmark.th_hit_rate_delta", {}, new Date("2026-09-03T00:00:00Z")).pipe(Effect.provide(deps)))
    expect(benchmark.get("#P")).toBe(-50)
  })

  it("keeps null observations distinct from zero and sorts numeric strings as strings", () => {
    expect(compareRosterValues(null, 0)).toBe(1)
    expect(compareRosterValues("10", "2")).toBe(-1)
    expect(compareRosterValues(10, 2)).toBe(1)
  })

  it("filters and sorts before applying limits and one-based rank", () => {
    const spec = { schemaVersion: 1 as const,
      columns: [{ id: "score", label: "Score", metricId: "war.hit_rate" }, { id: "rank", label: "Rank", metricId: "view.rank" }],
      filters: [{ columnId: "score", operator: "gt" as const, value: 30 }], sort: [{ columnId: "score", direction: "desc" as const }], limit: 2,
    }
    const rows = [20, 40, 80, 50].map((score, index) => ({ rosterId: "r", playerTag: `#${index}`, values: { score } }))
    expect(presentRosterView(rows, spec).map((row) => row.values)).toEqual([{ score: 80, rank: 1 }, { score: 50, rank: 2 }])
  })

  it("rejects duplicate columns and nonexistent highlight targets", async () => {
    const column = { id: "player", label: "Player", metricId: "player.name" }
    await expect(Effect.runPromise(validateRosterViewSpec({ schemaVersion: 1, columns: [column, column] }, new Set(["player.name"])))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(validateRosterViewSpec({ schemaVersion: 1, columns: [column], highlights: [
      { id: "highlight", target: "cell", columnId: "missing", tone: "red" },
    ] }, new Set(["player.name"])))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
