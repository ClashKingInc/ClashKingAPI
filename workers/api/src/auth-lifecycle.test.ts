import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { dispatchAuthLifecycle } from "./auth-lifecycle.js"
import { AuthIdentity } from "./auth.js"
import { AuthProfiles } from "./auth-profiles.js"
import { AuthEmail } from "./auth-email.js"
import { readWebRefreshCookie, validateWebRedirect, webRefreshCookie } from "./auth-cookies.js"
import { AuthRefreshRejected, AuthSessions } from "./auth-sessions.js"
import { DatabaseFailure, Forbidden, InvalidRequest, PayloadTooLarge, Unauthenticated } from "./errors.js"

const bindings = { WEB_ALLOWED_ORIGINS: "https://dashboard.clashk.ing,http://localhost:3002,https://dashboard-preview.example.workers.dev", DISCORD_REDIRECT_URI: "https://dashboard.clashk.ing/auth/callback" }
const tokens = { access_token: "access-fixture", refresh_token: "refresh-fixture", expiresAt: new Date("2030-01-01") }
const user = { user_id: "user-fixture", username: "Reader", avatar_url: "https://example.test/avatar", auth_methods: ["email"] }
const makeService = () => AuthSessions.of({
  issue: vi.fn(() => Effect.succeed(tokens)), emailLogin: vi.fn(() => Effect.succeed({ ...tokens, user })),
  refresh: vi.fn(() => Effect.succeed(tokens)), logout: vi.fn(() => Effect.void),
})
function request(path: string, body?: unknown, origin = "https://dashboard.clashk.ing", cookie?: string) {
  return new Request(`https://api.clashk.ing${path}`, { method: "POST", headers: {
    origin, "content-type": "application/json", ...(cookie === undefined ? {} : { cookie }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
const email = { email: "reader@example.test", password: "Password1", device_id: "device", device_name: "Phone" }
// Identity and profile mocks own all database work in this boundary-only suite.
const unusedSql = {} as SqlClient.SqlClient
const run = (req: Request, service = makeService(), profiles: Partial<AuthProfiles["Service"]> = {}, identity: Partial<AuthIdentity["Service"]> = {}) => Effect.runPromise(dispatchAuthLifecycle(req, bindings).pipe(
  Effect.provideService(AuthSessions, service),
  Effect.provide(Layer.mergeAll(Layer.mock(AuthProfiles, profiles), Layer.mock(AuthEmail, {}), Layer.mock(AuthIdentity, identity), Layer.succeed(SqlClient.SqlClient, unusedSql))),
))

describe("canonical auth lifecycle boundary", () => {
  it("keeps native refresh tokens in the body and browser refresh tokens only in secure cookies", async () => {
    const native = await run(request("/v2/auth/email", email))
    expect(await native!.json()).toEqual({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, user })
    expect(native!.headers.get("set-cookie")).toBeNull()
    const web = await run(request("/v2/auth/web/email", email))
    expect(await web!.json()).toEqual({ access_token: tokens.access_token, user })
    expect(web!.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=None")
    expect(web!.headers.get("set-cookie")).toContain("Path=/v2/auth/web")
    expect(web!.headers.get("cache-control")).toBe("no-store")
  })

  it("rejects missing, unlisted, and suffix-confusable browser origins before any session operation", async () => {
    const service = makeService()
    for (const origin of ["", "null", "https://dashboard.clashk.ing.evil.test", "https://evil.test"]) {
      await expect(run(request("/v2/auth/web/email", email, origin), service)).rejects.toBeInstanceOf(Forbidden)
    }
    expect(service.emailLogin).not.toHaveBeenCalled()
  })

  it("rejects oversized, malformed, or incorrectly typed login bodies before storage", async () => {
    const service = makeService()
    await expect(run(request("/v2/auth/email", { ...email, password: "a".repeat(17 * 1024) }), service)).rejects.toBeInstanceOf(PayloadTooLarge)
    await expect(run(request("/v2/auth/email", { ...email, device_id: 123 }), service)).rejects.toBeInstanceOf(InvalidRequest)
    await expect(run(new Request("https://api.clashk.ing/v2/auth/email", { method: "POST", body: "{" }), service)).rejects.toBeInstanceOf(InvalidRequest)
    expect(service.emailLogin).not.toHaveBeenCalled()
  })

  it("never clears a winner's cookie for concurrent, delayed, expired, or invalid refresh rejection", async () => {
    for (const message of ["Session was already refreshed", "Invalid session", "Invalid or expired refresh token"]) {
      const service = { ...makeService(), refresh: () => Effect.fail(new AuthRefreshRejected({ message })) }
      const response = await run(request("/v2/auth/web/refresh", undefined, undefined, "ck_web_refresh=old"), service)
      expect(response!.status).toBe(401)
      expect(response!.headers.has("set-cookie")).toBe(false)
    }
  })

  it("does not convert refresh or logout database failures into success or cookie deletion", async () => {
    const fail = () => Effect.fail(new DatabaseFailure({ cause: "fixture", message: "Database unavailable" }))
    for (const path of ["refresh", "logout"]) {
      await expect(run(request(`/v2/auth/web/${path}`, undefined, undefined, "ck_web_refresh=old"),
        { ...makeService(), refresh: fail, logout: fail })).rejects.toBeInstanceOf(DatabaseFailure)
    }
  })

  it("refreshes from only the cookie, expires logout cookies, and rejects duplicate cookie ambiguity", async () => {
    const service = makeService()
    const refreshed = await run(request("/v2/auth/web/refresh", { refresh_token: "attacker", device_id: "other" }, undefined,
      "ck_web_refresh=correct"), service)
    expect(service.refresh).toHaveBeenCalledWith("correct", "", "web")
    expect(await refreshed!.json()).toEqual({ access_token: tokens.access_token })
    const loggedOut = await run(request("/v2/auth/web/logout", undefined, undefined, "ck_web_refresh=correct"), service)
    expect(loggedOut!.status).toBe(204)
    expect(await loggedOut!.text()).toBe("")
    expect(loggedOut!.headers.get("set-cookie")).toContain("Max-Age=0")
    expect(readWebRefreshCookie(request("/v2/auth/web/refresh", undefined, undefined, "ck_web_refresh=a; ck_web_refresh=b"))).toBe("")
  })

  it("uses host-only Secure/SameSite=None cookies for allowed remote cross-site previews", async () => {
    const cookie = webRefreshCookie("token")
    expect(cookie).toContain("Secure; SameSite=None")
    expect(cookie).not.toContain("Domain=")
    for (const origin of ["http://localhost:3002", "https://dashboard-preview.example.workers.dev"]) {
      const response = await run(request("/v2/auth/web/email", email, origin))
      expect(response!.headers.get("set-cookie")).toContain("Secure; SameSite=None")
    }
  })

  it("requires an exact Origin for refresh/logout, rejects non-JSON login, and leaves OPTIONS to CORS", async () => {
    const service = makeService()
    for (const path of ["refresh", "logout"]) {
      for (const origin of ["", "null", "https://dashboard-preview.example.workers.dev.evil.test"]) {
        await expect(run(request(`/v2/auth/web/${path}`, undefined, origin, "ck_web_refresh=token"), service)).rejects.toBeInstanceOf(Forbidden)
      }
    }
    const req = request("/v2/auth/web/email", email)
    req.headers.set("content-type", "text/plain")
    await expect(run(req, service)).rejects.toMatchObject({ _tag: "InvalidRequest", status: 415 })
    expect(service.emailLogin).not.toHaveBeenCalled()
    expect(service.refresh).not.toHaveBeenCalled()
    expect(service.logout).not.toHaveBeenCalled()
    expect(await run(new Request("https://api.clashk.ing/v2/auth/web/email", { method: "OPTIONS", headers: { origin: "https://evil.test" } }), service)).toBeUndefined()
  })

  it("requires an exact allowed redirect origin and never handles legacy aliases", async () => {
    const req = request("/v2/auth/web/discord")
    await Effect.runPromise(validateWebRedirect(req, bindings, "https://dashboard.clashk.ing/auth/callback"))
    for (const redirect of ["https://evil.test/auth/callback", "https://dashboard.clashk.ing.evil.test", "https://evil@dashboard.clashk.ing/auth/callback"]) {
      await expect(Effect.runPromise(validateWebRedirect(req, bindings, redirect))).rejects.toBeInstanceOf(Forbidden)
    }
    expect(await run(request("/v2/email", email))).toBeUndefined()
  })

  it("uses the configured native redirect fallback and validates web redirects before OAuth", async () => {
    const discordLogin = vi.fn(() => Effect.succeed({ ...tokens, user }))
    const input = { code: "code", code_verifier: "verifier", redirect_uri: "", device_id: "phone" }
    await run(request("/v2/auth/discord", input), makeService(), { discordLogin })
    expect(discordLogin).toHaveBeenCalledWith({ ...input, redirect_uri: bindings.DISCORD_REDIRECT_URI }, "native")
    discordLogin.mockClear()
    await expect(run(request("/v2/auth/web/discord", { ...input, redirect_uri: "https://evil.test" }),
      makeService(), { discordLogin })).rejects.toBeInstanceOf(Forbidden)
    expect(discordLogin).not.toHaveBeenCalled()
    const response = await run(request("/v2/auth/web/discord", { ...input, redirect_uri: bindings.DISCORD_REDIRECT_URI }),
      makeService(), { discordLogin })
    expect(await response!.json()).not.toHaveProperty("refresh_token")
  })

  it("gets the current profile only through the authenticated user principal", async () => {
    const principal = { kind: "user" as const, userId: "authenticated", deviceId: "browser" }
    const currentUser = vi.fn(() => Effect.succeed({ ...user, account_summary: { follower_count: 2 } }))
    const req = new Request("https://api.clashk.ing/v2/auth/me?user_id=someone-else")
    const response = await run(req, makeService(), { currentUser }, { requireUser: () => Effect.succeed(principal) })
    expect(currentUser).toHaveBeenCalledWith(principal)
    expect(await response!.json()).toHaveProperty("account_summary.follower_count", 2)
    currentUser.mockClear()
    await expect(run(req, makeService(), { currentUser }, {
      requireUser: () => Effect.fail(new Unauthenticated({ message: "Not authenticated" })),
    })).rejects.toBeInstanceOf(Unauthenticated)
    expect(currentUser).not.toHaveBeenCalled()
  })
})
