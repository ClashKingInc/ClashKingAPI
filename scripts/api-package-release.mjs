import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const packageNames = ["@clashking/api-contracts", "@clashking/api-client"]
const registry = "https://registry.npmjs.org"
const readJson = path => JSON.parse(readFileSync(path, "utf8"))
const digest = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding)

export function validatePair(contracts, client, ref) {
  if (contracts.name !== packageNames[0] || client.name !== packageNames[1]) throw new Error("Unexpected API package names")
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-rc\.(?:0|[1-9]\d*)$/u.test(contracts.version) || client.version !== contracts.version) {
    throw new Error("API packages must have the same exact RC version")
  }
  if (client.dependencies?.[contracts.name] !== contracts.version) throw new Error("Client must depend on the exact contracts version")
  if (!/^\d+\.\d+\.\d+-rc\.\d+$/u.test(contracts.dependencies?.effect ?? "")) throw new Error("Effect must use an exact RC version")
  for (const pkg of [contracts, client]) {
    if (pkg.private || pkg.publishConfig?.access !== "public" || pkg.publishConfig?.registry !== `${registry}/`) {
      throw new Error("API package publication configuration differs from the reviewed registry/access")
    }
    if (pkg.publishConfig?.provenance !== true || pkg.repository?.type !== "git"
      || pkg.repository?.url !== "git+https://github.com/ClashKingInc/ClashKingAPI.git"
      || pkg.repository?.directory !== `packages/${pkg.name.split("/")[1]}`) {
      throw new Error("API package provenance requires the exact reviewed repository and workspace directory")
    }
    if (pkg.dependencies?.effect !== contracts.dependencies?.effect || pkg.peerDependencies?.effect !== contracts.dependencies?.effect) {
      throw new Error("API package Effect versions must agree exactly")
    }
  }
  if (ref !== `refs/tags/api-packages-v${contracts.version}`) throw new Error("Publish only from the matching api-packages version tag")
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
      throw new Error(`Unexpected published file: ${path}`)
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

export async function registryAction(artifact, fetcher = fetch) {
  const response = await fetcher(`${registry}/${encodeURIComponent(artifact.name)}/${encodeURIComponent(artifact.version)}`, {
    redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" },
  })
  if (response.status === 404) return "publish"
  if (!response.ok) throw new Error(`Registry check failed (${response.status}); refusing to assume the version is absent`)
  const metadata = await response.json()
  if (metadata.name !== artifact.name || metadata.version !== artifact.version || metadata.dist?.integrity !== artifact.integrity) {
    throw new Error(`Registry has different bytes for ${artifact.name}@${artifact.version}; never overwrite or skip this conflict`)
  }
  return "already-published"
}

export function parsePackOutput(output, expectedName) {
  const parsed = JSON.parse(output)
  // npm 12 keys workspace output by package name; earlier npm emits an array.
  // Either representation must describe exactly the requested workspace.
  const result = Array.isArray(parsed) && parsed.length === 1 ? parsed[0]
    : parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      && Object.keys(parsed).length === 1 && Object.hasOwn(parsed, expectedName) ? parsed[expectedName] : undefined
  if (result === null || typeof result !== "object" || Array.isArray(result) || result.name !== expectedName) {
    throw new Error("Expected exactly one packed result for the requested workspace")
  }
  return result
}

function prepare(root) {
  const packages = ["api-contracts", "api-client"].map(name => readJson(join(root, "packages", name, "package.json")))
  const version = validatePair(...packages, process.env.GITHUB_REF)
  // Complete both builds before any registry mutation. npm pack cannot run lifecycle scripts.
  for (const pkg of packages) execFileSync("npm", ["run", "build", "--workspace", pkg.name], { cwd: root, stdio: "inherit" })
  const directory = mkdtempSync(join(tmpdir(), "clashking-api-release-"))
  const artifacts = packages.map(pkg => {
    const output = execFileSync("npm", ["pack", "--workspace", pkg.name, "--ignore-scripts", "--json", "--pack-destination", directory], { cwd: root, encoding: "utf8" })
    const result = parsePackOutput(output, pkg.name)
    if (typeof result.filename !== "string" || basename(result.filename) !== result.filename) throw new Error("Unsafe packed filename")
    return validatePack(pkg, result, readFileSync(join(directory, result.filename)))
  })
  writeFileSync(join(directory, "manifest.json"), `${JSON.stringify({ version, ref: process.env.GITHUB_REF, commit: process.env.GITHUB_SHA, artifacts }, null, 2)}\n`, { flag: "wx" })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `directory=${directory}\n`)
  console.log(JSON.stringify({ directory, version, artifacts }, null, 2))
}

export async function check(directory, { ref = process.env.GITHUB_REF, commit = process.env.GITHUB_SHA,
  output = process.env.GITHUB_OUTPUT, fetcher = fetch, requirePublished = false } = {}) {
  const manifest = readJson(join(directory, "manifest.json"))
  if (manifest.ref !== ref || manifest.commit !== commit || !/^[0-9a-f]{40}$/u.test(commit ?? "") || ref !== `refs/tags/api-packages-v${manifest.version}`) {
    throw new Error("Release artifact source does not match this workflow")
  }
  if (manifest.artifacts?.length !== 2 || manifest.artifacts.some((item, i) => item.name !== packageNames[i] || item.version !== manifest.version)) {
    throw new Error("Release manifest does not contain the matching package pair")
  }
  const outputs = []
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (!/^[a-z0-9.-]+\.tgz$/u.test(artifact.filename)) throw new Error("Unsafe artifact filename")
    const bytes = readFileSync(join(directory, artifact.filename))
    if (`sha512-${digest(bytes, "sha512", "base64")}` !== artifact.integrity || digest(bytes, "sha256", "hex") !== artifact.sha256) {
      throw new Error("Release artifact bytes changed after packing")
    }
    const action = await registryAction(artifact, fetcher)
    if (requirePublished && action !== "already-published") throw new Error(`Published package is missing: ${artifact.name}`)
    outputs.push(`${index === 0 ? "contracts" : "client"}=${action === "publish" ? join(directory, artifact.filename) : ""}`)
    console.log(`${artifact.name}@${artifact.version}: ${action}`)
  }
  // Emit nothing until BOTH registry checks have succeeded.
  if (output) appendFileSync(output, `${outputs.join("\n")}\n`)
  return outputs
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory] = process.argv.slice(2)
  if (command === "prepare" && !directory) prepare(fileURLToPath(new URL("../", import.meta.url)))
  else if (command === "check" && directory) await check(resolve(directory))
  else if (command === "verify" && directory) await check(resolve(directory), { requirePublished: true })
  else throw new Error("Usage: node scripts/api-package-release.mjs prepare | check DIRECTORY | verify DIRECTORY")
}
