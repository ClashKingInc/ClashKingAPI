import { DiscordConfig, DiscordREST, DiscordRESTMemoryLive } from "dfx"
import { Context, Effect, Layer, Redacted, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"

import type { ApiFailure } from "./errors.js"
import { Forbidden, InvalidRequest, NotFound, RateLimited, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"
import { readBoundedJson } from "./request-body.js"

export interface DiscordRequestOptions {
  readonly files?: ReadonlyArray<File>
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT"
  readonly oauthAccessToken?: string
}
export interface DiscordTokenRequest {
  readonly client_id: string
  readonly client_secret: string
  readonly code?: string
  readonly code_verifier?: string
  readonly grant_type: "authorization_code" | "refresh_token"
  readonly redirect_uri?: string
  readonly refresh_token?: string
}

// The provider client applies OAuth after dfx's bot authorization. The token is
// fiber-local so concurrent user requests cannot share another user's bearer.
const OAuthBearer = Context.Reference<string | undefined>("clashking/DiscordOAuthBearer", {
  defaultValue: () => undefined,
})
const providerLayer = Layer.effect(HttpClient.HttpClient, Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  return HttpClient.mapRequestEffect(client, request => Effect.map(OAuthBearer, access => access === undefined
    ? request : HttpClientRequest.setHeader(request, "authorization", `Bearer ${access}`)))
})).pipe(Layer.provide(FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch,
  // Rate-limit sleeps belong to dfx. Only a network attempt and its body have
  // a deadline; timing the entire operation would interrupt valid 429 waits.
  (input, init) => globalThis.fetch(input, {...init, signal:AbortSignal.any([
    ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15_000),
  ])}),
)))))

const providerFailure = (cause: unknown): ApiFailure => new UpstreamUnavailable({
  // Native SDK errors can contain authenticated requests. Preserve the error
  // category without putting OAuth, bot or webhook tokens into API logs.
  cause: new Error(typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : "Discord transport failure"),
  message: "Discord API request failed",
})

const decodeResponse = (response: {readonly status: number;readonly headers: Readonly<Record<string,string>>;readonly stream: Stream.Stream<Uint8Array, unknown>}): Effect.Effect<unknown, ApiFailure> => Effect.gen(function* () {
  if (response.status === 204) return undefined
  const body = new Response(Stream.toReadableStream(response.stream), {headers:response.headers})
  if (response.status >= 200 && response.status < 300) {
    if (response.status === 204) return undefined
    return yield* readBoundedJson(body).pipe(Effect.mapError(() => new UpstreamUnavailable({
      cause:new Error("Invalid or oversized Discord JSON"),message:"Discord returned invalid JSON",
    })))
  }
  yield* Effect.promise(() => body.body?.cancel().catch(() => undefined) ?? Promise.resolve())
  if (response.status === 429) {
    const seconds=Number(response.headers["retry-after"])
    return yield* new RateLimited({message:"Discord API is rate limited",retryAfterSeconds:Number.isFinite(seconds)?Math.max(1,Math.ceil(seconds)):1})
  }
  if (response.status === 401 || response.status === 403) return yield* new Forbidden({message:"Discord rejected the configured credentials or permissions"})
  if (response.status === 404) return yield* new NotFound({message:"Discord resource was not found"})
  if (response.status >= 400 && response.status < 500) return yield* new InvalidRequest({message:`Discord rejected the request (${response.status})`})
  return yield* new UpstreamUnavailable({cause:new Error(`Discord returned ${response.status}`),message:"Discord API is unavailable"})
})

export class DiscordApi extends Context.Service<DiscordApi, {
  readonly request: (path:string,options?:DiscordRequestOptions)=>Effect.Effect<unknown,ApiFailure>
  readonly token: (request:DiscordTokenRequest)=>Effect.Effect<unknown,ApiFailure>
}>()("clashking/DiscordApi") {
  static readonly layer = Layer.unwrap(Effect.gen(function* () {
    const bindings=yield* WorkerEnvironment
    const origin=bindings.DISCORD_API_ORIGIN.replace(/\/+$/u,"")
    return Layer.effect(DiscordApi,Effect.gen(function* () {
      const sdk=yield* DiscordREST
      const http=yield* HttpClient.HttpClient
      const finish=(request:Effect.Effect<unknown,ApiFailure>)=>request.pipe(
        Effect.timeout("15 seconds"), Effect.catchTag("TimeoutError",providerFailureEffect),
      )
      const request=(path:string,options:DiscordRequestOptions={})=>{
        if(!path.startsWith("/")||path.startsWith("//"))return Effect.fail(new InvalidRequest({message:"Discord API path must be relative"}))
        // Existing API features supply dynamic publication paths. Use dfx's
        // public HTTP client and file context, with no custom auth/rate buckets.
        let req=HttpClientRequest.make(options.method??"GET")(path).pipe(HttpClientRequest.setHeaders(options.headers??{}))
        if(options.body!==undefined||options.files?.length)req=HttpClientRequest.bodyJsonUnsafe(req,options.body??{})
        let response=sdk.httpClient.execute(req)
        if(options.files?.length)response=response.pipe(sdk.withFiles(options.files))
        if(options.oauthAccessToken!==undefined)response=response.pipe(Effect.provideService(OAuthBearer,options.oauthAccessToken))
        return response.pipe(Effect.mapError(providerFailure),Effect.flatMap(decodeResponse),Effect.withSpan("DiscordApi.request"))
      }
      // dfx does not expose the OAuth code/refresh token exchange endpoint.
      // Keep only that form exchange on Effect's HTTP client, without bot auth
      // or automatic replay of a potentially consumed authorization code.
      const token=(value:DiscordTokenRequest)=>{
        const form=Object.fromEntries(Object.entries(value).filter((row):row is [string,string]=>typeof row[1]==="string"))
        const req=HttpClientRequest.post(`${origin.replace(/\/v\d+$/u,"")}/oauth2/token`).pipe(HttpClientRequest.bodyUrlParams(form))
        return finish(http.execute(req).pipe(Effect.mapError(providerFailure),Effect.flatMap(decodeResponse))).pipe(Effect.withSpan("DiscordApi.token"))
      }
      return {request,token}
    })).pipe(Layer.provide([
      DiscordRESTMemoryLive.pipe(Layer.provide([DiscordConfig.layer({token:Redacted.make(bindings.DISCORD_BOT_TOKEN),rest:{baseUrl:origin}}),providerLayer])),
      FetchHttpClient.layer,
    ]))
  }))
}
const providerFailureEffect=(cause:unknown)=>Effect.fail(providerFailure(cause))
