import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { DashboardCreateRosterRequest, DashboardRosterSignupScope } from "./dashboard-roster.js"

describe("roster signup scope contract", () => {
  it.each(["clan-only", "family-only", "anyone"])("accepts %s", scope => {
    expect(Schema.decodeUnknownSync(DashboardRosterSignupScope)(scope)).toBe(scope)
  })
  it.each(["family-wide", "invalid", ""])("rejects obsolete or invalid scope %s", scope => {
    expect(() => Schema.decodeUnknownSync(DashboardRosterSignupScope)(scope)).toThrow()
  })
  it("allows omission on creation so the API can apply its anyone default", () => {
    expect(Schema.decodeUnknownSync(DashboardCreateRosterRequest)({ alias: "CWL", roster_type: "clan" })).not.toHaveProperty("signup_scope")
  })
})
