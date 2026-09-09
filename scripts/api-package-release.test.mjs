import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { packageNames, parsePackOutput, validatePack, validatePair, verify } from "./api-package-release.mjs"

const version = "0.1.0-rc.17", tag = `v${version}`, commit = "a".repeat(40)
const packages = () => packageNames.map(name => ({ name, version,
  dependencies: { effect: "4.0.0-rc.112", ...(name === packageNames[1] ? { [packageNames[0]]: version } : {}) },
  peerDependencies: { effect: "4.0.0-rc.112", ...(name === packageNames[0] ? { "@clashking/clash-contract": ">=0.1.2 <2" } : {}) },
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
}))
const bytes = Buffer.from("test tarball bytes")
const integrity = data => `sha512-${createHash("sha512").update(data).digest("base64")}`
const packed = (pkg, data = bytes) => ({ name: pkg.name, version, filename: `${pkg.name.split("/")[1]}-${version}.tgz`,
  integrity: integrity(data), files: ["package.json", "dist/index.js", "dist/index.d.ts"].map(path => ({ path })) })

test("accepts npm workspace pack output and rejects ambiguous output", () => {
  const result = packed(packages()[0]), name = result.name
  assert.deepEqual(parsePackOutput(JSON.stringify({ [name]: result }), name), result)
  assert.deepEqual(parsePackOutput(JSON.stringify([result]), name), result)
  for (const invalid of [null, [], [result, result], {}, { wrong: result }, { [name]: result, other: result }, { [name]: null }]) {
    assert.throws(() => parsePackOutput(JSON.stringify(invalid), name), /exactly one/u)
  }
})

test("requires a coherent package pair and matching GitHub Release tag", () => {
  assert.equal(validatePair(...packages(), tag), version)
  for (const badTag of [undefined, "api-packages-v0.1.0-rc.17", "v0.1.0-rc.5"]) {
    assert.throws(() => validatePair(...packages(), badTag), /Release tag/u)
  }
  const pair = packages()
  pair[1].dependencies[packageNames[0]] = "^0.1.0-rc.17"
  assert.throws(() => validatePair(...pair, tag), /exact contracts/u)
  const invalidPeer = packages()
  invalidPeer[0].peerDependencies["@clashking/clash-contract"] = "0.1.2"
  assert.throws(() => validatePair(...invalidPeer, tag), /released Clash contract/u)
})

test("checks package identity, exported files, and exact bytes", () => {
  const pkg = packages()[0], result = packed(pkg)
  assert.equal(validatePack(pkg, result, bytes).integrity, result.integrity)
  assert.throws(() => validatePack(pkg, { ...result, filename: "../evil.tgz" }, bytes), /identity/u)
  assert.throws(() => validatePack(pkg, result, Buffer.from("modified")), /integrity/u)
  assert.throws(() => validatePack(pkg, { ...result, files: result.files.slice(1) }, bytes), /package.json/u)
  assert.throws(() => validatePack(pkg, { ...result, files: [...result.files, { path: ".env" }] }, bytes), /Unexpected/u)
})

test("verifies both archives against the source-bound manifest", t => {
  const directory = mkdtempSync(join(tmpdir(), "clashking-release-test-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const artifacts = packages().map((pkg, index) => {
    const data = Buffer.from(`artifact ${index}`), result = packed(pkg, data)
    writeFileSync(join(directory, result.filename), data)
    return validatePack(pkg, result, data)
  })
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version, tag, commit, artifacts }))
  assert.equal(verify(directory, { tag, commit }).version, version)
  assert.throws(() => verify(directory, { tag, commit: "b".repeat(40) }), /source/u)
  writeFileSync(join(directory, artifacts[0].filename), "changed")
  assert.throws(() => verify(directory, { tag, commit }), /bytes changed/u)
})

test("release workflow attaches source-bound archives without replacing an existing version", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release-api-packages.yml", import.meta.url), "utf8")
  assert.match(workflow, /release:\s*\n\s*types: \[published\]/u)
  assert.match(workflow, /ref: refs\/tags\/\$\{\{ env\.RELEASE_TAG \}\}/u)
  assert.match(workflow, /api-package-release\.mjs verify/u)
  assert.match(workflow, /gh release upload/u)
  assert.doesNotMatch(workflow, /--clobber|npm publish/u)
})
