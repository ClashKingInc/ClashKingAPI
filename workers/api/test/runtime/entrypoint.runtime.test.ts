import { readFileSync } from "node:fs"
import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"
import { jsonTranscriptStoragePrefix } from "../../src/ticket-json-transcript.js"
import { jsonTranscriptFixture } from "../fixtures/json-transcript.js"
import { deferredApiRoutes } from "../deferred-runtime-paths.js"

it("runs the complete fetch entrypoint inside workerd without external services", async () => {
  const capturedLogs: string[] = []
  let outboundRequests = 0
  const result = await build({
    entryPoints: ["workers/api/src/index.ts"], bundle: true, write: false, metafile: true,
    format: "esm", platform: "node", external: ["cloudflare:*"],
    banner: { js: 'import { createRequire as fixtureCreateRequire } from "node:module"; const require = fixtureCreateRequire("/entrypoint-test/index.js");' },
    plugins: [{ name: "isolated-runtime-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.wasm$/ }, () => ({ path: "./zstd.wasm", external: true }))
      builder.onResolve({ filter: /\.zdict$/ }, () => ({ path: "./dictionary.bin", external: true }))
      // Keep the actual lazy SQL layer, service composition and router. Its
      // acquisition fails like an unavailable DB; unrelated requests still work.
      builder.onResolve({ filter: /\/database\.js$/ }, () => ({ path: "database", namespace: "fixture" }))
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        import { Effect } from "effect";
        import { lazyDatabaseLayer } from "./workers/api/src/database.ts";
        export const databaseLayer = () => lazyDatabaseLayer(Effect.die(new Error("Database unavailable in fixture")));
      `, resolveDir: process.cwd(), loader: "js" }))
    } }],
  })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Entrypoint bundle missing")
  const bundleExports = Object.values(result.metafile?.outputs ?? {}).flatMap((output) => output.exports)
  expect(bundleExports.sort()).toEqual(["default"])
  const runtime = new Miniflare(convertV4MiniflareOptions({
    handleStructuredLogs: entry => { capturedLogs.push(JSON.stringify(entry)) },
    outboundService: () => {
      outboundRequests++
      throw new Error("Unexpected outbound provider request")
    },
    modulesRoot: "/entrypoint-test",
    modules: [
      { type: "ESModule", path: "/entrypoint-test/index.js", contents: script },
      { type: "CompiledWasm", path: "/entrypoint-test/zstd.wasm", contents: readFileSync("node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm") },
      { type: "Data", path: "/entrypoint-test/dictionary.bin", contents: readFileSync("workers/api/assets/war-json.zdict") },
    ],
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
    r2Buckets: ["MEDIA", "TICKETING"],
    assets: { directory: "workers/api/documentation-assets", binding: "API_DOCUMENTATION", run_worker_first: true,
      routerConfig: { has_user_worker: true },
      assetConfig: { html_handling: "none", not_found_handling: "none" } },
    bindings: {
      ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com", ACCESS_AUDIENCE: "fixture-audience",
      JWT_ACCESS_SECRET: "fixture-access-secret", JWT_REFRESH_SECRET: "fixture-refresh-secret", API_BOT_TOKEN: "fixture-bot-token",
      DISCORD_API_ORIGIN: "https://discord.example.test/api/v10",
      TENOR_ALLOWED_HOSTS: "tenor.example.test", TENOR_MEDIA_ALLOWED_HOSTS: "media.example.test",
      NATIVE_TOKEN_AUDIENCE: "native", WEB_TOKEN_AUDIENCE: "web",
      ADMIN_ALLOWED_ORIGINS: "https://admin.example.test", WEB_ALLOWED_ORIGINS: "https://app.example.test",
      STRIPE_RESTRICTED_KEY: "rk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      STRIPE_MONTHLY_PRICE_ID: "price_fixture",
      AI_USAGE_SECRET: "fixture-metering", AI_ROSTER_MAX_PROMPT_CHARS: "12000",
    },
  }))
  try {
    for (const [path, status] of [["/", 200], ["/docs", 200], ["/docs/anything", 200], ["/swagger", 307],
      ["/swagger/index.html", 200], ["/swagger/public", 404], ["/redoc", 307], ["/openapi.json", 200],
      ["/openapi.scalar.json", 200], ["/openapi.yaml", 200]] as const) {
      const response = await runtime.dispatchFetch(`https://entrypoint.test${path}`, { redirect: "manual" })
      expect(response.status, response.status === status ? path : `${path}: ${await response.clone().text()}\n${capturedLogs.join("\n")}`).toBe(status)
      expect(response.headers.get("cache-control")).toContain("no-store")
      if (path === "/openapi.json") {
        const document = await response.json() as { paths: Record<string, Record<string, unknown>> }
        expect(document.paths["/v2/home/activity"]?.post).toBeDefined()
        expect(document.paths["/v2/home/activity"]?.query).toBeUndefined()
        expect(Object.keys(document.paths).filter(path => path.startsWith("/v2/admin/"))).toEqual([
          "/v2/admin/tracking/summary", "/v2/admin/tracking/timeseries",
        ])
      } else await response.body?.cancel()
    }
    expect(outboundRequests).toBe(0)
    for (const [method, path, status] of [
      ["GET", "/v2/health", 200],
      ["GET", "/v2/counts/players/builder-halls", 501],
      ["GET", "/v2/auth/me", 401],
      ["POST", "/v2/auth/web/refresh", 401],
      ["POST", "/v2/auth/web/logout", 204],
      ["OPTIONS", "/proxy/v1/players/%23P0Y", 204],
      ["GET", "/v2/player/%23P0Y/join-leave", 401],
      ["GET", "/v2/player/%23P0Y/ranked/invalid/group", 400],
      ["POST", "/v2/player/%23P0Y/rankings", 404],
      ...deferredApiRoutes.map(({ method, path }) => [method, path, 404] as const),
      ["PUT", "/v2/billing/subscription/assignment", 401],
      ["POST", "/v2/billing/stripe/checkout", 401],
      ["POST", "/v2/billing/stripe/portal", 401],
      ["POST", "/v2/roster/ai/usage", 401],
      ["GET", "/v2/server/123456789012345678/bans", 401],
      ["POST", "/v2/server/123456789012345678/bans/%23P0Y", 401],
      ["DELETE", "/v2/server/123456789012345678/bans/%23P0Y", 401],
      ["GET", "/v2/server/123456789012345678/strikes", 401],
      ["GET", "/v2/server/123456789012345678/strikes/player/%23P0Y/summary", 401],
      ["POST", "/v2/server/123456789012345678/strikes/%23P0Y", 401],
      ["DELETE", "/v2/server/123456789012345678/strikes/strike-id", 401],
      ["GET", "/v2/server/123456789012345678/rosters", 401],
      ["POST", "/v2/app/announcements", 401],
      ["PUT", "/v2/app/announcements/70000000-0000-4000-8000-000000000001", 401],
      ["DELETE", "/v2/app/announcements/70000000-0000-4000-8000-000000000001", 401],
      ["GET", "/v2/auth/export", 401],
      ["DELETE", "/v2/auth/me", 401],
      ["POST", "/v2/links/123456789012345678", 401],
      ["DELETE", "/v2/links/123456789012345678/%23P0Y", 401],
      ["PATCH", "/v2/links/123456789012345678/%23P0Y", 401],
      ["PUT", "/v2/links/123456789012345678/order", 401],
      ["GET", "/v2/media/base_missing.png", 404],
    ] as const) {
      const response = await runtime.dispatchFetch(`https://entrypoint.test${path}`, {
        method, headers: { "x-request-id": "workerd-entrypoint", origin: "https://app.example.test" },
      })
      expect(response.status, `${method} ${path}`).toBe(status)
      expect(response.headers.get("x-request-id")).toBe("workerd-entrypoint")
      expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.test")
      if (status >= 400) expect(await response.json()).toMatchObject({ request_id: "workerd-entrypoint" })
      if (method === "OPTIONS") expect(response.headers.get("access-control-allow-headers")).toContain("Authorization")
      if (path === "/v2/auth/web/refresh") expect(response.headers.has("set-cookie")).toBe(false)
      if (path === "/v2/auth/web/logout") expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
    }
    for (const { method, path } of deferredApiRoutes) {
      const response = await runtime.dispatchFetch(`https://entrypoint.test${path}`, {
        method, headers: { authorization: "Bearer fixture-bot-token", "content-type": "application/json" },
        ...(method === "GET" ? {} : { body: "{}" }),
      })
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: "not_found" })
    }
    expect(outboundRequests).toBe(0)
    const forbidden = await runtime.dispatchFetch("https://entrypoint.test/v2/auth/web/refresh", { method: "POST" })
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.has("set-cookie")).toBe(false)
    const capability = "00000000-0000-4000-8000-000000000001"
    const transcriptPrefix = await jsonTranscriptStoragePrefix(capability)
    // Miniflare's ReplaceWorkersTypes conditional currently misidentifies this
    // R2 proxy under TS7. Validate the actual proxy API instead of type-casting it.
    const bucket: unknown = await runtime.getR2Bucket("TICKETING")
    if (typeof bucket !== "object" || bucket === null || !("put" in bucket) || typeof bucket.put !== "function") throw new Error("R2 fixture proxy missing put")
    const transcriptUrl = `https://entrypoint.test/v2/ticket-transcripts/${capability}`
    expect((await runtime.dispatchFetch(transcriptUrl)).status).toBe(404)
    const transcriptBytes = new TextEncoder().encode(JSON.stringify(jsonTranscriptFixture))
    await bucket.put(`${transcriptPrefix}/transcript.json`,transcriptBytes,{
      httpMetadata:{contentType:"application/json"},customMetadata:{format:"clashking-json-v1",kind:"document"},
      sha256:await crypto.subtle.digest("SHA-256",transcriptBytes),
    })
    // A stored document is still staging data until the small index is committed.
    expect((await runtime.dispatchFetch(transcriptUrl)).status).toBe(404)
    const documentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", transcriptBytes)),
      byte => byte.toString(16).padStart(2, "0")).join("")
    const indexBytes = new TextEncoder().encode(JSON.stringify({ size: transcriptBytes.byteLength, sha256: documentHash, attachments: [] }))
    await bucket.put(`${transcriptPrefix}/index.json`, indexBytes, {
      httpMetadata: { contentType: "application/json" }, customMetadata: { format: "clashking-json-v1", kind: "index" },
      sha256: await crypto.subtle.digest("SHA-256", indexBytes),
    })
    const transcript = await runtime.dispatchFetch(transcriptUrl,{headers:{"x-request-id":capability,origin:"https://app.example.test"}})
    expect(transcript.status).toBe(200)
    expect(await transcript.json()).toEqual(jsonTranscriptFixture)
    expect(transcript.headers.get("content-type")).toContain("application/json")
    expect((await runtime.dispatchFetch(`${transcriptUrl}/channel.html`)).status).toBe(404)
    expect(transcript.headers.get("referrer-policy")).toBe("no-referrer")
    expect(transcript.headers.get("content-security-policy")).toContain("default-src 'none'")
    expect(transcript.headers.has("x-request-id")).toBe(false)
    expect(transcript.headers.has("access-control-allow-origin")).toBe(false)
    expect((await runtime.dispatchFetch(`https://entrypoint.test/v2/ticket-transcripts/${capability}/unknown`,{headers:{"x-request-id":capability}})).status).toBe(404)
    await bucket.put(`${transcriptPrefix}/transcript.json`,"corrupt",{customMetadata:{format:"clashking-json-v1",kind:"document"}})
    expect((await runtime.dispatchFetch(transcriptUrl,{headers:{"x-request-id":capability}})).status).toBe(503)
    // A normal request confirms that this capture actually observes console
    // events; all transcript success/error/malformed-path invocations stay quiet.
    await runtime.dispatchFetch("https://entrypoint.test/v2/health")
    expect(capturedLogs.join("\n")).toContain("request_complete")
    expect(capturedLogs.join("\n")).not.toContain(capability)
    expect(capturedLogs.join("\n")).not.toContain("ticket-transcripts")
    const bonus = await runtime.dispatchFetch("https://entrypoint.test/v2/server/123456789012345678/cwl/%23P0Y/bonus-recipients?season=2026-09", {
      method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({recipients:[]}),
    })
    expect(bonus.status).toBe(401)
    for (const [path, body] of [
      ["/v2/roster/refresh-batch", { serverId: "123456789012345678", rosterIds: ["70000000-0000-4000-8000-000000000001"] }],
      ["/v2/roster/ai/context", { serverId: "123456789012345678", rosterIds: ["70000000-0000-4000-8000-000000000001"], messages: [{role:"user",content:"Show roster"}] }],
      ["/v2/roster/refresh-data?server_id=123456789012345678&roster_id=70000000-0000-4000-8000-000000000001", { scope: "data" }],
      ["/v2/server/123456789012345678/rosters/70000000-0000-4000-8000-000000000001/refresh", { scope: "data" }],
    ] as const) {
      const response = await runtime.dispatchFetch(`https://entrypoint.test${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      })
      expect(response.status).toBe(401)
    }
    const rawWebhook = '{\r\n  "id": "evt_fixture", "type": "fixture.unhandled", "livemode": false, "data": {"object": {}}\r\n}'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_fixture"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawWebhook}`))),
      (byte) => byte.toString(16).padStart(2, "0")).join("")
    // A valid signature reaches the strict SQL sentinel (500); changing just
    // whitespace must fail signature verification before SQL is touched (400).
    for (const [body, status] of [[rawWebhook, 500], [JSON.stringify(JSON.parse(rawWebhook)), 400]] as const) {
      const webhook = await runtime.dispatchFetch("https://entrypoint.test/v2/billing/stripe/webhook", {
        method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body,
      })
      expect(webhook.status).toBe(status)
    }
  } finally { await runtime.dispose() }
}, 30_000)
