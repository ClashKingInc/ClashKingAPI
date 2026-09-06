import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("preserves streamed non-GET proxy bodies and upstream responses in workerd", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { Effect } from "effect";
    import { proxyRequest } from "./workers/api/src/proxy.ts";
    export default { fetch(request, env) { return Effect.runPromise(proxyRequest(request, env)); } };
  ` }, bundle: true, write: false, format: "esm", platform: "browser" })
  const script = bundle.outputFiles[0]?.text
  if (!script) throw new Error("Proxy fixture bundle missing")
  const captured: Array<{ url: string; method: string; body: string; authorization: string | null; cookie: string | null }> = []
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script, compatibilityDate: "2026-08-22",
    outboundService: () => { throw new Error("Unexpected external provider request") },
    serviceBindings: {
      CLASH_PROXY: async (request) => {
        captured.push({ url: request.url, method: request.method, body: await request.text(),
          authorization: request.headers.get("authorization"), cookie: request.headers.get("cookie") })
        return new Response("unchanged upstream error", { status: 429, headers: { "retry-after": "3", "content-type": "text/plain" } })
      },
    },
  }))
  try {
    const response = await runtime.dispatchFetch("https://proxy.test/proxy/v1/players/%23P0Y/verifytoken?fixture=1", {
      method: "POST", body: "fixture streamed body",
      headers: { authorization: "Bearer private-user-jwt", cookie: "private=fixture" },
    })
    expect(response.status).toBe(429)
    expect(await response.text()).toBe("unchanged upstream error")
    expect(response.headers.get("retry-after")).toBe("3")
    expect(captured).toEqual([{ url: "http://clash-proxy.internal/v1/players/%23P0Y/verifytoken?fixture=1",
      method: "POST", body: "fixture streamed body", authorization: null, cookie: null }])
  } finally { await runtime.dispose() }
}, 30_000)
