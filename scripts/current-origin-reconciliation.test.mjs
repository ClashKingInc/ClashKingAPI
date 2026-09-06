import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { test } from "node:test"

const cwd = resolve(import.meta.dirname, "..")
const original = "90436aa042aa85ab1112ea12f3490787e2104b51"
const remote = "cf7371e4a32b4a37afd7c80ff83c72ef29b425e4"
const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" })
test("fresh remote main differs from the accepted original only by the recorded Capital Gold feature", () => {
  const paths = git("diff", "--name-only", original, remote).trim().split("\n")
  assert.deepEqual(paths, [
    "internal/docs/docs.go", "internal/models/v2/clan.go", "internal/models/v2/public_stats.go",
    "internal/routes/capital_gold_total_test.go", "internal/routes/clan_history_contract_test.go",
    "internal/routes/legacy_clan.go", "internal/routes/public_stats.go", "internal/routes/register.go",
    "internal/swaggerdocs/openapi.json", "internal/swaggerdocs/openapi.scalar.json", "internal/swaggerdocs/openapi.yaml",
    "internal/utils/store.go", "internal/utils/store_test.go", "test/api/swagger_test.go",
  ])
  const source = git("show", `${remote}:internal/routes/register.go`)
  assert.equal(createHash("sha256").update(source).digest("hex"), "5a0d0244ed8a85413286cafeebe01db34309f19160632761179e255a45856fc7")
  const accepted = git("show", `${original}:internal/routes/register.go`)
  assert.equal(accepted.replace(/^\s*app.Get\("\/v2\/leaderboard\/:location_id\/clan\/capital-gold", leaderboardClanCapitalGold\(a\)\)\n/mu, ""), source)
})
