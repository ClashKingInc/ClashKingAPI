import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import * as contracts from "@clashking/api-contracts"

import { buildReport, exportedDescriptors, inspectWorkerRoutes, parseGoRegistrations, readPinnedSource, routeKey } from "./check-route-parity.mjs"

const existing = { method: "GET", path: "/v2/server/:server_id/roles" }
const query = { method: "QUERY", path: "/v2/stats/war" }
const canonicalQuery = { ...query, method: "POST" }
const admin = { method: "POST", path: "/v2/admin/posts" }
const bot = { method: "POST", path: "/v2/runtime/tickets/open/prepare" }
const baselineSource = [
  'app.Get("/v2/server/:server_id/roles", serverRead(roles(a)))',
  'app.Add(apptypes.MethodQuery, "/v2/stats/war", statsWar(a))',
].join("\n")
const declaration = ({ method, path }) => `{ method: "${method}", path: "${path}" }`
const fixture = (overrides = {}) => ({
  baselineSource,
  workingSource: baselineSource,
  manifest: {
    baseline: { commit: "test-original", source: "register.go" },
    admin_baseline: { commit: "test-admin-original" },
    method_changes: [{ ...query, canonical_method: "POST" }],
    approved_removals: [],
    approved_moves_and_additions: [admin],
    preserved_uncommitted_api_features: [],
    deferred_bot_routes: [bot],
    manual_audit_gaps: ["Behavior has not been audited"],
    retired_connect_flow: { status: "intentionally removed" },
  },
  dispositions: { routes: [existing, query].map((route) => ({ ...route, disposition: "port", canonical_method: route.method === "QUERY" ? "POST" : route.method, canonical_path: route.path })) },
  workerSources: [{ file: "workers/api/src/router.ts", source: [existing, canonicalQuery, admin].map(declaration).join("\n") }],
  descriptors: [existing, canonicalQuery, admin],
  ...overrides,
})

test("complete static coverage is never called complete behavior parity", () => {
  const report = buildReport(fixture())
  assert.equal(report.expected_count, 3)
  assert.equal(report.route_inventory_complete, true)
  assert.equal(report.behavior_parity_verified, false)
  assert.equal(report.complete, false)
  assert.ok(report.required_routes.every((route) => route.behavior_evidence === "not-assessed-by-this-check"))
  assert.deepEqual(report.manual_audit_gaps, ["Behavior has not been audited"])
})

test("dirty Go additions and changed authorization wrappers never redefine baseline", () => {
  const workingSource = baselineSource.replace("serverRead(roles(a))", "publicRead(roles(a))") + '\napp.Get("/v2/app/updates/manifest", manifest(a))'
  const report = buildReport(fixture({ workingSource }))
  assert.equal(report.baseline_registration_count, 2)
  assert.equal(report.expected_count, 3)
  assert.deepEqual(report.working_go_registration_changes.map(({ finding }) => finding).sort(), ["added-after-baseline", "registration-expression-changed"])
  assert.equal(report.route_inventory_complete, false)
})

const preservedFixture = () => {
  const root = resolve(import.meta.dirname, "..")
  const policy = JSON.parse(readFileSync(resolve(root, "docs/worker-route-baseline.json"), "utf8"))
  const feature = structuredClone(policy.preserved_uncommitted_api_features[0])
  const input = fixture()
  input.manifest.preserved_uncommitted_api_features = [feature]
  input.workingSource += `\n${feature.registration}`
  input.workerSources[0].source += `\n${declaration(feature)}`
  input.descriptors.push(feature)
  input.dispositions.routes.push({ method: feature.method, path: feature.path, disposition: "port", canonical_method: feature.method, canonical_path: feature.path })
  return { input, feature }
}

test("one pinned preserved feature is required and its exact working diff remains reviewed evidence", () => {
  const { input, feature } = preservedFixture()
  const report = buildReport(input)
  assert.equal(report.baseline_registration_count, 2)
  assert.equal(report.preserved_uncommitted_api_feature_count, 1)
  assert.equal(report.expected_count, 4)
  assert.equal(report.legacy_disposition_findings.length, 0)
  assert.equal(report.unapproved_addition_count, 0)
  assert.equal(report.route_inventory_complete, true)
  assert.equal(report.behavior_parity_verified, false)
  assert.equal(report.complete, false)
  assert.equal(report.required_routes.find((route) => route.path === feature.path).source, "preserved-uncommitted-api-feature")
  assert.deepEqual(report.working_go_registration_changes.map(({ finding, reviewed, registration }) => ({ finding, reviewed, registration })), [
    { finding: "added-after-baseline", reviewed: true, registration: feature.registration },
  ])
})

