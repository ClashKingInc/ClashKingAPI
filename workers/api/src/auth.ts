import { jwtVerify } from "jose"
import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, Unauthenticated } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"

export interface UserPrincipal {
  readonly deviceId?: string
  readonly kind: "user"
  readonly userId: string
}

export interface BotPrincipal {
  readonly kind: "bot"
}

export type ApiPrincipal = BotPrincipal | UserPrincipal

export const bearerToken = (request: Request): string | undefined => {
  const authorization = request.headers.get("authorization")
  if (authorization === null) return undefined
  const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization.trim())
  return match?.[1]
}

export const sameSecret = (left: string, right: string) => Effect.promise(async () => {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes.at(index) ?? 0) ^ (rightBytes.at(index) ?? 0)
  }
  return difference === 0
})

export class AuthIdentity extends Context.Service<
  AuthIdentity,
  {
    readonly requireBot: (request: Request) => Effect.Effect<BotPrincipal, Unauthenticated>
    readonly requireUser: (
      request: Request,
    ) => Effect.Effect<UserPrincipal, DatabaseFailure | Unauthenticated, SqlClient.SqlClient>
    readonly requireUserOrBot: (
      request: Request,
    ) => Effect.Effect<ApiPrincipal, DatabaseFailure | Unauthenticated, SqlClient.SqlClient>
  }
>()("clashking/AuthIdentity") {
  static readonly layer = Layer.effect(
    AuthIdentity,
    Effect.gen(function* () {
      const env = yield* WorkerEnvironment
      const jwtKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET)

      const requireBot = Effect.fn("AuthIdentity.requireBot")(function* (request: Request) {
        const token = bearerToken(request)
        if (token === undefined || !(yield* sameSecret(token, env.API_BOT_TOKEN))) {
          return yield* new Unauthenticated({ message: "A valid bot token is required" })
        }
        return { kind: "bot" as const }
      })

      const requireUser = Effect.fn("AuthIdentity.requireUser")(function* (request: Request) {
        const token = bearerToken(request)
        if (token === undefined) {
          return yield* new Unauthenticated({ message: "Authentication token missing" })
        }
        const verified = yield* Effect.tryPromise({
          try: () => jwtVerify(token, jwtKey, {
            algorithms: ["HS256"],
            audience: [env.NATIVE_TOKEN_AUDIENCE, env.WEB_TOKEN_AUDIENCE],
          }),
          catch: () => new Unauthenticated({ message: "Invalid or expired token" }),
        })
        const { sub, device, exp, iat } = verified.payload
        if (typeof sub !== "string" || sub.length === 0 || typeof exp !== "number" || typeof iat !== "number") {
          return yield* new Unauthenticated({ message: "Access token claims are incomplete" })
        }
        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql<{ exists: boolean }>`
          SELECT EXISTS(SELECT 1 FROM auth_users WHERE user_id = ${sub}) AS exists
        `.pipe(
          Effect.mapError((cause) => new DatabaseFailure({
            cause,
            message: "Authentication state is unavailable",
          })),
        )
        if (rows[0]?.exists !== true) {
          return yield* new Unauthenticated({ message: "User session is no longer valid" })
        }
        return {
          kind: "user" as const,
          userId: sub,
          ...(typeof device === "string" && device.length > 0 ? { deviceId: device } : {}),
        }
      })

      const requireUserOrBot = Effect.fn("AuthIdentity.requireUserOrBot")(function* (
        request: Request,
      ) {
        const token = bearerToken(request)
        if (token !== undefined && (yield* sameSecret(token, env.API_BOT_TOKEN))) {
          return { kind: "bot" as const }
        }
        return yield* requireUser(request)
      })

      return AuthIdentity.of({ requireBot, requireUser, requireUserOrBot })
    }),
  )
}
