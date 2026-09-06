import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { botEndpoints } from "./bot.js"
import { ProxyPlayerEndpoint } from "./proxy.js"
import { RemindersResponse, TicketPanelsResponse } from "./dashboard-server.js"

describe("Bot endpoint contracts", () => {
  it("uses the canonical reminder response with in-game ranks rather than Discord role IDs", () => {
    expect(botEndpoints.reminders.response).toBe(RemindersResponse)
    const payload = { war_reminders: [], clan_games_reminders: [], inactivity_reminders: [], roster_reminders: [],
      capital_reminders: [{ id: "reminder", type: "Clan Capital", time: "1 hr", roles: ["leader", "coLeader", "admin", "member"], townhall_filter: [15, 16] }] }
    expect(Schema.decodeUnknownSync(botEndpoints.reminders.response)(payload)).toEqual(payload)
  })
  it("uses the canonical name-based ticket panels and nested Town Hall requirements", () => {
    expect(botEndpoints.tickets.response).toBe(TicketPanelsResponse)
    const payload = {
      items: [{ name: "Applications", server_id: "123456789012345678", embed_name: null,
        components: [{ custom_id: "apply_123", label: "Apply", style: 1, type: 2 }],
        button_settings: { apply_123: { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false,
          th_min: 10, num_apply: 1, naming: "ticket", account_apply: true, player_info: true, apply_clans: [],
          roles_to_add: [], roles_to_remove: [], townhall_requirements: { "15": { barbarian_king: 90, war_stars: 100 } }, new_message: null } },
        approve_messages: [] }], total: 1, available_embeds: [], townhall_requirement_fields: ["barbarian_king", "war_stars"],
    }
    expect(Schema.decodeUnknownSync(botEndpoints.tickets.response)(payload)).toEqual(payload)
  })
  it("defines every current Bot operation with unique operation IDs", () => {
    const endpoints = Object.values(botEndpoints)
    const operationIds = endpoints.map((endpoint) => endpoint.operationId)

    expect(endpoints).toHaveLength(65)
    expect(new Set(operationIds).size).toBe(operationIds.length)
    expect(endpoints.every((endpoint) =>
      endpoint.path.startsWith("/v2/"),
    )).toBe(true)
    expect(botEndpoints.cwlGroup.errors?.map(error => error.status)).toEqual([400, 404, 503])
    // Shared Dashboard operations retain their canonical error metadata too;
    // absence of an error list is not a Bot contract requirement.
    expect(endpoints.some((endpoint) => endpoint.path.startsWith("/v2/runtime/"))).toBe(false)
    expect(ProxyPlayerEndpoint.errors?.map(({ status }) => status))
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
