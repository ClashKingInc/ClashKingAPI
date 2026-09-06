import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { DashboardCreateRosterMemberGroupEndpoint, RosterCapacity, RosterMemberGroupSettingsRequest, rosterConfigurationEndpoints } from "./roster-configuration.js"
import { DashboardUpdateRosterRequest } from "./dashboard-roster.js"

const group = (index: number, enabled = true) => ({ member_group_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  signup_enabled: enabled, position: index, role_id: null })
describe("reference-only roster member-group configuration", () => {
  it("declares exactly five scoped read/write routes with UUID group identities", () => {
    expect(Object.values(rosterConfigurationEndpoints)).toHaveLength(5)
    expect(Object.values(rosterConfigurationEndpoints).every(endpoint => endpoint.path.startsWith("/v2/server/:serverId/"))).toBe(true)
    expect(Object.values(rosterConfigurationEndpoints).filter(endpoint => endpoint.auth === "server-read")).toHaveLength(1)
    expect(Object.values(rosterConfigurationEndpoints).filter(endpoint => endpoint.auth === "server-write")).toHaveLength(4)
  })
  it("retains 25 configured groups but allows at most 24 enabled groups plus Main", () => {
    const groups = Array.from({ length: 25 }, (_, index) => group(index, index !== 24))
    expect(Schema.is(RosterMemberGroupSettingsRequest)({ groups })).toBe(true)
    expect(Schema.is(RosterMemberGroupSettingsRequest)({ groups: groups.map(item => ({ ...item, signup_enabled: true })) })).toBe(false)
    expect(Schema.is(RosterMemberGroupSettingsRequest)({ groups: [group(1), group(1)] })).toBe(false)
    expect(Schema.is(RosterMemberGroupSettingsRequest)({ groups: [{ ...group(1), role_id: "invalid" }] })).toBe(false)
  })
  it("preserves the legacy name bound and rejects blank names, invalid capacities and positions", () => {
    const valid = Schema.is(DashboardCreateRosterMemberGroupEndpoint.body)
    expect(valid({ name: "x".repeat(49), position: 0 })).toBe(true)
    for (const name of ["", " ", "x".repeat(50)]) expect(valid({ name })).toBe(false)
    expect(valid({ name: "Group", position: -1 })).toBe(false)
    for (const value of [0, -1, 1.5, Infinity, 2147483648]) expect(Schema.is(RosterCapacity)(value)).toBe(false)
    expect(Schema.is(RosterCapacity)(50)).toBe(true)
  })
  it("preserves only null or positive per-user caps on the retained Dashboard request", () => {
    expect(Schema.is(DashboardUpdateRosterRequest)({ max_accounts_per_user: null })).toBe(true)
    expect(Schema.is(DashboardUpdateRosterRequest)({ max_accounts_per_user: 2 })).toBe(true)
    for (const value of [0, -1, 1.5, Infinity]) expect(Schema.is(DashboardUpdateRosterRequest)({ max_accounts_per_user: value })).toBe(false)
  })
})
