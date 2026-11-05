import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { NotFound, DatabaseFailure } from "./errors.js"
export const LIMIT_SUPPORT_URL="https://discord.gg/clashking"
export const limitMessage=(resource:string)=>`${resource} limit reached. Join our Discord server and ask for raised limits: ${LIMIT_SUPPORT_URL}`
export const readServerLimits=(serverId:string)=>Effect.gen(function*(){
 const sql=yield* SqlClient.SqlClient
 const row=(yield* sql<{id:string;name:string;clan_limit:number;autoboard_limit:number;ai_monthly_limit_usd:string;custom_autoboard_interval_enabled:boolean;bot_customization_enabled:boolean;clans:number;boards:number;spent:string;reserved:string}>`
 SELECT s.id,s.name,s.clan_limit,s.autoboard_limit,s.ai_monthly_limit_usd,s.bot_customization_enabled,s.custom_autoboard_interval_enabled,
 (SELECT count(*)::int FROM server_clans WHERE server_id=s.id) AS clans,
 (SELECT count(*)::int FROM autoboards WHERE server_id=s.id AND board_type NOT LIKE 'sample-%') AS boards,
 COALESCE((SELECT sum(total_cost_usd) FROM roster_ai_usage WHERE server_id=s.id AND budget_month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0)::text AS spent,
 COALESCE((SELECT sum(b.reserved_usd) FROM roster_ai_step_budgets b JOIN roster_ai_usage u ON u.id=b.usage_id
 WHERE u.server_id=s.id AND u.budget_month=date_trunc('month',now() AT TIME ZONE 'UTC')::date AND b.settled_at IS NULL),0)::text AS reserved
 FROM servers s WHERE s.id=${serverId}`)[0]
 if(!row)return yield* new NotFound({message:"Server not found"})
 const now=new Date()
 return {serverId:row.id,name:row.name,clanLimit:row.clan_limit,autoboardLimit:row.autoboard_limit,aiMonthlyLimitUsd:Number(row.ai_monthly_limit_usd),customAutoboardIntervalEnabled:row.custom_autoboard_interval_enabled,botCustomizationEnabled:row.bot_customization_enabled,clanCount:row.clans,autoboardCount:row.boards,aiSpentUsd:Number(row.spent),aiReservedUsd:Number(row.reserved),resetsAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(),supportUrl:LIMIT_SUPPORT_URL}
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Server limits are unavailable"}))))