test("preserved source never approves other dirty additions or changed authorization", () => {
  const { input } = preservedFixture()
  input.workingSource = input.workingSource.replace("serverRead(roles(a))", "publicRead(roles(a))")
    + '\napp.Get("/v2/unreviewed", unreviewed(a))'
  const report = buildReport(input)
  assert.equal(report.expected_count, 4)
  assert.equal(report.route_inventory_complete, false)
  assert.equal(report.findings.filter(({ kind }) => kind === "working-go-registration-diff").length, 2)
  assert.equal(report.working_go_registration_changes.filter(({ reviewed }) => reviewed).length, 1)
})

test("the preserved path does not approve a different working registration expression", () => {
  const { input, feature } = preservedFixture()
  input.workingSource = input.workingSource.replace(feature.registration, feature.registration.replace("appUpdateManifest(a)", "userOrBot(appUpdateManifest(a))"))
  const report = buildReport(input)
  assert.equal(report.route_inventory_complete, false)
  assert.equal(report.working_go_registration_changes[0].finding, "registration-expression-changed")
  assert.equal(report.working_go_registration_changes[0].original_registration, feature.registration)
  assert.notEqual(report.working_go_registration_changes[0].reviewed, true)
})

test("preserved policy requires its exact pinned registration and every source hash", () => {
  const changedExpression = preservedFixture()
  changedExpression.feature.registration = changedExpression.feature.registration.replace("appUpdateManifest(a)", "userOrBot(appUpdateManifest(a))")
  assert.throws(() => buildReport(changedExpression.input), /Preserved registration mismatch/u)
  for (const pin of ["registration_source", "implementation_source", "test_source"]) {
    const missingHash = preservedFixture()
    delete missingHash.feature[pin].sha256
    assert.throws(() => buildReport(missingHash.input), /hash mismatch/u)
    const changedHash = preservedFixture()
    changedHash.feature[pin].sha256 = "0".repeat(64)
    assert.throws(() => buildReport(changedHash.input), /hash mismatch/u)
    const missingPin = preservedFixture()
    delete missingPin.feature[pin]
    assert.throws(() => buildReport(missingPin.input), /immutable commit/u)
  }
})

test("preserved policy requires an explicit decision and an immutable source", () => {
  for (const field of ["decision", "evidence", "origin"]) {
    const { input, feature } = preservedFixture()
    delete feature[field]
    assert.throws(() => buildReport(input), /explicit source-backed decision/u)
  }
  const { input, feature } = preservedFixture()
  feature.registration_source.commit = "HEAD"
  assert.throws(() => buildReport(input), /immutable commit/u)
})

test("preserved routes cannot contradict a baseline, approved addition or deferred route", () => {
  const duplicate = preservedFixture()
  duplicate.input.manifest.preserved_uncommitted_api_features.push(duplicate.feature)
  assert.throws(() => buildReport(duplicate.input), /Duplicate preserved/u)
  const baselineOverlap = preservedFixture()
  baselineOverlap.input.baselineSource += `\n${baselineOverlap.feature.registration}`
  assert.throws(() => buildReport(baselineOverlap.input), /Preserved route must not overlap/u)
  const additionOverlap = preservedFixture()
  additionOverlap.input.manifest.approved_moves_and_additions.push(additionOverlap.feature)
  assert.throws(() => buildReport(additionOverlap.input), /Preserved route must not overlap/u)
  const deferredOverlap = preservedFixture()
  deferredOverlap.input.manifest.deferred_bot_routes.push(deferredOverlap.feature)
  assert.throws(() => buildReport(deferredOverlap.input), /cannot be deferred/u)
})

test("preserved routes remain requirements when absent from working Go or the Worker", () => {
  const { input, feature } = preservedFixture()
  input.workingSource = baselineSource
  input.workerSources[0].source = [existing, canonicalQuery, admin].map(declaration).join("\n")
  input.descriptors = [existing, canonicalQuery, admin]
  const report = buildReport(input)
  assert.equal(report.expected_count, 4)
  assert.equal(report.missing_count, 1)
  assert.equal(report.contract_missing_count, 1)
  assert.equal(report.missing[0].path, feature.path)
  assert.equal(report.working_go_registration_changes[0].finding, "removed-after-baseline")
})

