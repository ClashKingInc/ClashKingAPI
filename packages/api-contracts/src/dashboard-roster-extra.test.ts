import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  dashboardRosterExtraEndpoints,
  DashboardRosterAIContextEndpoint,
  DashboardRosterAIUsageEndpoint,
  DashboardRosterBatchRequest,
  DashboardRosterMembersQueryEndpoint,
  DashboardRosterQuestionnaire,
  DashboardRosterSubmissionEndpoint,
} from "./dashboard-roster-extra.js"

describe("canonical roster assistant and signup descriptors", () => {
  it("registers eleven unique method/path pairs without fallback descriptors", () => {
    const endpoints = Object.values(dashboardRosterExtraEndpoints)
    expect(endpoints).toHaveLength(11)
    expect(new Set(endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).size).toBe(11)
  })
  it("distinguishes user context from dedicated metering-secret settlement", () => {
    expect(DashboardRosterAIContextEndpoint.auth).toBe("user")
    expect(DashboardRosterAIUsageEndpoint.auth).toBe("ai-metering")
    expect(DashboardRosterAIUsageEndpoint.successStatus).toBe(204)
    expect(DashboardRosterAIUsageEndpoint.responseMode).toBe("none")
  })
  it("keeps Discord server IDs as decimal strings", () => {
    expect(Schema.decodeUnknownSync(DashboardRosterBatchRequest)({ serverId: "123456789012345678", rosterIds: [] }).serverId)
      .toBe("123456789012345678")
    expect(() => Schema.decodeUnknownSync(DashboardRosterBatchRequest)({ serverId: 123, rosterIds: [] })).toThrow()
  })
  it("rejects unknown requested snapshot fields", () => {
    expect(() => Schema.decodeUnknownSync(DashboardRosterBatchRequest)({ serverId: "123", rosterIds: [], fields: ["discordUserId"] })).toThrow()
  })
  it("accepts selected optional snapshot fields with existing nullable values", () => {
    const value = { rows: [{ rosterId: "roster", playerTag: "#P0Y", clanTag: null, trophies: null, signupAnswers: { availability: true } }] }
    expect(Schema.decodeUnknownSync(DashboardRosterMembersQueryEndpoint.response)(value)).toEqual(value)
  })
  it("preserves the existing account selector and question structure", () => {
    const value = { accountSelector: { id: "account", type: "account", required: true }, questions: [
      { id: "availability", label: "Available?", type: "boolean", required: false, options: [], order: 0 },
    ] }
    expect(Schema.decodeUnknownSync(DashboardRosterQuestionnaire)(value)).toEqual(value)
  })
  it("models signup success as201 and rejects non-string Discord IDs", () => {
    expect(DashboardRosterSubmissionEndpoint.successStatus).toBe(201)
    expect(() => Schema.decodeUnknownSync(DashboardRosterSubmissionEndpoint.body)({ playerTag: "#P0Y", answers: {}, discordUserId: 123 })).toThrow()
  })
})
