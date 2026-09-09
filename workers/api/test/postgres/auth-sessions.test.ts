import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { AuthCrypto } from "../../src/auth-crypto.js"
import { AuthRefreshRejected, AuthSessions } from "../../src/auth-sessions.js"
import { dispatchAuthLifecycle } from "../../src/auth-lifecycle.js"
import { AuthProfiles } from "../../src/auth-profiles.js"
import { AuthEmail } from "../../src/auth-email.js"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { DatabaseFailure, InvalidRequest, Unauthenticated } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, JWT_ACCESS_SECRET: "fixture-access-secret",
  JWT_REFRESH_SECRET: "fixture-refresh-secret", NATIVE_TOKEN_AUDIENCE: "fixture-native", WEB_TOKEN_AUDIENCE: "fixture-web" } as WorkerBindings
const run = <A, E>(program: Effect.Effect<A, E, AuthSessions | AuthCrypto | SqlClient.SqlClient>) => Effect.runPromise(program.pipe(
  Effect.provide(AuthSessions.layer), Effect.provide(AuthCrypto.layer),
  Effect.provideService(WorkerEnvironment, bindings), Effect.provide(databaseLayer(bindings)), Effect.scoped,
))
const account = () => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const auth = yield* AuthCrypto
  const userId = crypto.randomUUID()
  const email = `${userId}@example.test`
  const emailHash = yield* auth.emailHash(email)
  yield* sql`INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash)
    VALUES (${userId},'email',${emailHash},'Reader',${"$2a$10$4ki3HNn3zbKTEbQcXfa2julN2at/N6GYDAC/euGLXYV2Cp.X3sNzW"})`
  return { userId, email }
})