test("Builder Hall disposition preserves its original unavailable route instead of approving a removal", () => {
  const root = resolve(import.meta.dirname, "..")
  const dispositions = JSON.parse(readFileSync(resolve(root, "docs/worker-route-dispositions.json"), "utf8"))
  const route = dispositions.routes.find(({ path }) => path === "/v2/counts/players/builder-halls")
  assert.equal(route.disposition, "port")
  assert.equal(route.canonical_method, "GET")
  assert.equal(route.canonical_path, route.path)
  assert.equal(route.evidence, "docs/builder-hall-counts-boundary.md")
})

test("new Admin or other descriptors are findings, never automatic requirements", () => {
  const future = { method: "GET", path: "/v2/admin/unapproved-product" }
  const report = buildReport(fixture({ descriptors: [existing, canonicalQuery, admin, future] }))
  assert.equal(report.expected_count, 3)
  assert.equal(report.missing_count, 0)
  assert.equal(report.unapproved_addition_count, 1)
  assert.equal(report.unapproved_additions[0].path, future.path)
  assert.equal(report.route_inventory_complete, false)
})

test("absent speculative bot routes are not API gaps", () => {
  const report = buildReport(fixture())
  assert.equal(report.deferred_bot_count, 1)
  assert.equal(report.deferred_bot_mounted_count, 0)
  assert.equal(report.deferred_bot_contract_count, 0)
  assert.equal(report.missing_count, 0)
  assert.equal(report.route_inventory_complete, true)
})

test("surviving mounted/exported bot routes are ownership findings, not readiness progress", () => {
  const input = fixture()
  input.workerSources[0].source += `\n${declaration(bot)}`
  input.descriptors.push(bot)
  const report = buildReport(input)
  assert.equal(report.expected_count, 3)
  assert.equal(report.missing_count, 0)
  assert.equal(report.deferred_bot_mounted_count, 1)
  assert.equal(report.deferred_bot_contract_count, 1)
  assert.ok(report.findings.some(({ kind }) => kind === "deferred-bot-route-still-mounted"))
  assert.ok(report.findings.some(({ kind }) => kind === "deferred-bot-contract-still-exported"))
})

test("old alias and never-implemented labels cannot silently remove baseline behavior", () => {
  for (const reason of ["duplicate-handler-alias", "never-implemented"]) {
    const input = fixture()
    input.dispositions.routes[0] = { ...existing, disposition: "drop", reason }
    input.workerSources[0].source = [canonicalQuery, admin].map(declaration).join("\n")
    input.descriptors = [canonicalQuery, admin]
    const report = buildReport(input)
    assert.equal(report.expected_count, 3)
    assert.equal(report.missing_count, 1)
    assert.equal(report.contract_missing_count, 1)
    assert.equal(report.legacy_disposition_findings.length, 1)
    assert.match(report.legacy_disposition_findings[0].finding, /before accepting or restoring/u)
  }
})

test("an explicit route-specific retirement removes only its baseline route", () => {
  const input = fixture()
  input.manifest.approved_removals = [{ ...existing, approval: "fixture explicit retirement" }]
  input.dispositions.routes[0] = { ...existing, disposition: "drop", reason: "explicit-retirement" }
  input.workerSources[0].source = [canonicalQuery, admin].map(declaration).join("\n")
  input.descriptors = [canonicalQuery, admin]
  const report = buildReport(input)
  assert.equal(report.expected_count, 2)
  assert.equal(report.route_inventory_complete, true)
})

test("route declaration in an uncalled helper does not count as mounted", () => {
  const input = fixture()
  input.workerSources = [
    { file: "workers/api/src/router.ts", source: `${declaration(canonicalQuery)}\n${declaration(admin)}\n// dispatchUncalled(request)` },
    { file: "workers/api/src/helper.ts", source: `${declaration(existing)}\nexport const dispatchUncalled = () => undefined` },
  ]
  const report = buildReport(input)
  assert.equal(report.declared_count, 3)
  assert.equal(report.mounted_count, 2)
  assert.equal(report.missing[0].path, existing.path)
})

