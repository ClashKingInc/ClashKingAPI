import { compare, hash } from "bcryptjs"
import { Context, Effect, Layer } from "effect"
import { jwtVerify, SignJWT } from "jose"

import { WorkerEnvironment } from "./environment.js"
import { InvalidRequest, Unauthenticated, UpstreamUnavailable } from "./errors.js"

export type SessionKind = "native" | "web"
export interface SessionTokens {
  readonly access_token: string
  readonly refresh_token: string
  readonly expiresAt: Date
}
export interface RefreshClaims {
  readonly userId: string
  readonly deviceId: string
  readonly expiresAt: Date
}
type CryptoFailure = InvalidRequest | UpstreamUnavailable
const encoder = new TextEncoder()
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")

export class AuthCrypto extends Context.Service<AuthCrypto, {
  readonly emailHash: (email: string) => Effect.Effect<string, UpstreamUnavailable>
  readonly codeHash: (emailHash: string, code: string) => Effect.Effect<string, UpstreamUnavailable>
  readonly tokenHash: (token: string) => Effect.Effect<string, UpstreamUnavailable>
  readonly verificationCode: () => Effect.Effect<string, UpstreamUnavailable>
  readonly passwordHash: (password: string) => Effect.Effect<string, CryptoFailure>
  readonly passwordMatches: (password: string, encoded: string) => Effect.Effect<boolean, UpstreamUnavailable>
  readonly issue: (userId: string, deviceId: string, kind: SessionKind) => Effect.Effect<SessionTokens, CryptoFailure>
  readonly verifyRefresh: (token: string, kind: SessionKind) => Effect.Effect<RefreshClaims, Unauthenticated>
}>()("clashking/AuthCrypto") {
  static readonly layer = Layer.effect(AuthCrypto, Effect.gen(function* () {
    const env = yield* WorkerEnvironment
    const accessKey = encoder.encode(env.JWT_ACCESS_SECRET)
    const refreshKey = encoder.encode(env.JWT_REFRESH_SECRET)
    if (accessKey.length === 0 || refreshKey.length === 0) {
      return yield* new UpstreamUnavailable({ cause: "Missing JWT secrets", message: "Authentication is not configured" })
    }
    const audiences = {
      native: env.NATIVE_TOKEN_AUDIENCE.trim() || "clashking-native",
      web: env.WEB_TOKEN_AUDIENCE.trim() || "clashking-web",
    }
    const digest = (value: string) => cryptographic(() => crypto.subtle.digest("SHA-256", encoder.encode(value)).then(hex))
    return AuthCrypto.of({
      // These formats match existing stored authentication rows.
      emailHash: (email) => digest(email.trim().toLowerCase() + env.JWT_ACCESS_SECRET),
      tokenHash: digest,
      codeHash: (emailHash, code) => cryptographic(async () => {
        const key = await crypto.subtle.importKey("raw", accessKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
        return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${emailHash}\0${code.trim()}`)))
      }),
      verificationCode: () => cryptographic(async () => {
        // Rejection sampling avoids modulo bias, matching rand.Int(900000)+100000.
        const range = 900_000
        const limit = Math.floor(2 ** 32 / range) * range
        const bytes = new Uint32Array(1)
        do { crypto.getRandomValues(bytes) } while (bytes[0]! >= limit)
        return String(100_000 + bytes[0]! % range)
      }),
      passwordHash: (password) => Effect.gen(function* () {
        const length = encoder.encode(password).length
        if (length < 8 || !/[0-9]/u.test(password)) {
          return yield* new InvalidRequest({ message: "Password must be at least 8 characters long and contain a digit" })
        }
        // Go bcrypt.GenerateFromPassword rejects >72 bytes; bcryptjs truncates.
        if (length > 72) return yield* new InvalidRequest({ message: "Password must be at most 72 UTF-8 bytes" })
        return yield* cryptographic(() => hash(password, 10))
      }),
      passwordMatches: (password, encoded) => cryptographic(() => compare(password, encoded)),
      issue: (userId, deviceId, kind) => Effect.gen(function* () {
        if (userId.length === 0) return yield* new InvalidRequest({ message: "User identity is required" })
        const now = Math.floor(Date.now() / 1000)
        const expiration = now + 30 * 86400
        const makeToken = () => new SignJWT(deviceId.length === 0 ? {} : { device: deviceId })
          .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId)
          .setAudience(audiences[kind]).setIssuedAt(now)
        return yield* cryptographic(async () => ({
          access_token: await makeToken().setExpirationTime(now + (kind === "web" ? 900 : 86400)).sign(accessKey),
          refresh_token: await makeToken().setJti(crypto.randomUUID()).setExpirationTime(expiration).sign(refreshKey),
          expiresAt: new Date(expiration * 1000),
        }))
      }),
      verifyRefresh: (token, kind) => Effect.tryPromise({
        try: async () => {
          const { payload } = await jwtVerify(token, refreshKey, {
            algorithms: ["HS256"], audience: audiences[kind], requiredClaims: ["sub", "iat", "exp", "jti"],
          })
          if (typeof payload.sub !== "string" || payload.sub.length === 0 || typeof payload.exp !== "number"
            || typeof payload.iat !== "number" || typeof payload.jti !== "string" || payload.jti.length === 0
            || (payload.device !== undefined && typeof payload.device !== "string")) throw new Error("Incomplete refresh claims")
          return { userId: payload.sub, deviceId: typeof payload.device === "string" ? payload.device : "", expiresAt: new Date(payload.exp * 1000) }
        },
        catch: () => new Unauthenticated({ message: "Invalid or expired refresh token" }),
      }),
    })
  }))
}

function cryptographic<A>(operation: () => Promise<A>): Effect.Effect<A, UpstreamUnavailable> {
  return Effect.tryPromise({ try: operation, catch: (cause) => new UpstreamUnavailable({ cause, message: "Authentication cryptography failed" }) })
}
