import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { gatewayHeartbeatFreshnessSeconds } from "./server-authorization.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
export const dispatchBotStatus=(request:Request,bindings:WorkerBindings)=>Effect.gen(function*(){
 const url=new URL(request.url);if(url.pathname!=="/v2/bot/status")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||url.search)return yield* new InvalidRequest({message:"GET without query required"})
 const sql=yield* SqlClient.SqlClient
 const rows=yield* sql<Record<string,unknown>>`SELECT
  (SELECT count(*) FROM servers WHERE left_at IS NULL)::text AS "configuredServers",
  (SELECT count(DISTINCT clan.tag) FROM server_clans clan JOIN servers server ON server.id=clan.server_id WHERE server.left_at IS NULL)::text AS "familyClans",
  (SELECT count(*) FROM discord_cache.guilds WHERE application_id=${bindings.DISCORD_CLIENT_ID})::text AS "cachedGuilds",
  (SELECT CASE
    WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE data->>'member_count' ~ '^[0-9]{1,9}$')
    THEN sum(CASE WHEN data->>'member_count' ~ '^[0-9]{1,9}$' THEN (data->>'member_count')::bigint END)::text END
   FROM discord_cache.guilds WHERE application_id=${bindings.DISCORD_CLIENT_ID}) AS "serverMembers",
  (SELECT count(*) FROM tickets)::text AS tickets,
  (SELECT count(*) FROM discord_cache.guilds guild JOIN discord_cache.gateway_shards shard
   ON shard.application_id=guild.application_id AND shard.shard_id=guild.shard_id AND shard.generation=guild.generation
   WHERE guild.application_id=${bindings.DISCORD_CLIENT_ID} AND guild.available AND guild.metadata_complete AND guild.members_complete
    AND shard.healthy AND shard.heartbeat_at>now()-${gatewayHeartbeatFreshnessSeconds}*interval '1 second')::text AS "readyGuilds",
  (SELECT COALESCE(max(shard_count),0) FROM discord_cache.gateway_shards WHERE application_id=${bindings.DISCORD_CLIENT_ID})::text AS "expectedShards",
  (SELECT count(*) FROM discord_cache.gateway_shards WHERE application_id=${bindings.DISCORD_CLIENT_ID}
    AND healthy AND heartbeat_at>now()-${gatewayHeartbeatFreshnessSeconds}*interval '1 second')::text AS "healthyShards",
  player_count::text AS players,clan_count::text AS clans,wars_stored::text AS wars,refreshed_at AS "countsRefreshedAt",now() AS "observedAt"
  FROM api_global_counts WHERE id=1`
 const row=rows[0];if(!row)return yield* new DatabaseFailure({cause:"missing_counts",message:"Bot statistics unavailable"})
 // A partial/missing guild member count is unknown, never a fabricated zero total.
 const numeric=["configuredServers","familyClans","cachedGuilds","readyGuilds","expectedShards","healthyShards","serverMembers","tickets","players","clans","wars"]
 const data=Object.fromEntries(Object.entries(row).filter(([key,value])=>key!=="serverMembers"||value!==null).map(([key,value])=>[key,numeric.includes(key)?Number(value):value instanceof Date?value.toISOString():String(value)]))
 if(numeric.some(key=>data[key]!==undefined&&(!Number.isSafeInteger(data[key])||Number(data[key])<0)))return yield* new DatabaseFailure({cause:"invalid_counts",message:"Bot statistics unavailable"})
 return Response.json(data,{headers:{"cache-control":"no-store"}})
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Bot statistics unavailable"}))))
