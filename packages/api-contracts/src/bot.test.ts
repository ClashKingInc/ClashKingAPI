import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { botEndpoints } from "./bot.js"

describe("Bot endpoint contracts", () => {
  it("defines every current Bot operation with unique operation IDs", () => {
    const endpoints = Object.values(botEndpoints)
    const operationIds = endpoints.map((endpoint) => endpoint.operationId)

    expect(endpoints).toHaveLength(85)
    expect(new Set(operationIds).size).toBe(operationIds.length)
    expect(endpoints.every((endpoint) =>
      endpoint.path.startsWith("/v2/") || endpoint.path.startsWith("/proxy/v1/"),
    )).toBe(true)
    expect(endpoints
      .filter((endpoint) => endpoint.path.startsWith("/v2/") && !endpoint.path.startsWith("/v2/runtime/"))
      .every((endpoint) => endpoint.errors === undefined)).toBe(true)
    expect(endpoints
      .filter((endpoint) => endpoint.path.startsWith("/v2/runtime/"))
      .every((endpoint) => endpoint.errors !== undefined)).toBe(true)
    expect(botEndpoints.proxyPlayer.errors?.map(({ status }) => status))
      .toEqual([400, 403, 404, 429])
  })

  it("keeps required current query fields in the runtime schema", () => {
    expect(() => Schema.encodeUnknownSync(botEndpoints.playerHistory.query)({}))
      .toThrow()
    expect(() => Schema.encodeUnknownSync(botEndpoints.cwlLeaderboard.query)({ season: "2026-08" }))
      .toThrow()

    expect(Schema.encodeUnknownSync(botEndpoints.playerHistory.query)({ type: "hero_level" }))
      .toEqual({ type: "hero_level" })
    expect(Schema.encodeUnknownSync(botEndpoints.cwlLeaderboard.query)({
      season: "2026-08",
      team_size: 15,
    })).toEqual({ season: "2026-08", team_size: 15 })
  })

  it("decodes typed public payloads and rejects a malformed count", () => {
    const payload = {
      players_in_war: 10,
      clans_in_war: 2,
      total_join_leaves: 20,
      players_in_legends: 30,
      player_count: 40,
      clan_count: 5,
      wars_stored: 60,
    }

    expect(Schema.decodeUnknownSync(botEndpoints.counts.response)(payload)).toEqual(payload)
    expect(() => Schema.decodeUnknownSync(botEndpoints.counts.response)({
      ...payload,
      wars_stored: "sixty",
    })).toThrow()
  })

  it("decodes typed server payloads and enforces mutation bodies", () => {
    const largeServerId = "123456789012345678"
    const summary = {
      player_tag: "#P0Y",
      server_id: largeServerId,
      total_strikes: 0,
      total_weight: 0,
      strikes: [],
    }
    expect(Schema.decodeUnknownSync(botEndpoints.strikeSummary.response)(summary)).toEqual(summary)
    expect(() => Schema.decodeUnknownSync(botEndpoints.strikeSummary.response)({
      ...summary,
      server_id: Number(largeServerId),
    })).toThrow()

    expect(Schema.encodeUnknownSync(botEndpoints.refreshRoster.body)({ scope: "data" }))
      .toEqual({ scope: "data" })
    expect(() => Schema.encodeUnknownSync(botEndpoints.refreshRoster.body)({}))
      .toThrow()
    expect(() => Schema.encodeUnknownSync(botEndpoints.rerollGiveaway.body)({
      user_ids_to_replace: [123],
    })).toThrow()
  })
})
