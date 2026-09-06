import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export const normalizePath = (path) => path
  .replaceAll(/:([A-Za-z0-9_]+)/gu, "{}")
  .replaceAll(/\{([A-Za-z0-9_]+)\}/gu, "{}")
export const routeKey = ({ method, path }) => `${method} ${normalizePath(path)}`
const inScope = ({ path }) => path.startsWith("/v2/") || path.startsWith("/proxy/v1/")
const ordered = (routes) => [...routes].sort((a, b) => routeKey(a).localeCompare(routeKey(b), "en"))
const hash = (source) => createHash("sha256").update(source).digest("hex")

// Keep the original registration expression as evidence: a matching URL does
// not detect changed authorization wrappers, argument defaults or handlers.
export function parseGoRegistrations(source) {
  const routes = []
  for (const [index, line] of source.split("\n").entries()) {
    const ordinary = line.match(/^\s*app\.(Get|Post|Put|Patch|Delete|All)\(\s*"([^"]+)"/u)
    const query = line.match(/^\s*app\.Add\(apptypes\.MethodQuery,\s*"([^"]+)"/u)
    if (ordinary || query) routes.push({
      method: ordinary ? ordinary[1].toUpperCase() : "QUERY",
      path: ordinary ? ordinary[2] : query[1],
      source_line: index + 1,
      registration: line.trim(),
    })
    else if (/^\s*app\.(?:Get|Post|Put|Patch|Delete|All|Add)\(/u.test(line)) {
      throw new Error(`Unsupported Go registration syntax at line ${index + 1}; inventory it explicitly`)
    }
  }
  return routes
}

// No fallback to the working tree: unavailable history must fail visibly.
export function readPinnedSource(root, baseline) {
  if (!/^[a-f0-9]{40}$/u.test(baseline?.commit)) throw new Error("Baseline must use a full immutable commit hash")
  if (!/^[a-f0-9]{64}$/u.test(baseline.sha256)) throw new Error("Pinned baseline source hash mismatch: missing or invalid SHA-256")
  const source = execFileSync("git", ["show", `${baseline.commit}:${baseline.source}`], { cwd: root, encoding: "utf8" })
  if (hash(source) !== baseline.sha256) throw new Error("Pinned baseline source hash mismatch")
  return source
}

function readPreservedFeatures(root, manifest) {
  const features = uniqueRoutes(manifest.preserved_uncommitted_api_features ?? [], "preserved API feature")
  for (const [key, feature] of features) {
    if (feature.origin !== "preserved-uncommitted-api-feature" || !inScope(feature) ||
        typeof feature.decision !== "string" || feature.decision.trim() === "" ||
        typeof feature.evidence !== "string" || feature.evidence.trim() === "") {
      throw new Error(`Preserved feature requires an explicit source-backed decision: ${key}`)
    }
    const registrations = parseGoRegistrations(readPinnedSource(root, feature.registration_source))
      .filter(({ method, path }) => method === feature.method && path === feature.path)
    if (registrations.length !== 1 || registrations[0].registration !== feature.registration) {
      throw new Error(`Preserved registration mismatch: ${key}`)
    }
    // These snapshots establish the exact preserved input, not whether the
    // Worker implements it correctly. No working source can replace a pin.
    readPinnedSource(root, feature.implementation_source)
    readPinnedSource(root, feature.test_source)
    features.set(key, { ...feature, source_line: registrations[0].source_line })
  }
  return features
}

export function inspectWorkerRoutes(workerSources) {
  const withoutComments = (source) => source.replaceAll(/\/\*[\s\S]*?\*\//gu, "").replaceAll(/^\s*\/\/.*$/gmu, "")
  const sources = workerSources.map(({ file, source }) => ({ file, source: withoutComments(source) }))
  const router = sources.find(({ file }) => file.endsWith("/router.ts"))?.source ?? ""
  const entrypoint = sources.find(({ file }) => file.endsWith("/index.ts"))?.source ?? ""
  const declared = new Map()
  const mounted = new Map()
  for (const { file, source } of sources) {
    const routes = []
    for (const match of source.matchAll(/request\.method === "(GET|POST|PUT|PATCH|DELETE)" && url\.pathname === "([^"]+)"/gu)) {
      routes.push({ method: match[1], path: match[2], source: file })
    }
    for (const match of source.matchAll(/\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*path:\s*"([^"]+)"(?:,\s*operation:\s*"[^"]+")?(?:,\s*auth:\s*"(?:user-or-bot|public)")?\s*\}/gu)) {
      routes.push({ method: match[1], path: match[2], source: file })
    }
    if (source.includes('url.pathname.startsWith("/proxy/v1/")')) {
      routes.push({ method: "ALL", path: "/proxy/v1/*", source: file })
    }
    const dispatchers = [...source.matchAll(/export (?:const (dispatch[A-Za-z0-9]+)\s*=|function (dispatch[A-Za-z0-9]+)\s*\()/gu)]
      .map((match) => match[1] ?? match[2])
    const invoked = file.endsWith("/router.ts") ||
      (file.endsWith("/ticket-json-transcript.ts") && /\breadJsonTicketTranscript\s*\(/u.test(entrypoint)) ||
      dispatchers.some((name) => new RegExp(`\\b${name}\\s*\\(`, "u").test(router))
    for (const route of routes.filter(inScope)) {
      declared.set(routeKey(route), route)
      if (invoked) mounted.set(routeKey(route), route)
    }
  }
  return { declared, mounted }
}

