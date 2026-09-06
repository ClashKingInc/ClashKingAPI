import { readFileSync, existsSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { build } from "esbuild"
import pg from "pg"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"

// Interactive development uses local-api-database.mjs and a persistent volume.
// The disposable schema harness remains a separate, explicit test-only path.
// Never read dotenv, accept a remote database, or deploy.
process.chdir(fileURLToPath(new URL("../", import.meta.url)))
const persistent = process.env.CLASHKING_PERSISTENT_LOCAL_API === "1"
if (!persistent && process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use node scripts/local-api-database.mjs run for persistent interactive development")
const database = new URL((persistent ? process.env.CLASHKING_LOCAL_DATABASE_URL : process.env.TEST_DATABASE_URL) ?? "")
const expectedDatabase = persistent ? "/clashking_dev" : "/clashking_test"
const expectedUser = persistent ? "clashking_local" : "clashking_test"
if (database.protocol !== "postgres:" || database.hostname !== "127.0.0.1" ||
    database.pathname !== expectedDatabase || database.username !== expectedUser || database.password !== expectedUser) {
  throw new Error("Expected the owned loopback development/test database")
}
const port = Number(process.env.CLASHKING_LOCAL_API_PORT ?? "8787")
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local API port")
const lan = process.env.CLASHKING_LOCAL_LAN_IP ?? "192.168.5.62"
if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(lan)) throw new Error("Local LAN IPv4 address required")
const origin = `http://${lan}:${port}`
const discordClientId = process.env.CLASHKING_LOCAL_DISCORD_CLIENT_ID ?? ""
const discordClientSecret = process.env.CLASHKING_LOCAL_DISCORD_CLIENT_SECRET ?? ""
const discordBotToken = process.env.CLASHKING_LOCAL_DISCORD_BOT_TOKEN ?? ""
const clashProxyOrigin = process.env.CLASHKING_LOCAL_CLASH_PROXY_ORIGIN ?? ""
if (!/^\d+$/u.test(discordClientId) || discordClientSecret.length === 0) {
  throw new Error("Set the local Discord client ID and client secret")
}
if (clashProxyOrigin && new URL(clashProxyOrigin).origin !== "https://proxy.clashk.ing") {
  throw new Error("The local Clash proxy origin must be https://proxy.clashk.ing")
}
// The checked-in config has only full-line comments. Reuse public defaults,
// never its remote binding definitions, placement, schedules or migrations.
const config = JSON.parse(readFileSync("workers/api/wrangler.jsonc", "utf8")
  .split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n"))
const secret = () => randomBytes(32).toString("base64url")
const localSecret = (name) => {
  if (!persistent) return secret()
  const value = process.env[`CLASHKING_LOCAL_${name}`]
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error(`Missing stable local ${name}; start through the Keychain-backed launcher`)
  return value
}
const unavailable = () => Response.json({ code: "upstream_unavailable", message: "Provider is not configured in this isolated local environment" }, { status: 503 })
const clashProxy = clashProxyOrigin ? async request => {
  const incoming = new URL(request.url)
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, clashProxyOrigin)
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
  try {
    return await fetch(upstream, { method: request.method, headers: request.headers, body, redirect: "error", signal: request.signal })
  } catch (error) {
    console.error(JSON.stringify({event:"local_clash_proxy_error",path:incoming.pathname,error:String(error)}))
    throw error
  }
} : unavailable
const discordOnly = async request => {
  const url = new URL(request.url)
  if (url.protocol !== "https:" || url.hostname !== "discord.com") return unavailable()
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
  return fetch(url, { method: request.method, headers: request.headers, body })
}
// Goose creates these views WITH NO DATA. Initialize them from the empty local
// tables, as the retained SQL integration suite does; do not seed user records.
const initialization = new pg.Client({ connectionString: database.href })
try {
  await initialization.connect()
  for (const name of ["api_global_counts", "api_league_tier_counts", "townhall_counts", "war_league_counts"]) {
    await initialization.query(`REFRESH MATERIALIZED VIEW ${name}`)
  }
} finally {
  await initialization.end()
}
const result = await build({
  entryPoints: ["workers/api/src/index.ts"], bundle: true, write: false,
  format: "esm", platform: "node", conditions: ["workerd"], external: ["cloudflare:*"],
  banner: { js: 'import { createRequire as localCreateRequire } from "node:module"; const require = localCreateRequire("/local-api/index.js");' },
  plugins: [{ name: "local-binary-modules", setup(builder) {
    builder.onResolve({ filter: /\.wasm$/ }, () => ({ path: "./zstd.wasm", external: true }))
    builder.onResolve({ filter: /\.zdict$/ }, () => ({ path: "./dictionary.bin", external: true }))
  } }],
})
const runtime = new Miniflare(convertV4MiniflareOptions({
  host: "0.0.0.0", port,
  ...(persistent ? { resourcePersistencePath: resolve('.local/worker-storage') } : {}),
  modulesRoot: "/local-api",
  modules: [
    { type: "ESModule", path: "/local-api/index.js", contents: result.outputFiles[0].text },
    { type: "CompiledWasm", path: "/local-api/zstd.wasm", contents: readFileSync("node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm") },
    { type: "Data", path: "/local-api/dictionary.bin", contents: readFileSync("internal/wararchive/war-json.zdict") },
  ],
  compatibilityDate: config.compatibility_date, compatibilityFlags: ["nodejs_compat"],
  hyperdrives: { HYPERDRIVE: database.href },
  kvNamespaces: ["API_CACHE"],
  r2Buckets: ["WAR_ARCHIVE", "POSTS", "APP_UPDATES", "MEDIA", "TICKETING"],
  durableObjects: {
    MATERIALIZED_VIEW_REFRESHER: { className: "MaterializedViewRefresher", useSQLite: true },
    SHARED_LINKS_LIMITER: { className: "SharedLinksRateLimiter", useSQLite: true },
  },
  serviceBindings: { CLASH_PROXY: clashProxy, TRACKING: unavailable, ELASTICSEARCH: unavailable },
  // Forward Discord requests for real local sign-in. Stripe, FCM and every
  // other outbound provider remain unavailable in this isolated environment.
  outboundService: discordOnly,
  assets: {
    directory: "workers/api/documentation-assets", binding: "API_DOCUMENTATION", run_worker_first: true,
    routerConfig: { has_user_worker: true }, assetConfig: { html_handling: "none", not_found_handling: "none" },
  },
  bindings: {
    ...config.vars, ENVIRONMENT: "isolated-local",
    WEB_ALLOWED_ORIGINS: ["localhost", "127.0.0.1", lan].flatMap(host => [3002, 8081].map(value => `http://${host}:${value}`)).join(","),
    ADMIN_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    DISCORD_API_ORIGIN: "https://discord.com/api/v10",
    DISCORD_REDIRECT_URI: "http://localhost:3002/auth/callback",
    DISCORD_CLIENT_ID: discordClientId, DISCORD_CLIENT_SECRET: discordClientSecret, DISCORD_BOT_TOKEN: discordBotToken,
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", SMTP_USERNAME: "", SMTP_PASSWORD: "",
    STRIPE_RESTRICTED_KEY: "", STRIPE_WEBHOOK_SECRET: localSecret("STRIPE_WEBHOOK_SECRET"),
    ELASTICSEARCH_API_KEY: "", ACCESS_TEAM_DOMAIN: "", ACCESS_AUDIENCE: "",
    POSTS_PUBLIC_ORIGIN: origin, APP_UPDATES_PUBLIC_ORIGIN: origin, CONNECT_PUBLIC_ORIGIN: origin,
    JWT_ACCESS_SECRET: localSecret("JWT_ACCESS_SECRET"), JWT_REFRESH_SECRET: localSecret("JWT_REFRESH_SECRET"), API_BOT_TOKEN: localSecret("API_BOT_TOKEN"),
    AI_USAGE_SECRET: localSecret("AI_USAGE_SECRET"), DATA_ENCRYPTION_KEY: localSecret("DATA_ENCRYPTION_KEY"),
  },
}))
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await runtime.dispose()
  process.exit(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
await runtime.ready
const archiveDirectory = resolve('.local/imported-archives/packs')
if (persistent && existsSync(archiveDirectory)) {
  const bucket = await runtime.getR2Bucket('WAR_ARCHIVE')
  let seeded = 0
  for (const file of readdirSync(archiveDirectory)) {
    if (!/^\d+\.pack$/u.test(file)) continue
    const data = readFileSync(resolve(archiveDirectory, file))
    const digest = createHash('sha256').update(data).digest('hex')
    const key = `packs/${file}`
    if ((await bucket.head(key))?.customMetadata?.localImportSha256 === digest) continue
    await bucket.put(key, data, {customMetadata: {localImportSha256: digest}})
    seeded++
  }
  console.log(JSON.stringify({event:'local_war_archives_seeded',seeded}))
}
console.log(JSON.stringify({ event: "isolated_api_ready", pid: process.pid, url: `http://localhost:${port}`, lanUrl: origin,
  database: `127.0.0.1:${database.port}${database.pathname}`, providers: clashProxyOrigin ? "discord-and-clash-proxy" : "discord-only",
  storage: persistent ? "persistent local SQL/KV/R2/DO" : "test-only ephemeral SQL/KV/R2/DO" }))
