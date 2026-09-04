import { readFileSync } from "node:fs"
import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"
import { transcriptStoragePrefix } from "../../src/ticket-transcript-format.js"

it("runs the complete fetch entrypoint inside workerd without external services", async () => {
  const capturedLogs: string[] = []
  const result = await build({
    entryPoints: ["workers/api/src/index.ts"], bundle: true, write: false,
    format: "esm", platform: "node", external: ["cloudflare:*"],
    banner: { js: 'import { createRequire as fixtureCreateRequire } from "node:module"; const require = fixtureCreateRequire("/entrypoint-test/index.js");' },
    plugins: [{ name: "isolated-runtime-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.wasm$/ }, () => ({ path: "./zstd.wasm", external: true }))
      builder.onResolve({ filter: /\.zdict$/ }, () => ({ path: "./dictionary.bin", external: true }))
      // Keep the actual service composition and router. A strict SQL sentinel
      // proves these unauthenticated/validation paths perform no database I/O.
      builder.onResolve({ filter: /\/database\.js$/ }, () => ({ path: "database", namespace: "fixture" }))
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        import { Effect, Layer } from "effect";
        import { SqlClient } from "effect/unstable/sql";
        const sql = new Proxy({}, { get() { throw new Error("Unexpected database access"); } });
        export const databaseLayer = () => Layer.succeed(SqlClient.SqlClient, sql);
        export const refreshMaterializedViews = Effect.die(new Error("Unexpected refresh"));
      `, resolveDir: process.cwd(), loader: "js" }))
    } }],
  })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Entrypoint bundle missing")
  const runtime = new Miniflare(convertV4MiniflareOptions({
    handleStructuredLogs: entry => { capturedLogs.push(JSON.stringify(entry)) },
    modulesRoot: "/entrypoint-test",
    modules: [
      { type: "ESModule", path: "/entrypoint-test/index.js", contents: script },
      { type: "CompiledWasm", path: "/entrypoint-test/zstd.wasm", contents: readFileSync("node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm") },
      { type: "Data", path: "/entrypoint-test/dictionary.bin", contents: readFileSync("internal/wararchive/war-json.zdict") },
    ],
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
    r2Buckets: ["MEDIA", "TICKETING"],
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
    for (const [method, path, status] of [
      ["GET", "/v2/health", 200],
      ["GET", "/v2/auth/me", 401],
      ["POST", "/v2/auth/web/refresh", 401],
      ["POST", "/v2/auth/web/logout", 204],
      ["OPTIONS", "/proxy/v1/players/%23P0Y", 204],
      ["GET", "/v2/player/%23P0Y/join-leave", 401],
      ["GET", "/v2/player/%23P0Y/ranked/invalid/group", 400],
      ["POST", "/v2/player/%23P0Y/rankings", 404],
      ["POST", "/v2/runtime/giveaways/runtime-test/entries", 401],
      ["POST", "/v2/runtime/tickets/accounts", 401],
      ["POST", "/v2/runtime/tickets/message-events", 401],
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
      ["GET", "/v2/server/123456789012345678/roster-member-groups", 401],
      ["POST", "/v2/server/123456789012345678/roster-member-groups", 401],
      ["PATCH", "/v2/server/123456789012345678/roster-member-groups/70000000-0000-4000-8000-000000000001", 401],
      ["DELETE", "/v2/server/123456789012345678/roster-member-groups/70000000-0000-4000-8000-000000000001", 401],
      ["PUT", "/v2/server/123456789012345678/rosters/70000000-0000-4000-8000-000000000001/member-groups", 401],
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
      expect(response.status).toBe(status)
      expect(response.headers.get("x-request-id")).toBe("workerd-entrypoint")
      expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.test")
      if (status >= 400) expect(await response.json()).toMatchObject({ request_id: "workerd-entrypoint" })
      if (method === "OPTIONS") expect(response.headers.get("access-control-allow-headers")).toContain("Authorization")
      if (path === "/v2/auth/web/refresh") expect(response.headers.has("set-cookie")).toBe(false)
      if (path === "/v2/auth/web/logout") expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
    }
    const forbidden = await runtime.dispatchFetch("https://entrypoint.test/v2/auth/web/refresh", { method: "POST" })
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.has("set-cookie")).toBe(false)
    const capability = "00000000-0000-4000-8000-000000000001"
    const transcriptPrefix = await transcriptStoragePrefix(capability)
    // Miniflare's ReplaceWorkersTypes conditional currently misidentifies this
    // R2 proxy under TS7. Validate the actual proxy API instead of type-casting it.
    const bucket: unknown = await runtime.getR2Bucket("TICKETING")
    if (typeof bucket !== "object" || bucket === null || !("put" in bucket) || typeof bucket.put !== "function") throw new Error("R2 fixture proxy missing put")
    const transcriptUrl = `https://entrypoint.test/v2/ticket-transcripts/${capability}/channel.html`
    const metadata = {transcriptVersion:"1",transcriptPrefix}
    await bucket.put(`${transcriptPrefix}/channel.html`,"<!doctype html><p>Private fixture</p>",{
      customMetadata:{...metadata,transcriptKind:"channel"},
    })
    expect((await runtime.dispatchFetch(transcriptUrl)).status).toBe(404)
    await bucket.put(`${transcriptPrefix}/manifest.json`,JSON.stringify({version:1,complete:true,channel:true,thread:false}),{
      customMetadata:{...metadata,transcriptKind:"manifest"},
    })
    const transcript = await runtime.dispatchFetch(transcriptUrl,{headers:{"x-request-id":capability,origin:"https://app.example.test"}})
    expect(transcript.status).toBe(200)
    expect(await transcript.text()).toBe("<!doctype html><p>Private fixture</p>")
    expect(transcript.headers.get("referrer-policy")).toBe("no-referrer")
    expect(transcript.headers.get("content-security-policy")).toContain("default-src 'none'")
    expect(transcript.headers.has("x-request-id")).toBe(false)
    expect(transcript.headers.has("access-control-allow-origin")).toBe(false)
    expect((await runtime.dispatchFetch(`https://entrypoint.test/v2/ticket-transcripts/${capability}/unknown`,{headers:{"x-request-id":capability}})).status).toBe(404)
    await bucket.put(`${transcriptPrefix}/manifest.json`,"corrupt",{customMetadata:{...metadata,transcriptKind:"manifest"}})
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
