import { readdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { adminEndpoints, endpoints, persistentRuntimeEndpoints, rosterInteractionEndpoints, rosterConfigurationEndpoints, ticketTranscriptEndpoints, persistentRuntimeReadinessBlockers, TenorMediaEndpoint, MediaFileEndpoint, TicketMessageEventEndpoint } from "@clashking/api-contracts"

const root = resolve(import.meta.dirname, "..")
const goSource = await readFile(resolve(root, "internal/routes/register.go"), "utf8")
const dispositions = JSON.parse(await readFile(resolve(root, "docs/worker-route-dispositions.json"), "utf8"))
const workerDirectory = resolve(root, "workers/api/src")
const workerFiles = (await readdir(workerDirectory))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .sort()
const workerSources = await Promise.all(workerFiles.map(async (file) => ({
  file: `workers/api/src/${file}`,
  source: await readFile(resolve(workerDirectory, file), "utf8"),
})))
const workerRouterSource = workerSources.find(({ file }) => file.endsWith("/router.ts"))?.source ?? ""
const workerEntrypointSource = workerSources.find(({ file }) => file.endsWith("/index.ts"))?.source ?? ""

const normalizePath = (path) => path
  .replaceAll(/:([A-Za-z0-9_]+)/gu, "{}")
  .replaceAll(/\{([A-Za-z0-9_]+)\}/gu, "{}")

const key = (method, path) => `${method} ${normalizePath(path)}`
const expected = new Map()
const addExpected = (method, path, source) => {
  if (!path.startsWith("/v2/") && !path.startsWith("/proxy/v1/")) return
  expected.set(key(method, path), { method, path, source })
}

const registered = new Set()
for (const match of goSource.matchAll(/app\.(Get|Post|Put|Patch|Delete|All)\(\s*"([^"]+)"/gu)) {
  if (match[2].startsWith("/v2/") || match[2].startsWith("/proxy/v1/")) registered.add(`${match[1].toUpperCase()} ${match[2]}`)
}
for (const match of goSource.matchAll(/app\.Add\(apptypes\.MethodQuery,\s*"([^"]+)"/gu)) registered.add(`QUERY ${match[1]}`)
const reviewed = new Set()
for (const route of dispositions.routes) {
  const registration = `${route.method} ${route.path}`
  if (!registered.has(registration) || reviewed.has(registration)) throw new Error(`Stale or duplicate disposition: ${registration}`)
  reviewed.add(registration)
  if (route.disposition === "port") {
    addExpected(route.canonical_method, route.canonical_path, "canonical-go-disposition")
  } else if (route.disposition !== "drop" || !dispositions.drop_reasons[route.reason]) {
    throw new Error(`Unreviewed disposition: ${registration}`)
  }
}
for (const registration of registered) if (!reviewed.has(registration)) throw new Error(`Missing route disposition: ${registration}`)
for (const endpoint of Object.values(adminEndpoints)) {
  addExpected(endpoint.method, endpoint.path, "admin-contract")
}
addExpected(TenorMediaEndpoint.method, TenorMediaEndpoint.path, "tenor-contract")
addExpected(MediaFileEndpoint.method, MediaFileEndpoint.path, "r2-media-contract")
addExpected(TicketMessageEventEndpoint.method, TicketMessageEventEndpoint.path, "ticket-gateway-contract")
for (const endpoint of Object.values(persistentRuntimeEndpoints)) {
  addExpected(endpoint.method, endpoint.path, "persistent-runtime-contract")
}
for (const endpoint of Object.values(rosterInteractionEndpoints)) {
  addExpected(endpoint.method, endpoint.path, "roster-interaction-contract")
}
for (const endpoint of Object.values(rosterConfigurationEndpoints)) {
  addExpected(endpoint.method, endpoint.path, "roster-configuration-contract")
}
for (const endpoint of Object.values(ticketTranscriptEndpoints)) addExpected(endpoint.method, endpoint.path, "transcript-read-contract")

const contracted = new Map()
for (const endpoint of [...Object.values(endpoints), ...Object.values(adminEndpoints), ...Object.values(persistentRuntimeEndpoints)]) {
  contracted.set(key(endpoint.method, endpoint.path), {
    method: endpoint.method,
    path: endpoint.path,
    operation_id: endpoint.operationId,
  })
}
if (Object.values(endpoints).some((endpoint) => endpoint.path.startsWith("/proxy/v1/"))) {
  contracted.set(key("ALL", "/proxy/v1/*"), {
    method: "ALL",
    path: "/proxy/v1/*",
    operation_id: "typedProxySurface",
  })
}

const declared = new Map()
const implemented = new Map()
for (const { file, source } of workerSources) {
  const routes = []
  for (const match of source.matchAll(/request\.method === "(GET|POST|PUT|PATCH|DELETE)" && url\.pathname === "([^"]+)"/gu)) {
    routes.push({ method: match[1], path: match[2], source: file })
  }
  for (const match of source.matchAll(/\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*path:\s*"([^"]+)"(?:,\s*operation:\s*"[^"]+")?(?:,\s*auth:\s*"(?:user-or-bot|public)")?\s*\}/gu)) {
    routes.push({ method: match[1], path: match[2], source: file })
  }
  for (const route of routes) declared.set(key(route.method, route.path), route)

  const dispatcherNames = [...source.matchAll(/export (?:const (dispatch[A-Za-z0-9]+)\s*=|function (dispatch[A-Za-z0-9]+)\s*\()/gu)]
    .map((match) => match[1] ?? match[2])
  const integrated = file.endsWith("/router.ts") || (file.endsWith("/ticket-transcript-runtime.ts") && /\breadTicketTranscript\s*\(/u.test(workerEntrypointSource)) || dispatcherNames.some((name) =>
    new RegExp(`\\b${name}\\s*\\(`, "u").test(workerRouterSource))
  if (integrated) {
    for (const route of routes) implemented.set(key(route.method, route.path), route)
  }
  if (source.includes('url.pathname.startsWith("/proxy/v1/")')) {
    const route = {
      method: "ALL",
      path: "/proxy/v1/*",
      source: file,
    }
    declared.set(key(route.method, route.path), route)
    if (integrated) implemented.set(key(route.method, route.path), route)
  }
}

const readinessBlocked = new Map(Object.entries(persistentRuntimeReadinessBlockers).map(([name, reason]) => {
  const endpoint = persistentRuntimeEndpoints[name]
  return [key(endpoint.method, endpoint.path), { method:endpoint.method,path:endpoint.path,operation_id:endpoint.operationId,reason }]
}))
for (const route of readinessBlocked.keys()) implemented.delete(route)

const missing = [...expected].filter(([route]) => !implemented.has(route)).map(([route, value]) => ({ ...value,
  ...(readinessBlocked.has(route) ? { readiness_blocker:readinessBlocked.get(route).reason } : {}) }))
const extra = [...implemented].filter(([route]) => !expected.has(route)).map(([, value]) => value)
const contractMissing = [...expected].filter(([route]) => !contracted.has(route)).map(([, value]) => value)
const report = {
  schema_version: 2,
  generated_from: [
    "internal/routes/register.go",
    "docs/worker-route-dispositions.json",
    "packages/api-contracts/src/admin.ts",
    "packages/api-contracts/src/tenor.ts",
    "packages/api-contracts/src/persistent-runtime.ts",
    ...workerFiles.map((file) => `workers/api/src/${file}`),
  ],
  expected_count: expected.size,
  go_registration_count: registered.size,
  dropped_registration_count: dispositions.routes.filter((route) => route.disposition === "drop").length,
  contract_count: [...expected.keys()].filter((route) => contracted.has(route)).length,
  contract_missing_count: contractMissing.length,
  declared_count: [...expected.keys()].filter((route) => declared.has(route)).length,
  integrated_count: expected.size - missing.length,
  readiness_blocked_count: readinessBlocked.size,
  readiness_blocked:[...readinessBlocked.values()],
  evidence_scope: "Static dispatcher invocation and route declarations only; not authorization, database, or end-to-end behavior validation.",
  missing_count: missing.length,
  complete: missing.length === 0 && contractMissing.length === 0,
  contract_missing: contractMissing,
  missing,
  extra,
}

if (process.argv.includes("--write")) {
  await writeFile(resolve(root, "docs/worker-route-parity.json"), `${JSON.stringify(report, null, 2)}\n`)
}

console.log(JSON.stringify({
  expected: report.expected_count,
  contracted: report.contract_count,
  declared: report.declared_count,
  integrated: report.integrated_count,
  missing: report.missing_count,
  complete: report.complete,
}, null, 2))

if (process.argv.includes("--check") && !report.complete) {
  console.error(`Worker route parity is incomplete: ${report.contract_missing_count} contract and ${report.missing_count} integrated route/method pairs are missing`)
  process.exitCode = 1
}
