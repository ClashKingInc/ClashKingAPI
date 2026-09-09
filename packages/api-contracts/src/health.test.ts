import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { endpoints, HealthEndpoint, HealthResponse } from "./index.js"

describe("Worker liveness contract", () => {
  it("exposes the existing public GET response without readiness fields", () => {
    expect(endpoints.health).toBe(HealthEndpoint)
    expect(HealthEndpoint).toMatchObject({
      method: "GET", path: "/v2/health", auth: "public", successStatus: 200,
      bodyMode: "none", responseMode: "json",
    })
    expect(HealthEndpoint.summary).toContain("does not check database or provider readiness")
    expect(Schema.decodeUnknownSync(HealthResponse)({
      status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.15",
    })).toEqual({ status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.15" })
  })

  it("does not describe invented status, runtime, or version values as valid", () => {
    for (const changed of [{ status: "database-healthy" }, { runtime: "go" }, { version: "1.0.0" }]) {
      expect(() => Schema.decodeUnknownSync(HealthResponse)({
        status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.15", ...changed,
      })).toThrow()
    }
  })
})
