import { BotUserRostersEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
export const dispatchBotUserRosters=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/servers\/([^/]+)\/users\/([^/]+)\/rosters$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||url.search)return yield* new InvalidRequest({message:"GET without query required"})
 const params=yield* Schema.decodeUnknownEffect(BotUserRostersEndpoint.pathParams)({serverId:match[1],userId:match[2]}).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid Discord IDs"})))
 const sql=yield* SqlClient.SqlClient
 // The clicker's canonical links define ownership. Never use a roster's cached
 // Discord identity or expose another member's rows through a copied button.
 const rows=yield* sql<{rosterId:string;rosterName:string;playerTag:string;playerName:string;clanName:string|null;groupName:string}>`
  SELECT roster.id::text AS "rosterId",roster.alias AS "rosterName",member.tag AS "playerTag",member.name AS "playerName",
   member.current_clan_name AS "clanName",COALESCE(label.name,'Main') AS "groupName"
  FROM roster_members member JOIN rosters roster ON roster.id=member.roster_id
  JOIN player_links link ON link.tag=member.tag AND link.user_id=${params.userId} AND link.hidden=false
  LEFT JOIN roster_member_groups label ON label.id=member.member_group_id
  WHERE roster.server_id=${params.serverId}
  ORDER BY roster.alias,roster.id,member.name,member.tag LIMIT 101`
 return Response.json({items:rows.slice(0,100),truncated:rows.length>100},{headers:{"cache-control":"no-store"}})
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Roster memberships unavailable"}))))
