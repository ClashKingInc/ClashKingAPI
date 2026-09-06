import { Effect } from "effect"

import { UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"

const requestHeaderAllowlist = [
  "accept",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "traceparent",
  "tracestate",
  "user-agent",
  "x-request-id",
] as const

const responseHeaderAllowlist = [
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "last-modified",
  "retry-after",
] as const

export const proxyRequest = (request: Request, bindings: WorkerBindings) =>
  Effect.tryPromise({
    try: async () => {
      const incomingUrl = new URL(request.url)
      const upstreamUrl = new URL(incomingUrl.pathname.slice("/proxy".length) + incomingUrl.search, "http://clash-proxy.internal")
      const headers = new Headers()
      for (const name of requestHeaderAllowlist) {
        const value = request.headers.get(name)
        if (value !== null) headers.set(name, value)
      }
      if (!headers.has("accept")) headers.set("accept", "application/json")
      const upstream = new Request(upstreamUrl, {
        method: request.method,
        headers,
        ...(request.method === "GET" || request.method === "HEAD"
          ? {}
          : { body: request.body }),
      })
      const response = await bindings.CLASH_PROXY.fetch(upstream)
      const responseHeaders = new Headers()
      for (const name of responseHeaderAllowlist) {
        const value = response.headers.get(name)
        if (value !== null) responseHeaders.set(name, value)
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    },
    catch: (cause) => new UpstreamUnavailable({
      cause,
      message: "Clash proxy service binding failed",
    }),
  })
