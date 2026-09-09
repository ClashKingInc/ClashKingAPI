import { adminEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccessIdentity } from "./access.js"
import { dispatchAdmin } from "./admin.js"
import type { AdminWorkerBindings } from "./admin-operations.js"
import { Forbidden } from "./errors.js"
import { executeTrackingRead } from "./tracking-operations.js"

vi.mock("./tracking-operations.js", async importOriginal => ({
  ...await importOriginal<typeof import("./tracking-operations.js")>(), executeTrackingRead: vi.fn(),
}))
const principal = { id: "admin-fixture", email: "admin@example.test", username: "admin@example.test", display_name: "Admin", role: "owner" as const, active: true }
const summary = { generated_at: "2026-09-04T12:00:00Z", stale_after_seconds: 180, processes: [], domains: [] }
const series = { generated_at: summary.generated_at, window: "1h" as const, start: "2026-09-04T11:00:00Z", end: summary.generated_at, bucket_seconds: 60 as const, max_points_per_series: 120, processes: [], domains: [] }
const bindings = { API_BOT_TOKEN: "test-bot-secret" } as AdminWorkerBindings
const run = (request: Request, requireAdmin = vi.fn(() => Effect.fail(new Forbidden({ message: "Access denied" }))), env = bindings) =>
  Effect.runPromise(dispatchAdmin(request, env).pipe(
    Effect.provideService(AccessIdentity, { requireAdmin }),
    Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
  ))

beforeEach(() => {
  vi.mocked(executeTrackingRead).mockReset().mockImplementation(endpoint => Effect.succeed(endpoint === "summary" ? summary : series))
})

describe("original Tracking bot and moved Admin admission", () => {
  it.each(["summary", "timeseries"])("admits the original bot caller to %s without Access or a human principal", async endpoint => {
    const requireAdmin = vi.fn(() => Effect.fail(new Forbidden({ message: "must not acquire Access" })))
    const response = await run(new Request(`https://api.example.test/v2/admin/tracking/${endpoint}`, {
      headers: { authorization: "Bearer test-bot-secret" },
    }), requireAdmin)
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual(endpoint === "summary" ? summary : series)
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(executeTrackingRead).toHaveBeenCalledExactlyOnceWith(endpoint, endpoint === "summary" ? {} : { window: "1h", script: "", domain: "" })
  })

  it.each(["summary", "timeseries"])("keeps the moved Access caller working on %s", async endpoint => {
    const requireAdmin = vi.fn(() => Effect.succeed(principal))
    const request = new Request(`https://api.example.test/v2/admin/tracking/${endpoint}`, {
      headers: { "x-requested-with": "XMLHttpRequest", "cf-access-jwt-assertion": "verified-by-service-fixture" },
    })
    const response = await Effect.runPromise(dispatchAdmin(request, bindings).pipe(
      Effect.provideService(AccessIdentity, { requireAdmin }),
      Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    ))
    expect(response?.status).toBe(200)
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(request)
    expect(executeTrackingRead).toHaveBeenCalledOnce()
  })

  it.each([undefined, "Basic test-bot-secret", "Bearer wrong", "Bearer test-bot-secret extra"])("does not bypass Access for invalid authorization %s", async authorization => {
    const requireAdmin = vi.fn(() => Effect.fail(new Forbidden({ message: "Access denied" })))
    await expect(run(new Request("https://api.example.test/v2/admin/tracking/summary", {
      headers: authorization ? { authorization } : {},
    }), requireAdmin)).rejects.toMatchObject({ _tag: "Unauthenticated", message: "Authentication token missing" })
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(executeTrackingRead).not.toHaveBeenCalled()
  })

  it("never admits a bot when its configured secret is missing", async () => {
    await expect(run(new Request("https://api.example.test/v2/admin/tracking/summary", {
      headers: { authorization: "Bearer test-bot-secret" },
    }), undefined, {} as AdminWorkerBindings)).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(executeTrackingRead).not.toHaveBeenCalled()
  })

  it("normalizes original Tracking filters and rejects invalid input before reading SQL", async () => {
    const request = (query: string) => new Request(`https://api.example.test/v2/admin/tracking/timeseries?${query}`, {
      headers: { authorization: "Bearer test-bot-secret" },
    })
    expect((await run(request("window=%206H%20&script=%20main%20&domain=%20wars%20")))?.status).toBe(200)
    expect(executeTrackingRead).toHaveBeenLastCalledWith("timeseries", { window: "6h", script: "main", domain: "wars" })
    vi.mocked(executeTrackingRead).mockClear()
    await expect(run(request("window=2h"))).rejects.toMatchObject({ _tag: "InvalidRequest", message: "window must be one of 15m, 1h, 6h, or 24h" })
    await expect(run(request("domain=bad%20name"))).rejects.toMatchObject({ _tag: "InvalidRequest", message: "domain contains unsupported characters" })
    expect(executeTrackingRead).not.toHaveBeenCalled()
  })

  it.each(Object.values(adminEndpoints).filter(endpoint => !["adminTrackingSummary", "adminTrackingTimeseries"].includes(endpoint.operationId)))("a valid bot token grants no access to $operationId", async endpoint => {
    const requireAdmin = vi.fn(() => Effect.fail(new Forbidden({ message: "Access denied" })))
    await expect(run(new Request(`https://api.example.test${endpoint.path.replace(/:[^/]+/gu, "1")}`, {
      method: endpoint.method, headers: { authorization: "Bearer test-bot-secret" },
    }), requireAdmin)).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(executeTrackingRead).not.toHaveBeenCalled()
  })
})
