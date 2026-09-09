import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { validatePullRequestVersion, validateReleaseVersion } from "./api-release-version.mjs"

const pair = (version = "0.1.0-rc.16") => [
  { name: "@clashking/api-contracts", version },
  { name: "@clashking/api-client", version, dependencies: { "@clashking/api-contracts": version } },
]

test("requires one exact semantic version across the release package pair", () => {
  assert.equal(validateReleaseVersion(...pair()), "0.1.0-rc.16")
  const mismatch = pair(); mismatch[1].version = "0.1.0-rc.12"
  assert.throws(() => validateReleaseVersion(...mismatch), /same valid semantic version/u)
  const dependency = pair(); dependency[1].dependencies["@clashking/api-contracts"] = "^0.1.0-rc.16"
  assert.throws(() => validateReleaseVersion(...dependency), /exact contracts version/u)
  assert.throws(() => validateReleaseVersion(...pair("next")), /semantic version/u)
})

test("blocks unchanged pull-request versions and versions whose tag already exists", () => {
  assert.equal(validatePullRequestVersion(pair("0.1.0-rc.16"), pair("0.1.0-rc.11"), false), "0.1.0-rc.16")
  assert.equal(validatePullRequestVersion(pair("0.1.0-rc.16"), undefined, false), "0.1.0-rc.16")
  assert.throws(() => validatePullRequestVersion(pair(), pair(), false), /must update/u)
  assert.throws(() => validatePullRequestVersion(pair(), pair("0.1.0-rc.11"), true), /already exists/u)
})

test("main release calls the immutable package workflow without recursive release events", () => {
  const release = readFileSync(new URL("../.github/workflows/release-api-version.yml", import.meta.url), "utf8")
  const packages = readFileSync(new URL("../.github/workflows/release-api-packages.yml", import.meta.url), "utf8")
  assert.match(release, /push:\s*\n\s*branches: \[main\]/u)
  assert.match(release, /uses: \.\/\.github\/workflows\/release-api-packages\.yml/u)
  assert.match(release, /gh release create/u)
  assert.match(release, /GH_TOKEN: \$\{\{ github\.token \}\}/u)
  assert.doesNotMatch(release, /workflow_dispatch|repository_dispatch|--force/u)
  assert.match(packages, /workflow_call:/u)
  assert.doesNotMatch(packages, /--clobber/u)
})
