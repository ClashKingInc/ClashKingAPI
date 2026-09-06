import { execFileSync, spawn } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { pipeline } from "node:stream/promises"
import pg from "pg"
import { loadLocalApiSecrets } from "./local-api-keychain.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const schema = fileURLToPath(new URL("../../clashking_schemas/", import.meta.url))
const name = process.env.CLASHKING_LOCAL_DB_CONTAINER ?? "clashking-rewrite-api-dev"
const port = Number(process.env.CLASHKING_LOCAL_DB_PORT ?? "54329")
if (!/^clashking-rewrite-api-[a-z0-9-]+$/u.test(name) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local database name/port")
const volume = `${name}-data`
const label = "io.clashking.local=retained-api-persistent-v1"
const databaseName = "clashking_dev"
const importName = "clashking_import_pending"
// Public, loopback-only development credentials. These are not provider secrets.
const username = "clashking_local"
const connection = (database = databaseName) => `postgres://${username}:${username}@127.0.0.1:${port}/${database}?sslmode=disable`
const output = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim()
const docker = (...args) => output("docker", args)
const endpoint = process.env.DOCKER_HOST ?? output("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
if (!endpoint.startsWith("unix://") || process.env.DOCKER_HOST && process.env.DOCKER_CONTEXT) throw new Error("Only an unambiguous local Unix-socket Docker context is allowed")
process.env.DOCKER_HOST = endpoint
delete process.env.DOCKER_CONTEXT
const [image, ...migrations] = output("bash", ["-c", 'source "$1"; printf "%s\\n" "$fixture_image" "${fixture_sources[@]}"', "local-profile", join(schema, "scripts/retained-api-profile.sh")]).split("\n")
if (!image?.includes("@sha256:") || migrations.at(-1) !== "028_discord_coordination.sql") throw new Error("Unexpected authoritative retained API profile")

function inspect() {
  const ids = docker("ps", "-aq", "--filter", `name=^/${name}$`)
  if (!ids) return undefined
  const item = JSON.parse(docker("inspect", name))[0]
  if (item.Config.Labels?.["io.clashking.local"] !== "retained-api-persistent-v1" || item.Config.Image !== image ||
      !item.Mounts.some((mount) => mount.Type === "volume" && mount.Name === volume && mount.Destination === "/var/lib/postgresql")) {
    throw new Error("Existing container does not match the owned persistent development database")
  }
  const ports = item.HostConfig.PortBindings?.["5432/tcp"]
  if (ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== String(port)) throw new Error("Existing database port is not the expected loopback binding")
  return item
}

async function ensure() {
  let item = inspect()
  if (item === undefined) {
    const volumes = docker("volume", "ls", "-q", "--filter", `name=^${volume}$`)
    if (volumes) {
      const existing = JSON.parse(docker("volume", "inspect", volume))[0]
      if (existing.Labels?.["io.clashking.local"] !== "retained-api-persistent-v1") throw new Error("Refusing an unowned existing volume")
    } else docker("volume", "create", "--label", label, volume)
    docker("run", "--detach", "--name", name, "--label", label, "--restart", "unless-stopped",
      "--mount", `type=volume,source=${volume},destination=/var/lib/postgresql`, "--publish", `127.0.0.1:${port}:5432`,
      "--env", `POSTGRES_USER=${username}`, "--env", `POSTGRES_PASSWORD=${username}`, "--env", "POSTGRES_DB=postgres", image)
    item = inspect()
  } else if (!item.State.Running) docker("start", name)
  for (let i = 0; i < 60; i++) {
    try { docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", username, "-d", "postgres"); return }
    catch { await new Promise((resolve) => setTimeout(resolve, 500)) }
  }
  throw new Error("Persistent local database did not become ready; its volume was retained")
}

async function query(database, text, values) {
  const client = new pg.Client({ connectionString: connection(database) })
  try { await client.connect(); return await client.query(text, values) }
  finally { await client.end() }
}
async function exists(database = databaseName) {
  return (await query("postgres", "SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount > 0
}
async function migrate(database = databaseName) {
  await ensure()
  if (database === databaseName && await exists(importName)) throw new Error("An unfinished local import exists; inspect it before starting a new database")
  if (!(await exists(database))) docker("exec", name, "createdb", "-U", username, database)
  const directory = mkdtempSync(join(tmpdir(), "clashking-interactive-migrations-"))
  try {
    for (const file of migrations) cpSync(join(schema, "database/timescale", file), join(directory, file))
    const environment = { ...process.env }
    for (const key of ["GOOSE_DBSTRING", "GOOSE_DRIVER", "GOOSE_MIGRATION_DIR", "GOOSE_TABLE", "ADMIN_OWNER_BOOTSTRAP_B64"]) delete environment[key]
    execFileSync("goose", ["-env", "/dev/null", "-dir", directory, "validate"], { stdio: "inherit", env: environment })
    execFileSync("goose", ["-env", "/dev/null", "-dir", directory, "postgres", connection(database), "up"], { stdio: "inherit", env: environment })
  } finally {
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file))
    rmdirSync(directory)
  }
}

async function copyFrom(source) {
  if (!/^[a-f0-9]{12,64}$/u.test(source ?? "")) throw new Error("Provide the exact disposable source container ID")
  const original = JSON.parse(docker("inspect", source))[0]
  const sourcePorts = original.HostConfig.PortBindings?.["5432/tcp"]
  if (original.Config.Labels?.["io.clashking.fixture"] !== "timescale" || original.Config.Image !== image || !original.State.Running ||
      !original.Mounts.some((mount) => mount.Type === "tmpfs" && mount.Destination === "/var/lib/postgresql") ||
      sourcePorts?.length !== 1 || sourcePorts[0].HostIp !== "127.0.0.1") throw new Error("Source is not the expected local disposable Timescale fixture")
  await ensure()
  if (await exists()) throw new Error("Target development database already exists; refusing to replace any data")
  if (await exists(importName)) throw new Error("An unfinished local import already exists; source is untouched and retry will not overwrite it")
  // Keep source and all source records untouched. The destination is initially empty.
  docker("exec", name, "createdb", "-U", username, importName)
  await query(importName, "CREATE EXTENSION IF NOT EXISTS timescaledb")
  await query(importName, "SELECT timescaledb_pre_restore()")
  // Timescale stores job owners as regrole values inside table data, which
  // --no-owner cannot remap. Supply a non-login role during restore, then
  // reassign only the restored jobs to the destination owner before resuming.
  await query("postgres", "CREATE ROLE clashking_test NOLOGIN")
  const dump = spawn("docker", ["exec", source, "pg_dump", "-U", "clashking_test", "-d", "clashking_test", "--format=custom", "--no-owner", "--no-acl"], { stdio: ["ignore", "pipe", "pipe"] })
  const restore = spawn("docker", ["exec", "-i", name, "pg_restore", "-U", username, "-d", importName, "--no-owner", "--no-acl", "--exit-on-error"], { stdio: ["pipe", "ignore", "pipe"] })
  // Suppress dump/restore diagnostics: they can contain user values. Fail clearly
  // without printing database contents or writing a backup file.
  dump.stderr.resume(); restore.stderr.resume()
  const done = (child) => new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Local database transfer failed; source untouched, destination retained for inspection"))) })
  await Promise.all([pipeline(dump.stdout, restore.stdin), done(dump), done(restore)])
  await query(importName, "UPDATE _timescaledb_config.bgw_job SET owner='clashking_local'::regrole WHERE owner='clashking_test'::regrole")
  await query("postgres", "DROP ROLE clashking_test")
  await query(importName, "SELECT timescaledb_post_restore()")
  await migrate(importName)
  const emailUsers = Number((await query(importName, "SELECT count(*) AS count FROM auth_users WHERE provider='email'")).rows[0].count)
  // Current throw-away keys are unrecoverable. Preserve auth_users and all
  // business data, clearing only unusable local credentials in the new copy.
  const client = new pg.Client({ connectionString: connection(importName) })
  try {
    await client.connect(); await client.query("BEGIN")
    for (const table of ["auth_discord_tokens", "auth_refresh_tokens", "auth_email_verifications", "auth_password_reset_tokens"]) await client.query(`DELETE FROM ${table}`)
    await client.query("UPDATE mobile_push_devices SET token_ciphertext='', enabled=false")
    await client.query("COMMIT")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { await client.end() }
  await query("postgres", `ALTER DATABASE ${importName} RENAME TO ${databaseName}`)
  console.log(JSON.stringify({ event: "local_database_copied", source, target: name, auth: "one-time sign-in required", emailAccountsNeedingOriginalPepper: emailUsers }))
}

async function runApi() {
  await migrate()
  const secrets = loadLocalApiSecrets()
  const environment = { ...process.env, CLASHKING_PERSISTENT_LOCAL_API: "1", CLASHKING_LOCAL_DATABASE_URL: connection(),
    ...Object.fromEntries(Object.entries(secrets).map(([key, value]) => [`CLASHKING_LOCAL_${key}`, value])) }
  delete environment.CLASHKING_DISPOSABLE_TIMESCALE
  delete environment.TEST_DATABASE_URL
  const child = spawn(process.execPath, [join(root, "scripts/start-local-rewrite-api.mjs")], { stdio: "inherit", env: environment, cwd: root })
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal))
  child.once("exit", (code) => process.exit(code ?? 1))
}

async function verifyRestart() {
  await ensure()
  if (await exists() || await exists(importName)) throw new Error("Run restart validation on a new verification container, not an interactive database or pending import")
  const check = "clashking_persistence_check"
  if (!(await exists(check))) docker("exec", name, "createdb", "-U", username, check)
  await query(check, "CREATE TABLE IF NOT EXISTS restart_check (id text PRIMARY KEY)")
  const id = randomUUID()
  await query(check, "INSERT INTO restart_check(id) VALUES($1)", [id])
  docker("restart", name)
  await ensure()
  const persisted = (await query(check, "SELECT 1 FROM restart_check WHERE id=$1", [id])).rowCount === 1
  if (!persisted) throw new Error("Persistence check failed")
  console.log(JSON.stringify({ event: "persistent_restart_verified", container: name, volume, port, survived: true }))
}

const action = process.argv[2]
if (action === "up") await ensure()
else if (action === "migrate") await migrate()
else if (action === "run") await runApi()
else if (action === "copy-from") await copyFrom(process.argv[3])
else if (action === "verify-restart") await verifyRestart()
else if (action === "status") console.log(JSON.stringify({ container: name, volume, port, running: inspect()?.State.Running ?? false }))
else throw new Error("Usage: node scripts/local-api-database.mjs up|status|migrate|run|copy-from SOURCE_CONTAINER_ID|verify-restart")
