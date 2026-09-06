import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  DashboardCreateRosterRequest, DashboardRoster, DashboardRosterMember,
  DashboardRosterMemberInput, DashboardUpdateRosterMemberRequest, DashboardUpdateRosterRequest,
} from "./dashboard-roster.js"
import { BotRosterEndpoint } from "./bot-server.js"

describe("retained roster fields", () => {
  it("does not require or advertise deferred bot configuration on existing Dashboard operations", () => {
    for (const shape of [DashboardRoster, DashboardCreateRosterRequest, DashboardUpdateRosterRequest]) {
      expect(Object.keys(shape.fields)).not.toEqual(expect.arrayContaining(["capacity", "roster_role_id", "member_groups"]))
      for (const field of ["capacity", "roster_role_id", "member_groups"]) expect(Object.keys(shape.fields)).not.toContain(field)
    }
    for (const shape of [DashboardRosterMember, DashboardRosterMemberInput, DashboardUpdateRosterMemberRequest]) {
      for (const field of ["member_group_id", "is_substitute"]) expect(Object.keys(shape.fields)).not.toContain(field)
    }
  })

  it("continues accepting the original per-user cap and clearing it with null", () => {
    for (const value of [1, 50, 100, null]) {
      expect(Schema.decodeUnknownSync(DashboardUpdateRosterRequest)({ max_accounts_per_user: value }))
        .toEqual({ max_accounts_per_user: value })
    }
    for (const value of [0, -1, 1.5, Infinity]) {
      expect(() => Schema.decodeUnknownSync(DashboardUpdateRosterRequest)({ max_accounts_per_user: value })).toThrow()
    }
  })

  it("does not expose new bot-only fields on the existing server roster response", () => {
    const shape = BotRosterEndpoint.response.fields
    for (const field of ["capacity", "rosterRoleId", "memberGroups"]) expect(Object.keys(shape.roster.fields)).not.toContain(field)
    for (const field of ["memberGroupId", "isSubstitute"]) expect(Object.keys(shape.roster.fields.members.value.fields)).not.toContain(field)
  })
})
