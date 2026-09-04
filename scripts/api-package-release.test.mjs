import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { check, packageNames, parsePackOutput, registryAction, validatePack, validatePair } from "./api-package-release.mjs"

const version = "0.1.0-rc.0", ref = `refs/tags/api-packages-v${version}`, commit = "a".repeat(40)
const packages = () => packageNames.map(name => ({ name, version,
  repository: { type: "git", url: "git+https://github.com/ClashKingInc/ClashKingAPI.git", directory: `packages/${name.split("/")[1]}` },
  dependencies: { effect: "4.0.0-rc.112", ...(name === packageNames[1] ? { [packageNames[0]]: version } : {}) },
  peerDependencies: { effect: "4.0.0-rc.112" },
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  publishConfig: { access: "public", provenance: true, registry: "https://registry.npmjs.org/" },
}))
const bytes = Buffer.from("test tarball bytes")
const integrity = data => `sha512-${createHash("sha512").update(data).digest("base64")}`
const packed = (pkg, data = bytes) => ({ name: pkg.name, version, filename: `${pkg.name.split("/")[1]}-${version}.tgz`,
  integrity: integrity(data), files: ["package.json", "dist/index.js", "dist/index.d.ts"].map(path => ({ path })) })
const metadata = artifact => ({ name: artifact.name, version: artifact.version, dist: { integrity: artifact.integrity } })

test("accepts npm 12 keyed workspace pack output and rejects ambiguous or wrong workspaces", () => {
  const result = packed(packages()[0]), name = result.name
  assert.deepEqual(parsePackOutput(JSON.stringify({ [name]: result }), name), result)
  assert.deepEqual(parsePackOutput(JSON.stringify([result]), name), result)
  for (const invalid of [null, [], [result, result], {}, { wrong: result }, { [name]: result, other: result },
    { [name]: { ...result, name: "wrong" } }, [null], { [name]: null }, ["text"]]) {
    assert.throws(() => parsePackOutput(JSON.stringify(invalid), name), /exactly one/u)
  }
})

test("requires a coherent immutable pair and the exact release tag", () => {
  assert.equal(validatePair(...packages(), ref), version)
  for (const badRef of [undefined, "refs/heads/main", "refs/tags/api-packages-v0.1.0-rc.1"]) {
    assert.throws(() => validatePair(...packages(), badRef), /matching.*tag/u)
  }
  const mutations = [
    pair => { pair[0].name = "unrelated" },
    pair => { pair[1].version = "0.1.0-rc.1" },
    pair => { pair[1].dependencies[packageNames[0]] = "^0.1.0-rc.0" },
    pair => { pair[0].version = pair[1].version = "00.1.0-rc.0" },
    pair => { pair[0].private = true },
    pair => { pair[1].publishConfig.registry = "https://example.test/" },
    pair => { pair[1].publishConfig.access = "restricted" },
    pair => { pair[1].peerDependencies.effect = "4.0.0-rc.111" },
    pair => { pair.forEach(pkg => { delete pkg.dependencies.effect; delete pkg.peerDependencies.effect }) },
  ]
  for (const mutate of mutations) { const pair = packages(); mutate(pair); assert.throws(() => validatePair(...pair, ref)) }
})

test("requires provenance and case-sensitive source repository metadata for both packages", () => {
  const mutations = [
    pkg => { delete pkg.repository },
    pkg => { pkg.repository.type = "svn" },
    pkg => { pkg.repository.url = "git+https://github.com/clashkinginc/ClashKingAPI.git" },
    pkg => { pkg.repository.directory = "packages/unrelated" },
    pkg => { pkg.publishConfig.provenance = false },
    pkg => { delete pkg.publishConfig.provenance },
  ]
  for (const index of [0, 1]) for (const mutate of mutations) {
    const pair = packages()
    mutate(pair[index])
    assert.throws(() => validatePair(...pair, ref), /provenance/u)
  }
})

