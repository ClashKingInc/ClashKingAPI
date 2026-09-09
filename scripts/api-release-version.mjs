import { appendFileSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const semver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u
const manifests = ["packages/api-contracts/package.json", "packages/api-client/package.json"]
const json = value => JSON.parse(value)
const read = path => json(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))

export function validateReleaseVersion(contracts, client) {
  if (contracts.name !== "@clashking/api-contracts" || client.name !== "@clashking/api-client") {
    throw new Error("Unexpected API package names")
  }
  if (!semver.test(contracts.version) || client.version !== contracts.version) {
    throw new Error("API package versions must be the same valid semantic version")
  }
  if (client.dependencies?.[contracts.name] !== contracts.version) {
    throw new Error("API client must depend on the exact contracts version")
  }
  return contracts.version
}

export function validatePullRequestVersion(current, base, tagExists) {
  const version = validateReleaseVersion(...current)
  if (base !== undefined) {
    const baseVersion = validateReleaseVersion(...base)
    if (version === baseVersion) throw new Error("Pull requests must update the API package version")
  }
  if (tagExists) throw new Error(`Release tag v${version} already exists`)
  return version
}

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const current = () => manifests.map(read)
const atRef = ref => {
  const packages = manifests.map(path => {
    try { return json(git("show", `${ref}:${path}`)) }
    catch (error) {
      if (error?.status === 128 && /(?:does not exist|exists on disk, but not)/u.test(error.stderr ?? "")) return undefined
      throw error
    }
  })
  if (packages.every(value => value === undefined)) return undefined
  if (packages.some(value => value === undefined)) throw new Error("Base branch must contain both API package manifests or neither")
  return packages
}
const tagExists = tag => {
  try { git("show-ref", "--verify", "--quiet", `refs/tags/${tag}`); return true }
  catch (error) {
    if (error?.status === 1) return false
    throw error
  }
}

function output(version) {
  const releaseTag = `v${version}`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release_tag=${releaseTag}\n`)
  console.log(releaseTag)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, baseRef] = process.argv.slice(2)
  if (command === "current" && baseRef === undefined) output(validateReleaseVersion(...current()))
  else if (command === "check-pr" && baseRef) {
    const packages = current()
    const version = validateReleaseVersion(...packages)
    output(validatePullRequestVersion(packages, atRef(baseRef), tagExists(`v${version}`)))
  } else throw new Error("Usage: node scripts/api-release-version.mjs current | check-pr BASE_REF")
}
