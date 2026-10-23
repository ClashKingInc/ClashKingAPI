import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { ServerAuthorization } from "./server-authorization.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { readDashboardMultipart } from "./dashboard-upload.js"
import { competitiveStandings, generateCompetitiveRound, type CompetitiveMatch } from "./competitive-engine.js"
import { competitiveAttacks, runCompetitiveWarSync, storeCompetitiveObservation } from "./competitive-war.js"
import { competitiveElo } from "./competitive-elo.js"

const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } })
const body = <A>(request: Request, schema: Schema.Codec<A, unknown, never, never>) => readBoundedJson(request, 32_768).pipe(Effect.flatMap(value=>Schema.decodeUnknownEffect(schema)(value,{onExcessProperty:"error"})), Effect.mapError(() => new InvalidRequest({ message: "Invalid competitive request" })))
const Size = Schema.Literals([2, 3, 5, 10])
const Format = Schema.Literals(["single_elimination", "double_elimination", "round_robin", "swiss", "elo"])
const Status = Schema.Literals(["draft", "registration", "active", "completed", "cancelled"])
const permissions = ["teams", "tournaments", "participants", "matches", "scores", "penalties", "permissions"] as const
const Permission = Schema.Literals(permissions)
const Penalty = Schema.Struct({homeDeduction:Schema.Number,awayDeduction:Schema.Number,reason:Schema.String})
const optionalString = Schema.optionalKey(Schema.String)
const Rules = Schema.Union([Schema.String,Schema.Struct({description:optionalString,minTownHall:Schema.optionalKey(Schema.Int),maxTownHall:Schema.optionalKey(Schema.Int),maxRosterSize:Schema.optionalKey(Schema.Int),prizeDescription:optionalString,rulebookUrl:optionalString,visibility:Schema.optionalKey(Schema.Literals(['public','unlisted']))})])
const normalizeRules = (rules:typeof Rules.Type|undefined,size:number) => {
  const data=typeof rules==="string"?{description:rules}:rules??{}
  const min=data.minTownHall??1,max=data.maxTownHall??30
  const prizeDescription=data.prizeDescription?.trim(),rulebookUrl=data.rulebookUrl?.trim()
  let validUrl=true
  if(rulebookUrl){try{const url=new URL(rulebookUrl);validUrl=url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password&&rulebookUrl.length<=2048}catch{validUrl=false}}
  const metadata={...(prizeDescription?{prizeDescription}:{}),...(rulebookUrl?{rulebookUrl}:{}),visibility:data.visibility??'public'}
  return {description:data.description??"",min,max,metadata,valid:min>=1&&max<=30&&min<=max&&(data.maxRosterSize===undefined||data.maxRosterSize===size)&&(prizeDescription?.length??0)<=1000&&validUrl}
}
const cache = new Map<string, { until: number; value: unknown; fetchedAt: string }>()
const ccnPending = new Map<string, Promise<{ value: unknown; fetchedAt: string }>>()
const ccnResources: Record<string, { path: string; query?: Record<string, string> }> = {
  events: { path: "/worlds/events" }, divisions: { path: "/worlds/events/{eventId}/divisions" }, segments: { path: "/worlds/events/{eventId}/segments" },
  teams: { path: "/worlds/events/segments/{segmentId}/teams" }, standings: { path: "/worlds/events/segments/{segmentId}/standings" }, records: { path: "/worlds/events/segments/{segmentId}/records" },
  leaderboard: { path: "/worlds/leaderboard", query: { segmentId: "segment_id" } }, player: { path: "/players/basicinfo", query: { playerTag: "player" } },
  clan: { path: "/clans/info", query: { clanTag: "clan" } }, team: { path: "/teams/basicinfo", query: { teamId: "team_id" } },
  "team-search": { path: "/teams/search", query: { search: "search_str" } }, "team-matches": { path: "/teams/matches", query: { teamId: "team_id" } },
  "team-upcoming": { path: "/teams/upcoming_matches", query: { teamId: "team_id" } }, "clan-matches": { path: "/clans/matches", query: { clanTag: "clantag" } },
}
const ccn = (request: Request, resource: string) => Effect.gen(function* () {
  if (resource === "elo" || resource === "elo-matches" || resource === "elo-team") return yield* competitiveElo(request, resource)
  if (request.method !== "GET") return yield* new InvalidRequest({ message: "GET required" })
  const config = ccnResources[resource]
  if (!config) return yield* new NotFound({ message: "Unknown public CCN resource" })
  const input = new URL(request.url), target = new URL(config.path.replace(/\{(\w+)\}/gu, (_, key: string) => encodeURIComponent(input.searchParams.get(key) ?? "")), "https://api.competitiveclash.network")
  for (const key of [...config.path.matchAll(/\{(\w+)\}/gu)].map(match => match[1]!)) if (!/^\d+$/u.test(input.searchParams.get(key) ?? "")) return yield* new InvalidRequest({ message: `${key} must be a positive integer` })
  for (const [key, upstream] of Object.entries(config.query ?? {})) {
    const value = input.searchParams.get(key)?.trim()
    if (!value || value.length > 100) return yield* new InvalidRequest({ message: `${key} is required` })
    target.searchParams.set(upstream, value)
  }
  // CCN omits broadcast metadata by default. Request it for every upcoming
  // team view as well as the aggregated feed; completed matches lack this field.
  if (resource === "team-upcoming") target.searchParams.set("include_streams", "true")
  // Only this fixed allowlist reaches CCN. Never forward caller credentials,
  // arbitrary upstream paths, linkage operations, tokens or auth parameters.
  const key = target.toString(), stored = cache.get(key)
  if (stored && stored.until > Date.now()) return json({ source: "ccn", fetchedAt: stored.fetchedAt, data: stored.value })
  const { value, fetchedAt } = yield* Effect.tryPromise({ try: async () => {
    let pending = ccnPending.get(key)
    if (!pending) {
      pending = (async () => {
        // Full ladder standings contain thousands of rows and CCN can spend
        // over 15 seconds producing them. Keep the larger budget specific to
        // historical standings/records so basic discovery still fails fast.
        const timeout = resource === "standings" || resource === "records" ? 30_000 : 10_000
        const response = await fetch(target, { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } })
        // A provider 404 is absence, not a successful cache entry. Transient
        // provider failures must remain retryable instead of hiding fresh data.
        if (response.status === 404) return { value: null, fetchedAt: new Date().toISOString() }
        if (!response.ok) throw new Error(`CCN HTTP ${response.status}`)
        const value: unknown = await response.json(), fetchedAt = new Date().toISOString()
        if (cache.size >= 500) cache.delete(cache.keys().next().value!)
        cache.set(key, { until: Date.now() + 60_000, value, fetchedAt })
        return { value, fetchedAt }
      })()
      ccnPending.set(key, pending)
      void pending.finally(() => ccnPending.delete(key)).catch(() => {})
    }
    return pending
  }, catch: cause => new UpstreamUnavailable({ cause, message: "CCN is temporarily unavailable" }) })
  return json({ source: "ccn", fetchedAt, data: value })
})