test("checks packed identity, export completeness, allowed files and exact bytes", () => {
  const pkg = packages()[0], result = packed(pkg)
  assert.equal(validatePack(pkg, result, bytes).integrity, result.integrity)
  for (const filename of ["../evil.tgz", "x\noutput.tgz", "/tmp/x.tgz"]) {
    assert.throws(() => validatePack(pkg, { ...result, filename }, bytes), /identity/u)
  }
  assert.throws(() => validatePack(pkg, { ...result, name: "other" }, bytes), /identity/u)
  assert.throws(() => validatePack(pkg, result, Buffer.from("modified")), /integrity/u)
  assert.throws(() => validatePack(pkg, { ...result, files: result.files.slice(1) }, bytes), /package.json/u)
  assert.throws(() => validatePack(pkg, { ...result, files: result.files.slice(0, 2) }, bytes), /export/u)
  for (const path of [".env", "src/private.ts", "dist/.env", "dist/.env.json", "dist/private.pem", "dist/.secret/x.js", "dist/../.env", "dist/../../secret", "dist/x\nkey.js"]) {
    assert.throws(() => validatePack(pkg, { ...result, files: [...result.files, { path }] }, bytes), /Unexpected/u)
  }
})

test("only a registry 404 permits publishing; identical integrity permits a retry skip", async () => {
  const artifact = validatePack(packages()[0], packed(packages()[0]), bytes)
  const fakeFetch = async (url, options) => {
    assert.equal(url, `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${version}`)
    assert.equal(options.redirect, "error")
    assert.ok(options.signal)
    assert.equal(options.headers.authorization, undefined)
    return new Response(null, { status: 404 })
  }
  assert.equal(await registryAction(artifact, fakeFetch), "publish")
  assert.equal(await registryAction(artifact, async () => Response.json(metadata(artifact))), "already-published")
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(registryAction(artifact, async () => new Response(null, { status })), /Registry check failed/u)
  }
  await assert.rejects(registryAction(artifact, async () => { throw new Error("offline") }), /offline/u)
  for (const badMetadata of [{}, { ...metadata(artifact), version: "different" }, { ...metadata(artifact), dist: { integrity: "sha512-other" } }]) {
    await assert.rejects(registryAction(artifact, async () => Response.json(badMetadata)), /different bytes/u)
  }
})

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "clashking-release-test-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const artifacts = packages().map((pkg, index) => {
    const data = Buffer.from(`artifact ${index}`), result = packed(pkg, data)
    writeFileSync(join(directory, result.filename), data)
    return validatePack(pkg, result, data)
  })
  const manifest = { version, ref, commit, artifacts }
  const save = () => writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest))
  save()
  const output = join(directory, "output.txt")
  writeFileSync(output, "")
  return { directory, manifest, save, options: { ref, commit, output } }
}

test("checks the whole pair before exposing any publish paths and resumes a partial publish", async t => {
  const { directory, manifest, options } = fixture(t)
  let calls = 0
  const fetcher = async () => ++calls === 1 ? Response.json(metadata(manifest.artifacts[0])) : new Response(null, { status: 404 })
  const result = await check(directory, { ...options, fetcher })
  assert.deepEqual(result, ["contracts=", `client=${join(directory, manifest.artifacts[1].filename)}`])
  assert.match(readFileSync(options.output, "utf8"), /^contracts=\nclient=/u)
})

test("a conflict in the second package emits no first-package publication output", async t => {
  const { directory, options } = fixture(t)
  let calls = 0
  await assert.rejects(check(directory, { ...options, fetcher: async () => ++calls === 1
    ? new Response(null, { status: 404 }) : Response.json({}) }), /different bytes/u)
  assert.equal(readFileSync(options.output, "utf8"), "")
})

test("rejects modified artifacts and mismatched release source before allowing publication", async t => {
  const { directory, manifest, options } = fixture(t)
  const fetcher = async () => { throw new Error("Unexpected registry request") }
  await assert.rejects(check(directory, { ...options, commit: "b".repeat(40), fetcher }), /source/u)
  writeFileSync(join(directory, manifest.artifacts[0].filename), "changed")
  await assert.rejects(check(directory, { ...options, fetcher }), /bytes changed/u)
  assert.equal(readFileSync(options.output, "utf8"), "")
})

test("post-publication verification requires both exact registry artifacts", async t => {
  const { directory, manifest, options } = fixture(t)
  await assert.rejects(check(directory, { ...options, requirePublished: true,
    fetcher: async () => new Response(null, { status: 404 }) }), /missing/u)
  let calls = 0
  assert.deepEqual(await check(directory, { ...options, requirePublished: true,
    fetcher: async () => Response.json(metadata(manifest.artifacts[calls++])) }), ["contracts=", "client="])
})
