import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { ServerLeaderboardsEndpoint } from "./dashboard-server-extra.js"

describe("server leaderboard nullable Go fields", () => {
  it("preserves unranked null values and exact Discord server strings", () => {
    const payload = {
      server_id: "1234567890123456789", total_players: 1, total_clans: 1,
      players: [{ player_tag: "#2PP", player_name: "Player", clan_tag: "#2QQ", clan_name: "Clan", townhall_level: null,
        trophies: null, global_rank: null, local_rank: null, location_id: null, country_code: null, country_name: null, legend_trophies: null }],
      clans: [{ clan_tag: "#2QQ", clan_name: "Clan", global_rank: null, local_rank: null, country_code: null,
        country_name: null, clan_level: null, clan_points: null, member_count: null, capital_points: null }],
    }
    expect(Schema.decodeUnknownSync(ServerLeaderboardsEndpoint.response)(payload)).toEqual(payload)
    expect(() => Schema.decodeUnknownSync(ServerLeaderboardsEndpoint.response)({ ...payload, server_id: 123 })).toThrow()
  })
})
