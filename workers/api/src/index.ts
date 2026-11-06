import { runClanVerificationChecks } from "./dashboard-clan-verification.js"
import { Effect, Layer } from "effect"
import * as Sentry from "@sentry/cloudflare"

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
import { databaseLayer, needsFreshDatabaseReads } from "./database.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { StoredTokenCipher } from "./fernet.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { applyCors, recoverDefectWith, recoverRoute, route } from "./router.js"
import { ServerAuthorization } from "./server-authorization.js"
import { GuildActivityStore } from "./public-metadata-runtime.js"
import { DashboardServerOperations } from "./dashboard-server-runtime.js"
import { DashboardMiscReads, DashboardPersonalLinks } from "./dashboard-misc-runtime.js"
import { dashboardMiscExternalLayer } from "./dashboard-misc-external.js"
import { observeProxySearch } from "./proxy-search-observer.js"
import { isJsonTranscriptRequest, readJsonTicketTranscript, transcriptBrowserCors } from "./ticket-json-transcript.js"
import { isApiDocumentationRequest, serveApiDocumentation } from "./api-documentation.js"
import { captureWorkerError, recordRequestTiming, requestRouteTemplate, sentryOptions } from "./observability.js"
export { TicketRuntimeCoordinator } from "./ticket-runtime-coordinator.js"
export { RuntimeRecoveryCoordinator } from "./runtime-recovery-coordinator.js"

const liveLayer = (bindings: WorkerBindings, request: Request) => {
  const environment = WorkerEnvironment.layer(bindings)
  const services = Layer.mergeAll(
    AccessIdentity.layer,
    AuthIdentity.layer,
    AuthCrypto.layer,
    authMailerLayer,
    DiscordApi.layer,
    StoredTokenCipher.layer,
  ).pipe(
    Layer.provideMerge(environment),
    Layer.provideMerge(databaseLayer(bindings, needsFreshDatabaseReads(request))),
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

const handler = {
  async scheduled(_controller: ScheduledController, bindings: WorkerBindings, context: ExecutionContext): Promise<void> {
    // A commit can survive a lost immediate RPC. Re-arm the existing bounded
    // SQL inventory so ticket/panel/dashboard operations are not stranded.
    context.waitUntil(bindings.RUNTIME_RECOVERY.getByName("global").wake());
    context.waitUntil(Effect.runPromise(runClanVerificationChecks(bindings).pipe(Effect.provide(databaseLayer(bindings)), Effect.scoped)));
  },
  async fetch(request: Request, bindings: WorkerBindings, context: ExecutionContext): Promise<Response> {
    // A transcript URL is a bearer credential. Keep the entire invocation out
    // of request/defect logging, SQL layers and caller request-ID echoing.
    // Wrangler invocation logs/traces must also remain disabled for this Worker.
    if (isJsonTranscriptRequest(request)) return transcriptBrowserCors(request,
      await readJsonTicketTranscript(request, bindings.TICKETING), bindings.WEB_ALLOWED_ORIGINS)
    const routeTemplate = requestRouteTemplate(request) ?? "/unmatched"
    const startedAt = Date.now()
    if (isApiDocumentationRequest(request)) return serveApiDocumentation(request, bindings.API_DOCUMENTATION).then((response) => {
      recordRequestTiming(bindings, routeTemplate, request.method, response.status, Date.now() - startedAt)
      return response
    })
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
    const program = Effect.suspend(() => route(request, bindings, (principal, proxyRequest, response) => {
      context.waitUntil(Effect.runPromise(observeProxySearch(principal, proxyRequest, response).pipe(
        Effect.provide(databaseLayer(bindings)), Effect.scoped,
      )))
    }).pipe(Effect.provide(liveLayer(bindings, request)), Effect.scoped)).pipe(
      Effect.tapError((failure) => Effect.sync(() => {
        if (failure._tag === "DatabaseFailure") captureWorkerError("database", routeTemplate, request.method, 503)
        else if (failure._tag === "UpstreamUnavailable") captureWorkerError("upstream", routeTemplate, request.method, 503)
      })),
      recoverRoute(requestId),
      recoverDefectWith(() => captureWorkerError("defect", routeTemplate, request.method, 500)),
      Effect.tap((response) =>
        Effect.sync(() => {
          recordRequestTiming(bindings, routeTemplate, request.method, response.status, Date.now() - startedAt)
        }),
      ),
    )
    const response = Effect.runPromise(program)
    context.waitUntil(response.then(() => undefined))
    return response.then((rawValue) => {
      const value = rawValue
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
} satisfies ExportedHandler<WorkerBindings>

export default Sentry.withSentry<WorkerBindings, unknown, unknown, typeof handler>(sentryOptions, handler)
