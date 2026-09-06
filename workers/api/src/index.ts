import { Effect, Layer } from "effect"

import { AccessIdentity } from "./access.js"
import { AuthIdentity } from "./auth.js"
import { AuthCrypto } from "./auth-crypto.js"
import { AuthEmail } from "./auth-email.js"
import { authMailerLayer } from "./auth-mailer.js"
import { AuthProfiles } from "./auth-profiles.js"
import { AuthSessions } from "./auth-sessions.js"
import { BotAdjacentStore } from "./bot-adjacent-runtime.js"
import { BotModerationStore } from "./bot-runtime.js"
import { DashboardRosterOperations } from "./dashboard-roster-runtime.js"
import { databaseLayer } from "./database.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { StoredTokenCipher } from "./fernet.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { applyCors, recoverDefect, recoverRoute, route } from "./router.js"
import { ServerAuthorization } from "./server-authorization.js"
import { SharedLinksLimiter } from "./shared-links-limiter.js"
import { GuildActivityStore } from "./public-metadata-runtime.js"
import { DashboardServerOperations } from "./dashboard-server-runtime.js"
import { DashboardMiscReads, DashboardPersonalLinks } from "./dashboard-misc-runtime.js"
import { dashboardMiscExternalLayer } from "./dashboard-misc-external.js"
import { observeProxySearch } from "./proxy-search-observer.js"
import { isJsonTranscriptRequest, readJsonTicketTranscript } from "./ticket-json-transcript.js"
import { isApiDocumentationRequest, serveApiDocumentation } from "./api-documentation.js"

export { MaterializedViewRefresher } from "./materialized-view-refresher.js"
export { SharedLinksRateLimiter } from "./shared-links-rate-limiter.js"

const liveLayer = (bindings: WorkerBindings) => {
  const environment = WorkerEnvironment.layer(bindings)
  const services = Layer.mergeAll(
    AccessIdentity.layer,
    AuthIdentity.layer,
    AuthCrypto.layer,
    authMailerLayer,
    DiscordApi.layer,
    StoredTokenCipher.layer,
    SharedLinksLimiter.layer,
  ).pipe(
    Layer.provideMerge(environment),
    Layer.provideMerge(databaseLayer(bindings)),
  )
  const credentials = DiscordCredentials.layer.pipe(Layer.provideMerge(services))
  const authorization = ServerAuthorization.layer.pipe(Layer.provideMerge(credentials))
  const core = authorization
  const sessions = AuthSessions.layer.pipe(Layer.provideMerge(core))
  return Layer.mergeAll(BotAdjacentStore.layer, BotModerationStore.layer, DashboardRosterOperations.layer, GuildActivityStore.layer, DashboardServerOperations.layer,
    DashboardMiscReads.layer, DashboardPersonalLinks.layer, dashboardMiscExternalLayer,
    AuthProfiles.layer, AuthEmail.layer,
  ).pipe(Layer.provideMerge(sessions))
}

export default {
  fetch(request: Request, bindings: WorkerBindings, context: ExecutionContext): Promise<Response> {
    // A transcript URL is a bearer credential. Keep the entire invocation out
    // of request/defect logging, SQL layers, CORS and caller request-ID echoing.
    // Wrangler invocation logs/traces must also remain disabled for this Worker.
    if (isJsonTranscriptRequest(request)) return readJsonTicketTranscript(request, bindings.TICKETING)
    if (isApiDocumentationRequest(request)) return serveApiDocumentation(request, bindings.API_DOCUMENTATION)
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
    const startedAt = Date.now()
    const program = Effect.suspend(() => route(request, bindings, (principal, proxyRequest, response) => {
      context.waitUntil(Effect.runPromise(observeProxySearch(principal, proxyRequest, response).pipe(
        Effect.provide(databaseLayer(bindings)), Effect.scoped,
      )))
    }).pipe(Effect.provide(liveLayer(bindings)), Effect.scoped)).pipe(
      recoverRoute(requestId),
      recoverDefect,
      Effect.tap((response) =>
        Effect.sync(() => {
          console.log(JSON.stringify({
            event: "request_complete",
            method: request.method,
            path: new URL(request.url).pathname,
            request_id: requestId,
            status: response.status,
            duration_ms: Date.now() - startedAt,
          }))
        }),
      ),
    )
    const response = Effect.runPromise(program)
    context.waitUntil(response.then(() => undefined))
    return response.then((value) => {
      const corsResponse = applyCors(request, value, bindings)
      const headers = new Headers(corsResponse.headers)
      headers.set("x-request-id", requestId)
      return new Response(corsResponse.body, {
        status: corsResponse.status,
        statusText: corsResponse.statusText,
        headers,
      })
    })
  },

  scheduled(_controller: ScheduledController, bindings: WorkerBindings, context: ExecutionContext): void {
    const refresher = bindings.MATERIALIZED_VIEW_REFRESHER.getByName(
      "stats-materialized-views",
      { locationHint: "enam" },
    )
    context.waitUntil(refresher.refresh().then(
      (result) => console.log(JSON.stringify({ event: "materialized_view_refresh_complete", result })),
      (failure) => {
        console.error(JSON.stringify({
          event: "materialized_view_refresh_failed",
          failure: failure instanceof Error ? failure.message : String(failure),
        }))
        throw failure
      },
    ))
  },
} satisfies ExportedHandler<WorkerBindings>
