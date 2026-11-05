import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ReserveAIStepEndpoint, SettleAIStepEndpoint } from "@clashking/api-contracts"
import { sameSecret } from "./auth.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, RateLimited, Unauthenticated } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { limitMessage } from "./server-limits.js"
import { rosterAIUsageCost } from "./dashboard-roster-ai-usage.js"
const units=(value:string)=>{const [a,b='']=value.split('.');return BigInt(a!)*100000000n+BigInt((b+'00000000').slice(0,8))}
const money=(value:bigint)=>`${value/100000000n}.${String(value%100000000n).padStart(8,'0')}`
export const dispatchAIStepBudgets=(request:Request,secret:string)=>Effect.gen(function*(){
 const path=new URL(request.url).pathname
 if(request.method!=="POST"||!["/v2/runtime/roster-ai/reserve","/v2/runtime/roster-ai/settle"].includes(path))return undefined
 if(!secret || !(yield* sameSecret(secret,request.headers.get("X-ClashKing-AI-Metering")??"")))return yield* new Unauthenticated({message:"Invalid AI metering credentials"})
 const raw=yield* readBoundedJson(request,8192)
 const reserve=path.endsWith('/reserve')
 const body=yield* Schema.decodeUnknownEffect(reserve?ReserveAIStepEndpoint.body:SettleAIStepEndpoint.body)(raw).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid AI step request"})))
 if(!/^[0-9a-f-]{36}$/iu.test(body.requestId)||body.step<0||body.step>7)return yield* new InvalidRequest({message:"Invalid AI step identity"})
 const sql=yield* SqlClient.SqlClient
 return yield* sql.withTransaction(Effect.gen(function*(){
  // Every admission, settlement and admin limit change locks this server row.
  // No expiration releases an uncertain provider call: held funds stay counted.
  const account=(yield* sql<{server_id:string;budget_month:string;model:"gpt-6-luna";cap:string}>`
   SELECT u.server_id,u.budget_month::text,u.model,s.ai_monthly_limit_usd::text AS cap
   FROM roster_ai_usage u JOIN servers s ON s.id=u.server_id WHERE u.id=${body.requestId}::uuid FOR UPDATE OF s,u`)[0]
  if(!account)return yield* new NotFound({message:"AI request not found"})
  if(account.model!=="gpt-6-luna")return yield* new InvalidRequest({message:"This model has no approved hard-budget price bounds"})
  if(reserve){
   const input=(body as typeof ReserveAIStepEndpoint.body.Type).inputTokenLimit,output=(body as typeof ReserveAIStepEndpoint.body.Type).outputTokenLimit
   if(input<1||input>1000000||output<1||output>64000)return yield* new InvalidRequest({message:"AI token bounds are invalid"})
   if((yield* sql`SELECT 1 FROM roster_ai_step_budgets WHERE usage_id=${body.requestId}::uuid AND step=${body.step}`).length)return yield* new Conflict({message:"This AI step was already reserved"})
   const current=(yield* sql<{month:string}>`SELECT date_trunc('month',now() AT TIME ZONE 'UTC')::date::text AS month`)[0]!.month
   if(account.budget_month!==current)return yield* new Conflict({message:"Start a new AI request for the current month"})
   const spent=(yield* sql<{value:string}>`SELECT (COALESCE((SELECT sum(total_cost_usd) FROM roster_ai_usage WHERE server_id=${account.server_id} AND budget_month=${account.budget_month}::date),0)
    +COALESCE((SELECT sum(b.reserved_usd) FROM roster_ai_step_budgets b JOIN roster_ai_usage u ON u.id=b.usage_id WHERE u.server_id=${account.server_id} AND u.budget_month=${account.budget_month}::date AND b.settled_at IS NULL),0))::text AS value`)[0]!.value
   // Reserve the highest approved long-context cache-write input rate,
   // not only the lower uncached-input rate. Output includes reasoning.
   const available=units(account.cap)-units(spent),inputCost=BigInt(input)*25n
   const permitted=available>inputCost?Number((available-inputCost)/75n):0
   const maxOutput=Math.min(output,permitted)
   if(maxOutput<64)return yield* new RateLimited({message:limitMessage("Monthly AI spend"),retryAfterSeconds:60})
   const held=inputCost+BigInt(maxOutput)*75n
   yield* sql`INSERT INTO roster_ai_step_budgets(usage_id,step,input_token_limit,output_token_limit,reserved_usd) VALUES(${body.requestId}::uuid,${body.step},${input},${maxOutput},${money(held)}::numeric)`
   return Response.json({step:body.step,maxOutputTokens:maxOutput,reservedUsd:Number(money(held))})
  }
  const usage=body as typeof SettleAIStepEndpoint.body.Type
  const row=(yield* sql<{input_token_limit:string;output_token_limit:string;reserved_usd:string;usage:unknown}>`SELECT input_token_limit::text,output_token_limit::text,reserved_usd::text,usage FROM roster_ai_step_budgets WHERE usage_id=${body.requestId}::uuid AND step=${body.step} FOR UPDATE`)[0]
  if(!row)return yield* new NotFound({message:"AI reservation not found"})
  const actual={inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,cachedInputTokens:usage.cachedInputTokens??0,cacheWriteTokens:usage.cacheWriteTokens??0}
  if(Object.values(actual).some(x=>!Number.isSafeInteger(x)||x<0)||actual.inputTokens>Number(row.input_token_limit)||actual.outputTokens>Number(row.output_token_limit)||actual.cachedInputTokens+actual.cacheWriteTokens>actual.inputTokens)return yield* new InvalidRequest({message:"AI usage exceeds the reserved bounds"})
  if(row.usage!==null){
   if(JSON.stringify(row.usage)!==JSON.stringify(actual) && JSON.stringify(Object.entries(row.usage as object).sort())!==JSON.stringify(Object.entries(actual).sort()))return yield* new Conflict({message:"AI step already settled differently"})
   return Response.json({settled:true})
  }
  const costs=rosterAIUsageCost(account.model,actual),cost=(costs.inputNanoUsd+costs.outputNanoUsd+9n)/10n
  if(cost>units(row.reserved_usd))return yield* new InvalidRequest({message:"AI cost exceeds reservation"})
  yield* sql`UPDATE roster_ai_step_budgets SET actual_usd=${money(cost)}::numeric,usage=${JSON.stringify(actual)}::jsonb,settled_at=now() WHERE usage_id=${body.requestId}::uuid AND step=${body.step}`
  yield* sql`UPDATE roster_ai_usage SET input_tokens=input_tokens+${actual.inputTokens},output_tokens=output_tokens+${actual.outputTokens},cached_input_tokens=cached_input_tokens+${actual.cachedInputTokens},cache_write_tokens=cache_write_tokens+${actual.cacheWriteTokens},total_tokens=total_tokens+${actual.inputTokens+actual.outputTokens},input_cost_usd=input_cost_usd+${money((costs.inputNanoUsd+9n)/10n)}::numeric,output_cost_usd=output_cost_usd+${money(cost-(costs.inputNanoUsd+9n)/10n)}::numeric,total_cost_usd=total_cost_usd+${money(cost)}::numeric WHERE id=${body.requestId}::uuid`
  return Response.json({settled:true})
 })).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"AI budget storage unavailable"}))))
})