test("renamed route parameters match, but methods and paths remain exact", () => {
  const input = fixture()
  input.workerSources[0].source = input.workerSources[0].source.replace(":server_id", "{serverId}")
  input.descriptors[0] = { ...existing, path: "/v2/server/:serverId/roles" }
  assert.equal(buildReport(input).route_inventory_complete, true)
  input.workerSources[0].source = input.workerSources[0].source.replace('method: "GET"', 'method: "POST"')
  assert.equal(buildReport(input).missing_count, 1)
})

test("Admin moves can overlap existing API paths without replacing original evidence", () => {
  const input = fixture()
  input.manifest.approved_moves_and_additions.push({ ...existing, original_path: "/api/admin/roles", original_source_line: 8 })
  const route = buildReport(input).required_routes.find((route) => routeKey(route) === routeKey(existing))
  assert.equal(route.source, "api-baseline-and-admin-move")
  assert.equal(route.original_path, "/api/admin/roles")
  assert.equal(route.registration, 'app.Get("/v2/server/:server_id/roles", serverRead(roles(a)))')
})

test("unapproved method or path dispositions remain visible", () => {
  const input = fixture()
  input.dispositions.routes[0].canonical_path = "/v2/quietly-renamed"
  assert.match(buildReport(input).legacy_disposition_findings[0].finding, /not in the approved manifest/u)
})

test("duplicate, stale and contradictory policy entries fail closed", () => {
  const duplicate = fixture()
  duplicate.manifest.approved_moves_and_additions.push(admin)
  assert.throws(() => buildReport(duplicate), /Duplicate approved/u)
  const stale = fixture()
  stale.manifest.method_changes[0].path = "/v2/unregistered"
  assert.throws(() => buildReport(stale), /Invalid baseline method exception/u)
  const contradiction = fixture()
  contradiction.manifest.deferred_bot_routes.push(existing)
  assert.throws(() => buildReport(contradiction), /cannot be deferred/u)
  const staleRemoval = fixture()
  staleRemoval.manifest.approved_removals.push(bot)
  assert.throws(() => buildReport(staleRemoval), /Stale approved removal/u)
})

test("unsupported Go registration syntax is an error instead of disappearing", () => {
  assert.throws(() => parseGoRegistrations('app.Get(\n  "/v2/multiline", handler)'), /Unsupported Go registration/u)
  assert.throws(() => parseGoRegistrations('app.Add(customMethod, "/v2/new", handler)'), /Unsupported Go registration/u)
  assert.equal(parseGoRegistrations('// app.Get("/v2/comment", handler)').length, 0)
})

test("descriptor collection does not treat arbitrary exported values as endpoints", () => {
  assert.deepEqual(exportedDescriptors({ direct: existing, group: { query: canonicalQuery }, constant: true, helper: () => 1 }), [existing, canonicalQuery].map((route) => ({ ...route, operation_id: undefined })))
})

test("typed proxy subpaths are projections of the original wildcard, not invented additions", () => {
  const input = fixture()
  input.baselineSource += '\napp.All("/proxy/v1/*", proxy(a))'
  input.workingSource = input.baselineSource
  input.dispositions.routes.push({ method: "ALL", path: "/proxy/v1/*", disposition: "port", canonical_method: "ALL", canonical_path: "/proxy/v1/*" })
  input.workerSources[0].source += '\nif (url.pathname.startsWith("/proxy/v1/")) return proxy(request)'
  input.descriptors.push({ method: "GET", path: "/proxy/v1/players/:playerTag" })
  const report = buildReport(input)
  assert.equal(report.expected_count, 4)
  assert.equal(report.unapproved_addition_count, 0)
  assert.equal(report.typed_proxy_projections.length, 1)
  assert.equal(report.route_inventory_complete, true)
  assert.equal(report.behavior_parity_verified, false)
})

test("file and whole-line comments cannot manufacture mounted routes", () => {
  const { mounted } = inspectWorkerRoutes([{ file: "workers/api/src/router.ts", source: `// ${declaration(existing)}\n/* ${declaration(admin)} */` }])
  assert.equal(mounted.size, 0)
})

