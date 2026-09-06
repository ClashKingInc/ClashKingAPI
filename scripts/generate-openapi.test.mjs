import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import * as deferred from "@clashking/api-contracts/deferred-runtime"

test("generated OpenAPI excludes every deferred runtime operation and keeps baseline routes", () => {
  const directory = mkdtempSync(join(tmpdir(), "clashking-openapi-boundary-"))
  try {
    const output = join(directory, "openapi.json")
    execFileSync(process.execPath, ["scripts/generate-openapi.mjs", output], { stdio: "pipe" })
    const document = JSON.parse(readFileSync(output, "utf8"))
    const runtimeDescriptors = [...Object.values(deferred.persistentRuntimeEndpoints),
      ...Object.values(deferred.rosterInteractionEndpoints), deferred.TicketMessageEventEndpoint]
    assert.equal(runtimeDescriptors.length, 19)
    const configurationDescriptors = Object.values(deferred.rosterConfigurationEndpoints)
    assert.equal(configurationDescriptors.length, 5)
    const descriptors = [...runtimeDescriptors, ...configurationDescriptors]
    const operationIds = new Set(Object.values(document.paths).flatMap(methods => Object.values(methods))
      .flatMap(operation => [operation.operationId, ...(operation["x-clashking-operation-aliases"] ?? [])]))
    assert.equal(Object.keys(document.paths).some(path => path.startsWith("/v2/runtime/")), false)
    for (const descriptor of descriptors) {
      assert.equal(operationIds.has(descriptor.operationId), false)
      const path = descriptor.path.replaceAll(/:([A-Za-z0-9_]+)/gu, "{$1}")
      assert.equal(document.paths[path], undefined)
    }
    assert.ok(document.paths["/v2/links/shared"].post)
    for (const suffix of ["summary", "timeseries"]) {
      const tracking = document.paths[`/v2/admin/tracking/${suffix}`].get
      assert.deepEqual(tracking.security, [{ CloudflareAccess: [] }, { BotToken: [] }])
      const ajax = tracking.parameters.find(parameter => parameter.name === "X-Requested-With")
      assert.equal(ajax.required, false)
      assert.match(ajax.description, /Required with Cloudflare Access/)
    }
    assert.deepEqual(document.paths["/v2/admin/developer-applications"].post.security, [{ CloudflareAccess: [] }])
    assert.ok(document.paths["/v2/server/{serverId}/strikes/{playerTag}"].post)
    assert.ok(document.paths["/v2/media/{filename}"].get)
    assert.ok(document.paths["/v2/ticket-transcripts/{capability}"].get.responses["200"].content["application/json"])
    assert.equal(document.paths["/v2/ticket-transcripts/{capability}/channel.html"], undefined)
    assert.equal(document.paths["/v2/ticket-transcripts/{capability}/thread.html"], undefined)
    assert.ok(document.paths["/v2/roster-group"].post)
    assert.ok(document.paths["/v2/roster-group/list"].get)
    for (const method of ["get", "patch", "delete"]) assert.ok(document.paths["/v2/roster-group/{groupId}"][method])
    assert.ok(document.paths["/v2/roster/account-groups/query"].post)
    const builderHall = document.paths["/v2/counts/players/builder-halls"].get
    assert.deepEqual(builderHall.security, [])
    assert.deepEqual(Object.keys(builderHall.responses), ["501"])
    assert.equal(builderHall.responses["501"].description, "Expected error")
    const unavailable = builderHall.responses["501"].content["application/json"].schema
    assert.deepEqual(unavailable.properties.code.enum, ["not_implemented"])
    assert.deepEqual(unavailable.properties.message.enum, ["Builder Hall counts are not implemented"])
    const proxyOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith("/proxy/v1/"))
      .flatMap(([, methods]) => Object.values(methods))
    assert.equal(proxyOperations.length, 18)
    for (const operation of proxyOperations) assert.equal(operation["x-clashking-auth"], "user")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
