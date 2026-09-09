import { describe, expect, it } from "vitest"

import { Forbidden, InvalidRequest } from "../src/errors.js"
import type { WorkerBindings } from "../src/environment.js"
import { adminPreflight, browserPreflight, failureResponse } from "../src/router.js"

describe("Admin transport policy", () => {
  it("allows only an explicitly configured credentialed origin", () => {
    const bindings = {
      ADMIN_ALLOWED_ORIGINS: "https://admin.clashk.ing,https://admin-staging.clashk.ing",
    } as WorkerBindings
    const response = adminPreflight(
      new Request("https://api.clashk.ing/v2/admin/me", {
        method: "OPTIONS",
        headers: { origin: "https://admin.clashk.ing" },
      }),
      bindings,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://admin.clashk.ing")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("vary")).toContain("Origin")
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Request-ID")
    expect(response.headers.get("access-control-expose-headers")).toContain("X-Request-ID")
  })

  it("does not reflect an unconfigured origin", () => {
    const bindings = { ADMIN_ALLOWED_ORIGINS: "https://admin.clashk.ing" } as WorkerBindings
    const response = adminPreflight(
      new Request("https://api.clashk.ing/v2/admin/me", {
        method: "OPTIONS",
        headers: { origin: "https://attacker.invalid" },
      }),
      bindings,
    )

    expect(response.headers.has("access-control-allow-origin")).toBe(false)
  })
})

describe("Dashboard and App transport policy", () => {
  it("allows an exact credentialed Dashboard origin", () => {
    const bindings = {
      WEB_ALLOWED_ORIGINS: "https://dashboard.clashk.ing,https://app.clashk.ing",
    } as WorkerBindings
    const response = browserPreflight(
      new Request("https://api.clashk.ing/v2/auth/web/refresh", {
        method: "OPTIONS",
        headers: { origin: "https://dashboard.clashk.ing" },
      }),
      bindings,
    )

    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.clashk.ing")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("vary")).toContain("Origin")
    const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase()
    for (const header of ["x-request-id", "traceparent", "tracestate"]) expect(allowed).toContain(header)
    const exposed = response.headers.get("access-control-expose-headers")?.toLowerCase()
    for (const header of ["x-request-id", "retry-after", "content-disposition"]) expect(exposed).toContain(header)
  })

  it("rejects suffix and wildcard-like origin matches", () => {
    const bindings = { WEB_ALLOWED_ORIGINS: "https://dashboard.clashk.ing" } as WorkerBindings
    const response = browserPreflight(
      new Request("https://api.clashk.ing/v2/auth/web/refresh", {
        method: "OPTIONS",
        headers: { origin: "https://dashboard.clashk.ing.attacker.invalid" },
      }),
      bindings,
    )

    expect(response.headers.has("access-control-allow-origin")).toBe(false)
  })
})

describe("typed API failure mapping", () => {
  it("preserves validation details and request IDs", async () => {
    const response = failureResponse(
      new InvalidRequest({
        message: "Invalid body",
        details: [{ field: "title", message: "is required" }],
      }),
      "req-123",
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: "invalid_request",
      message: "Invalid body",
      request_id: "req-123",
      details: [{ field: "title", message: "is required" }],
    })
  })

  it("maps authorization failures without leaking causes", async () => {
    const response = failureResponse(new Forbidden({ message: "Owner access is required" }), "req-9")

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      code: "forbidden",
      message: "Owner access is required",
      request_id: "req-9",
    })
  })
})
