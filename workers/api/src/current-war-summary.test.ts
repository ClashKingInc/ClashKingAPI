import { CurrentCwlGroup, CurrentWarSummary, EnrichedCwlGroup, ProxyWarResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import input from "../test/fixtures/current-war-summary.input.json"
import expected from "../test/fixtures/current-war-summary.expected.json"
import { currentWarSummary, enrichClanLeagueIcons, enrichLeagueInfo, extractLeagueWarTags, isCwlWindow } from "./current-war-summary.js"
import type { WorkerBindings } from "./environment.js"

const group = Schema.decodeUnknownSync(CurrentCwlGroup)(input.group)
const wars = input.wars.map((war) => Schema.decodeUnknownSync(ProxyWarResponse)(war))
const now = new Date("2026-09-03T12:00:00Z")
const harness = (reply: (path: string, request: Request) => Response | Promise<Response>) => {
  const requests: Request[] = []
  const bindings = { CLASH_PROXY: { fetch: async (request: Request) => {
    requests.push(request)
    return reply(new URL(request.url).pathname, request)
  } } } as unknown as WorkerBindings
  const run = (date = now) => Effect.runPromise(currentWarSummary(bindings, "a", date))
  return { requests, run }
}
afterEach(() => vi.useRealTimers())

describe("Go-compatible CWL enrichment", () => {
  it("matches the Go-produced full nested fixture without mutating its inputs", () => {
    const before = JSON.stringify({ group, wars })
    const result = enrichLeagueInfo(group, wars)
    expect(result).toEqual(expected)
    expect(Schema.decodeUnknownSync(EnrichedCwlGroup)(result)).toEqual(expected)
    expect(JSON.stringify({ group, wars })).toBe(before)
  })

  it("counts missed attacks only for ended wars, but missing defenses for both active states", () => {
    const ended = { ...wars[1]!, state: "warEnded" }
    const result = enrichLeagueInfo(group, [ended])
    const member = result.clans[0]!.members[0]!
    expect(member.attacks).toMatchObject({ attack_count: 0, missed_attacks: 1 })
    expect(member.defense).toMatchObject({ defense_count: 0, missed_defenses: 1 })
    expect(result.clans[0]!.members[1]!.attacks.missed_attacks).toBe(0)
    const active = enrichLeagueInfo(group, [wars[1]!]).clans[0]!.members[0]!
    expect(active.attacks.missed_attacks).toBe(0)
    expect(active.defense.missed_defenses).toBe(1)
  })

  it("ignores preparation wars and ranks exact ties deterministically by tag", () => {
    const result = enrichLeagueInfo({ ...group, clans: [...group.clans].reverse() }, [{ ...wars[0]!, state: "preparation" }])
    expect(result.clans.map((clan) => [clan.tag, clan.rank, clan.wars_played])).toEqual([["#B", 2, 0], ["#A", 1, 0]])
    expect(result.total_stars).toBe(0)
  })

  it("uses only the first attack per CWL participant, with no historical win bonus", () => {
    const war = structuredClone(wars[0]!)
    const member = war.clan!.members![0]!
    const extra = { ...member.attacks![0]!, stars: 2 }
    const changed = { ...war, clan: { ...war.clan!, members: [{ ...member, attacks: [...member.attacks!, extra] }] } }
    const result = enrichLeagueInfo(group, [changed])
    expect(result.total_stars).toBe(4)
    expect(result.clans[0]!.members[0]!.attacks.attack_count).toBe(1)
  })

  it("normalizes and deduplicates war tags in round order", () => {
    expect(extractLeagueWarTags({ rounds: [{ warTags: ["w1", "#0", "", "#W2", "#W1"] }] })).toEqual(["#W1", "#W2"])
  })

  it("retains existing icon URLs when the pinned static catalog has no fallback", () => {
    const clan = { tag: "#A", name: "Alpha", warLeague: { id: 48_000_022, name: "Champion League I", iconUrls: { small: "existing-small" } } }
    expect(enrichClanLeagueIcons(clan)).toEqual(clan)
  })
})

describe("continuous documented CWL window", () => {
  it.each([
    ["2026-09-01T07:59:59Z", false], ["2026-09-01T08:00:00Z", true],
    ["2026-09-11T07:59:59Z", true], ["2026-09-11T08:00:00Z", false],
    ["2026-09-12T00:00:00Z", false], ["2026-09-30T23:59:59Z", false],
    ["2026-10-01T07:59:59Z", false], ["2026-10-01T08:00:00Z", true],
  ])("%s => %s", (date, active) => expect(isCwlWindow(new Date(date))).toBe(active))
})

describe("live current-war summary", () => {
  it("preserves regular-war precedence while including league data and original war tags", async () => {
    const test = harness((path) => Response.json(path.endsWith("/leaguegroup") ? group : path.includes("clanwarleagues") ? wars[0] : wars[1]))
    const summary = await test.run()
    expect(summary).toMatchObject({ clan_tag: "#A", isInWar: true, isInCwl: false, war_info: { state: "war", bypass: false } })
    expect(summary.war_league_infos.map((war) => war.war_tag)).toEqual(["#W1", "#W2"])
    expect(summary.league_info?.total_stars).toBe(8)
    expect(Schema.decodeUnknownSync(CurrentWarSummary)(summary)).toEqual(summary)
    expect(test.requests).toHaveLength(4)
    expect(test.requests.every((request) => new URL(request.url).hostname === "clash-proxy.internal" && !request.headers.has("authorization"))).toBe(true)
  })

  it("keeps successful league wars when another lookup fails", async () => {
    const test = harness((path) => {
      if (path.endsWith("leaguegroup")) return Response.json(group)
      if (path.endsWith("%23W1")) return Response.json(wars[0])
      return Response.json({ state: "notInWar" }, { status: path.endsWith("%23W2") ? 404 : 200 })
    })
    expect(await test.run()).toMatchObject({ isInWar: false, isInCwl: true, war_info: { state: "notInWar" }, war_league_infos: [{ war_tag: "#W1" }] })
  })

  it("does not query league data outside the CWL window", async () => {
    const test = harness(() => Response.json({ state: "notInWar" }))
    expect(await test.run(new Date("2026-09-12T00:00:00Z"))).toEqual({ clan_tag: "#A", isInWar: false, isInCwl: false,
      war_info: { state: "notInWar" }, league_info: null, war_league_infos: [] })
    expect(test.requests).toHaveLength(1)
  })

  it("treats malformed or oversized upstream JSON as unavailable without archive or public-network fallback", async () => {
    const test = harness((path) => path.endsWith("leaguegroup") ? Response.json({ state: "inWar", clans: "bad" }) : new Response('"' + "x".repeat(1024 * 1024) + '"'))
    expect(await test.run()).toMatchObject({ isInWar: false, isInCwl: false, league_info: null })
    expect(test.requests).toHaveLength(2)
  })

  it("rejects oversized league fan-out before requesting any wars", async () => {
    const oversized = { ...group, rounds: [{ warTags: Array.from({ length: 65 }, (_, index) => `#W${index + 1}`) }] }
    const test = harness((path) => Response.json(path.endsWith("leaguegroup") ? oversized : { state: "notInWar" }))
    expect(await test.run()).toMatchObject({ league_info: null, war_league_infos: [] })
    expect(test.requests).toHaveLength(2)
  })

  it("limits in-flight league requests to ten and preserves their round order", async () => {
    const extended = { ...group, rounds: [{ warTags: Array.from({ length: 22 }, (_, index) => `#W${index + 1}`) }] }
    let active = 0, maximum = 0
    const test = harness(async (path) => {
      if (path.endsWith("leaguegroup")) return Response.json(extended)
      if (path.endsWith("currentwar")) return Response.json({ state: "notInWar" })
      active++; maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return Response.json(wars[0])
    })
    expect((await test.run()).war_league_infos.map((war) => war.war_tag)).toEqual(extended.rounds[0]!.warTags)
    expect(maximum).toBe(10)
  })

  it("cancels a stalled response body when the single-request deadline expires", async () => {
    vi.useFakeTimers()
    let cancelled = false
    const test = harness(() => new Response(new ReadableStream({ cancel() { cancelled = true } })))
    const pending = test.run(new Date("2026-09-12T00:00:00Z"))
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await pending).toMatchObject({ isInWar: false })
    expect(cancelled).toBe(true)
  })
})
