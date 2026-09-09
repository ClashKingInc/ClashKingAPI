import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { AuthCrypto } from "../../src/auth-crypto.js"
import { AuthEmail, AuthMailer, AuthVerificationExpired, type AuthEmailMessage } from "../../src/auth-email.js"
import { AuthSessions } from "../../src/auth-sessions.js"
import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, Unauthenticated, UpstreamUnavailable } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the disposable Goose Timescale harness")
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, JWT_ACCESS_SECRET: "fixture-access-secret",
  JWT_REFRESH_SECRET: "fixture-refresh-secret", NATIVE_TOKEN_AUDIENCE: "fixture-native", WEB_TOKEN_AUDIENCE: "fixture-web" } as WorkerBindings
const messages: AuthEmailMessage[] = []
const mail = AuthMailer.of({ send: (message) => Effect.sync(() => { messages.push(message) }) })
const run = <A, E>(program: Effect.Effect<A, E, AuthEmail | AuthMailer | AuthSessions | AuthCrypto | SqlClient.SqlClient>,
  mailer = mail, sessions?: AuthSessions["Service"]) => Effect.runPromise(program.pipe(
  Effect.provide(AuthEmail.layer), Effect.provide(sessions === undefined ? AuthSessions.layer : Layer.succeed(AuthSessions, sessions)),
  Effect.provide(AuthCrypto.layer), Effect.provideService(AuthMailer, mailer), Effect.provideService(WorkerEnvironment, bindings),
  Effect.provide(databaseLayer(bindings)), Effect.scoped,
))
const input = () => ({ email: `${crypto.randomUUID()}@example.test`, password: "FixturePassword1", username: "Reader", device_id: "phone", device_name: "Phone" })
const messageFor = (recipient: string, kind: AuthEmailMessage["kind"]) => messages.findLast((message) => message.recipient === recipient && message.kind === kind)!
const create = () => Effect.gen(function* () {
  const email = yield* AuthEmail
  const user = input()
  yield* email.register(user, "fr")
  const session = yield* email.verify(user.email, messageFor(user.email, "verification").code, "native")
  return { ...user, userId: session.user.user_id, session }
})

