import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Script } from "node:vm"
import { test } from "node:test"
import source from "./api-documentation-navigation.source.json" with { type: "json" }
import { applyFeatureNavigation, normalizeDocumentationPath, primaryFeatureTagOrder } from "./api-documentation-navigation.mjs"

const currentPath = path => {
  let index = 0
  return path.replaceAll(/\{[^}]+\}/gu, () => "{parameter" + (++index) + "}")
}
const document = paths => ({ openapi: "3.1.1", info: { title: "fixture" }, paths, components: { schemas: { Fixture: { type: "string" } } } })

test("compact navigation retains every pinned original feature tag with normalized parameters", () => {
  assert.equal(source.sourceCommit, "cf7371e4a32b4a37afd7c80ff83c72ef29b425e4")
  assert.equal(source.sourcePath, "internal/swaggerdocs/openapi.json")
  assert.equal(source.operations.length, 290)
  const paths = {}
  for (const [method, path] of source.operations) {
    paths[currentPath(path)] ??= {}
    paths[currentPath(path)][(method === "QUERY" ? "POST" : method).toLowerCase()] = {
      summary: "preserved", tags: ["server-write"], security: [{ FixtureAuth: [] }],
      responses: { 200: { description: "unchanged" } }, "x-clashking-auth": "server-write",
    }
  }
  const input = document(paths)
  const before = structuredClone(input)
  const result = applyFeatureNavigation(input)
  assert.deepEqual(input, before, "projection must not mutate the shared/internal spec")
  assert.deepEqual(Object.keys(result.paths), Object.keys(paths))
  for (const [method, path, tags] of source.operations) {
    const normalizedMethod = (method === "QUERY" ? "POST" : method).toLowerCase()
    const operation = result.paths[currentPath(path)][normalizedMethod]
    assert.deepEqual(operation.tags, tags.length ? tags : ["Static Data"])
    assert.deepEqual(operation.security, [{ FixtureAuth: [] }])
    assert.deepEqual(operation.responses, { 200: { description: "unchanged" } })
    assert.equal(operation["x-clashking-auth"], "server-write")
  }
  assert.deepEqual(result.components, input.components)
  const used = new Set(source.operations.flatMap(([, , tags]) => tags))
  assert.deepEqual(result.tags.map(tag => tag.name), [...source.tagOrder.filter(name => used.has(name)), "Static Data"])
  assert.deepEqual(Object.keys(source).sort(), ["operations", "primaryTagOrder", "sourceCommit", "sourcePath", "tagOrder"])
})

test("six retired QUERY methods provide POST navigation only, never a runtime compatibility shim", () => {
  assert.deepEqual(source.operations.filter(([method]) => method === "QUERY").map(([, path]) => path).sort(), [
    "/v2/home/activity", "/v2/stats/armies", "/v2/stats/cwl", "/v2/stats/items", "/v2/stats/ranked", "/v2/stats/war",
  ])
  assert.equal(normalizeDocumentationPath("/v2/links/{userId}/{playerTag}"), "/v2/links/{}/{}")
  assert.throws(() => applyFeatureNavigation(document({ "/v2/home/activity": { query: {} } })), /QUERY is not a supported/)
  assert.throws(() => applyFeatureNavigation(document({ "/new-feature": { get: {} } })), /Missing API documentation feature mapping/)
})

