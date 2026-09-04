import { AchievementsCheckEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import type { WorkerBindings } from "./environment.js"
import { checkMobileAchievements } from "./mobile-achievements.js"

const userId = "2534567890123456789"
const setup = (tags: readonly string[], fetch: (request: Request) => Promise<Response>, failAwards = false) => {
  const awards = new Map<string, { achievement_id: string; tag: string }>()
  const statements: Array<{ text: string; parameters: unknown[] }> = []
  const query = (strings: TemplateStringsArray, ...parameters: unknown[]) => {
    const text = strings.join("?")
    statements.push({ text, parameters })
    if (text.includes("SELECT tag, order_index")) return Effect.succeed(tags.map((tag, order_index) => ({ tag, order_index, added_at: "2026-09-03T00:00:00Z" }))
      .filter(({ order_index }) => parameters[1] === null || order_index > Number(parameters[2])).slice(0, 128))
    if (text.includes("INSERT INTO achievement_player_awards")) {
      if (failAwards) return Effect.fail(new Error("Fixture database failure"))
      const tag = String(parameters[0]), achievement_id = String(parameters[2])
      awards.set(`${tag}/${achievement_id}`, { achievement_id, tag })
      return Effect.succeed([])
    }
    if (text.includes("count(*)")) {
      const counts = new Map<string, number>()
      for (const award of awards.values()) counts.set(award.achievement_id, (counts.get(award.achievement_id) ?? 0) + 1)
      return Effect.succeed([...counts].map(([achievement_id, count]) => ({ achievement_id, count: String(count) })))
    }
    return Effect.die(new Error(`Unexpected fixture SQL: ${text}`))
  }
  const bindings = { CLASH_PROXY: { fetch } } as unknown as WorkerBindings
  return {
    awards, statements,
    run: () => Effect.runPromise(checkMobileAchievements(userId, bindings).pipe(Effect.provideService(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient))),
  }
}

describe("mobile achievement checks", () => {
  it("returns the exact four catalog entries without inventing Legend awards", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({})))
    const fixture = setup([], fetch)
    const response = await fixture.run()
    expect(Schema.decodeUnknownSync(AchievementsCheckEndpoint.response)(response)).toEqual(response)
    expect(response.items.map((item) => [item.id, item.earned_count, item.repeatable])).toEqual([
      ["townhall_18", 0, true], ["war_warrior", 0, true], ["mr_legend", 0, true], ["defense_doesnt_matter", 0, true],
    ])
    expect(response.items.map((item) => item.asset_url)).toEqual([
      "https://assets.clashk.ing/achievements/town-hall-18-achievement-badge.glb",
      "https://assets.clashk.ing/achievements/war-champion-achievement-badge.glb",
      "https://assets.clashk.ing/achievements/perfect-legends-day-achievement-badge.glb",
      "https://assets.clashk.ing/achievements/bad-legends-achievement-badge.glb",
    ])
    expect(fetch).not.toHaveBeenCalled()
    expect(fixture.statements.every(({ parameters }) => parameters.includes(userId))).toBe(true)
  })

  it.each([
    [17, 4999, []], [18, 4999, ["townhall_18"]], [17, 5000, ["war_warrior"]], [18, 5000, ["townhall_18", "war_warrior"]],
  ])("evaluates TH%s and %s war stars exactly at the existing thresholds", async (townHallLevel, warStars, expected) => {
    const fixture = setup(["#P0Y"], async () => Response.json({ tag: "#P0Y", townHallLevel, warStars }))
    await fixture.run()
    await fixture.run()
    expect([...fixture.awards.values()].map((award) => award.achievement_id)).toEqual(expected)
    for (const { text, parameters } of fixture.statements.filter(({ text }) => text.includes("INSERT INTO"))) {
      expect(text).toContain("is_verified = true FOR UPDATE")
      expect(text).toContain("'lifetime'")
      expect(text).toContain("ON CONFLICT DO NOTHING")
      expect(parameters[1]).toBe(userId)
    }
  })

  it("skips network, HTTP, malformed, mismatched, and oversized player responses", async () => {
    const tags = ["#NETWORK", "#HTTP", "#JSON", "#OTHER", "#LARGE", "#GOOD"]
    const fixture = setup(tags, async (request) => {
      const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "")
      if (tag === "#NETWORK") throw new Error("Offline")
      if (tag === "#HTTP") return new Response(null, { status: 503 })
      if (tag === "#JSON") return new Response("broken")
      if (tag === "#LARGE") return new Response("x".repeat(1024 * 1024 + 1))
      return Response.json({ tag: tag === "#OTHER" ? "#UNRELATED" : tag, townHallLevel: 18, warStars: 0 })
    })
    await fixture.run()
    expect([...fixture.awards.values()]).toEqual([{ tag: "#GOOD", achievement_id: "townhall_18" }])
  })

  it("propagates database award failures instead of treating them as an upstream skip", async () => {
    const fixture = setup(["#P0Y"], async () => Response.json({ tag: "#P0Y", townHallLevel: 18, warStars: 5000 }), true)
    await expect(fixture.run()).rejects.toMatchObject({ _tag: "DatabaseFailure", message: "Unable to award player achievement" })
  })

  it("keeps live player requests concurrent but bounded to four", async () => {
    let active = 0, maximum = 0
    const tags = Array.from({ length: 9 }, (_, index) => `#PLAYER${index}`)
    const fixture = setup(tags, async (request) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return Response.json({ tag: decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? ""), townHallLevel: 17, warStars: 0 })
    })
    await fixture.run()
    expect(maximum).toBe(4)
    expect(active).toBe(0)
  })

  it("continues beyond the first link page without truncating or refetching players", async () => {
    const tags = Array.from({ length: 129 }, (_, index) => `#PLAYER${index}`)
    const fetched: string[] = []
    const fixture = setup(tags, async (request) => {
      const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "")
      fetched.push(tag)
      return Response.json({ tag, townHallLevel: 17, warStars: 0 })
    })
    await fixture.run()
    expect(fetched).toHaveLength(129)
    expect(new Set(fetched)).toEqual(new Set(tags))
    expect(fixture.statements.filter(({ text }) => text.includes("SELECT tag, order_index"))).toHaveLength(2)
  })
})
