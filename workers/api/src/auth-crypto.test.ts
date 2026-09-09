import { Effect } from "effect"
import { decodeJwt, jwtVerify, SignJWT } from "jose"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthCrypto } from "./auth-crypto.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { InvalidRequest, Unauthenticated } from "./errors.js"

const bindings = {
  JWT_ACCESS_SECRET: "fixture-access-secret", JWT_REFRESH_SECRET: "fixture-refresh-secret",
  NATIVE_TOKEN_AUDIENCE: "fixture-native", WEB_TOKEN_AUDIENCE: "fixture-web",
} as WorkerBindings
const run = <A, E>(program: Effect.Effect<A, E, AuthCrypto>) => Effect.runPromise(program.pipe(
  Effect.provide(AuthCrypto.layer), Effect.provideService(WorkerEnvironment, bindings),
))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("auth crypto parity with the existing Go implementation", () => {
  it("matches Go-generated email/code hash and bcrypt fixtures", async () => {
    await run(Effect.gen(function* () {
      const crypto = yield* AuthCrypto
      const email = yield* crypto.emailHash(" Reader@Example.test ")
      expect(email).toBe("d51be5d1c65bdefbdb90610bf4e28b65a81a32cd95321ace83aae5c05f26edae")
      expect(yield* crypto.codeHash(email, " 123456 ")).toBe("dfe421c3e281cc04c9f9994ea64a256fe911ac2237c56fb7bee3e0af78330742")
      const hash = "$2a$10$4ki3HNn3zbKTEbQcXfa2julN2at/N6GYDAC/euGLXYV2Cp.X3sNzW"
      expect(yield* crypto.passwordMatches("FixturePassword1", hash)).toBe(true)
      expect(yield* crypto.passwordMatches("WrongPassword1", hash)).toBe(false)
    }))
  })

  it("does not truncate newly registered bcrypt passwords over 72 UTF-8 bytes", async () => {
    await expect(run(AuthCrypto.use((crypto) => crypto.passwordHash("é".repeat(36) + "1"))))
      .rejects.toBeInstanceOf(InvalidRequest)
    await run(Effect.gen(function* () {
      const crypto = yield* AuthCrypto
      const hash = yield* crypto.passwordHash("FixturePassword1")
      expect(hash).toMatch(/^\$2b\$10\$/)
      expect(yield* crypto.passwordMatches("FixturePassword1", hash)).toBe(true)
    }))
  })

  it("preserves native/web audiences, device identity, lifetimes, and unique refresh IDs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-03T18:00:00Z"))
    await run(Effect.gen(function* () {
      const crypto = yield* AuthCrypto
      for (const [kind, ttl] of [["native", 86400], ["web", 900]] as const) {
        const pair = yield* crypto.issue("123456789012345678", "device-a", kind)
        const { payload } = yield* Effect.promise(() => jwtVerify(pair.access_token,
          new TextEncoder().encode(bindings.JWT_ACCESS_SECRET), { audience: `fixture-${kind}`, algorithms: ["HS256"] }))
        expect(payload.sub).toBe("123456789012345678")
        expect(payload.device).toBe("device-a")
        expect(payload.exp! - payload.iat!).toBe(ttl)
        const refresh = yield* crypto.verifyRefresh(pair.refresh_token, kind)
        expect(refresh).toMatchObject({ userId: "123456789012345678", deviceId: "device-a" })
        expect(refresh.expiresAt.valueOf() - Date.now()).toBe(30 * 86400 * 1000)
        const other = yield* crypto.issue("123456789012345678", "device-a", kind)
        expect(decodeJwt(other.refresh_token).jti).not.toBe(decodeJwt(pair.refresh_token).jti)
        expect(yield* crypto.verifyRefresh(pair.refresh_token, kind === "native" ? "web" : "native").pipe(Effect.flip))
          .toBeInstanceOf(Unauthenticated)
        expect(yield* crypto.verifyRefresh(pair.access_token, kind).pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      }
    }))
  })

  it("rejects expired, unsigned, wrong-key, and incomplete refresh tokens", async () => {
    const key = new TextEncoder().encode(bindings.JWT_REFRESH_SECRET)
    const tokens = [
      "not-a-jwt",
      await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("user").setAudience("fixture-native")
        .setIssuedAt().setExpirationTime("30d").sign(key),
      await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("user").setAudience("fixture-native")
        .setJti("one").setIssuedAt().setExpirationTime(1).sign(key),
      await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("user").setAudience("fixture-native")
        .setJti("one").setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode("wrong-key")),
    ]
    for (const token of tokens) {
      await expect(run(AuthCrypto.use((crypto) => crypto.verifyRefresh(token, "native")))).rejects.toBeInstanceOf(Unauthenticated)
    }
  })

  it("generates six-digit codes with cryptographic rejection sampling", async () => {
    const random = vi.spyOn(crypto, "getRandomValues")
    await run(Effect.gen(function* () {
      const auth = yield* AuthCrypto
      for (let i = 0; i < 20; i++) expect(yield* auth.verificationCode()).toMatch(/^[1-9][0-9]{5}$/)
    }))
    expect(random).toHaveBeenCalled()
  })
})
