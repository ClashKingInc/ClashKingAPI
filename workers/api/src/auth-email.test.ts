import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { AuthEmail, AuthVerificationExpired, requestedAuthLocale, validateEmail } from "./auth-email.js"
import { AuthIdentity } from "./auth.js"
import { AuthProfiles } from "./auth-profiles.js"
import { AuthSessions } from "./auth-sessions.js"
import { authLifecycleRuntimeRoutes, dispatchAuthLifecycle } from "./auth-lifecycle.js"

describe("email auth input parity and routing", () => {
  it("matches Go net/mail fixtures including display names, quoted locals, Unicode, and single-member groups", async () => {
    const valid = ["reader@example.test", " Reader@Example.test ", "Reader <reader@example.test>",
      '"read er"@example.test', "读者@example.test", "reader@localhost", "Group:reader@example.test;", "reader@[127.0.0.1]"]
    const invalid = ["reader(comment)@example.test", "reader @example.test", "one@example.test,two@example.test", "reader", "a@@example.test",
      ".a@example.test", "a..b@example.test", "reader@example.test\r\nBcc: other@example.test", "", "Group:one@example.test,two@example.test;"]
    for (const value of valid) expect(await Effect.runPromise(validateEmail(value))).toHaveProperty("address")
    for (const value of invalid) await expect(Effect.runPromise(validateEmail(value))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("preserves explicit, query, header, stored, then Accept-Language locale precedence", () => {
    expect(requestedAuthLocale({ explicit: " fr-CA, en;q=0.9", query: "de", header: "ja", acceptLanguage: "es" }, "it")).toBe("fr-CA")
    expect(requestedAuthLocale({ query: "de;q=0.8", header: "ja" }, "it")).toBe("de")
    expect(requestedAuthLocale({ header: "ja" }, "it")).toBe("ja")
    expect(requestedAuthLocale({ acceptLanguage: "es" }, "it")).toBe("it")
    expect(requestedAuthLocale({ acceptLanguage: "es, en" })).toBe("es")
    expect(requestedAuthLocale({})).toBe("en")
  })

  it("routes all 15 canonical lifecycle operations and preserves resend expiry as410", async () => {
    expect(authLifecycleRuntimeRoutes).toHaveLength(15)
    const resend = vi.fn(() => Effect.fail(new AuthVerificationExpired({ message: "Verification expired. Please register again." })))
    const response = await run("/v2/auth/resend-verification", { email: "reader@example.test", locale: "fr" }, { resend })
    expect(response!.status).toBe(410)
    expect(resend).toHaveBeenCalledWith("reader@example.test", "fr")
    expect(await response!.json()).toMatchObject({ code: "invalid_request", message: "Verification expired. Please register again." })
  })

  it("keeps verification/recovery codes out of responses and refresh tokens out of web JSON", async () => {
    const register = vi.fn(() => Effect.succeed({ message: "Verification sent" }))
    const result = await run("/v2/auth/register", { email: "reader@example.test", password: "Password1", username: "Reader", device_id: "phone", device_name: "Phone" }, { register })
    expect(await result!.json()).toEqual({ message: "Verification sent" })
    const tokens = { access_token: "fixture-access", refresh_token: "fixture-refresh", expiresAt: new Date(),
      user: { user_id: "fixture", username: "Reader", avatar_url: "", auth_methods: ["email"] } }
    const verify = vi.fn(() => Effect.succeed(tokens))
    const web = await run("/v2/auth/web/verify-email-code", { email: "reader@example.test", code: "123456" }, { verify })
    expect(verify).toHaveBeenCalledWith("reader@example.test", "123456", "web")
    expect(await web!.json()).toEqual({ access_token: "fixture-access", user: tokens.user })
    expect(web!.headers.get("set-cookie")).toContain("Secure; SameSite=None")
    const reset = vi.fn(() => Effect.succeed(tokens))
    const body = { email: "reader@example.test", reset_code: "123456", new_password: "Password2", device_id: "phone", device_name: "Phone" }
    await run("/v2/auth/reset-password", body, { reset })
    expect(reset).toHaveBeenCalledWith(body, "native")
  })
})

function run(path: string, body: unknown, email: Partial<AuthEmail["Service"]>) {
  return Effect.runPromise(dispatchAuthLifecycle(new Request(`https://api.clashk.ing${path}`, { method: "POST",
    headers: { origin: "https://dash.clashk.ing", "content-type": "application/json" }, body: JSON.stringify(body),
  }), { WEB_ALLOWED_ORIGINS: "https://dash.clashk.ing", DISCORD_REDIRECT_URI: "https://dash.clashk.ing/auth/callback" }).pipe(
    Effect.provide(Layer.mergeAll(Layer.mock(AuthEmail, email), Layer.mock(AuthSessions, {}), Layer.mock(AuthProfiles, {}),
      Layer.mock(AuthIdentity, {}), Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient))),
  ))
}