test("new public operations receive explicit feature names and path-level metadata stays unchanged", () => {
  const additions = [
    ["get", "/proxy/v1/players/{tag}", "Clash API Proxy"],
    ["get", "/v2/app/config", "Mobile App"],
    ["get", "/v2/app/posts", "Mobile App"],
    ["get", "/v2/app/updates/manifest", "Mobile App"],
    ["get", "/v2/auth/export", "App Authentication"],
    ["delete", "/v2/auth/me", "App Authentication"],
    ["get", "/v2/health", "Health"],
    ["get", "/v2/leaderboard/{location}/clan/capital-gold", "Leaderboard"],
    ["get", "/v2/media/{filename}", "Media"],
    ["post", "/v2/roster/account-groups/query", "Roster Builder"],
    ["post", "/v2/roster/ai/usage", "Roster Builder"],
    ["post", "/v2/roster/members/query", "Roster Builder"],
    ["post", "/v2/roster/membership-changes/validate", "Roster Builder"],
    ["post", "/v2/roster/refresh-batch", "Roster Builder"],
    ["post", "/v2/roster/views/preview", "Roster Builder"],
    ["post", "/v2/server/{guild}/rosters/{id}/discord-identity/refresh", "Roster Builder"],
    ["get", "/v2/ticket-transcripts/{capability}", "Ticket Transcripts"],
    ["get", "/v2/ticket-transcripts/{capability}/attachments/{id}", "Ticket Transcripts"],
    ["post", "/v2/tracking/verified-players", "Tracking"],
  ]
  const paths = Object.fromEntries(additions.map(([method, path]) => [path, {
    [method]: { tags: ["public"], security: [] }, parameters: [{ name: "fixture", in: "header" }],
  }]))
  const output = applyFeatureNavigation(document(paths))
  for (const [method, path, tag] of additions) {
    assert.deepEqual(output.paths[path][method].tags, [tag])
    assert.deepEqual(output.paths[path].parameters, paths[path].parameters)
  }
  assert.ok(!output.tags.some(tag => ["public", "admin", "user"].includes(tag.name)))
  assert.ok(!output.tags.some(tag => tag.name === "Server Tickets"), "do not emit unused tag headings")
})

function templateConfiguration(name) {
  const path = fileURLToPath(new URL("../workers/api/documentation/" + name + ".html", import.meta.url))
  const html = readFileSync(path, "utf8")
  if (name === "scalar") {
    const code = html.slice(html.indexOf("const configuration ="), html.indexOf('const script = document.getElementById("scalar-loader")'))
    assert.ok(code.length > 100)
    return new Script(code + "\nconfiguration").runInNewContext({
      document: { getElementById: () => ({ textContent: "fixture CSS" }) },
    })
  }
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].at(-1)?.[1]
  assert.ok(script)
  let result
  const SwaggerUIBundle = configuration => { result = configuration; return {} }
  SwaggerUIBundle.presets = { apis: {} }
  SwaggerUIBundle.plugins = { DownloadUrl: {} }
  new Script(script + "\nwindow.onload()").runInNewContext({ window: {}, SwaggerUIBundle, SwaggerUIStandalonePreset: {} })
  return result
}

test("both shipped viewers preserve original feature priority without browser or DOM execution", () => {
  for (const name of ["scalar", "swagger"]) {
    const configuration = templateConfiguration(name)
    const shuffled = [...primaryFeatureTagOrder].reverse()
    assert.deepEqual(shuffled.sort(configuration.tagsSorter), [...primaryFeatureTagOrder])
    assert.ok(configuration.tagsSorter("Player", "Server Tickets") < 0)
    assert.ok(configuration.tagsSorter("Server Tickets", "Server Bans") > 0)
    assert.equal(configuration.url, "/openapi.json")
  }
  assert.equal(templateConfiguration("swagger").persistAuthorization, false)
})

test("Swagger personal-links ordering handles current and future parameter names", () => {
  const sorter = templateConfiguration("swagger").operationsSorter
  const entries = [
    ["get", "/v2/links/{userId}"],
    ["post", "/v2/links/{userId}"],
    ["put", "/v2/links/{userId}/order"],
    ["delete", "/v2/links/{userId}/{playerTag}"],
    ["get", "/v2/links/{userId}/bookmarks"],
    ["post", "/v2/links/{userId}/bookmarks"],
    ["put", "/v2/links/{userId}/bookmarks/order"],
    ["delete", "/v2/links/{userId}/bookmarks/{type}/{tag}"],
    ["get", "/v2/links/{userId}/searches"],
  ].map(([method, path]) => ({ method, path, get(field) { return this[field] } }))
  assert.deepEqual([...entries].reverse().sort(sorter).map(item => [item.method, item.path]), entries.map(item => [item.method, item.path]))
  const old = { get: field => field === "method" ? "get" : "/v2/links/{id}" }
  assert.equal(sorter(old, entries[0]), 0)
  const unknown = { get: field => field === "method" ? "get" : "/v2/links/{subject}/upgrades" }
  assert.ok(sorter(unknown, entries[8]) > 0)
})
