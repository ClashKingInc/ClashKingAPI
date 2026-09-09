import { describe, expect, it } from "vitest"

import type { WorkerBindings } from "./environment.js"
import { applyCors, browserPreflight } from "./router.js"

const bindings = {
  WEB_ALLOWED_ORIGINS: "https://dash.clashk.ing",
  ADMIN_ALLOWED_ORIGINS: "https://admin.clashk.ing",
} as WorkerBindings
const origin = "https://community.example"

describe("contract-aware CORS", () => {
  it.each([
    "/v2/stats/ranked",
    "/v2/counts",
    "/cwl/%23J0R28G/2026-06",
    "/player/%23P0Y/warhits",
  ])("allows any origin without credentials for public data, including errors: %s", (path) => {
    const response = applyCors(new Request(`https://api.clashk.ing${path}`, { headers: { origin } }), Response.json({ error: true }, { status: 503 }), bindings)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.has("access-control-allow-credentials")).toBe(false)
  })

  it("allows public legacy preflight from any origin", () => {
    const request = new Request("https://api.clashk.ing/cwl/%23J0R28G/2026-06", { method: "OPTIONS", headers: { origin, "access-control-request-method": "GET" } })
    const response = browserPreflight(request, bindings)
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("access-control-allow-methods")).toContain("GET")
    expect(response.headers.has("access-control-allow-credentials")).toBe(false)
  })

  it.each([
    ["/v2/auth/me", "GET"],
    ["/v2/admin/operations", "GET"],
    ["/v2/server/123/config", "GET"],
    ["/route-that-does-not-exist", "GET"],
  ])("does not grant an arbitrary origin access to %s", (path, method) => {
    const response = applyCors(new Request(`https://api.clashk.ing${path}`, { method, headers: { origin } }), Response.json({}), bindings)
    expect(response.headers.has("access-control-allow-origin")).toBe(false)
    expect(response.headers.has("access-control-allow-credentials")).toBe(false)
  })

  it("retains credentialed allowlist CORS for authenticated browser routes", () => {
    const response = applyCors(new Request("https://api.clashk.ing/v2/auth/me", { headers: { origin: "https://dash.clashk.ing" } }), Response.json({}), bindings)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dash.clashk.ing")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
  })
})
