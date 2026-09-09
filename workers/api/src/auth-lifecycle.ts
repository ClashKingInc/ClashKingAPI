import { expoEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity } from "./auth.js"
import { AuthProfiles } from "./auth-profiles.js"
import { AuthEmail, requestedAuthLocale } from "./auth-email.js"
import { readWebRefreshCookie, requireWebOrigin, validateWebRedirect, webRefreshCookie } from "./auth-cookies.js"
import { AuthSessions, type AuthSession } from "./auth-sessions.js"
import type { SessionTokens } from "./auth-crypto.js"
import type { WorkerBindings } from "./environment.js"
import { InvalidRequest, type ApiFailure } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

// Only implemented canonical routes are advertised for API-owner integration.
export const authLifecycleRuntimeRoutes = [
  { method: "POST", path: "/v2/auth/email" },
  { method: "POST", path: "/v2/auth/web/email" },
  { method: "POST", path: "/v2/auth/refresh" },
  { method: "POST", path: "/v2/auth/web/refresh" },
  { method: "POST", path: "/v2/auth/web/logout" },
  { method: "POST", path: "/v2/auth/discord" },
  { method: "POST", path: "/v2/auth/web/discord" },
  { method: "GET", path: "/v2/auth/me" },
  { method: "POST", path: "/v2/auth/register" },
  { method: "POST", path: "/v2/auth/resend-verification" },
  { method: "POST", path: "/v2/auth/verify-email-code" },
  { method: "POST", path: "/v2/auth/web/verify-email-code" },
  { method: "POST", path: "/v2/auth/forgot-password" },
  { method: "POST", path: "/v2/auth/reset-password" },
  { method: "POST", path: "/v2/auth/web/reset-password" },
] as const

export function dispatchAuthLifecycle(
  request: Request, bindings: Pick<WorkerBindings, "WEB_ALLOWED_ORIGINS" | "DISCORD_REDIRECT_URI">,
): Effect.Effect<Response | undefined, ApiFailure, AuthSessions | AuthEmail | AuthProfiles | AuthIdentity | SqlClient.SqlClient> {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname
    if (!authLifecycleRuntimeRoutes.some((route) => route.path === path && route.method === request.method)) return undefined
    if (path === "/v2/auth/me") {
      const identity = yield* AuthIdentity
      const principal = yield* identity.requireUser(request)
      const profiles = yield* AuthProfiles
      return Response.json(yield* profiles.currentUser(principal), { headers: { "cache-control": "no-store" } })
    }
    const web = path.startsWith("/v2/auth/web/")
    if (web) yield* requireWebOrigin(request, bindings)
    const hints = { query: new URL(request.url).searchParams.get("locale") ?? undefined,
      header: request.headers.get("x-locale") ?? undefined, acceptLanguage: request.headers.get("accept-language") ?? undefined }
    if (path.endsWith("/register")) {
      const body = yield* decodeBody(request, expoEndpoints.authRegister.body)
      const email = yield* AuthEmail
      return Response.json(yield* email.register(body, requestedAuthLocale({ ...hints, explicit: body.locale })), { headers: { "cache-control": "no-store" } })
    }
    if (path.endsWith("/resend-verification")) {
      const body = yield* decodeBody(request, expoEndpoints.authResendVerification.body)
      const email = yield* AuthEmail
      return yield* email.resend(body.email, requestedAuthLocale({ ...hints, explicit: body.locale })).pipe(
        Effect.map((response) => Response.json(response, { headers: { "cache-control": "no-store" } })),
        Effect.catchTag("AuthVerificationExpired", (error) => Effect.succeed(Response.json({ code: "invalid_request", message: error.message,
          ...requestIdField(request) }, { status: 410, headers: { "cache-control": "no-store" } }))),
      )
    }
    if (path.endsWith("/verify-email-code")) {
      const body = yield* decodeBody(request, expoEndpoints.authVerifyEmail.body)
      const email = yield* AuthEmail
      return sessionResponse(yield* email.verify(body.email, body.code, web ? "web" : "native"), web)
    }
    if (path.endsWith("/forgot-password")) {
      const body = yield* decodeBody(request, expoEndpoints.authForgotPassword.body)
      const email = yield* AuthEmail
      return Response.json(yield* email.forgot(body.email, { ...hints, explicit: body.locale }), { headers: { "cache-control": "no-store" } })
    }
    if (path.endsWith("/reset-password")) {
      const body = yield* decodeBody(request, expoEndpoints.authResetPassword.body)
      const email = yield* AuthEmail
      return sessionResponse(yield* email.reset(body, web ? "web" : "native"), web)
    }
    if (path.endsWith("/discord")) {
      const body = yield* decodeBody(request, expoEndpoints.authDiscord.body)
      const redirect = body.redirect_uri.trim() || (web ? "" : bindings.DISCORD_REDIRECT_URI.trim())
      if (web) yield* validateWebRedirect(request, bindings, redirect)
      const profiles = yield* AuthProfiles
      return sessionResponse(
        yield* profiles.discordLogin({ ...body, redirect_uri: redirect }, web ? "web" : "native"), web)
    }
    const sessions = yield* AuthSessions
    if (path.endsWith("/email")) {
      const body = yield* decodeBody(request, expoEndpoints.authEmail.body)
      const session = yield* sessions.emailLogin(body.email, body.password, body.device_id, web ? "web" : "native")
      return sessionResponse(session, web)
    }
    if (path.endsWith("/logout")) {
      yield* sessions.logout(readWebRefreshCookie(request))
      return new Response(null, { status: 204, headers: { "set-cookie": webRefreshCookie(), "cache-control": "no-store" } })
    }
    const input = web ? { refresh_token: readWebRefreshCookie(request), device_id: "" }
      : yield* decodeBody(request, expoEndpoints.authRefresh.body)
    if (input.refresh_token.length === 0) return rejected(request, "Session is missing")
    return yield* sessions.refresh(input.refresh_token, input.device_id, web ? "web" : "native").pipe(
      Effect.map((tokens) => sessionResponse(tokens, web)),
      // A delayed loser can fail before its initial SELECT, or after token
      // expiry. No failure may clear a newer cookie set by a winning response.
      Effect.catchTag("AuthRefreshRejected", (error) => Effect.succeed(rejected(request, error.message))),
    )
  })
}

function sessionResponse(session: SessionTokens | AuthSession, web: boolean) {
  const response = Response.json({ access_token: session.access_token,
    ...(web ? {} : { refresh_token: session.refresh_token }), ...("user" in session ? { user: session.user } : {}),
  }, { headers: { "cache-control": "no-store" } })
  if (web) response.headers.set("set-cookie", webRefreshCookie(session.refresh_token))
  return response
}

function requestIdField(request: Request) {
  const requestId = request.headers.get("x-request-id")
  return requestId === null ? {} : { request_id: requestId }
}

function rejected(request: Request, message: string) {
  return Response.json({ code: "unauthenticated", message, ...requestIdField(request) },
    { status: 401, headers: { "cache-control": "no-store" } })
}

function decodeBody<S extends Schema.Top>(request: Request, schema: S) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return Effect.fail(new InvalidRequest({ status: 415, message: "Authentication requests require application/json" }))
  }
  return readBoundedJson(request, 16 * 1024).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((cause) => cause._tag === "SchemaError" ? new InvalidRequest({ message: "Invalid authentication request" }) : cause))
}