describe("auth sessions against authoritative Goose migrations", () => {
  it("checks Go bcrypt credentials, hides unknown accounts, and stores only refresh hashes", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const sessions = yield* AuthSessions
      const user = yield* account()
      for (const [email, password] of [[user.email, "wrong"], ["missing@example.test", "FixturePassword1"]]) {
        expect(yield* sessions.emailLogin(email!, password!, "phone", "native").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      }
      expect(yield* sessions.emailLogin(user.email, "FixturePassword1", "  ", "web").pipe(Effect.flip)).toBeInstanceOf(InvalidRequest)
      const session = yield* sessions.emailLogin(user.email, "FixturePassword1", "phone", "native")
      expect(session.user).toMatchObject({ user_id: user.userId, auth_methods: ["email"] })
      const rows = yield* sql<{ token_hash: string; device_id: string }>`SELECT token_hash,device_id FROM auth_refresh_tokens WHERE user_id = ${user.userId}`
      expect(rows).toEqual([{ token_hash: yield* auth.tokenHash(session.refresh_token), device_id: "phone" }])
      expect(rows[0]!.token_hash).not.toBe(session.refresh_token)
    }))
  })

  it("rotates native sessions atomically and preserves the existing explicit device-update behavior", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const sessions = yield* AuthSessions
      const { userId } = yield* account()
      const first = yield* sessions.issue(userId, "phone", "native")
      const next = yield* sessions.refresh(first.refresh_token, "replacement", "native")
      expect(yield* auth.verifyRefresh(next.refresh_token, "native")).toMatchObject({ userId, deviceId: "replacement" })
      const rows = yield* sql<{ token_hash: string; device_id: string }>`SELECT token_hash,device_id FROM auth_refresh_tokens WHERE user_id = ${userId}`
      expect(rows).toEqual([{ token_hash: yield* auth.tokenHash(next.refresh_token), device_id: "replacement" }])
      expect(yield* sessions.refresh(first.refresh_token, "phone", "native").pipe(Effect.flip)).toBeInstanceOf(AuthRefreshRejected)
    }))
  })

  it("rejects stored user/device mismatch, expiry, and the wrong audience without changing sessions", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const sessions = yield* AuthSessions
      const { userId } = yield* account()
      const other = yield* account()
      const token = yield* sessions.issue(userId, "phone", "native")
      expect(yield* sessions.refresh(token.refresh_token, "", "web").pipe(Effect.flip)).toBeInstanceOf(AuthRefreshRejected)
      yield* sql`UPDATE auth_refresh_tokens SET device_id = 'other' WHERE user_id = ${userId}`
      expect(yield* sessions.refresh(token.refresh_token, "other", "native").pipe(Effect.flip)).toBeInstanceOf(AuthRefreshRejected)
      yield* sql`UPDATE auth_refresh_tokens SET device_id = 'phone',user_id = ${other.userId} WHERE user_id = ${userId}`
      expect(yield* sessions.refresh(token.refresh_token, "", "native").pipe(Effect.flip)).toBeInstanceOf(AuthRefreshRejected)
      yield* sql`UPDATE auth_refresh_tokens SET user_id = ${userId},expires_at = now() - interval '1 second' WHERE user_id = ${other.userId}`
      expect(yield* sessions.refresh(token.refresh_token, "", "native").pipe(Effect.flip)).toBeInstanceOf(AuthRefreshRejected)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${userId}`).length).toBe(1)
    }))
  })

  it("has exactly one concurrent rotation winner and tells the loser not to clear its cookie", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const sessions = yield* AuthSessions
      const { userId } = yield* account()
      const first = yield* sessions.issue(userId, "browser", "web")
      let arrivals = 0
      let release!: () => void
      const barrier = new Promise<void>((resolve) => { release = resolve })
      const synchronized = AuthCrypto.of({ ...auth, issue: (id, device, kind) => Effect.gen(function* () {
        arrivals++
        if (arrivals === 2) release()
        yield* Effect.promise(() => barrier)
        return yield* auth.issue(id, device, kind)
      }) })
      const outcomes = yield* AuthSessions.use((service) => Effect.all([
        service.refresh(first.refresh_token, "ignored", "web").pipe(Effect.result),
        service.refresh(first.refresh_token, "ignored", "web").pipe(Effect.result),
      ], { concurrency: 2 })).pipe(Effect.provide(Layer.fresh(AuthSessions.layer)), Effect.provideService(AuthCrypto, synchronized))
      expect(outcomes.filter((result) => result._tag === "Success")).toHaveLength(1)
      const loser = outcomes.find((result) => result._tag === "Failure")
      expect(loser?._tag === "Failure" && loser.failure).toMatchObject({ _tag: "AuthRefreshRejected", message: "Session was already refreshed" })
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${userId}`).length).toBe(1)
    }))
  })

  it("does not clear a winner's cookie when a delayed loser first looks up an already consumed token", async () => {
    await run(Effect.gen(function* () {
      const sessions = yield* AuthSessions
      const { userId } = yield* account()
      const first = yield* sessions.issue(userId, "browser", "web")
      const next = yield* sessions.refresh(first.refresh_token, "", "web")
      const req = new Request("https://api.clashk.ing/v2/auth/web/refresh", { method: "POST",
        headers: { origin: "https://dash.clashk.ing", cookie: `ck_web_refresh=${first.refresh_token}` } })
      const response = yield* dispatchAuthLifecycle(req, {
        WEB_ALLOWED_ORIGINS: "https://dash.clashk.ing", DISCORD_REDIRECT_URI: "https://dash.clashk.ing/auth/callback",
      }).pipe(Effect.provide(Layer.mergeAll(Layer.mock(AuthProfiles, {}), Layer.mock(AuthEmail, {}), Layer.mock(AuthIdentity, {}))))
      expect(response!.status).toBe(401)
      expect(response!.headers.has("set-cookie")).toBe(false)
      // The successor remains usable; no replay grace period was introduced.
      expect((yield* sessions.refresh(next.refresh_token, "", "web")).refresh_token).not.toBe(next.refresh_token)
    }))
  })

  it("rolls back consuming the old token when storing its successor fails", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const sessions = yield* AuthSessions
      const { userId } = yield* account()
      const first = yield* sessions.issue(userId, "browser", "web")
      const existing = yield* sessions.issue(userId, "browser", "web")
      const result = yield* AuthSessions.use((service) => service.refresh(first.refresh_token, "", "web")).pipe(
        Effect.provide(Layer.fresh(AuthSessions.layer)), Effect.provideService(AuthCrypto, { ...auth, issue: () => Effect.succeed(existing) }), Effect.flip,
      )
      expect(result).toBeInstanceOf(DatabaseFailure)
      const oldHash = yield* auth.tokenHash(first.refresh_token)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE token_hash = ${oldHash}`).length).toBe(1)
    }))
  })

  it("logs out only the signed browser user/device session, leaving native and other sessions intact", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const sessions = yield* AuthSessions
      const a = yield* account()
      const b = yield* account()
      const target = yield* sessions.issue(a.userId, "browser-a", "web")
      yield* sessions.issue(a.userId, "browser-b", "web")
      yield* sessions.issue(b.userId, "browser-a", "web")
      const native = yield* sessions.issue(a.userId, "phone", "native")
      yield* sessions.logout(native.refresh_token)
      yield* sessions.logout("invalid")
      yield* sessions.logout(target.refresh_token)
      yield* sessions.logout(target.refresh_token)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${a.userId}`).length).toBe(2)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${b.userId}`).length).toBe(1)
    }))
  })
})
