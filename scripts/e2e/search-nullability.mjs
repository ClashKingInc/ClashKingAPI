// Exercise real workerd -> Elasticsearch HTTP search with stored nullable fields.
import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
const exec = promisify(execFile)
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, "1")
const database = new URL(process.env.TEST_DATABASE_URL ?? "")
assert.equal(database.hostname, "127.0.0.1")
assert.equal(database.pathname, "/clashking_test")
const dockerEndpoint = process.env.DOCKER_HOST ?? (await exec("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])).stdout.trim()
assert(dockerEndpoint.startsWith("unix://"), "Only the local Docker daemon may run this fixture")
const dockerEnv = { ...process.env, DOCKER_HOST: dockerEndpoint }; delete dockerEnv.DOCKER_CONTEXT
const docker = async args => (await exec("docker", args, { env: dockerEnv })).stdout.trim()
const runId = randomUUID(), schemaRoot = resolve(process.env.CLASHKING_E2E_SCHEMA_ROOT ?? ".ci-schema")
let container, api, logs = ""
try {
  container = await docker(["run", "--detach", "--label", `io.clashking.search-fixture=${runId}`, "--publish", "127.0.0.1::9200", "--memory", "1536m", "--cpus", "2", "--env", "discovery.type=single-node", "--env", "xpack.security.enabled=false", "--env", "ES_JAVA_OPTS=-Xms512m -Xmx512m", "docker.elastic.co/elasticsearch/elasticsearch:8.19.17"])
  assert.match(container, /^[a-f0-9]{64}$/u)
  const address = await docker(["port", container, "9200/tcp"])
  assert.match(address, /^127\.0\.0\.1:\d+$/u)
  const elasticsearch = `http://${address}`
  let ready = false
  for (let attempt=0;attempt<120;attempt++) {
    try { ready = (await fetch(`${elasticsearch}/_cluster/health`, { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
    await new Promise(r => setTimeout(r,500))
  }
  assert(ready, "Local Elasticsearch did not become ready")
  async function es(path, method, body) {
    const response = await fetch(`${elasticsearch}${path}`, { method, headers: {"content-type":"application/json"}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) })
    const value = await response.json(); assert(response.ok, JSON.stringify(value)); return value
  }
  for (const kind of ["players","clans"]) {
    const mapping = JSON.parse(await readFile(resolve(schemaRoot,`database/pgsync/indexes/clashking_${kind}_v2.json`),"utf8"))
    await es(`/clashking_${kind}`,"PUT",mapping)
  }
  for (const [tag,name,clan] of [["#PYP","NullPlayer One",null],["#PYQ","NullPlayer Two","#PQL"]]) {
    await es(`/clashking_players/_doc/${encodeURIComponent(tag)}?refresh=true`,"PUT",{tag,name,league_id:null,clan_tag:clan,townhall_level:17})
  }
  await es(`/clashking_clans/_doc/${encodeURIComponent("#PQL")}?refresh=true`,"PUT",{tag:"#PQL",name:"NullClan",clan_level:10,badge_token:"fixture",location_id:null,cwl_league_id:48000000,member_count:1})
  const port=8805, origin=`http://127.0.0.1:${port}`
  api=spawn(process.execPath,["scripts/start-local-rewrite-api.mjs"],{env:{...process.env,CLASHKING_LOCAL_ELASTICSEARCH_ORIGIN:elasticsearch,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ARCHIVE_BRIDGE:"0",CLASHKING_LOCAL_PRODUCTION_READS:"0",CLASHKING_LOCAL_DISCORD_CLIENT_ID:"999999999999999999",CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:"local-only",CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve("../clashking_assets/assets/static_data")},stdio:["ignore","pipe","pipe"]})
  api.stdout.on("data",d=>logs+=d);api.stderr.on("data",d=>logs+=d)
  ready=false
  for(let i=0;i<120;i++) {
    assert.equal(api.exitCode,null,logs.slice(-2000))
    try { ready=(await fetch(`${origin}/v2/health`,{signal:AbortSignal.timeout(1000)})).ok&&logs.includes("isolated_api_ready") } catch {}
    if(ready)break
    await new Promise(r=>setTimeout(r,500))
  }
  assert(ready,logs.slice(-2000))
  async function search(path) {
    const response=await fetch(origin+path),body=await response.json()
    assert.equal(response.status,200,JSON.stringify(body));return body
  }
  const players=await search("/v2/player/search?query=NullPlayer")
  assert.equal(players.items.length,2)
  const clanless=players.items.find(p=>p.tag==="#PYP"),member=players.items.find(p=>p.tag==="#PYQ")
  assert.equal(clanless.clan,undefined);assert.equal(clanless.leagueTier,undefined)
  assert.equal(member.clan.name,"NullClan");assert.equal(member.leagueTier,undefined)
  const first=await search("/v2/player/search?query=NullPlayer&limit=1")
  assert(first.pagination.hasMore)
  const second=await search(`/v2/player/search?query=NullPlayer&limit=1&cursor=${encodeURIComponent(first.pagination.nextCursor)}`)
  assert.equal(second.items.length,1);assert.notEqual(first.items[0].tag,second.items[0].tag)
  const clans=await search("/v2/clan/search?query=NullClan")
  assert.equal(clans.items.length,1);assert.equal(clans.items[0].location,undefined)
  console.log("PASS real workerd/Elasticsearch: nullable clan, league and location; clan enrichment; cursor pagination")
} catch (error) {
  console.error(logs.slice(-6000))
  throw error
} finally {
  if(api && api.exitCode===null) {
    api.kill("SIGTERM")
    for(let i=0;i<50&&api.exitCode===null;i++)await new Promise(r=>setTimeout(r,100))
    if(api.exitCode===null)api.kill("SIGKILL")
  }
  if(container) {
    assert.equal(await docker(["inspect","--format",'{{index .Config.Labels "io.clashking.search-fixture"}}',container]),runId)
    await docker(["rm","--force","--volumes",container])
  }
}
