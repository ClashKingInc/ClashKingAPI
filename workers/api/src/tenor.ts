import { Context, Effect, Layer } from "effect"

import { InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"
import { readBoundedText } from "./request-body.js"

const idPattern = /(?:^|-)(\d{6,})(?:$|[/?#])/u
const metaPattern = /<meta\s+([^>]+)>/giu
const attributePattern = /([\w:-]+)\s*=\s*(["'])(.*?)\2/gu

export const parseTenorMetadata = (html: string): Readonly<Record<string, string>> => {
  const metadata: Record<string, string> = {}
  for (const metaMatch of html.matchAll(metaPattern)) {
    const rawAttributes = metaMatch[1]
    if (rawAttributes === undefined) continue
    const attributes: Record<string, string> = {}
    for (const attributeMatch of rawAttributes.matchAll(attributePattern)) {
      const name = attributeMatch[1]
      const value = attributeMatch[3]
      if (name !== undefined && value !== undefined) attributes[name.toLowerCase()] = value
    }
    const key = attributes.property ?? attributes.name
    if (key?.startsWith("og:image") === true && attributes.content !== undefined) {
      metadata[key] = attributes.content
    }
  }
  return metadata
}

const parseAllowedUrl = (rawUrl: string, allowedHosts: ReadonlySet<string>) => {
  const url = new URL(rawUrl)
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) {
    throw new TypeError("URL host is not allowed")
  }
  return url
}

export class TenorResolver extends Context.Service<
  TenorResolver,
  {
    readonly resolve: (url: string) => Effect.Effect<{
      readonly height: number
      readonly id: string
      readonly media_url: string
      readonly provider: "tenor"
      readonly width: number
    }, InvalidRequest | UpstreamUnavailable>
  }
>()("clashking/TenorResolver") {
  static readonly layer = Layer.effect(
    TenorResolver,
    Effect.gen(function* () {
      const env = yield* WorkerEnvironment
      const allowedHosts = new Set(env.TENOR_ALLOWED_HOSTS.split(",").map((value) => value.trim()))
      const allowedMediaHosts = new Set(
        env.TENOR_MEDIA_ALLOWED_HOSTS.split(",").map((value) => value.trim()),
      )
      const resolve = Effect.fn("TenorResolver.resolve")(function* (rawUrl: string) {
        const url = yield* Effect.try({
          try: () => parseAllowedUrl(rawUrl, allowedHosts),
          catch: () => new InvalidRequest({ message: "A valid Tenor URL is required" }),
        })
        const html = yield* Effect.tryPromise({
          try: async (interruption) => {
            const signal = AbortSignal.any([interruption, AbortSignal.timeout(8_000)])
            let current = url
            for (let redirects = 0; redirects <= 3; redirects += 1) {
              const result = await fetch(current, {
                redirect: "manual",
                signal,
              })
              if (result.status < 300 || result.status >= 400) {
                if (!result.ok) {
                  await result.body?.cancel()
                  throw new Error("Tenor lookup returned an unsuccessful response")
                }
                return await Effect.runPromise(readBoundedText(result), { signal })
              }
              await result.body?.cancel()
              const location = result.headers.get("location")
              if (location === null || redirects === 3) throw new TypeError("Invalid redirect")
              current = parseAllowedUrl(new URL(location, current).toString(), allowedHosts)
            }
            throw new TypeError("Too many redirects")
          },
          catch: (cause) => new UpstreamUnavailable({ cause, message: "Tenor lookup failed" }),
        })
        const metadata = parseTenorMetadata(html)
        const mediaUrl = metadata["og:image"]
        const id = url.pathname.match(idPattern)?.[1]
        if (mediaUrl === undefined || id === undefined) {
          return yield* new UpstreamUnavailable({ cause: html.length, message: "Tenor response did not contain media metadata" })
        }
        const safeMediaUrl = yield* Effect.try({
          try: () => parseAllowedUrl(mediaUrl.replaceAll("&amp;", "&"), allowedMediaHosts),
          catch: (cause) => new UpstreamUnavailable({
            cause,
            message: "Tenor media URL is not on an allowed host",
          }),
        })
        const width = Number(metadata["og:image:width"] ?? 0)
        const height = Number(metadata["og:image:height"] ?? 0)
        if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 0)) {
          return yield* new UpstreamUnavailable({ cause: "invalid_dimensions", message: "Tenor response contained invalid media dimensions" })
        }
        return {
          provider: "tenor" as const,
          id,
          media_url: safeMediaUrl.toString(),
          width,
          height,
        }
      })
      return TenorResolver.of({ resolve })
    }),
  )
}
