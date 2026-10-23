import { loadLocalApiSecrets } from "./local-api-keychain.mjs"

const origin = process.env.CLASHKING_LOCAL_API_ORIGIN ?? "http://127.0.0.1:8787"
const parsedOrigin = new URL(origin)
if (!(["127.0.0.1", "localhost"].includes(parsedOrigin.hostname)) || parsedOrigin.protocol !== "http:") {
  throw new Error("Local roster smoke test requires a loopback HTTP API")
}
const syntheticServerId = "999999999999999001"
const userId = process.env.CLASHKING_LOCAL_ROSTER_USER_ID ?? "706149153431879760"
const serverId = process.env.CLASHKING_LOCAL_ROSTER_SERVER_ID ?? syntheticServerId
const clanTag = process.env.CLASHKING_LOCAL_ROSTER_CLAN_TAG ?? "#P0Y"
const playerTag = process.env.CLASHKING_LOCAL_ROSTER_PLAYER_TAG ?? "#P0YJ"
const token = loadLocalApiSecrets().API_BOT_TOKEN
const request = async (path, { method = "GET", body, expected = 200 } = {}) => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value = await response.json().catch(() => undefined)
  if (response.status !== expected) throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(value)}`)
  return value
}

const health = await request("/v2/health")
const links = await request(`/v2/links/${userId}`)
let listed = await request(`/v2/server/${serverId}/rosters`)
let roster = listed.items?.find((item) => item.alias === "Local roster smoke")
if (roster === undefined) {
  const created = await request(`/v2/roster?server_id=${serverId}`, { method: "POST", expected: 201, body: {
    alias: "Local roster smoke", roster_type: "clan", signup_scope: "clan-only", clan_tag: clanTag, members: [],
  } })
  roster = created.roster
  listed = await request(`/v2/server/${serverId}/rosters`)
}
const rosterId = roster.id
const detail = await request(`/v2/server/${serverId}/rosters/${rosterId}`)
const submissionPath = `/v2/server/${serverId}/rosters/${rosterId}/submissions`
const submissionResponse = await fetch(`${origin}${submissionPath}`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ playerTag, answers: {}, discordUserId: userId, discordUsername: "Local Tester" }),
})
const signup = await submissionResponse.json().catch(() => undefined)
if (submissionResponse.status === 403 && serverId === syntheticServerId) {
  console.log(JSON.stringify({ event: "local_roster_smoke_reached_discord_boundary", healthVersion: health.version,
    linkedPlayerTags: links.items.map((item) => item.player_tag), serverId, rosterId,
    rosterCount: listed.items.length, detailAlias: detail.roster.alias, submissionStatus: 403 }))
  process.exit(0)
}
if (submissionResponse.status !== 201) throw new Error(`POST ${submissionPath} returned ${submissionResponse.status}: ${JSON.stringify(signup)}`)

console.log(JSON.stringify({ event: "local_roster_smoke_passed", healthVersion: health.version,
  linkedPlayerTags: links.items.map((item) => item.player_tag), serverId, rosterId,
  rosterCount: listed.items.length, detailAlias: detail.roster.alias, submissionId: signup.submission.id }))
