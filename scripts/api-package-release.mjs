import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const packageNames = ["@clashking/api-contracts", "@clashking/api-client"]
const readJson = path => JSON.parse(readFileSync(path, "utf8"))
const digest = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding)
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u

export function validatePair(contracts, client, tag) {
  if (contracts.name !== packageNames[0] || client.name !== packageNames[1]) throw new Error("Unexpected API package names")
  if (!versionPattern.test(contracts.version) || client.version !== contracts.version) {
    throw new Error("API packages must have the same exact semantic version")
  }
  if (client.dependencies?.[contracts.name] !== contracts.version) throw new Error("Client must depend on the exact contracts version")
  if (!/^\d+\.\d+\.\d+-rc\.\d+$/u.test(contracts.dependencies?.effect ?? "")) throw new Error("Effect must use an exact RC version")
  for (const pkg of [contracts, client]) {
    if (pkg.dependencies?.effect !== contracts.dependencies?.effect || pkg.peerDependencies?.effect !== contracts.dependencies?.effect) {
      throw new Error("API package Effect versions must agree exactly")
    }
  }
  if (tag !== `v${contracts.version}`) throw new Error("GitHub Release tag must match the API package version")
  return contracts.version
}

export function validatePack(pkg, result, bytes) {
  if (result.name !== pkg.name || result.version !== pkg.version || !/^[a-z0-9.-]+\.tgz$/u.test(result.filename)) {
    throw new Error("Packed package identity is invalid")
  }
  const paths = new Set(result.files.map(file => file.path))
  if (!paths.has("package.json")) throw new Error("Packed package.json is missing")
  for (const path of paths) {
    if (!/^(?:package\.json|(?:README|LICENSE|LICENCE)(?:\.[\w-]+)?|dist\/(?:[\w-]+\/)*[\w-][\w.-]*\.(?:js(?:\.map)?|d\.ts(?:\.map)?|json))$/iu.test(path) || path.split("/").includes("..")) {
      throw new Error(`Unexpected released file: ${path}`)
    }
  }
  for (const entry of Object.values(pkg.exports)) {
    for (const key of ["types", "import"]) {
      if (typeof entry[key] !== "string" || !entry[key].startsWith("./dist/") || !paths.has(entry[key].slice(2))) {
        throw new Error(`Missing packed ${key} export`)
      }
    }
  }
  const integrity = `sha512-${digest(bytes, "sha512", "base64")}`
  if (result.integrity !== integrity) throw new Error("Packed package integrity mismatch")
  return { name: pkg.name, version: pkg.version, filename: result.filename, integrity, sha256: digest(bytes, "sha256", "hex") }
}

export function parsePackOutput(output, expectedName) {
  const parsed = JSON.parse(output)
  const result = Array.isArray(parsed) && parsed.length === 1 ? parsed[0]
    : parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      && Object.keys(parsed).length === 1 && Object.hasOwn(parsed, expectedName) ? parsed[expectedName] : undefined
  if (result === null || typeof result !== "object" || Array.isArray(result) || result.name !== expectedName) {
    throw new Error("Expected exactly one packed result for the requested workspace")
  }
  return result
}

function source() {
  const tag = process.env.SOURCE_TAG
  const commit = process.env.SOURCE_COMMIT
  if (!/^v[0-9A-Za-z.-]+$/u.test(tag ?? "") || !/^[0-9a-f]{40}$/u.test(commit ?? "")) {
    throw new Error("Release source tag or commit is invalid")
  }
  return { tag, commit }
}

function packageManifests(root) {
  return ["api-contracts", "api-client"].map(name => readJson(join(root, "packages", name, "package.json")))
}

function prepare(root) {
  const packages = packageManifests(root)
  const release = source()
  const version = validatePair(...packages, release.tag)
  for (const pkg of packages) execFileSync("npm", ["run", "build", "--workspace", pkg.name], { cwd: root, stdio: "inherit" })
  const directory = mkdtempSync(join(tmpdir(), "clashking-api-release-"))
  const artifacts = packages.map(pkg => {
    const output = execFileSync("npm", ["pack", "--workspace", pkg.name, "--ignore-scripts", "--json", "--pack-destination", directory], { cwd: root, encoding: "utf8" })
    const result = parsePackOutput(output, pkg.name)
    if (typeof result.filename !== "string" || basename(result.filename) !== result.filename) throw new Error("Unsafe packed filename")
    return validatePack(pkg, result, readFileSync(join(directory, result.filename)))
  })
  writeFileSync(join(directory, "manifest.json"), `${JSON.stringify({ version, ...release, artifacts }, null, 2)}\n`, { flag: "wx" })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `directory=${directory}\n`)
  console.log(JSON.stringify({ directory, version, artifacts }, null, 2))
}

export function verify(directory, expected = source()) {
  const manifest = readJson(join(directory, "manifest.json"))
  if (manifest.tag !== expected.tag || manifest.commit !== expected.commit) throw new Error("Release artifact source does not match this workflow")
  if (manifest.artifacts?.length !== packageNames.length || manifest.artifacts.some((item, i) => item.name !== packageNames[i] || item.version !== manifest.version)) {
    throw new Error("Release manifest does not contain the matching package pair")
  }
  for (const artifact of manifest.artifacts) {
    if (!/^[a-z0-9.-]+\.tgz$/u.test(artifact.filename)) throw new Error("Unsafe artifact filename")
    const bytes = readFileSync(join(directory, artifact.filename))
    if (`sha512-${digest(bytes, "sha512", "base64")}` !== artifact.integrity || digest(bytes, "sha256", "hex") !== artifact.sha256) {
      throw new Error("Release artifact bytes changed after packing")
    }
  }
  const root = fileURLToPath(new URL("../", import.meta.url))
  validatePair(...packageManifests(root), manifest.tag)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory] = process.argv.slice(2)
  if (command === "prepare" && !directory) prepare(fileURLToPath(new URL("../", import.meta.url)))
  else if (command === "verify" && directory) verify(resolve(directory))
  else throw new Error("Usage: node scripts/api-package-release.mjs prepare | verify DIRECTORY")
}
