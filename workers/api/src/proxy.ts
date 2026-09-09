import { Effect } from "effect"

import { UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { readBoundedJson } from "./request-body.js"

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

const maintenanceReasons = new Set(["maintenance", "inmaintenance"])

export const normalizeClashMaintenance = async (response: Response, headers: Headers): Promise<Response> => {
  if (response.status !== 503 || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) return response
  try {
    const value = await Effect.runPromise(readBoundedJson(response.clone(), 4_096))
    const reason = typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { reason?: unknown }).reason === "string"
      ? (value as { reason: string }).reason.trim().toLowerCase()
      : ""
    if (!maintenanceReasons.has(reason)) return response
    await response.body?.cancel().catch(() => undefined)
    return Response.json({ reason: "maintenance", message: "Clash of Clans is currently under maintenance." }, { status: 503, headers })
  } catch {
    return response
  }
}

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
      const proxied = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
      return normalizeClashMaintenance(proxied, responseHeaders)
    },
    catch: (cause) => new UpstreamUnavailable({
      cause,
      message: "Clash proxy service binding failed",
    }),
  })