// Inspect exported descriptors as observations only. Their existence never
// adds a new requirement; only the checked-in decision manifest can do that.
export function exportedDescriptors(exports) {
  const isEndpoint = (value) => value !== null && typeof value === "object" &&
    typeof value.method === "string" && typeof value.path === "string"
  const descriptors = Object.values(exports).flatMap((value) => isEndpoint(value) ? [value] :
    value !== null && typeof value === "object" ? Object.values(value).filter(isEndpoint) : [])
  return descriptors.map(({ method, path, operationId }) => ({ method, path, operation_id: operationId }))
}

function uniqueRoutes(routes, label) {
  const result = new Map()
  for (const route of routes) {
    if (result.has(routeKey(route))) throw new Error(`Duplicate ${label}: ${routeKey(route)}`)
    result.set(routeKey(route), route)
  }
  return result
}

export function buildReport({ baselineSource, workingSource, manifest, dispositions, workerSources, descriptors,
  root = resolve(import.meta.dirname, ".."),
}) {
  const registrations = parseGoRegistrations(baselineSource)
  const baseline = uniqueRoutes(registrations.filter(inScope), "baseline registration")
  const working = uniqueRoutes(parseGoRegistrations(workingSource).filter(inScope), "working registration")
  const changes = uniqueRoutes(manifest.method_changes, "method exception")
  const removals = uniqueRoutes(manifest.approved_removals, "approved removal")
  const additions = uniqueRoutes(manifest.approved_moves_and_additions, "approved move/addition")
  const preserved = readPreservedFeatures(root, manifest)
  const deferred = uniqueRoutes(manifest.deferred_bot_routes, "deferred bot route")
  for (const [key, change] of changes) {
    if (!baseline.has(key) || change.method !== "QUERY" || change.canonical_method !== "POST") {
      throw new Error(`Invalid baseline method exception: ${key}`)
    }
  }
  for (const key of removals.keys()) if (!baseline.has(key)) throw new Error(`Stale approved removal: ${key}`)
  const expected = new Map()
  for (const [key, route] of baseline) {
    if (removals.has(key)) continue
    const change = changes.get(key)
    const canonical = { ...route, method: change?.canonical_method ?? route.method, source: "pinned-api-baseline" }
    expected.set(routeKey(canonical), canonical)
  }
  for (const [key, route] of additions) {
    if (deferred.has(key)) throw new Error(`Route is both approved and deferred: ${key}`)
    // A moved Admin caller can target an already-existing API endpoint. Retain
    // both origins, because route overlap does not prove auth/response parity.
    expected.set(key, { ...expected.get(key), ...route, source: expected.has(key) ? "api-baseline-and-admin-move" : "approved-move-or-addition" })
  }
  for (const [key, feature] of preserved) {
    if (baseline.has(key) || expected.has(key)) throw new Error(`Preserved route must not overlap another requirement: ${key}`)
    expected.set(key, { ...feature, source: "preserved-uncommitted-api-feature" })
  }
  for (const key of deferred.keys()) if (expected.has(key)) throw new Error(`Baseline/approved route cannot be deferred: ${key}`)

  const { declared, mounted } = inspectWorkerRoutes(workerSources)
  const contracted = new Map(descriptors.filter(inScope).map((endpoint) => [routeKey(endpoint), endpoint]))
  if (descriptors.some(({ path }) => path.startsWith("/proxy/v1/"))) contracted.set("ALL /proxy/v1/*", {
    method: "ALL", path: "/proxy/v1/*", operation_id: "typedProxySurface", evidence: "Typed proxy family only; arbitrary-method behavior is not proven",
  })
  const missing = ordered([...expected].filter(([key]) => !mounted.has(key)).map(([, route]) => route))
  const contractMissing = ordered([...expected].filter(([key]) => !contracted.has(key)).map(([, route]) => route))
  // The original wildcard already accepts these typed client subpaths. Keep
  // their descriptor evidence visible without inventing new API requirements.
  const proxyProjections = expected.has("ALL /proxy/v1/*")
    ? descriptors.filter(({ path }) => path.startsWith("/proxy/v1/") && path !== "/proxy/v1/*") : []
  const projectionKeys = new Set(proxyProjections.map(routeKey))
  const extras = new Map([...contracted, ...mounted].filter(([key]) => !expected.has(key) && !deferred.has(key) && !projectionKeys.has(key)))
  const unapproved = ordered([...extras].map(([key, route]) => ({ ...route, contracted: contracted.has(key), mounted: mounted.has(key) })))
  const deferredInventory = ordered([...deferred].map(([key, route]) => ({ ...route,
    contracted: contracted.has(key), declared: declared.has(key), mounted: mounted.has(key),
  })))

  const dispositionFindings = []
  const seenDispositions = new Set()
  for (const route of dispositions.routes) {
    const key = routeKey(route)
    if (seenDispositions.has(key)) throw new Error(`Duplicate legacy disposition: ${key}`)
    seenDispositions.add(key)
    if (!baseline.has(key) && !preserved.has(key)) dispositionFindings.push({ ...route, finding: "Not registered in pinned baseline or a source-verified preserved feature; dirty Go source cannot authorize this addition" })
    else if (route.disposition === "drop" && !removals.has(key)) dispositionFindings.push({ ...route,
      finding: "Proposed removal lacks a route-specific approved exception; compare original behavior and callers before accepting or restoring",
    })
    else if (route.disposition === "port" && !removals.has(key)) {
      const approvedMethod = changes.get(key)?.canonical_method ?? route.method
      if (route.canonical_method !== approvedMethod || normalizePath(route.canonical_path) !== normalizePath(route.path)) {
        dispositionFindings.push({ ...route, finding: "Proposed method/path change is not in the approved manifest" })
      }
    } else if (route.disposition !== "drop") dispositionFindings.push({ ...route, finding: "Unknown historical disposition" })
  }
  for (const [key, route] of [...baseline, ...preserved]) if (!seenDispositions.has(key)) dispositionFindings.push({ ...route, finding: "Baseline/preserved route has no historical disposition; still required" })

  const workingChanges = []
  for (const [key, route] of working) {
    const original = baseline.get(key) ?? preserved.get(key)
    if (!original) workingChanges.push({ ...route, finding: "added-after-baseline" })
    else if (route.registration !== original.registration) workingChanges.push({ ...route, original_registration: original.registration, finding: "registration-expression-changed" })
    else if (preserved.has(key)) workingChanges.push({ ...route, finding: "added-after-baseline", reviewed: true,
      decision: original.decision, evidence: original.evidence, registration_source: original.registration_source,
    })
  }
  for (const [key, route] of [...baseline, ...preserved]) if (!working.has(key)) workingChanges.push({ ...route, finding: "removed-after-baseline" })
  const deferredMounted = deferredInventory.filter(({ mounted }) => mounted)
  const deferredContracted = deferredInventory.filter(({ contracted }) => contracted)
  const findings = [
    ...missing.map((route) => ({ kind: "baseline-or-approved-route-missing", ...route })),
    ...contractMissing.map((route) => ({ kind: "baseline-or-approved-contract-missing", ...route })),
    ...dispositionFindings.map((route) => ({ kind: "unapproved-legacy-disposition", ...route })),
    ...unapproved.map((route) => ({ kind: "unapproved-addition", ...route })),
    ...deferredMounted.map((route) => ({ kind: "deferred-bot-route-still-mounted", ...route })),
    ...deferredContracted.map((route) => ({ kind: "deferred-bot-contract-still-exported", ...route })),
    ...workingChanges.filter(({ reviewed }) => !reviewed).map((route) => ({ kind: "working-go-registration-diff", ...route })),
  ]
  return {
    schema_version: 3,
    baseline: { ...manifest.baseline, actual_sha256: hash(baselineSource) },
    admin_baseline: manifest.admin_baseline,
    preserved_uncommitted_api_features: ordered(preserved.values()),
    generated_from: ["docs/worker-route-baseline.json", "docs/worker-route-dispositions.json", "current exported contract descriptors", ...workerSources.map(({ file }) => file)],
    evidence_scope: "Static literal route declarations and dispatcher invocation only; not handler execution, authorization, response, SQL, provider effects, wildcard semantics or end-to-end behavior. The recorded pre-rewrite commit and individually pinned preserved features are not a verified deployed release.",
    expected_count: expected.size,
    baseline_registration_count: baseline.size,
    preserved_uncommitted_api_feature_count: preserved.size,
    approved_move_or_addition_count: additions.size,
    contract_count: expected.size - contractMissing.length,
    declared_count: [...expected.keys()].filter((key) => declared.has(key)).length,
    mounted_count: expected.size - missing.length,
    contract_missing_count: contractMissing.length,
    missing_count: missing.length,
    unapproved_addition_count: unapproved.length,
    deferred_bot_count: deferred.size,
    deferred_runtime_route_count: deferredInventory.filter(({ path }) => path.startsWith("/v2/runtime/")).length,
    deferred_roster_configuration_count: deferredInventory.filter(({ category }) => category === "roster-configuration").length,
    deferred_bot_mounted_count: deferredMounted.length,
    deferred_bot_contract_count: deferredContracted.length,
    finding_count: findings.length,
    route_inventory_complete: findings.length === 0,
    behavior_parity_verified: false,
    complete: false,
    required_routes: ordered([...expected].map(([key, route]) => ({ ...route,
      contracted: contracted.has(key), declared: declared.has(key), mounted: mounted.has(key), behavior_evidence: "not-assessed-by-this-check",
    }))),
    approved_method_changes: manifest.method_changes,
    approved_removals: manifest.approved_removals,
    retired_connect_flow: manifest.retired_connect_flow,
    typed_proxy_projections: ordered(proxyProjections),
    out_of_scope_registrations: registrations.filter((route) => !inScope(route)),
    manual_audit_gaps: manifest.manual_audit_gaps,
    deferred_bot_routes: deferredInventory,
    unapproved_additions: unapproved,
    legacy_disposition_findings: ordered(dispositionFindings),
    working_go_registration_changes: ordered(workingChanges),
    contract_missing: contractMissing,
    missing,
    findings,
  }
}

