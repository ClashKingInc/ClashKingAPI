import { createRemoteJWKSet, jwtVerify } from "jose"
import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, Forbidden, Unauthenticated } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"

export interface AdminPrincipal {
  readonly active: boolean
  readonly avatar_url?: string
  readonly created_at: string
  readonly display_name: string
  readonly email: string
  readonly id: string
  readonly last_login_at?: string
  readonly role: "admin" | "owner"
  readonly updated_at: string
  readonly username: string
}

interface AdminPrincipalRow {
  readonly active: boolean
  readonly avatar_url: string | null
  readonly created_at: Date
  readonly display_name: string
  readonly email: string
  readonly id: string
  readonly last_login_at: Date | null
  readonly role: "admin" | "owner"
  readonly updated_at: Date
  readonly username: string
}

export class AccessIdentity extends Context.Service<
  AccessIdentity,
  {
    readonly requireAdmin: (
      request: Request,
      requiredRole: "admin" | "owner",
    ) => Effect.Effect<AdminPrincipal, DatabaseFailure | Forbidden | Unauthenticated, SqlClient.SqlClient>
  }
>()("clashking/AccessIdentity") {
  static readonly layer = Layer.effect(
    AccessIdentity,
    Effect.gen(function* () {
      const env = yield* WorkerEnvironment
      const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
      const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))

      const requireAdmin = Effect.fn("AccessIdentity.requireAdmin")(function* (
        request: Request,
        requiredRole: "admin" | "owner",
      ) {
        if (request.headers.get("x-requested-with") !== "XMLHttpRequest") {
          return yield* new Forbidden({ message: "Admin requests require the AJAX request header" })
        }
        const assertion = request.headers.get("cf-access-jwt-assertion")
        if (assertion === null || assertion.length === 0) {
          return yield* new Unauthenticated({ message: "Cloudflare Access assertion is required" })
        }
        const claims = yield* Effect.tryPromise({
          try: () => jwtVerify(assertion, jwks, { issuer, audience: env.ACCESS_AUDIENCE }),
          catch: () => new Unauthenticated({ message: "Cloudflare Access assertion is invalid" }),
        })
        const email = typeof claims.payload.email === "string" ? claims.payload.email : ""
        const subject = claims.payload.sub ?? ""
        if (email.length === 0 || subject.length === 0) {
          return yield* new Unauthenticated({ message: "Cloudflare Access identity is incomplete" })
        }

        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql<AdminPrincipalRow>`
          UPDATE admin_access_principals
          SET last_login_at = now()
          WHERE access_subject = ${subject}
            AND lower(email) = lower(${email})
            AND active
            AND (${requiredRole} = 'admin' OR role = 'owner')
          RETURNING access_subject AS id, email, username, display_name, avatar_url,
                    role, active, last_login_at, created_at, updated_at
        `.pipe(
          Effect.mapError(
            (cause) => new DatabaseFailure({ cause, message: "Admin role lookup failed" }),
          ),
        )
        const row = rows[0]
        if (row === undefined) {
          return yield* new Forbidden({ message: "Admin access is not active" })
        }
        return {
          id: row.id,
          email: row.email,
          username: row.username,
          display_name: row.display_name,
          ...(row.avatar_url === null ? {} : { avatar_url: row.avatar_url }),
          role: row.role,
          active: row.active,
          ...(row.last_login_at === null ? {} : { last_login_at: row.last_login_at.toISOString() }),
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        }
      })

      return AccessIdentity.of({ requireAdmin })
    }),
  )
}
