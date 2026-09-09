import type { AuthUser } from "@clashking/api-contracts"
import { Context, Data, Effect, Layer } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"

import { AuthCrypto, type SessionKind, type SessionTokens } from "./auth-crypto.js"
import { DatabaseFailure, InvalidRequest, Unauthenticated, type ApiFailure } from "./errors.js"

export interface EmailAccount {
  readonly user_id: string
  readonly username: string | null
  readonly password_hash: string | null
}
export interface AuthSession extends SessionTokens { readonly user: typeof AuthUser.Type }
export class AuthRefreshRejected extends Data.TaggedError("AuthRefreshRejected")<{
  readonly message: string
}> {}
type RefreshFailure = ApiFailure | AuthRefreshRejected

export const emailAuthUser = (account: EmailAccount): typeof AuthUser.Type => ({
  user_id: account.user_id, username: account.username?.trim() ? account.username : "User",
  avatar_url: "https://assets.clashk.ing/stickers/Troop_HV_Goblin.png", auth_methods: ["email"],
})

export class AuthSessions extends Context.Service<AuthSessions, {
  readonly issue: (userId: string, deviceId: string, kind: SessionKind) => Effect.Effect<SessionTokens, ApiFailure>
  readonly emailLogin: (email: string, password: string, deviceId: string, kind: SessionKind) => Effect.Effect<AuthSession, ApiFailure>
  readonly refresh: (token: string, requestedDevice: string, kind: SessionKind) => Effect.Effect<SessionTokens, RefreshFailure>
  readonly logout: (token: string) => Effect.Effect<void, ApiFailure>
}>()("clashking/AuthSessions") {
  static readonly layer = Layer.effect(AuthSessions, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const auth = yield* AuthCrypto
    const lockUser = (userId: string) => Effect.gen(function* () {
      const rows = yield* database(sql<{ user_id: string }>`SELECT user_id FROM auth_users WHERE user_id = ${userId} FOR UPDATE`)
      if (rows.length !== 1) return yield* new Unauthenticated({ message: "User session is no longer valid" })
    })
    const persist = (userId: string, deviceId: string, tokens: SessionTokens) => Effect.gen(function* () {
      const tokenHash = yield* auth.tokenHash(tokens.refresh_token)
      yield* database(sql`INSERT INTO auth_refresh_tokens (token_hash,user_id,device_id,expires_at)
        VALUES (${tokenHash},${userId},${deviceId},${tokens.expiresAt})`)
    })
    const issue = (userId: string, deviceId: string, kind: SessionKind) => Effect.gen(function* () {
      yield* requireSessionDevice(deviceId, kind)
      const tokens = yield* auth.issue(userId, deviceId, kind)
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* lockUser(userId)
        yield* persist(userId, deviceId, tokens)
      })).pipe(mapTransactionError)
      return tokens
    })
    return AuthSessions.of({
      issue,
      emailLogin: (email, password, deviceId, kind) => Effect.gen(function* () {
        yield* requireSessionDevice(deviceId, kind)
        const emailHash = yield* auth.emailHash(email)
        return yield* sql.withTransaction(Effect.gen(function* () {
        const users = yield* database(sql<EmailAccount>`SELECT /* auth-login-lock */ user_id,username,password_hash FROM auth_users
          WHERE email_hash = ${emailHash} AND provider = 'email' LIMIT 1 FOR UPDATE`)
        const user = users[0]
        // Do bcrypt work for missing users too; neither branch reveals account existence.
        const matches = yield* auth.passwordMatches(password, user?.password_hash ??
          "$2a$10$4ki3HNn3zbKTEbQcXfa2julN2at/N6GYDAC/euGLXYV2Cp.X3sNzW")
        if (user === undefined || !matches) return yield* new Unauthenticated({ message: "Invalid email or password" })
        return { ...yield* issue(user.user_id, deviceId, kind), user: emailAuthUser(user) }
        })).pipe(mapTransactionError)
      }),
      refresh: (token, requestedDevice, kind) => Effect.gen(function* () {
        const claims = yield* auth.verifyRefresh(token, kind).pipe(Effect.mapError((error) =>
          new AuthRefreshRejected({ message: error.message })))
        const oldHash = yield* auth.tokenHash(token)
        const rows = yield* database(sql<{ user_id: string; device_id: string; expires_at: Date }>`
          SELECT user_id,device_id,expires_at FROM auth_refresh_tokens WHERE token_hash = ${oldHash}`)
        const stored = rows[0]
        if (stored === undefined || stored.user_id !== claims.userId || stored.device_id !== claims.deviceId
          || new Date(stored.expires_at).valueOf() <= Date.now()) {
          return yield* new AuthRefreshRejected({ message: "Invalid session" })
        }
        // Native clients may update their device ID, as in Go. The old row must
        // still match the signed device, and browser refresh never changes it.
        const nextDevice = kind === "native" ? requestedDevice.trim() || claims.deviceId : claims.deviceId
        yield* requireSessionDevice(nextDevice, kind)
        const tokens = yield* auth.issue(claims.userId, nextDevice, kind)
        return yield* sql.withTransaction(Effect.gen(function* () {
          yield* lockUser(claims.userId)
          const removed = yield* database(sql<{ token_hash: string }>`DELETE FROM auth_refresh_tokens
            WHERE token_hash = ${oldHash} AND user_id = ${claims.userId} AND device_id = ${claims.deviceId}
              AND expires_at > now() RETURNING token_hash`)
          if (removed.length !== 1) {
            return yield* new AuthRefreshRejected({ message: "Session was already refreshed" })
          }
          yield* persist(claims.userId, nextDevice, tokens)
          return tokens
        })).pipe(Effect.mapError((cause) => cause._tag === "SqlError"
          ? new DatabaseFailure({ cause, message: "Session rotation failed" }) : cause))
      }),
      logout: (token) => Effect.gen(function* () {
        if (token.trim().length === 0) return
        const claims = yield* auth.verifyRefresh(token, "web").pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (claims === undefined) return
        const tokenHash = yield* auth.tokenHash(token)
        yield* database(sql`DELETE FROM auth_refresh_tokens WHERE token_hash = ${tokenHash}
          AND user_id = ${claims.userId} AND device_id = ${claims.deviceId}`)
      }),
    })
  }))
}

export function requireSessionDevice(deviceId: string, kind: SessionKind) {
  return kind === "web" && deviceId.trim().length === 0
    ? Effect.fail(new InvalidRequest({ message: "Device ID is required" })) : Effect.void
}

function database<A, E>(operation: Effect.Effect<A, E>) {
  return operation.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Authentication storage failed" })))
}

function mapTransactionError<A, E extends ApiFailure, R>(operation: Effect.Effect<A, E | SqlError.SqlError, R>) {
  return operation.pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Authentication transaction failed" }))))
}