async function main() {
  const root = resolve(import.meta.dirname, "..")
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--write" && arg !== "--check")) throw new Error("Usage: check-route-parity.mjs [--write] [--check]")
  const manifest = JSON.parse(await readFile(resolve(root, "docs/worker-route-baseline.json"), "utf8"))
  const baselineSource = readPinnedSource(root, manifest.baseline)
  const workingSource = await readFile(resolve(root, manifest.baseline.source), "utf8")
  const dispositions = JSON.parse(await readFile(resolve(root, "docs/worker-route-dispositions.json"), "utf8"))
  const directory = resolve(root, "workers/api/src")
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")).sort()
  const workerSources = await Promise.all(files.map(async (file) => ({ file: `workers/api/src/${file}`, source: await readFile(resolve(directory, file), "utf8") })))
  const descriptors = exportedDescriptors(await import("@clashking/api-contracts"))
  const report = buildReport({ root, baselineSource, workingSource, manifest, dispositions, workerSources, descriptors })
  if (args.includes("--write")) await writeFile(resolve(root, "docs/worker-route-parity.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    baseline: report.baseline_registration_count, approved_moves_and_additions: report.approved_move_or_addition_count,
    preserved_uncommitted_api_features: report.preserved_uncommitted_api_feature_count,
    expected: report.expected_count, contracted: report.contract_count, mounted: report.mounted_count,
    missing: report.missing_count, unapproved_additions: report.unapproved_addition_count,
    deferred_bot_mounted: report.deferred_bot_mounted_count, findings: report.finding_count,
    deferred_runtime_routes: report.deferred_runtime_route_count,
    deferred_roster_configuration_routes: report.deferred_roster_configuration_count,
    route_inventory_complete: report.route_inventory_complete, behavior_parity_verified: report.behavior_parity_verified,
  }, null, 2))
  if (args.includes("--check") && !report.route_inventory_complete) {
    console.error(`Worker route inventory has ${report.finding_count} unresolved findings. This check never proves behavior parity.`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
