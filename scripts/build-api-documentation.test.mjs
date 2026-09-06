import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { buildApiDocumentation, jsonToYaml, publicApiDocument } from "./build-api-documentation.mjs"

test("YAML preserves JSON scalars, empty containers, arrays and quoted keys", () => {
  assert.equal(jsonToYaml({ "true": "false", nested: [{ date: "2026-09-04", quoted: '"\n', count: 2 }, null], empty: {}, list: [] }),
    '"true": "false"\n"nested":\n  -\n    "date": "2026-09-04"\n    "quoted": "\\\"\\n"\n    "count": 2\n  - null\n"empty": {}\n"list": []')
})

test("public docs preserve the two Tracking reads but exclude private operations and unused schemas", () => {
  const input = { paths: {
    "/v2/health": { get: { response: { $ref: "#/components/schemas/Public" } } },
    "/v2/admin/tracking/summary": { get: { security: [{ BotToken: [] }] }, post: { private: true } },
    "/v2/admin/audit": { get: { response: { $ref: "#/components/schemas/Private" } } },
  }, components: { schemas: { Public: { items: { $ref: "#/components/schemas/Nested" } }, Nested: { type: "string" }, Private: { secretField: true } },
    securitySchemes: { BotToken: { type: "http" }, Unused: { type: "apiKey" } } } }
  const result = publicApiDocument(input)
  assert.equal(result.paths["/v2/admin/audit"], undefined)
  assert.equal(result.paths["/v2/admin/tracking/summary"].post, undefined)
  assert.deepEqual(Object.keys(result.components.schemas).sort(), ["Nested", "Public"])
  assert.deepEqual(Object.keys(result.components.securitySchemes), ["BotToken"])
  assert.ok(input.paths["/v2/admin/audit"])
  assert.throws(() => publicApiDocument({ paths: { "/v2/health": { $ref: "#/components/schemas/Missing" } } }), /Missing public OpenAPI/)
})

test("documentation build includes only current schemas and preserved viewers without QUERY compatibility", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clashking-docs-"))
  try {
    const destination = join(directory, "assets")
    const source = join(directory, "source.json")
    execFileSync(process.execPath, ["scripts/generate-openapi.mjs", source], { stdio: "pipe" })
    const names = await buildApiDocumentation(resolve("."), destination, source)
    assert.deepEqual((await readdir(destination)).sort(), names.sort())
    const document = JSON.parse(await readFile(join(destination, "openapi.json"), "utf8"))
    assert.ok(document.paths["/v2/home/activity"].post)
    assert.equal(document.paths["/v2/home/activity"].query, undefined)
    assert.deepEqual(Object.keys(document.paths).filter(path => path.startsWith("/v2/admin/")), ["/v2/admin/tracking/summary", "/v2/admin/tracking/timeseries"])
    assert.doesNotMatch(JSON.stringify(document), /adminAudit|adminPushLab|adminReleaseCreate/)
    const scalar = await readFile(join(destination, "scalar.html"), "utf8")
    assert.match(scalar, /@scalar\/api-reference@1\.63\.0/)
    assert.match(scalar, /clashking-wordmark-dark\.svg/)
    assert.match(scalar, /url: "\/openapi.json"/)
    assert.doesNotMatch(scalar, /queryPaths|scalarFetch|watchScalarQueryLabels|\{\{/)
    assert.match(await readFile(join(destination, "swagger.html"), "utf8"), /persistAuthorization: false/)
    assert.match(await readFile(join(destination, "openapi.yaml"), "utf8"), /^"openapi": "3.1.1"/)
    await writeFile(join(destination, "unexpected-secret.txt"), "test-only")
    await assert.rejects(buildApiDocumentation(resolve("."), destination, source), /Unexpected documentation asset/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