test("checked-in baseline is immutable and contains exactly the six approved method changes", () => {
  const root = resolve(import.meta.dirname, "..")
  const manifest = JSON.parse(readFileSync(resolve(root, "docs/worker-route-baseline.json"), "utf8"))
  assert.equal(manifest.baseline.commit, "90436aa042aa85ab1112ea12f3490787e2104b51")
  const source = readPinnedSource(root, manifest.baseline)
  const original = parseGoRegistrations(source)
  assert.deepEqual(manifest.method_changes.map(({ path }) => path).sort(), ["/v2/home/activity", "/v2/stats/armies", "/v2/stats/items", "/v2/stats/ranked", "/v2/stats/war", "/v2/stats/cwl"].sort())
  assert.ok(manifest.method_changes.every(({ method, canonical_method }) => method === "QUERY" && canonical_method === "POST"))
  assert.equal(original.filter(({ method }) => method === "QUERY").length, 6)
  assert.equal(original.some(({ path }) => path === "/v2/app/updates/manifest"), false)
  assert.equal(manifest.approved_moves_and_additions.filter(({ origin }) => origin === "admin-handler-move").length, 37)
  const preservedAdmin = manifest.approved_moves_and_additions.filter(({ origin }) => origin === "preserved-uncommitted-admin-handler-move")
  assert.deepEqual(preservedAdmin.map(({ method, path }) => ({ method, path })), [
    { method: "GET", path: "/v2/admin/app-releases" },
    { method: "PUT", path: "/v2/admin/app-releases/channels/:track/:platform/:runtimeVersion" },
  ])
  for (const route of preservedAdmin) {
    assert.equal(route.original_source_sha256, "11f7a3c3b62482eba5b055e705502d896ebdd3dfad57d15eb72e6f3b60cce890")
    assert.equal(route.original_caller_sha256, "4b2692ae6f7c8f10330a3f3f79ac61eae5262f8c8f5f949e22d8f890ffe9731a")
    assert.equal(route.original_path, route.path.replace("/v2/admin/", "/api/"))
  }
  assert.equal(manifest.deferred_bot_routes.length, 24)
  assert.equal(manifest.deferred_bot_routes.filter(({ path }) => path.startsWith("/v2/runtime/")).length, 19)
  assert.deepEqual(manifest.deferred_bot_routes.filter(({ category }) => category === "roster-configuration").map(routeKey).sort(), [
    "GET /v2/server/{}/roster-member-groups", "POST /v2/server/{}/roster-member-groups",
    "PATCH /v2/server/{}/roster-member-groups/{}", "DELETE /v2/server/{}/roster-member-groups/{}",
    "PUT /v2/server/{}/rosters/{}/member-groups",
  ].sort())
  assert.equal(manifest.preserved_uncommitted_api_features.length, 1)
  assert.equal(manifest.preserved_uncommitted_api_features[0].path, "/v2/app/updates/manifest")
  assert.match(manifest.retired_connect_flow.status, /Intentionally removed/u)
  assert.throws(() => readPinnedSource(root, { ...manifest.baseline, sha256: "wrong" }), /hash mismatch/u)
  assert.throws(() => readPinnedSource(root, { ...manifest.baseline, commit: "HEAD" }), /immutable commit/u)
})

test("audited alias retirements preserve original canonical routes and active contracts", () => {
  const root = resolve(import.meta.dirname, "..")
  const manifest = JSON.parse(readFileSync(resolve(root, "docs/worker-route-baseline.json"), "utf8"))
  const original = new Set(parseGoRegistrations(readPinnedSource(root, manifest.baseline)).map(routeKey))
  const active = new Set(exportedDescriptors(contracts).map(routeKey))
  assert.equal(manifest.approved_removals.length, 16)
  assert.match(manifest.alias_retirement_decision.basis, /Implementation-selected/u)
  assert.equal(manifest.alias_retirement_decision.evidence, "docs/worker-route-alias-review.md")
  for (const removal of manifest.approved_removals) {
    const canonical = routeKey({ method: removal.canonical_method, path: removal.canonical_path })
    assert.equal(removal.decision, "alias_retirement_decision")
    assert.ok(original.has(routeKey(removal)), `Alias must exist in the pinned source: ${routeKey(removal)}`)
    assert.ok(original.has(canonical), `Canonical route must already exist in the original API: ${canonical}`)
    assert.ok(active.has(canonical), `Canonical contract must remain available: ${canonical}`)
    assert.equal(active.has(routeKey(removal)), false, "Do not reintroduce retired compatibility contracts")
  }
  assert.equal(manifest.approved_removals.some(({ path }) => path.includes("builder-halls")), false)
})
