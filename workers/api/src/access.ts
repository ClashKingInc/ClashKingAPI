import type { AdminUser } from "@clashking/api-contracts"
import { createRemoteJWKSet, customFetch, jwksCache, jwtVerify, type JWKSCacheInput } from "jose"
import { Context, Effect, Layer } from "effect"

import { Forbidden, Unauthenticated, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"

export type AdminPrincipal = AdminUser

// Only public certificate JSON and fetch timestamps are shared. Each request
// creates its own resolver, so an in-flight fetch never crosses Worker requests.
export const makeAccessCertificateCache = () => new Map<string, JWKSCacheInput>()
const certificates = makeAccessCertificateCache()

export class AccessIdentity extends Context.Service<
  AccessIdentity,
  {
    readonly requireAdmin: (
      request: Request,
    ) => Effect.Effect<AdminPrincipal, Forbidden | Unauthenticated | UpstreamUnavailable>
  }
>()("clashking/AccessIdentity") {
  static readonly layerWithCache = (cache: ReturnType<typeof makeAccessCertificateCache>) => Layer.effect(
    AccessIdentity,
    Effect.gen(function* () {
      const env = yield* WorkerEnvironment
      const domain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/u, "") ?? ""
      const audience = env.ACCESS_AUDIENCE?.trim() ?? ""
      const issuer = domain.startsWith("https://") ? domain : `https://${domain}`
      let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

      const requireAdmin = Effect.fn("AccessIdentity.requireAdmin")(function* (
        request: Request,
      ) {
        if (request.headers.get("x-requested-with") !== "XMLHttpRequest") {
          return yield* new Forbidden({ message: "Admin requests require the AJAX request header" })
        }
        if (domain.length === 0 || audience.length === 0) {
          return yield* new UpstreamUnavailable({
            cause: new Error("Cloudflare Access team domain and audience are required"),
            message: "Cloudflare Access verification is not configured",
          })
        }
        const assertion = request.headers.get("cf-access-jwt-assertion")?.trim()
        if (assertion === undefined || assertion.length === 0) {
          return yield* new Unauthenticated({ message: "Cloudflare Access assertion is required" })
        }
        const claims = yield* Effect.tryPromise({
          try: () => {
            let cached = cache.get(issuer)
            if (cached === undefined) {
              cached = {}
              if (cache.size >= 8) cache.delete(cache.keys().next().value!)
              cache.set(issuer, cached)
            }
            jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
              [jwksCache]: cached,
              [customFetch]: async (...args) => {
                try {
                  const response = await fetch(...args)
                  if (response.status !== 200) {
                    await response.body?.cancel().catch(() => undefined)
                    throw new Error("Certificate endpoint returned an unsuccessful response")
                  }
                  return response
                } catch (cause) {
                  throw new UpstreamUnavailable({ cause, message: "Cloudflare Access signing keys are unavailable" })
                }
              },
            })
            return jwtVerify(assertion, jwks, { algorithms: ["RS256"], issuer, audience })
          },
          catch: (cause) => cause instanceof UpstreamUnavailable ? cause
            : typeof cause === "object" && cause !== null && "code" in cause &&
                ["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID", "ERR_JOSE_GENERIC"].includes(String(cause.code))
              ? new UpstreamUnavailable({ cause, message: "Cloudflare Access signing keys are unavailable" })
              : new Forbidden({ message: "Cloudflare Access assertion is invalid" }),
        })
        const email = typeof claims.payload.email === "string" ? claims.payload.email : ""
        const subject = typeof claims.payload.sub === "string" ? claims.payload.sub : ""
        if (email.length === 0 || subject.length === 0) {
          return yield* new Forbidden({ message: "Cloudflare Access identity is incomplete" })
        }

        // The configured Access application's admission policy is the Admin
        // authorization boundary, matching the original Admin backend.
        const displayName = typeof claims.payload.name === "string" ? claims.payload.name.trim() : ""
        return {
          id: subject,
          email,
          username: email,
          display_name: displayName || email.split("@")[0]!,
          role: "owner" as const,
          active: true,
        }
      })

      return AccessIdentity.of({ requireAdmin })
    }),
  )
  static readonly layer = AccessIdentity.layerWithCache(certificates)
}
