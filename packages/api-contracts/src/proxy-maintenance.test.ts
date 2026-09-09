import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ProxyUnavailableErrorResponse } from "./proxy.js"

describe("proxy maintenance contract", () => {
  it("accepts only the canonical maintenance reason", () => {
    expect(Schema.decodeUnknownSync(ProxyUnavailableErrorResponse)({ reason: "maintenance", message: "Maintenance" })).toEqual({
      reason: "maintenance", message: "Maintenance",
    })
    expect(() => Schema.decodeUnknownSync(ProxyUnavailableErrorResponse)({ reason: "inMaintenance", message: "Maintenance" })).toThrow()
  })

  it("keeps generic service failures distinct", () => {
    expect(Schema.decodeUnknownSync(ProxyUnavailableErrorResponse)({ code: "upstream_unavailable", message: "Unavailable" })).toEqual({
      code: "upstream_unavailable", message: "Unavailable",
    })
  })
})
