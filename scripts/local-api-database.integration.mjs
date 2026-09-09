// Explicit integration command, deliberately excluded from the unit-test glob.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import pg from "pg"

if (process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the disposable schema harness")
const sourceUrl = new URL(process.env.TEST_DATABASE_URL ?? "")
if (sourceUrl.hostname !== "127.0.0.1" || sourceUrl.pathname !== "/clashking_test" || sourceUrl.username !== "clashking_test") throw new Error("Expected a disposable loopback source")
const name = "clashking-rewrite-api-persistence-validation", volume = `${name}-data`
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
if (docker("ps", "-aq", "--filter", `name=^/${name}$`) || docker("volume", "ls", "-q", "--filter", `name=^${volume}$`)) throw new Error("Validation target already exists; refusing to touch it")
const candidates = docker("ps", "-q", "--filter", "label=io.clashking.fixture=timescale").split("\n").filter(Boolean)
const source = candidates.find((id) => JSON.parse(docker("inspect", id))[0].NetworkSettings.Ports["5432/tcp"].some((port) => port.HostIp === "127.0.0.1" && port.HostPort === sourceUrl.port))
assert.ok(source)
const environment = { ...process.env, CLASHKING_LOCAL_DB_CONTAINER: name, CLASHKING_LOCAL_DB_PORT: "54330" }
const command = (...args) => execFileSync(process.execPath, ["scripts/local-api-database.mjs", ...args], { env: environment, stdio: "inherit" })
const query = async (url, sql) => {
  const client = new pg.Client({ connectionString: url })
  try { await client.connect(); return (await client.query(sql)).rows }
  finally { await client.end() }
}
const target = "postgres://clashking_local:clashking_local@127.0.0.1:54330/clashking_dev?sslmode=disable"
let owned = false
try {
  command("up"); owned = true
  await query(sourceUrl.href, "INSERT INTO servers(id,name) VALUES('810000000000000001','persistent-dev-fixture')")
  await query(sourceUrl.href, "INSERT INTO auth_users(user_id,provider) VALUES('810000000000000002','discord')")
  await query(sourceUrl.href, "INSERT INTO auth_discord_tokens(user_id,device_id,access_token_ciphertext,refresh_token_ciphertext) VALUES('810000000000000002','fixture-device','test-only-unrecoverable','test-only-unrecoverable')")
  command("copy-from", source)
  assert.equal((await query(target, "SELECT name FROM servers WHERE id='810000000000000001'"))[0].name, "persistent-dev-fixture")
  assert.equal((await query(target, "SELECT count(*)::int AS count FROM auth_users WHERE user_id='810000000000000002'"))[0].count, 1)
  assert.equal((await query(target, "SELECT count(*)::int AS count FROM auth_discord_tokens"))[0].count, 0)
  assert.equal((await query(sourceUrl.href, "SELECT count(*)::int AS count FROM auth_discord_tokens"))[0].count, 1)
  docker("restart", name); command("up")
  command("migrate"); command("migrate")
  assert.equal((await query(target, "SELECT name FROM servers WHERE id='810000000000000001'"))[0].name, "persistent-dev-fixture")
  assert.equal(Number((await query(target, "SELECT max(version_id) AS version FROM goose_db_version WHERE is_applied"))[0].version), 28)
  console.log(JSON.stringify({ event: "persistent_copy_restart_migrations_verified", recordsPreserved: true, sourceAuthUntouched: true, copiedTokensCleared: true, version: 28 }))
} finally {
  if (owned) { docker("rm", "--force", name); docker("volume", "rm", volume) }
}
