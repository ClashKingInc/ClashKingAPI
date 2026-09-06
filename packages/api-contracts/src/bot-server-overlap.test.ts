import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import * as botServer from "./bot-server.js"
import { dashboardEndpoints } from "./dashboard.js"

const routeKey = (endpoint: { method: string; path: string }) => `${endpoint.method} ${endpoint.path.replace(/:[^/]+/gu, ":param")}`
const canonical = new Map(Object.values(dashboardEndpoints).map(endpoint => [routeKey(endpoint), endpoint]))
const overlaps = Object.values(botServer).flatMap(endpoint => {
  const matching = canonical.get(routeKey(endpoint))
  return matching === undefined ? [] : [{ bot: endpoint, canonical: matching }]
})

describe("Bot descriptors sharing an existing Dashboard operation", () => {
  it("covers all 21 existing shared method and path pairs", () => {
    expect(overlaps).toHaveLength(21)
  })

  it.each(overlaps)("reuses the canonical schemas for $bot.operationId", ({ bot, canonical }) => {
    expect(bot.response).toBe(canonical.response)
    expect(bot.query).toBe(canonical.query)
    expect(bot.body).toBe(canonical.body)
    expect(bot.errors).toBe(canonical.errors)
    expect(bot.bodyMode).toBe(canonical.bodyMode)
    expect(bot.responseMode).toBe(canonical.responseMode)
    expect(bot.responseContentType).toBe(canonical.responseContentType)
    expect(bot.auth).toBe(canonical.auth)
    expect(bot.method).toBe(canonical.method)
    expect(bot.successStatus).toBe(canonical.successStatus)
  })

  it("accepts the canonical linked-account omissions and optional token", () => {
    const payload = { items: [{ user_id: "123456789012345678", player_tag: "#P0Y", order_index: 0,
      is_verified: false, hidden: false, added_at: "2026-09-04T00:00:00Z" }] }
    expect(Schema.decodeUnknownSync(botServer.BotAccountsEndpoint.response)(payload)).toEqual(payload)
    expect(Schema.encodeUnknownSync(botServer.BotLinkAccountEndpoint.body)({ player_tag: "#P0Y" })).toEqual({ player_tag: "#P0Y" })
  })

  it("retains the canonical bans actor query", () => {
    for (const endpoint of [botServer.BotBansEndpoint, botServer.BotSaveBanEndpoint, botServer.BotDeleteBanEndpoint]) {
      expect(Schema.encodeUnknownSync(endpoint.query)({ user_id: "123456789012345678" })).toEqual({ user_id: "123456789012345678" })
    }
  })
})
