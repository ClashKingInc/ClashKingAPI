import { Context, Effect, Layer } from "effect"

import type { ApiFailure } from "./errors.js"
import { Forbidden, InvalidRequest, NotFound, RateLimited, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"
import { readBoundedJson } from "./request-body.js"

export interface DiscordRequestOptions {
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

const retryAfterMilliseconds = async (response: Response): Promise<number> => {
  const raw = response.headers.get("retry-after")
  const seconds = raw === null ? NaN : Number(raw)
  const headerDelay = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1_000)
    : raw === null ? NaN : Math.max(0, Date.parse(raw) - Date.now())
  let bodyDelay = NaN
  try {
    const body: unknown = await Effect.runPromise(readBoundedJson(response, 65_536))
    if (typeof body === "object" && body !== null && "retry_after" in body &&
        typeof body.retry_after === "number" && Number.isFinite(body.retry_after)) {
      bodyDelay = Math.max(0, body.retry_after * 1_000)
    }
  } catch {
    await response.body?.cancel().catch(() => undefined)
  }
  const delays = [headerDelay, bodyDelay].filter(Number.isFinite)
  return delays.length === 0 ? 1_000 : Math.max(...delays)
}

const fetchDiscord = (request: Request) => Effect.tryPromise({
  try: async () => {
    const startedAt = Date.now()
    const retryRequest = request.clone() as unknown as Request
    const first = await fetch(request)
    if (first.status !== 429) return first
    const delay = await retryAfterMilliseconds(first)
    if (delay >= 15_000 - (Date.now() - startedAt)) {
      throw new RateLimited({ message: "Discord API is rate limited", retryAfterSeconds: Math.max(1, Math.ceil(delay / 1_000)) })
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
    const retry = await fetch(retryRequest)
    if (retry.status === 429) {
      const nextDelay = await retryAfterMilliseconds(retry)
      throw new RateLimited({ message: "Discord API is rate limited", retryAfterSeconds: Math.max(1, Math.ceil(nextDelay / 1_000)) })
    }
    return retry
  },
  catch: (cause) => cause instanceof RateLimited ? cause : new UpstreamUnavailable({ cause, message: "Discord API request failed" }),
})

const classify = (response: Response): Effect.Effect<Response, ApiFailure> => Effect.gen(function* () {
  if (response.ok) return response
  // Error bodies are not consumed by parseJson. Release the transport before
  // returning the typed failure, without letting cleanup replace that failure.
  yield* Effect.promise(async () => {
    try { await response.body?.cancel() } catch { /* Keep the provider failure. */ }
  })
  if (response.status === 429) {
    return yield* Effect.fail(new UpstreamUnavailable({
      cause: new Error("Discord rate limit remained active after one retry"),
      message: "Discord API is temporarily rate limited",
    }))
  }
  if (response.status === 401 || response.status === 403) {
    return yield* Effect.fail(new Forbidden({ message: "Discord rejected the configured credentials or permissions" }))
  }
  if (response.status === 404) {
    return yield* Effect.fail(new NotFound({ message: "Discord resource was not found" }))
  }
  if (response.status >= 400 && response.status < 500) {
    return yield* Effect.fail(new InvalidRequest({ message: `Discord rejected the request (${response.status})` }))
  }
  return yield* Effect.fail(new UpstreamUnavailable({
    cause: new Error(`Discord returned ${response.status}`),
    message: "Discord API is unavailable",
  }))
})

const parseJson = (response: Response): Effect.Effect<unknown, UpstreamUnavailable> =>
  response.status === 204
    ? Effect.succeed(undefined)
    : Effect.tryPromise({
        try: () => Effect.runPromise(readBoundedJson(response)),
        catch: (cause) => new UpstreamUnavailable({ cause, message: "Discord returned invalid JSON" }),
      })

export class DiscordApi extends Context.Service<
  DiscordApi,
  {
    readonly request: (
      path: string,
      options?: DiscordRequestOptions,
    ) => Effect.Effect<unknown, ApiFailure>
    readonly token: (request: DiscordTokenRequest) => Effect.Effect<unknown, ApiFailure>
  }
>()("clashking/DiscordApi") {
  static readonly layer = Layer.effect(
    DiscordApi,
    Effect.gen(function* () {
      const bindings = yield* WorkerEnvironment
      const origin = bindings.DISCORD_API_ORIGIN.replace(/\/+$/u, "")

      const request = (path: string, options: DiscordRequestOptions = {}) => {
        if (!path.startsWith("/") || path.startsWith("//")) {
          return Effect.fail(new InvalidRequest({ message: "Discord API path must be relative" }))
        }
        const headers = new Headers(options.headers)
        headers.set("accept", "application/json")
        headers.set("authorization", options.oauthAccessToken === undefined
          ? `Bot ${bindings.DISCORD_BOT_TOKEN}`
          : `Bearer ${options.oauthAccessToken}`)
        let body: string | undefined
        if (options.body !== undefined) {
          headers.set("content-type", "application/json")
          body = JSON.stringify(options.body)
        }
        const discordRequest = new Request(`${origin}${path}`, {
          method: options.method ?? "GET",
          headers,
          signal: AbortSignal.timeout(15_000),
          ...(body === undefined ? {} : { body }),
        })
        return fetchDiscord(discordRequest).pipe(
          Effect.flatMap(classify),
          Effect.flatMap(parseJson),
          Effect.withSpan("DiscordApi.request", { attributes: { "http.request.method": options.method ?? "GET" } }),
        )
      }

      const token = (value: DiscordTokenRequest) => {
        const form = new URLSearchParams()
        for (const [key, item] of Object.entries(value)) {
          if (item !== undefined) form.set(key, item)
        }
        const discordRequest = new Request(`${origin.replace(/\/v\d+$/u, "")}/oauth2/token`, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        })
        return fetchDiscord(discordRequest).pipe(
          Effect.flatMap(classify),
          Effect.flatMap(parseJson),
          Effect.withSpan("DiscordApi.token"),
        )
      }

      return { request, token }
    }),
  )
}
