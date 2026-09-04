import { Effect } from "effect"

import { InvalidRequest, PayloadTooLarge, UnprocessableEntity, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

const allowedUrl = (raw: string) => {
  const url = new URL(raw)
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["discohook.app", "share.discohook.app"].includes(url.hostname)) throw new Error("Disallowed Discohook URL")
  return url
}

export const resolveDiscohook = (raw: string, fetcher: typeof fetch = fetch) => Effect.gen(function* () {
  const initial = yield* Effect.try({
    try: () => allowedUrl(raw),
    catch: () => new InvalidRequest({ message: "Invalid or disallowed Discohook URL" }),
  })
  const resolved = yield* Effect.tryPromise({
    try: async (interruption) => {
      const signal = AbortSignal.any([interruption, AbortSignal.timeout(8_000)])
      let current = initial
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await fetcher(current, { redirect: "manual", signal, headers: { "user-agent": "ClashKingAPI/2" } })
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel()
          const location = response.headers.get("location")
          if (!location || redirects === 3) throw new UnprocessableEntity({ message: "Discohook share not found" })
          try { current = allowedUrl(new URL(location, current).href) }
          catch { throw new UnprocessableEntity({ message: "Discohook share redirected to a disallowed URL" }) }
          continue
        }
        if (!response.ok) {
          await response.body?.cancel()
          throw new UnprocessableEntity({ message: "Discohook share not found" })
        }
        if (current.searchParams.has("data")) {
          await response.body?.cancel()
          return { resolvedUrl: current.href } as const
        }
        // Keep body reads within the same eight-second deadline as redirects.
        const body = await Effect.runPromise(readBoundedJson(response).pipe(
          Effect.catch((failure) => Effect.fail(new UnprocessableEntity({ message: failure instanceof PayloadTooLarge
            ? "Discohook share exceeds the response size limit" : "Discohook share did not return JSON" }))),
        ), { signal })
        if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
          throw new UnprocessableEntity({ message: "Discohook share did not return a JSON object" })
        }
        const data = body !== null ? (body as Record<string, unknown>).data : undefined
        return { payload: data === undefined || data === null ? body : data }
      }
      throw new UnprocessableEntity({ message: "Discohook share not found" })
    },
    catch: (cause) => cause instanceof UnprocessableEntity ? cause
      : cause instanceof InvalidRequest ? new UnprocessableEntity({ message: "Discohook share did not return JSON" })
      : new UpstreamUnavailable({ cause, message: "Failed to resolve Discohook share link" }),
  })
  return resolved
})