describe("email lifecycle against authoritative Goose migrations", () => {
  it("hashes pending credentials, consumes verification once, and returns no raw code", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const email = yield* AuthEmail
      const auth = yield* AuthCrypto
      const user = input()
      const response = yield* email.register(user, "fr")
      expect(response).not.toHaveProperty("verification_code")
      const sent = messageFor(user.email, "verification")
      expect(sent.locale).toBe("fr")
      const emailHash = yield* auth.emailHash(user.email)
      const rows = yield* sql<{ verification_code_hash: string; password_hash: string; expires_at: Date }>`SELECT verification_code_hash,password_hash,expires_at FROM auth_email_verifications WHERE email_hash = ${emailHash}`
      expect(rows[0]!.verification_code_hash).toBe(yield* auth.codeHash(emailHash, sent.code))
      expect(rows[0]!.password_hash).not.toBe(user.password)
      expect(new Date(rows[0]!.expires_at).valueOf() - Date.now()).toBeGreaterThan(14 * 60_000)
      expect(yield* email.verify(user.email, "000000", "native").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      const session = yield* email.verify(user.email, sent.code, "native")
      expect(session.user.username).toBe(user.username)
      expect(yield* email.verify(user.email, sent.code, "native").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      expect(yield* email.register(user, "en").pipe(Effect.flip)).toBeInstanceOf(InvalidRequest)
    }))
  })

  it("has one concurrent registration winner and does not overwrite live pending credentials", async () => {
    await run(Effect.gen(function* () {
      const email = yield* AuthEmail
      const user = input()
      const outcomes = yield* Effect.all([email.register(user, "en").pipe(Effect.result),
        email.register({ ...user, password: "AttackerPassword2", device_id: "other" }, "en").pipe(Effect.result)], { concurrency: 2 })
      expect(outcomes.filter((result) => result._tag === "Success")).toHaveLength(1)
      const failure = outcomes.find((result) => result._tag === "Failure")
      expect(failure?._tag === "Failure" && failure.failure).toBeInstanceOf(Conflict)
      expect(messages.filter((message) => message.recipient === user.email)).toHaveLength(1)
    }))
  })

  it("rotates resend codes, rejects expired/missing requests, and preserves pending browser verification on missing device", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const email = yield* AuthEmail
      const user = { ...input(), device_id: "" }
      yield* email.register(user, "en")
      const first = messageFor(user.email, "verification").code
      yield* email.resend(user.email, "ja")
      const next = messageFor(user.email, "verification").code
      expect(next).not.toBe(first)
      expect(yield* email.verify(user.email, first, "native").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      expect(yield* email.verify(user.email, next, "web").pipe(Effect.flip)).toBeInstanceOf(InvalidRequest)
      const hash = yield* auth.emailHash(user.email)
      expect((yield* sql`SELECT email_hash FROM auth_email_verifications WHERE email_hash = ${hash}`).length).toBe(1)
      yield* sql`UPDATE auth_email_verifications SET expires_at = now() - interval '1 second' WHERE email_hash = ${hash}`
      expect(yield* email.resend(user.email, "en").pipe(Effect.flip)).toBeInstanceOf(AuthVerificationExpired)
      expect((yield* sql`SELECT email_hash FROM auth_email_verifications WHERE email_hash = ${hash}`).length).toBe(0)
      expect(yield* email.resend(user.email, "en").pipe(Effect.flip)).toBeInstanceOf(NotFound)
    }))
  })

  it("never overwrites an existing account from a stale pending verification", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const email = yield* AuthEmail
      const user = yield* create()
      const hash = yield* auth.emailHash(user.email)
      const codeHash = yield* auth.codeHash(hash, "123456")
      yield* sql`INSERT INTO auth_email_verifications(email_hash,verification_code_hash,username,password_hash,device_id,expires_at)
        VALUES (${hash},${codeHash},'Changed','bad-hash','other',now() + interval '15 minutes')`
      expect(yield* email.verify(user.email, "123456", "native").pipe(Effect.flip)).toBeInstanceOf(Conflict)
      const rows = yield* sql<{ password_hash: string }>`SELECT password_hash FROM auth_users WHERE user_id = ${user.userId}`
      expect(yield* auth.passwordMatches(user.password, rows[0]!.password_hash)).toBe(true)
    }))
  })

  it("cleans only its failed registration delivery and hides account existence on recovery failure", async () => {
    const failedMail = AuthMailer.of({ send: () => Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Fixture mail failure" })) })
    const user = await run(create())
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const email = yield* AuthEmail
      const pending = input()
      expect(yield* email.register(pending, "en").pipe(Effect.flip)).toBeInstanceOf(UpstreamUnavailable)
      const hash = yield* auth.emailHash(pending.email)
      expect((yield* sql`SELECT email_hash FROM auth_email_verifications WHERE email_hash = ${hash}`).length).toBe(0)
      const existing = yield* email.forgot(user.email, {})
      const missing = yield* email.forgot("missing@example.test", {})
      expect(existing).toEqual(missing)
      expect(existing).not.toHaveProperty("reset_code")
      expect((yield* sql`SELECT email_hash FROM auth_password_reset_tokens WHERE user_id = ${user.userId}`).length).toBe(0)
    }), failedMail)
  })

  it("consumes a reset once, changes the password, and revokes only that user's sessions", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const email = yield* AuthEmail
      const sessions = yield* AuthSessions
      const user = yield* create()
      const other = yield* create()
      yield* sessions.issue(user.userId, "browser", "web")
      yield* email.forgot(user.email, { explicit: "de" })
      const sent = messageFor(user.email, "password_reset")
      expect(sent.locale).toBe("de")
      const payload = { email: user.email, reset_code: sent.code, new_password: "NewPassword2", device_id: "new-browser", device_name: "Browser" }
      const reset = yield* email.reset(payload, "web")
      expect(yield* email.reset(payload, "web").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      expect(yield* sessions.emailLogin(user.email, user.password, "phone", "native").pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      const rows = yield* sql<{ device_id: string }>`SELECT device_id FROM auth_refresh_tokens WHERE user_id = ${user.userId}`
      expect(rows).toEqual([{ device_id: "new-browser" }])
      expect(reset.user.user_id).toBe(user.userId)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${other.userId}`).length).toBe(1)
    }))
  })

  it("rolls back reset code consumption, password change, and session revocation if successor storage fails", async () => {
    const user = await run(Effect.gen(function* () { const user = yield* create(); const email = yield* AuthEmail; yield* email.forgot(user.email, {}); return user }))
    const fail = () => Effect.fail(new DatabaseFailure({ cause: "fixture", message: "Fixture session failure" }))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthCrypto
      const email = yield* AuthEmail
      expect(yield* email.reset({ email: user.email, reset_code: messageFor(user.email, "password_reset").code,
        new_password: "NewPassword2", device_id: "new", device_name: "New" }, "native").pipe(Effect.flip)).toBeInstanceOf(DatabaseFailure)
      const rows = yield* sql<{ password_hash: string }>`SELECT password_hash FROM auth_users WHERE user_id = ${user.userId}`
      expect(yield* auth.passwordMatches(user.password, rows[0]!.password_hash)).toBe(true)
      expect((yield* sql`SELECT email_hash FROM auth_password_reset_tokens WHERE user_id = ${user.userId}`).length).toBe(1)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${user.userId}`).length).toBe(1)
    }), mail, AuthSessions.of({ issue: fail, emailLogin: fail, refresh: fail, logout: fail }))
  })

  it("revokes an old-password login already in flight before reset can finish", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const realCrypto = yield* AuthCrypto
      const email = yield* AuthEmail
      const user = yield* create()
      yield* email.forgot(user.email, {})
      const payload = { email: user.email, reset_code: messageFor(user.email, "password_reset").code,
        new_password: "NewPassword2", device_id: "reset-browser", device_name: "Browser" }
      let checked!: () => void, release!: () => void, resetPrepared!: () => void
      const passwordChecked = new Promise<void>((resolve) => { checked = resolve })
      const allowLogin = new Promise<void>((resolve) => { release = resolve })
      const resetReady = new Promise<void>((resolve) => { resetPrepared = resolve })
      const gatedCrypto = AuthCrypto.of({ ...realCrypto, passwordMatches: (password, encoded) => Effect.gen(function* () {
        const matches = yield* realCrypto.passwordMatches(password, encoded)
        checked()
        yield* Effect.promise(() => allowLogin)
        return matches
      }), passwordHash: password => Effect.gen(function* () {
        const hash = yield* realCrypto.passwordHash(password)
        resetPrepared()
        return hash
      }) })
      const race = Effect.gen(function* () {
        const sessions = yield* AuthSessions
        const recovery = yield* AuthEmail
        return yield* Effect.all([
          sessions.emailLogin(user.email, user.password, "old-password-login", "native"),
          Effect.promise(() => passwordChecked).pipe(Effect.flatMap(() => recovery.reset(payload, "web"))),
          Effect.gen(function* () {
            yield* Effect.promise(() => resetReady)
            release()
          }),
        ], { concurrency: 3 })
      }).pipe(Effect.provide(Layer.fresh(AuthEmail.layer)), Effect.provide(Layer.fresh(AuthSessions.layer)),
        Effect.provideService(AuthCrypto, gatedCrypto))
      const [login, reset] = yield* race
      expect(login.user.user_id).toBe(reset.user.user_id)
      const rows = yield* sql<{ token_hash: string; device_id: string }>`SELECT token_hash,device_id FROM auth_refresh_tokens WHERE user_id = ${user.userId}`
      expect(rows).toEqual([{ token_hash: yield* realCrypto.tokenHash(reset.refresh_token), device_id: "reset-browser" }])
      // The old login returned a token before reset completed, but reset revoked it.
      const sessions = yield* AuthSessions
      expect(yield* sessions.refresh(login.refresh_token, "", "native").pipe(Effect.flip)).toMatchObject({ _tag: "AuthRefreshRejected" })
    }))
  })

  it("rejects an old-password login waiting behind an already-started reset", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const email = yield* AuthEmail
      const realCrypto = yield* AuthCrypto
      const user = yield* create()
      yield* email.forgot(user.email, {})
      const payload = { email: user.email, reset_code: messageFor(user.email, "password_reset").code,
        new_password: "NewPassword2", device_id: "reset-browser", device_name: "Browser" }
      let locked!: () => void, loginPrepared!: () => void
      const userLocked = new Promise<void>((resolve) => { locked = resolve })
      const loginReady = new Promise<void>((resolve) => { loginPrepared = resolve })
      const observedCrypto = AuthCrypto.of({ ...realCrypto, emailHash: value => Effect.gen(function* () {
        const hash = yield* realCrypto.emailHash(value)
        loginPrepared()
        return hash
      }) })
      const outcomes = yield* Effect.gen(function* () {
        const concurrentSessions = yield* AuthSessions
        return yield* Effect.all([
          sql.withTransaction(Effect.gen(function* () {
            yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${user.userId} FOR UPDATE`
            locked()
            yield* Effect.promise(() => loginReady)
            return yield* email.reset(payload, "web")
          })),
          Effect.promise(() => userLocked).pipe(Effect.flatMap(() => concurrentSessions.emailLogin(
            user.email, user.password, "old-login", "native",
          )), Effect.result),
        ], { concurrency: 2 })
      }).pipe(Effect.provide(Layer.fresh(AuthSessions.layer)), Effect.provideService(AuthCrypto, observedCrypto))
      expect(outcomes[1]._tag === "Failure" && outcomes[1].failure).toBeInstanceOf(Unauthenticated)
      expect((yield* sql`SELECT token_hash FROM auth_refresh_tokens WHERE user_id = ${user.userId}`).length).toBe(1)
    }))
  })
})
