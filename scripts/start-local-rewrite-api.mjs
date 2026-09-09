import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { randomBytes } from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isAbsolute, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { build } from "esbuild"
import pg from "pg"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { getPlatformProxy } from "wrangler"
import { localProviderOrigin } from "./local-provider-origin.mjs"
import { createLocalAdminIdentity } from "./local-admin-identity.mjs"

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
const localAdmin = persistent && process.env.CLASHKING_LOCAL_ADMIN_IDENTITY === "1"
  ? await createLocalAdminIdentity({ apiOrigin: `http://127.0.0.1:${port}` }) : undefined
const clashProxyOrigin = localProviderOrigin(process.env.CLASHKING_LOCAL_CLASH_PROXY_ORIGIN ?? "", { publicOrigin: "https://proxy.clashk.ing" })
const schemaRoot = process.env.CLASHKING_LOCAL_SCHEMA_ROOT ?? ""
const archiveImportRoot = process.env.CLASHKING_LOCAL_ARCHIVE_IMPORT_ROOT ?? resolve('.local/imported-archives/packs')
if (!/^\d+$/u.test(discordClientId) || discordClientSecret.length === 0) {
  throw new Error("Set the local Discord client ID and client secret")
}
// The checked-in config has only full-line comments. Reuse public defaults,
// never its remote binding definitions, placement, schedules or migrations.
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8")
  .split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n"))