const tournamentSelect = `SELECT id::text,server_id AS "serverId",name,format,team_size::int AS "teamSize",starts_at AS "startsAt",ends_at AS "endsAt",status,jsonb_build_object('description',rules,'minTownHall',min_town_hall,'maxTownHall',max_town_hall,'maxRosterSize',team_size,'visibility','public') || rules_metadata AS rules FROM competitive_tournaments`
const matchSelect=`SELECT id::text,round,home_team_id::text AS "homeTeamId",away_team_id::text AS "awayTeamId",war_id AS "warId",home_score::float8 AS "rawHomeScore",away_score::float8 AS "rawAwayScore",CASE WHEN home_score IS NULL THEN NULL ELSE GREATEST(0,home_score-COALESCE((penalty->>'homeDeduction')::numeric,0)) END::float8 AS "homeScore",CASE WHEN away_score IS NULL THEN NULL ELSE GREATEST(0,away_score-COALESCE((penalty->>'awayDeduction')::numeric,0)) END::float8 AS "awayScore",penalty,status FROM competitive_matches`
const eligibleRoster = (tournamentId:string,teamId:string) => Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  if(!(yield* sql`SELECT 1 FROM competitive_teams t JOIN server_clan_verifications v ON v.server_id=t.server_id AND v.clan_tag=t.clan_tag AND v.state='verified' WHERE t.id=${teamId}::uuid AND NOT t.archived`).length)return yield* new InvalidRequest({message:"The team's clan must remain verified on its server"})
  // A clan can keep multiple persistent teams across events. One event accepts
  // one team per clan because an official war cannot pair a clan against itself.
  if((yield* sql`SELECT 1 FROM competitive_participants p JOIN competitive_teams entered ON entered.id=p.team_id JOIN competitive_teams candidate ON candidate.id=${teamId}::uuid WHERE p.tournament_id=${tournamentId}::uuid AND p.withdrawn_at IS NULL AND p.team_id<>candidate.id AND entered.clan_tag=candidate.clan_tag LIMIT 1`).length)return yield* new InvalidRequest({message:"Only one active team from the same clan can enter a tournament"})
  const tournament=(yield* sql<{team_size:number;min_town_hall:number;max_town_hall:number}>`SELECT team_size,min_town_hall,max_town_hall FROM competitive_tournaments WHERE id=${tournamentId}::uuid`)[0]!
  const roster=yield* sql<{playerTag:string;userId:string;name:string;townHallLevel:number}>`SELECT m.player_tag AS "playerTag",m.user_id AS "userId",p.name,p.townhall_level AS "townHallLevel" FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id AND l.is_verified JOIN basic_player p ON p.tag=m.player_tag WHERE m.team_id=${teamId}::uuid AND m.left_at IS NULL AND m.accepted_at IS NOT NULL ORDER BY m.joined_at`
  if(roster.length!==tournament.team_size||roster.some(player=>player.townHallLevel<tournament.min_town_hall||player.townHallLevel>tournament.max_town_hall))return yield* new InvalidRequest({message:"A full accepted verified roster within the tournament town hall range is required"})
  const duplicates=yield* sql`SELECT 1 FROM competitive_participants p CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry WHERE p.tournament_id=${tournamentId}::uuid AND p.team_id<>${teamId}::uuid AND p.withdrawn_at IS NULL AND entry->>'playerTag'=ANY(${roster.map(row=>row.playerTag)}::text[]) LIMIT 1`
  if(duplicates.length)return yield* new InvalidRequest({message:"A player cannot represent two teams in the same tournament"})
  return roster
})
const selfMutation = (request: Request, parts: string[]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (parts[2] === "teams" && parts[3] && parts[4] && request.method === "POST") {
    const user = yield* (yield* AuthIdentity).requireUser(request)
    const data = yield* body(request, Schema.Struct({ playerTag: Schema.String })), tag = data.playerTag.toUpperCase()
    return yield* sql.withTransaction(Effect.gen(function* () {
      const team = (yield* sql<{id:string;server_id:string;size:number;archived:boolean}>`SELECT * FROM competitive_teams WHERE id::text=${parts[3]!} FOR UPDATE`)[0]
      if (!team || team.archived) return yield* new NotFound({ message: "Active team not found" })
      if (!(yield* sql`SELECT 1 FROM player_links WHERE tag=${tag} AND user_id=${user.userId} AND is_verified FOR UPDATE`).length) return yield* new Forbidden({ message: "Own and verify the account before changing its membership" })
      if (parts[4] === "join") {
        if (!(yield* sql`SELECT 1 FROM competitive_team_members WHERE team_id=${team.id}::uuid AND player_tag=${tag} AND user_id=${user.userId} AND left_at IS NULL`).length) return yield* new Forbidden({ message: "Ask the clan's team manager for an invitation" })
        yield* sql`UPDATE competitive_team_members SET accepted_at=COALESCE(accepted_at,now()) WHERE team_id=${team.id}::uuid AND player_tag=${tag} AND left_at IS NULL`
      } else if (parts[4] === "leave") yield* sql`UPDATE competitive_team_members SET left_at=now() WHERE team_id=${team.id}::uuid AND player_tag=${tag} AND user_id=${user.userId} AND left_at IS NULL`
      else return yield* new InvalidRequest({ message: "Unknown membership operation" })
      yield* sql`INSERT INTO competitive_audit(server_id,actor_id,action,entity_id,after_data) VALUES(${team.server_id},${user.userId},${`member.${parts[4]}`},${team.id},${JSON.stringify({playerTag:tag})}::jsonb)`
      return json({ ok: true })
    }))
  }
  if (parts[2] === "tournaments" && parts[3] && (parts[4] === "register" || parts[4] === "check-in") && request.method === "POST") {
    const user = yield* (yield* AuthIdentity).requireUser(request), data = yield* body(request, Schema.Struct({ teamId: Schema.String }))
    return yield* sql.withTransaction(Effect.gen(function* () {
      const tournament = (yield* sql<{id:string;status:string;team_size:number;server_id:string}>`SELECT * FROM competitive_tournaments WHERE id::text=${parts[3]!} FOR UPDATE`)[0]
      const team = (yield* sql<{id:string;size:number;archived:boolean}>`SELECT * FROM competitive_teams WHERE id::text=${data.teamId} FOR UPDATE`)[0]
      if (!tournament || !team || team.archived || team.size !== tournament.team_size) return yield* new InvalidRequest({ message: "Eligible team and tournament required" })
      if (!(yield* sql`SELECT 1 FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id WHERE m.team_id=${team.id}::uuid AND m.left_at IS NULL AND m.accepted_at IS NOT NULL AND l.user_id=${user.userId} AND l.is_verified`).length) return yield* new Forbidden({ message: "An accepted team member must register or check in" })
      const count = (yield* sql<{count:number}>`SELECT count(*)::int AS count FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id AND l.is_verified WHERE m.team_id=${team.id}::uuid AND m.left_at IS NULL AND m.accepted_at IS NOT NULL`)[0]!.count
      if (count !== team.size || tournament.status !== "registration") return yield* new InvalidRequest({ message: "Open registration and a full accepted verified roster required" })
      const roster=yield* eligibleRoster(tournament.id,team.id)
      if (parts[4] === "register") yield* sql`INSERT INTO competitive_participants(tournament_id,team_id,roster) VALUES(${tournament.id}::uuid,${team.id}::uuid,${JSON.stringify(roster)}::jsonb) ON CONFLICT(tournament_id,team_id) DO UPDATE SET withdrawn_at=NULL,checked_in_at=NULL,roster=EXCLUDED.roster`
      else if (!(yield* sql`UPDATE competitive_participants SET checked_in_at=now() WHERE tournament_id=${tournament.id}::uuid AND team_id=${team.id}::uuid AND withdrawn_at IS NULL RETURNING team_id`).length) return yield* new InvalidRequest({ message: "Register the team first" })
      yield* sql`INSERT INTO competitive_audit(server_id,actor_id,action,entity_id,after_data) VALUES(${tournament.server_id},${user.userId},${`participant.${parts[4]}`},${tournament.id},${JSON.stringify(data)}::jsonb)`
      return json({ok:true})
    }))
  }
  return undefined
})
const teams = (serverId?: string, clanTag?: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.unsafe<{id:string;[key:string]:unknown}>(`SELECT t.id::text,t.clan_tag AS "clanTag",c.name AS "clanName",t.size::int,t.archived${serverId ? ',t.server_id AS "serverId",t.internal_name AS "internalName"' : ''},
    COALESCE((SELECT jsonb_agg(jsonb_build_object('playerTag',m.player_tag,'name',p.name,'joinedAt',m.joined_at,'acceptedAt',m.accepted_at,'profile',CASE WHEN cp.private=false THEN jsonb_build_object('userId',cp.user_id,'displayName',COALESCE(du.data->>'username',au.username,''),'avatarUrl',CASE WHEN du.data->>'avatar' ~ '^[a-zA-Z0-9_]+$' THEN 'https://cdn.discordapp.com/avatars/' || cp.user_id || '/' || (du.data->>'avatar') || CASE WHEN du.data->>'avatar' LIKE 'a_%' THEN '.gif' ELSE '.png' END ELSE NULL END) ELSE NULL END)) FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id AND l.is_verified JOIN basic_player p ON p.tag=m.player_tag LEFT JOIN competitive_profiles cp ON cp.user_id=l.user_id LEFT JOIN auth_users au ON au.user_id=l.user_id LEFT JOIN discord_cache.users du ON du.id=l.user_id WHERE m.team_id=t.id AND m.left_at IS NULL AND (${Boolean(serverId)} OR (m.accepted_at IS NOT NULL AND NOT l.hidden))),'[]'::jsonb) AS members
    FROM competitive_teams t JOIN basic_clan c ON c.tag=t.clan_tag WHERE ${serverId ? 't.server_id=$1' : 't.clan_tag=$1 AND NOT t.archived'} ORDER BY t.created_at`, [serverId ?? clanTag])
})
const profile = (userId: string, own: boolean) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ userId: string; displayName: string; avatarUrl: string | null; bannerUrl: string | null; private: boolean; hideDiscord: boolean;bio:string;socials:Record<string,string> }>`SELECT user_id AS "userId",display_name AS "displayName",avatar_url AS "avatarUrl",banner_url AS "bannerUrl",private,hide_discord AS "hideDiscord",bio,socials FROM competitive_profiles WHERE user_id=${userId}`
  const row = rows[0]
  if (row?.private && !own) return yield* new NotFound({ message: "Profile is private" })
  const accounts = yield* sql`SELECT l.tag,p.name,p.townhall_level AS "townHallLevel" FROM player_links l JOIN basic_player p ON p.tag=l.tag WHERE l.user_id=${userId} AND l.is_verified AND (${own} OR NOT l.hidden) ORDER BY l.is_main DESC,l.order_index`
  if (!row && !own) return yield* new NotFound({ message: "Profile not found" })
  const memberships = yield* sql`SELECT t.id::text,t.clan_tag AS "clanTag",c.name AS "clanName",t.size::int,m.player_tag AS "playerTag",m.joined_at AS "joinedAt",m.left_at AS "leftAt",m.accepted_at AS "acceptedAt" FROM competitive_team_members m JOIN competitive_teams t ON t.id=m.team_id JOIN basic_clan c ON c.tag=t.clan_tag LEFT JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id WHERE m.user_id=${userId} AND (${own} OR (l.is_verified AND NOT l.hidden AND m.accepted_at IS NOT NULL)) ORDER BY m.joined_at DESC`
  const discordUser=(yield* sql<{username:string|null;avatar:string|null}>`SELECT data->>'username' AS username,data->>'avatar' AS avatar FROM discord_cache.users WHERE id=${userId}`)[0]
  const discord=discordUser?.username??null
  const identity=(yield* sql<{username:string|null}>`SELECT username FROM auth_users WHERE user_id=${userId}`)[0]
  // Count links directly, without the basic_player join used for enrichment.
  // Missing game snapshots must not erase verified ownership. Public profiles
  // count only visible links so hidden accounts cannot be inferred from a badge.
  const verifiedAccountCount=(yield* sql<{count:number}>`SELECT count(DISTINCT tag)::int AS count FROM player_links WHERE user_id=${userId} AND is_verified AND (${own} OR NOT hidden)`)[0]?.count??0
  // Only an actual provider photo is a fallback. Do not manufacture a default
  // avatar or copy it into competitive_profiles.avatar_url on subsequent edits.
  const discordAvatarUrl=discordUser?.avatar&&/^[a-zA-Z0-9_]+$/.test(discordUser.avatar)
    ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.${discordUser.avatar.startsWith('a_')?'gif':'png'}`
    : null
  const achievements=yield* sql`SELECT a.achievement_id AS id,a.player_tag AS "playerTag",a.earned_at AS "earnedAt" FROM achievement_player_awards a JOIN player_links l ON l.tag=a.player_tag AND l.user_id=${userId} AND l.is_verified WHERE (${own} OR NOT l.hidden) AND (a.achievement_id<>'first_tournament' OR EXISTS(SELECT 1 FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id CROSS JOIN LATERAL jsonb_array_elements(m.observed_attacks) entry WHERE m.status='completed' AND t.status NOT IN ('draft','cancelled') AND entry->>'playerTag'=a.player_tag AND entry->>'userId'=${userId} AND (entry->>'attacks')::integer>0)) ORDER BY a.earned_at DESC`
  const tournamentHistory=yield* sql`SELECT DISTINCT t.id::text,t.name,t.format,t.status,t.starts_at AS "startsAt",t.ends_at AS "endsAt",p.team_id::text AS "teamId",c.name AS "clanName",c.tag AS "clanTag" FROM competitive_participants p JOIN competitive_tournaments t ON t.id=p.tournament_id JOIN competitive_teams team ON team.id=p.team_id JOIN basic_clan c ON c.tag=team.clan_tag CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry WHERE t.status<>'draft' AND (${own} OR COALESCE(t.rules_metadata->>'visibility','public')='public') AND entry->>'userId'=${userId} ORDER BY t.starts_at DESC LIMIT 100`
  const stats=(yield* sql<{observedMatches:number;attacks:number;triples:number;stars:number;destruction:number;duration:number}>`SELECT count(DISTINCT m.id)::int AS "observedMatches",COALESCE(sum((summary->>'attacks')::int),0)::int AS attacks,COALESCE(sum((summary->>'triples')::int),0)::int AS triples,COALESCE(sum((summary->>'stars')::int),0)::int AS stars,COALESCE(sum((summary->>'destructionTotal')::numeric),0)::float8 AS destruction,COALESCE(sum((summary->>'durationTotal')::numeric),0)::float8 AS duration FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id CROSS JOIN LATERAL jsonb_array_elements(m.observed_attacks) summary WHERE m.status='completed' AND t.status NOT IN ('draft','cancelled') AND (${own} OR COALESCE(t.rules_metadata->>'visibility','public')='public') AND summary->>'userId'=${userId}`)[0]!
  const total=(yield* sql<{count:number}>`SELECT count(DISTINCT m.id)::int AS count FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id JOIN competitive_participants p ON p.tournament_id=m.tournament_id AND p.team_id IN (m.home_team_id,m.away_team_id) CROSS JOIN LATERAL jsonb_array_elements(p.roster) account WHERE m.status='completed' AND t.status NOT IN ('draft','cancelled') AND (${own} OR COALESCE(t.rules_metadata->>'visibility','public')='public') AND account->>'userId'=${userId}`)[0]!.count
  const tournamentStats=stats.observedMatches?{attacks:stats.attacks,triples:stats.triples,stars:stats.stars,hitRatePercent:stats.attacks?100*stats.triples/stats.attacks:null,averageDestruction:stats.attacks?stats.destruction/stats.attacks:null,averageDuration:stats.attacks?stats.duration/stats.attacks:null,observedMatches:stats.observedMatches,totalCompletedMatches:total}:null
  // Privacy gates the whole public profile above. The retired per-handle flag
  // remains stored for old clients, but must not hide identity on public profiles.
  return json({ ...(row ?? { userId, private: true,bio:'',socials:{} }), displayName:discord??identity?.username??"", avatarUrl:discordAvatarUrl, bannerUrl:null, hideDiscord:false, discordHandle:discord, discordAvatarUrl, verifiedAccountCount, accounts, teams: memberships,achievements,tournamentHistory,tournamentStats,statsAvailability:{status:stats.observedMatches===0?'awaiting_observation':stats.observedMatches<total?'partial':'available',observedMatches:stats.observedMatches,totalCompletedMatches:total} })
})

export const dispatchCompetitive = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] !== "v2") return undefined
  if (parts[1] === "esports" && parts[2] === "ccn" && parts.length === 4) return yield* ccn(request, parts[3]!)
  if (parts[1] !== "competitive") return undefined
  const sql = yield* SqlClient.SqlClient
  const selfResponse = yield* selfMutation(request, parts)
  if (selfResponse !== undefined) return selfResponse
  if (parts[2] === "profile" && parts[3] === "image" && request.method === "POST") {
    yield* (yield* AuthIdentity).requireUser(request)
    // Drain a bounded legacy request before rejecting it so local HTTP reuse
    // does not reset the following privacy save. Nothing is stored or uploaded.
    yield* readDashboardMultipart(request, 6 * 1024 * 1024)
    return yield* new InvalidRequest({message:"Custom profile images are no longer supported"})
  }
  if (parts[2] === "profile" && parts.length === 3) {
    const user = yield* (yield* AuthIdentity).requireUser(request)
    if (request.method === "GET") return yield* profile(user.userId, true)
    if (request.method !== "PUT") return yield* new InvalidRequest({ message: "GET or PUT required" })
    const data = yield* body(request, Schema.Struct({ displayName: Schema.optionalKey(Schema.String), avatarUrl: Schema.optionalKey(Schema.NullOr(Schema.String)), bannerUrl: Schema.optionalKey(Schema.NullOr(Schema.String)), private: Schema.Boolean, hideDiscord: Schema.optionalKey(Schema.Boolean),bio:optionalString,socials:Schema.optionalKey(Schema.Record(Schema.String,Schema.String)) }))
    if((data.bio?.length??0)>1000||Object.entries(data.socials??{}).some(([key,value])=>key.length>30||value.length>300||!value.startsWith('https://'))||Object.keys(data.socials??{}).length>10)return yield* new InvalidRequest({message:"Bio is limited to 1000 characters and up to ten HTTPS social links"})
    // Older Dashboard/app versions still send these fields. Accept their
    // shape but discard custom artwork, so privacy edits continue to work.
    if ((data.displayName?.length ?? 0) > 50) return yield* new InvalidRequest({ message: "Legacy display names must be at most 50 characters" })
    // Retain the legacy NOT NULL display_name column without making users pick
    // a name. New profiles use their stable ID internally; omitted legacy names
    // preserve stored values. Clients show Discord identity, not this column.
    const legacyName=data.displayName?.trim() || null
    yield* sql`INSERT INTO competitive_profiles(user_id,display_name,avatar_url,banner_url,private,hide_discord) VALUES(${user.userId},${legacyName??user.userId},NULL,NULL,${data.private},false) ON CONFLICT(user_id) DO UPDATE SET display_name=COALESCE(${legacyName},competitive_profiles.display_name),avatar_url=NULL,banner_url=NULL,private=EXCLUDED.private,hide_discord=false,updated_at=now()`
    yield* sql`UPDATE competitive_profiles SET bio=COALESCE(${data.bio??null},bio),socials=COALESCE(${data.socials?JSON.stringify(data.socials):null}::jsonb,socials) WHERE user_id=${user.userId}`
    return yield* profile(user.userId, true)
  }
  if (parts[2] === "profiles" && parts.length === 4 && request.method === "GET") return yield* profile(parts[3]!, false)
  if(parts[2]==="matches"&&parts[3]&&parts[4]==="attacks"&&request.method==="GET"){
    const rows=yield* sql<{war_id:string|null}>`SELECT m.war_id FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id WHERE m.id::text=${parts[3]} AND t.status<>'draft'`
    if(!rows.length)return yield* new NotFound({message:"Match not found"})
    return json({items:yield* competitiveAttacks(rows[0]!.war_id)})
  }
  if (parts[2] === "teams" && parts.length === 4 && request.method === "GET") {
    const row=(yield* sql<{clan_tag:string}>`SELECT clan_tag FROM competitive_teams WHERE id::text=${parts[3]!}`)[0]
    if(!row)return yield* new NotFound({message:"Team not found"})
    const all=yield* teams(undefined,row.clan_tag), team=all.find(item=>item.id===parts[3])
    if(!team)return yield* new NotFound({message:"Team not found"})
    const history=yield* sql`SELECT m.player_tag AS "playerTag",m.joined_at AS "joinedAt",m.left_at AS "leftAt" FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id WHERE m.team_id::text=${parts[3]!} AND m.accepted_at IS NOT NULL AND NOT l.hidden ORDER BY m.joined_at DESC LIMIT 200`
    return json({team,history})
  }
  if (parts[2] === "clans" && parts[4] === "teams" && request.method === "GET") return json({ items: yield* teams(undefined, decodeURIComponent(parts[3]!).toUpperCase()) })
  if (parts[2] === "tournaments" && request.method === "GET") {
    if (parts.length === 3) return json({ items: yield* sql.unsafe(`${tournamentSelect} WHERE status<>'draft' AND COALESCE(rules_metadata->>'visibility','public')='public' ORDER BY starts_at DESC LIMIT 100`) })
    const rows = yield* sql.unsafe<{format:string}>(`${tournamentSelect} WHERE id::text=$1 AND status<>'draft'`, [parts[3]!])
    if (!rows.length) return yield* new NotFound({ message: "Tournament not found" })
    const participants = yield* sql`SELECT p.team_id::text AS "teamId",t.clan_tag AS "clanTag",c.name AS "clanName",p.withdrawn_at AS "withdrawnAt",p.checked_in_at AS "checkedInAt",p.roster FROM competitive_participants p JOIN competitive_teams t ON t.id=p.team_id JOIN basic_clan c ON c.tag=t.clan_tag WHERE p.tournament_id::text=${parts[3]!}`
    const matches = yield* sql.unsafe<CompetitiveMatch>(`${matchSelect} WHERE tournament_id::text=$1 ORDER BY round,id`,[parts[3]!])
    const publicParticipants=[]
    for(const participant of participants){
      const visible=yield* sql`SELECT entry-'userId' AS account FROM competitive_participants p CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry JOIN player_links l ON l.tag=entry->>'playerTag' WHERE p.tournament_id::text=${parts[3]!} AND p.team_id::text=${String(participant.teamId)} AND l.is_verified AND NOT l.hidden AND l.user_id=entry->>'userId'`
      publicParticipants.push({...participant,roster:visible.map(row=>row.account)})
    }
    return json({ tournament: rows[0], participants:publicParticipants, matches, standings:competitiveStandings(participants.map(row=>String(row.teamId)),matches,String(rows[0]?.format)) })
  }
  if (parts[2] !== "servers" || !parts[3]) return yield* new NotFound({ message: "Competitive route not found" })
  const serverId = parts[3], area = parts[4]!, id = parts[5], sub = parts[6], child = parts[7]
  const access = yield* (yield* ServerAuthorization).resolve(request, serverId)
  const permission = area === "permissions" ? "permissions" : area === "overview" || area === "audit" ? "tournaments" : sub === "members" ? "teams" : sub === "participants" ? "participants" : sub === "matches" || sub === "generate" || sub === "sync" ? "matches" : area === "matches" ? "scores" : area
  const actor = access.principal.kind === "user" ? access.principal.userId : "bot"
  if (!access.manager) {
    // Resolve current roles only after the existing authorization service has
    // checked gateway health, guild membership and scoped-session ceilings.
    if (access.principal.kind !== "user" || access.principal.dashboardScope && access.sections.competitive !== "manage" && request.method!=="GET") return yield* new Forbidden({ message: "Tournament permission required" })
    const granted = yield* sql`SELECT 1 FROM competitive_role_grants g JOIN discord_cache.members m ON m.guild_id=g.server_id AND m.user_id=${actor} WHERE g.server_id=${serverId} AND g.permission=${permission} AND m.data->'roles' ? g.role_id LIMIT 1`
    if (!granted.length && !(request.method === "GET" && access.sections.competitive)) return yield* new Forbidden({ message: "Tournament permission required" })
  }
  const audit = (action: string, entity: string, before: unknown, after: unknown, reason = "") => sql`INSERT INTO competitive_audit(server_id,actor_id,action,entity_id,before_data,after_data,reason) VALUES(${serverId},${actor},${action},${entity},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${reason})`
  if (request.method === "GET") {
    if(area==="matches"&&id&&sub==="attacks"){
      const rows=yield* sql<{war_id:string|null}>`SELECT m.war_id FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id WHERE m.id::text=${id} AND t.server_id=${serverId}`
      if(!rows.length)return yield* new NotFound({message:"Match not found"})
      return json({items:yield* competitiveAttacks(rows[0]!.war_id)})
    }
    if (area === "overview") {
      const rolePermissions = access.manager ? permissions : (yield* sql<{permission:string}>`SELECT DISTINCT g.permission FROM competitive_role_grants g JOIN discord_cache.members m ON m.guild_id=g.server_id AND m.user_id=${actor} WHERE g.server_id=${serverId} AND m.data->'roles' ? g.role_id`).map(row=>row.permission)
      return json({ teams:yield* teams(serverId), tournaments:yield* sql.unsafe(`${tournamentSelect} WHERE server_id=$1 ORDER BY starts_at DESC`,[serverId]), verifiedClans:yield* sql`SELECT v.clan_tag AS tag,c.name FROM server_clan_verifications v JOIN basic_clan c ON c.tag=v.clan_tag WHERE v.server_id=${serverId} AND v.state='verified'`, permissions:rolePermissions,manager:access.manager })
    }
    if (area === "teams") return json({ items: yield* teams(serverId), history: yield* sql`SELECT m.team_id::text AS "teamId",m.player_tag AS "playerTag",m.joined_at AS "joinedAt",m.left_at AS "leftAt",m.accepted_at AS "acceptedAt" FROM competitive_team_members m JOIN competitive_teams t ON t.id=m.team_id WHERE t.server_id=${serverId} ORDER BY joined_at DESC LIMIT 1000` })
    if (area === "tournaments" && !id) return json({ items: yield* sql.unsafe(`${tournamentSelect} WHERE server_id=$1 ORDER BY starts_at DESC`, [serverId]) })
    if (area === "tournaments" && id) {
      const rows=yield* sql.unsafe<{format:string}>(`${tournamentSelect} WHERE server_id=$1 AND id::text=$2`,[serverId,id])
      if(!rows.length)return yield* new NotFound({message:"Tournament not found"})
      const participants=yield* sql`SELECT p.team_id::text AS "teamId",t.clan_tag AS "clanTag",c.name AS "clanName",p.withdrawn_at AS "withdrawnAt",p.checked_in_at AS "checkedInAt",p.roster FROM competitive_participants p JOIN competitive_teams t ON t.id=p.team_id JOIN basic_clan c ON c.tag=t.clan_tag WHERE p.tournament_id::text=${id}`
      const matches=yield* sql.unsafe<CompetitiveMatch>(`${matchSelect} WHERE tournament_id::text=$1 ORDER BY round,id`,[id])
      return json({tournament:rows[0],participants,matches,standings:competitiveStandings(participants.map(row=>String(row.teamId)),matches,String(rows[0]?.format))})
    }
    if (area === "permissions") return json({ items: yield* sql`SELECT role_id AS "roleId",permission FROM competitive_role_grants WHERE server_id=${serverId}` })
    if (area === "audit") return json({ items: yield* sql`SELECT id::text,action,actor_id AS "actorId",occurred_at AS "createdAt",entity_id AS "entityId",before_data AS before,after_data AS after,reason FROM competitive_audit WHERE server_id=${serverId} ORDER BY occurred_at DESC LIMIT 200` })
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    if (area === "permissions" && request.method === "PUT") {
      if (!access.manager) return yield* new Forbidden({ message: "Only server managers can change tournament permissions" })
      const data = yield* body(request, Schema.Struct({ items: Schema.Array(Schema.Struct({ roleId: Schema.String, permission: Permission })) }))
      if (data.items.length > 200 || data.items.some(item => !/^\d{5,25}$/u.test(item.roleId))) return yield* new InvalidRequest({ message: "Invalid Discord role grants" })
      const before = yield* sql`SELECT * FROM competitive_role_grants WHERE server_id=${serverId}`
      yield* sql`DELETE FROM competitive_role_grants WHERE server_id=${serverId}`
      for (const item of data.items) yield* sql`INSERT INTO competitive_role_grants VALUES(${serverId},${item.roleId},${item.permission}) ON CONFLICT DO NOTHING`
      yield* audit("permissions", serverId, before, data)
      return json(data)
    }
    if (area === "teams") {
      if (!id && request.method === "POST") {
        const data = yield* body(request, Schema.Struct({ clanTag: Schema.String, internalName: Schema.String, size: Size }))
        const tag = data.clanTag.toUpperCase()
        if (!data.internalName.trim() || data.internalName.length > 80) return yield* new InvalidRequest({ message: "Internal team name required" })
        if (!(yield* sql`SELECT 1 FROM server_clan_verifications WHERE server_id=${serverId} AND clan_tag=${tag} AND state='verified' FOR UPDATE`).length) return yield* new Forbidden({ message: "Verify this clan on the server before creating teams" })
        const rows = yield* sql<{ id: string }>`INSERT INTO competitive_teams(server_id,clan_tag,internal_name,size) VALUES(${serverId},${tag},${data.internalName},${data.size}) RETURNING id::text`
        yield* audit("team.create", rows[0]!.id, null, data)
        return json({ id: rows[0]!.id })
      }
      const team = (yield* sql<{ id: string; size: number; archived: boolean }>`SELECT * FROM competitive_teams WHERE id::text=${id ?? ''} AND server_id=${serverId} FOR UPDATE`)[0]
      if (!team) return yield* new NotFound({ message: "Team not found" })
      if (sub === "members") {
        if (team.archived) return yield* new InvalidRequest({ message: "Archived teams cannot change members" })
        if (request.method === "POST") {
          const data = yield* body(request, Schema.Struct({ playerTag: Schema.String })), tag = data.playerTag.toUpperCase()
          const link=(yield* sql<{user_id:string}>`SELECT user_id FROM player_links WHERE tag=${tag} AND is_verified AND user_id IS NOT NULL FOR UPDATE`)[0]
          if (!link) return yield* new InvalidRequest({ message: "Only verified accounts can join teams" })
          const count = (yield* sql<{ count: number }>`SELECT count(*)::int AS count FROM competitive_team_members WHERE team_id=${team.id}::uuid AND left_at IS NULL`)[0]!.count
          if (count >= team.size) return yield* new InvalidRequest({ message: "Team is full" })
          if ((yield* sql`SELECT 1 FROM competitive_team_members WHERE team_id=${team.id}::uuid AND player_tag=${tag} AND left_at IS NULL`).length) return yield* new InvalidRequest({ message: "Player is already a member" })
          yield* sql`INSERT INTO competitive_team_members(team_id,player_tag,user_id) VALUES(${team.id}::uuid,${tag},${link.user_id})`
          yield* audit("member.join", team.id, null, { playerTag: tag })
          return json({ ok: true })
        }
        if (request.method === "DELETE" && child) {
          const tag = decodeURIComponent(child).toUpperCase()
          const rows = yield* sql`UPDATE competitive_team_members SET left_at=now() WHERE team_id=${team.id}::uuid AND player_tag=${tag} AND left_at IS NULL RETURNING *`
          yield* audit("member.leave", team.id, rows, { playerTag: tag })
          return json({ ok: true })
        }
      }
      if (!sub && request.method === "PUT") {
        const data = yield* body(request, Schema.Struct({ internalName: optionalString, archived: Schema.optionalKey(Schema.Boolean) }))
        if (data.internalName !== undefined && (!data.internalName.trim() || data.internalName.length > 80)) return yield* new InvalidRequest({ message: "Invalid internal name" })
        if (data.archived && (yield* sql`SELECT 1 FROM competitive_participants p JOIN competitive_tournaments t ON t.id=p.tournament_id WHERE p.team_id=${team.id}::uuid AND p.withdrawn_at IS NULL AND t.status IN ('draft','registration','active') LIMIT 1`).length) return yield* new InvalidRequest({ message: "Withdraw from all active tournaments before archiving" })
        yield* sql`UPDATE competitive_teams SET internal_name=COALESCE(${data.internalName ?? null},internal_name),archived=COALESCE(${data.archived ?? null},archived) WHERE id=${team.id}::uuid`
        yield* audit("team.update", team.id, team, data)
        return json({ ok: true })
      }
    }
    if (area === "tournaments") {
      if (!id && request.method === "POST") {
        const data = yield* body(request, Schema.Struct({ name: Schema.String, format: Format, teamSize: Size, startsAt: Schema.String, endsAt: Schema.String, rules: Schema.optionalKey(Rules) }))
        const rules=normalizeRules(data.rules,data.teamSize)
        if(!rules.valid)return yield* new InvalidRequest({message:"Invalid town hall range or roster capacity; roster size must equal the team's size"})
        if (!data.name.trim() || data.name.length > 100 || !Number.isFinite(Date.parse(data.startsAt)) || Date.parse(data.endsAt) <= Date.parse(data.startsAt) || !Number.isFinite(Date.parse(data.endsAt))) return yield* new InvalidRequest({ message: "Valid tournament name and independent start/end dates required" })
        const rows = yield* sql<{ id: string }>`INSERT INTO competitive_tournaments(server_id,name,format,team_size,starts_at,ends_at,rules,min_town_hall,max_town_hall,rules_metadata) VALUES(${serverId},${data.name},${data.format},${data.teamSize},${data.startsAt}::timestamptz,${data.endsAt}::timestamptz,${rules.description},${rules.min},${rules.max},${JSON.stringify(rules.metadata)}::jsonb) RETURNING id::text`
        yield* audit("tournament.create", rows[0]!.id, null, data)
        return json({ id: rows[0]!.id })
      }
      const tournament = (yield* sql<{ id: string; status: string; team_size: number; starts_at: Date; ends_at: Date;rules:string;min_town_hall:number;max_town_hall:number;rules_metadata:{prizeDescription?:string;rulebookUrl?:string;visibility?:'public'|'unlisted'} }>`SELECT * FROM competitive_tournaments WHERE id::text=${id ?? ''} AND server_id=${serverId} FOR UPDATE`)[0]
      if (!tournament) return yield* new NotFound({ message: "Tournament not found" })
      if(sub==="sync"&&request.method==="POST")return json(yield* runCompetitiveWarSync(serverId,tournament.id))
      if(sub==="generate"&&request.method==="POST"){
        const generated=yield* generateCompetitiveRound(serverId,tournament.id)
        yield* audit("tournament.generate",tournament.id,null,generated)
        return json(generated)
      }
      if (sub === "participants") {
        if (request.method === "POST") {
          const data = yield* body(request, Schema.Struct({ teamId: Schema.String }))
          const team = (yield* sql<{ id: string; size: number; archived: boolean }>`SELECT * FROM competitive_teams WHERE id::text=${data.teamId} AND server_id=${serverId} FOR UPDATE`)[0]
          if (!team || team.archived || team.size !== tournament.team_size || tournament.status !== "registration") return yield* new InvalidRequest({ message: "An active team of the required size and open registration are required" })
          const count = (yield* sql<{ count: number }>`SELECT count(*)::int AS count FROM competitive_team_members m JOIN player_links l ON l.tag=m.player_tag AND l.user_id=m.user_id AND l.is_verified WHERE m.team_id=${team.id}::uuid AND m.left_at IS NULL AND m.accepted_at IS NOT NULL`)[0]!.count
          if (count !== team.size) return yield* new InvalidRequest({ message: "Complete the verified team roster before registering" })
          const roster=yield* eligibleRoster(tournament.id,team.id)
          yield* sql`INSERT INTO competitive_participants(tournament_id,team_id,roster) VALUES(${tournament.id}::uuid,${team.id}::uuid,${JSON.stringify(roster)}::jsonb) ON CONFLICT(tournament_id,team_id) DO UPDATE SET withdrawn_at=NULL,roster=EXCLUDED.roster,checked_in_at=NULL`
          yield* audit("participant.register", tournament.id, null, data)
          return json({ ok: true })
        }
        if (request.method === "DELETE" && child) {
          const before = yield* sql`UPDATE competitive_participants SET withdrawn_at=now() WHERE tournament_id=${tournament.id}::uuid AND team_id::text=${child} RETURNING *`
          yield* audit("participant.withdraw", tournament.id, before, null)
          return json({ ok: true })
        }
      }
      if (sub === "matches" && request.method === "POST") {
        const data = yield* body(request, Schema.Struct({ homeTeamId: Schema.String, awayTeamId: Schema.String, round: Schema.Int, warId: optionalString }))
        if (data.round < 1 || data.homeTeamId === data.awayTeamId) return yield* new InvalidRequest({ message: "Two different teams and a positive round are required" })
        if(data.warId&&(!/^\d+$/u.test(data.warId)||!(yield* sql`SELECT 1 FROM wars w JOIN competitive_teams h ON h.id::text=${data.homeTeamId} JOIN competitive_teams a ON a.id::text=${data.awayTeamId} WHERE w.war_id::text=${data.warId} AND w.size=${tournament.team_size} AND w.start_time>=${tournament.starts_at} AND w.start_time<${tournament.ends_at} AND ((w.clan_tag=h.clan_tag AND w.opponent_tag=a.clan_tag) OR (w.clan_tag=a.clan_tag AND w.opponent_tag=h.clan_tag))`).length))return yield* new InvalidRequest({message:"Linked war must match both clans, team size and tournament dates"})
        const eligible = yield* sql`SELECT team_id FROM competitive_participants WHERE tournament_id=${tournament.id}::uuid AND team_id::text IN (${data.homeTeamId},${data.awayTeamId}) AND withdrawn_at IS NULL`
        if (eligible.length !== 2) return yield* new InvalidRequest({ message: "Both teams must be active participants" })
        const clans=(yield* sql<{count:number}>`SELECT count(DISTINCT clan_tag)::int AS count FROM competitive_teams WHERE id::text IN (${data.homeTeamId},${data.awayTeamId})`)[0]!.count
        if(clans!==2)return yield* new InvalidRequest({message:"A clan cannot play a match against itself"})
        const rows = yield* sql<{ id: string }>`INSERT INTO competitive_matches(tournament_id,home_team_id,away_team_id,round,war_id) VALUES(${tournament.id}::uuid,${data.homeTeamId}::uuid,${data.awayTeamId}::uuid,${data.round},${data.warId ?? null}) RETURNING id::text`
        yield* audit("match.create", rows[0]!.id, null, data)
        return json({ id: rows[0]!.id })
      }
      if (!sub && request.method === "PUT") {
        const data = yield* body(request, Schema.Struct({ name: optionalString, format: Schema.optionalKey(Format), teamSize: Schema.optionalKey(Size), startsAt: optionalString, endsAt: optionalString, rules: Schema.optionalKey(Rules), status: Schema.optionalKey(Status) }))
        const transitions:Record<string,string[]>={draft:['draft','registration','cancelled'],registration:['registration','active','cancelled'],active:['active','completed','cancelled'],completed:['completed'],cancelled:['cancelled']}
        if(data.status&&!transitions[tournament.status]?.includes(data.status))return yield* new InvalidRequest({message:"Tournament state cannot move backwards; create a new event instead"})
        if(data.status==='completed'&&(yield* sql`SELECT 1 FROM competitive_matches WHERE tournament_id=${tournament.id}::uuid AND status NOT IN ('completed','cancelled') LIMIT 1`).length)return yield* new InvalidRequest({message:"Resolve all matches before completing the tournament"})
        const preserved={description:tournament.rules,minTownHall:tournament.min_town_hall,maxTownHall:tournament.max_town_hall,...tournament.rules_metadata}
        const rules=normalizeRules(data.rules===undefined?preserved:typeof data.rules==='string'?{...preserved,description:data.rules}:{...preserved,...data.rules},data.teamSize??tournament.team_size)
        if(!rules.valid)return yield* new InvalidRequest({message:"Invalid eligibility rules"})
        const start = data.startsAt ?? tournament.starts_at.toISOString(), end = data.endsAt ?? tournament.ends_at.toISOString()
        if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || data.name !== undefined && (!data.name.trim() || data.name.length > 100)) return yield* new InvalidRequest({ message: "Invalid tournament details" })
        if ((data.teamSize !== undefined || data.format !== undefined) && (yield* sql`SELECT 1 FROM competitive_participants WHERE tournament_id=${tournament.id}::uuid LIMIT 1`).length) return yield* new InvalidRequest({ message: "Format and team size are locked after registration" })
        yield* sql`UPDATE competitive_tournaments SET name=COALESCE(${data.name ?? null},name),format=COALESCE(${data.format ?? null},format),team_size=COALESCE(${data.teamSize ?? null},team_size),starts_at=${start}::timestamptz,ends_at=${end}::timestamptz,rules=${rules.description},min_town_hall=${rules.min},max_town_hall=${rules.max},rules_metadata=${JSON.stringify(rules.metadata)}::jsonb,status=COALESCE(${data.status ?? null},status) WHERE id=${tournament.id}::uuid`
        yield* audit("tournament.update", tournament.id, tournament, data)
        return json({ ok: true })
      }
    }
    if (area === "matches" && id && request.method === "PUT") {
      const data = yield* body(request, Schema.Struct({ homeScore: Schema.Number, awayScore: Schema.Number, status: Schema.Literals(["scheduled", "active", "completed", "cancelled"]), reason: Schema.String, penalty: Schema.optionalKey(Penalty) }))
      if (!data.reason.trim() || !Number.isFinite(data.homeScore) || !Number.isFinite(data.awayScore) || data.homeScore < 0 || data.awayScore < 0) return yield* new InvalidRequest({ message: "Nonnegative scores and an audit reason are required" })
      if(data.penalty&&(!Number.isFinite(data.penalty.homeDeduction)||!Number.isFinite(data.penalty.awayDeduction)||data.penalty.homeDeduction<0||data.penalty.awayDeduction<0||!data.penalty.reason.trim()))return yield* new InvalidRequest({message:"Nonnegative deductions and a penalty reason are required"})
      if (data.penalty && !access.manager) {
        const grants = yield* sql`SELECT 1 FROM competitive_role_grants g JOIN discord_cache.members m ON m.guild_id=g.server_id AND m.user_id=${actor} WHERE g.server_id=${serverId} AND g.permission='penalties' AND m.data->'roles' ? g.role_id LIMIT 1`
        if (!grants.length) return yield* new Forbidden({ message: "Penalty permission required" })
      }
      const before = yield* sql`SELECT m.* FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id WHERE m.id::text=${id} AND t.server_id=${serverId} FOR UPDATE OF m`
      if (!before.length) return yield* new NotFound({ message: "Match not found" })
      if((yield* sql`SELECT 1 FROM competitive_matches next JOIN competitive_matches current ON current.id::text=${id} JOIN competitive_tournaments t ON t.id=current.tournament_id WHERE current.status='completed' AND t.format<>'round_robin' AND next.tournament_id=current.tournament_id AND next.round>current.round AND next.status<>'cancelled' LIMIT 1`).length)return yield* new InvalidRequest({message:"Cancel later rounds before correcting a score that determined their participants"})
      yield* sql`UPDATE competitive_matches SET home_score=${data.homeScore},away_score=${data.awayScore},status=${data.status},penalty=COALESCE(${data.penalty ? JSON.stringify(data.penalty) : null}::jsonb,penalty) WHERE id::text=${id}`
      // Award participation only after an actual completed match. Snapshot
      // ownership prevents a later link transfer from receiving historical credit.
      const warId=before[0]&&'war_id' in before[0]?String(before[0].war_id??''):null
      const ended=warId&&(yield* sql`SELECT 1 FROM wars WHERE war_id::text=${warId} AND state IN ('ended','warEnded')`).length>0
      const attacks=data.status==="completed"&&ended?yield* competitiveAttacks(warId):[]
      const observed=data.status==='completed'&&ended&&warId?yield* storeCompetitiveObservation(id,warId):false
      if(data.status==="completed"&&observed&&attacks.length)yield* sql`INSERT INTO achievement_player_awards(achievement_id,player_tag) SELECT DISTINCT 'first_tournament',entry->>'playerTag' FROM competitive_matches m JOIN competitive_participants p ON p.tournament_id=m.tournament_id AND p.team_id IN (m.home_team_id,m.away_team_id) CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry JOIN player_links l ON l.tag=entry->>'playerTag' AND l.user_id=entry->>'userId' AND l.is_verified WHERE m.id::text=${id} AND entry->>'playerTag'=ANY(${attacks.map(attack=>attack.attackerTag)}::text[]) ON CONFLICT DO NOTHING`
      yield* audit("match.score", id, before[0], data, data.reason)
      return json({ ok: true })
    }
    return yield* new InvalidRequest({ message: "Unsupported competitive operation" })
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Competitive storage is temporarily unavailable" }))))
