import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

test("OpenAPI documents exact public Worker liveness without readiness claims", () => {
  const directory = mkdtempSync(join(tmpdir(), "clashking-health-openapi-"))
  try {
    const output = join(directory, "openapi.json")
    execFileSync(process.execPath, ["scripts/generate-openapi.mjs", output], { stdio: "pipe" })
    const document = JSON.parse(readFileSync(output, "utf8"))
    const health = document.paths["/v2/health"]
    assert.deepEqual(Object.keys(health), ["get"])
    assert.equal(health.get.operationId, "workerHealth")
    assert.deepEqual(health.get.security, [])
    assert.match(health.get.summary, /liveness only; does not check database or provider readiness/u)
    const response = health.get.responses["200"].content["application/json"].schema
    assert.deepEqual(Object.keys(response.properties).sort(), ["runtime", "status", "version"])
    assert.deepEqual(response.required.sort(), ["runtime", "status", "version"])
    assert.deepEqual(response.properties.status.enum, ["ok"])
    assert.deepEqual(response.properties.runtime.enum, ["cloudflare-worker"])
    assert.deepEqual(response.properties.version.enum, ["0.1.0-rc.15"])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