const secret = () => randomBytes(32).toString("base64url")
const localSecret = (name) => {
  if (!persistent) return secret()
  const value = process.env[`CLASHKING_LOCAL_${name}`]
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error(`Missing stable local ${name}; start through the Keychain-backed launcher`)
  return value
}
const unavailable = () => Response.json({ code: "upstream_unavailable", message: "Provider is not configured in this isolated local environment" }, { status: 503 })
let remotePlatform
if (persistent && clashProxyOrigin === "") {
  const remoteBinding = config.vpc_services.find(binding => binding.binding === "CLASH_PROXY")
  if (remoteBinding === undefined) throw new Error("CLASH_PROXY VPC binding is missing from wrangler.jsonc")
  const directory = mkdtempSync(join(tmpdir(), "clashking-local-vpc-"))
  const configPath = join(directory, "wrangler.json")
  try {
    writeFileSync(configPath, JSON.stringify({
      name: `${config.name}-local-vpc`,
      compatibility_date: config.compatibility_date,
      vpc_services: [{ ...remoteBinding, remote: true }],
    }))
    remotePlatform = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
const remoteClashProxy = remotePlatform?.env.CLASH_PROXY
if (remotePlatform !== undefined && (typeof remoteClashProxy !== "object" || remoteClashProxy === null || typeof remoteClashProxy.fetch !== "function")) {
  await remotePlatform.dispose()
  throw new Error("Wrangler did not provide the remote CLASH_PROXY VPC binding")
}
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
} : remoteClashProxy === undefined ? unavailable : request => remoteClashProxy.fetch(request)
const discordOnly = async request => {
  const certificates = localAdmin?.certificates(request)
  if (certificates !== undefined) return certificates
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
    { type: "Data", path: "/local-api/dictionary.bin", contents: readFileSync("workers/api/assets/war-json.zdict") },
  ],
  compatibilityDate: config.compatibility_date, compatibilityFlags: ["nodejs_compat"],
  hyperdrives: { HYPERDRIVE: database.href },
  kvNamespaces: ["API_CACHE"],
  r2Buckets: ["WAR_ARCHIVE", "POSTS", "APP_UPDATES", "MEDIA", "TICKETING"],
  durableObjects: {
  },
  serviceBindings: { CLASH_PROXY: clashProxy, ELASTICSEARCH: unavailable },
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
    ADMIN_ALLOWED_ORIGINS: ["localhost", "127.0.0.1", lan].map(host => `http://${host}:3000`).join(","),
    DISCORD_API_ORIGIN: "https://discord.com/api/v10",
    DISCORD_REDIRECT_URI: "http://localhost:3002/auth/callback",
    DISCORD_CLIENT_ID: discordClientId, DISCORD_CLIENT_SECRET: discordClientSecret, DISCORD_BOT_TOKEN: discordBotToken,
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", SMTP_USERNAME: "", SMTP_PASSWORD: "",
    STRIPE_RESTRICTED_KEY: "", STRIPE_WEBHOOK_SECRET: localSecret("STRIPE_WEBHOOK_SECRET"),
    ELASTICSEARCH_API_KEY: "", ACCESS_TEAM_DOMAIN: "", ACCESS_AUDIENCE: "",
    ...localAdmin?.bindings,
    POSTS_PUBLIC_ORIGIN: origin, APP_UPDATES_PUBLIC_ORIGIN: origin, CONNECT_PUBLIC_ORIGIN: origin,
    JWT_ACCESS_SECRET: localSecret("JWT_ACCESS_SECRET"), JWT_REFRESH_SECRET: localSecret("JWT_REFRESH_SECRET"), API_BOT_TOKEN: localSecret("API_BOT_TOKEN"),
    AI_USAGE_SECRET: localSecret("AI_USAGE_SECRET"), DATA_ENCRYPTION_KEY: localSecret("DATA_ENCRYPTION_KEY"),
  },
}))
let stopping = false
let archiveBridge
async function stop() {
  if (stopping) return
  stopping = true
  await archiveBridge?.close()
  await localAdmin?.close()
  await runtime.dispose()
  await remotePlatform?.dispose()
  process.exit(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
try {
  await runtime.ready
  if (localAdmin) console.log(JSON.stringify({event:'local_admin_identity_ready',origin:await localAdmin.listen(),identity:'local-developer'}))
  const bucket = await runtime.getR2Bucket('WAR_ARCHIVE')
  let seeded = 0
  let archiveFiles = 0
  let archiveBytes = 0
  if (persistent && existsSync(archiveImportRoot)) {
    for (const file of readdirSync(archiveImportRoot)) {
      if (!/^\d+\.pack$/u.test(file)) continue
      const data = readFileSync(resolve(archiveImportRoot, file))
      archiveFiles++
      archiveBytes += data.byteLength
      const digest = createHash('sha256').update(data).digest('hex')
      const key = `packs/${file}`
      if ((await bucket.head(key))?.customMetadata?.localImportSha256 === digest) continue
      await bucket.put(key, data, {customMetadata: {localImportSha256: digest}})
      seeded++
    }
    console.log(JSON.stringify({event:'local_war_archives_seeded',source:archiveImportRoot,files:archiveFiles,bytes:archiveBytes,seeded}))
  }
  if (persistent) {
    if (!isAbsolute(schemaRoot)) throw new Error("Set CLASHKING_LOCAL_SCHEMA_ROOT to the absolute canonical schema checkout")
    const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? ""
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? ""
    const modulePath = join(schemaRoot, "scripts/local-archive-bridge.mjs")
    if (!existsSync(modulePath)) throw new Error("Canonical local archive bridge is missing")
    const { createLocalArchiveBridge } = await import(pathToFileURL(modulePath).href)
    archiveBridge = createLocalArchiveBridge({ bucket, accessKeyId, secretAccessKey })
    await archiveBridge.listen()
  }
} catch (error) {
  await localAdmin?.close().catch(() => undefined)
  await archiveBridge?.close().catch(() => undefined)
  await runtime.dispose()
  await remotePlatform?.dispose()
  throw error
}
console.log(JSON.stringify({ event: "isolated_api_ready", pid: process.pid, url: `http://localhost:${port}`, lanUrl: origin,
  database: `127.0.0.1:${database.port}${database.pathname}`, providers: { discord: true, clashProxy: clashProxyOrigin === "" ? "remote-vpc" : "explicit-origin" },
  storage: persistent ? "persistent local SQL/KV/R2 with loopback archive bridge" : "test-only ephemeral SQL/KV/R2" }))
