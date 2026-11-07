import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ReserveAIStepEndpoint, SettleAIStepEndpoint } from "@clashking/api-contracts"
import { sameSecret } from "./auth.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, Unauthenticated } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { rosterAIUsageCost } from "./dashboard-roster-ai-usage.js"
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
  // Serialize per-request accounting. The monthly allowance gates admission
  // only; a started prompt must finish and record costs even above its limit.
  const account=(yield* sql<{model:"gpt-6-luna"}>`
   SELECT model FROM roster_ai_usage WHERE id=${body.requestId}::uuid FOR UPDATE`)[0]
  if(!account)return yield* new NotFound({message:"AI request not found"})
  if(account.model!=="gpt-6-luna")return yield* new InvalidRequest({message:"Unsupported AI accounting model"})
  if(reserve){
   const input=(body as typeof ReserveAIStepEndpoint.body.Type).inputTokenLimit,output=(body as typeof ReserveAIStepEndpoint.body.Type).outputTokenLimit
   if(input<1||input>1000000||output<1||output>64000)return yield* new InvalidRequest({message:"AI token bounds are invalid"})
   // Keep the legacy route for a rolling upgrade, but reserve no money.
   // A retry after a lost HTTP response must not prevent the provider call.
   yield* sql`INSERT INTO roster_ai_step_budgets(usage_id,step,input_token_limit,output_token_limit,reserved_usd)
    VALUES(${body.requestId}::uuid,${body.step},${input},${output},0) ON CONFLICT(usage_id,step) DO NOTHING`
   return Response.json({step:body.step,maxOutputTokens:output,reservedUsd:0})
  }
  const usage=body as typeof SettleAIStepEndpoint.body.Type
  const row=(yield* sql<{usage:Record<string,number>|null}>`SELECT usage FROM roster_ai_step_budgets WHERE usage_id=${body.requestId}::uuid AND step=${body.step} FOR UPDATE`)[0]
  if(!row)return yield* new NotFound({message:"AI call not found"})
  const actual={inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,cachedInputTokens:usage.cachedInputTokens??0,cacheWriteTokens:usage.cacheWriteTokens??0,reasoningTokens:usage.reasoningTokens??0}
  if(Object.values(actual).some(x=>!Number.isSafeInteger(x)||x<0)||actual.cachedInputTokens+actual.cacheWriteTokens>actual.inputTokens||actual.reasoningTokens>actual.outputTokens)return yield* new InvalidRequest({message:"Invalid AI usage"})
  const outcome=usage.outcome??"completed"
  if((usage.providerResponseId?.length??0)>200||(usage.failureCode?.length??0)>100)return yield* new InvalidRequest({message:"Invalid AI diagnostic identifier"})
  if(outcome==="unknown"){
   // No provider receipt means unknown, not free. A later receipt may repair
   // this row; a delayed error must never overwrite an already recorded cost.
   if(row.usage===null)yield* sql`UPDATE roster_ai_step_budgets SET outcome='unknown',provider_response_id=COALESCE(${usage.providerResponseId??null},provider_response_id),failure_code=${usage.failureCode??'missing_usage'},updated_at=now() WHERE usage_id=${body.requestId}::uuid AND step=${body.step}`
   return Response.json({settled:false})
  }
  if(outcome==="rejected"&&Object.values(actual).some(x=>x!==0))return yield* new InvalidRequest({message:"Rejected calls cannot include usage"})
  if(row.usage!==null){
   if(Object.entries(actual).some(([key,value])=>(row.usage![key]??0)!==value))return yield* new Conflict({message:"AI call already recorded differently"})
   return Response.json({settled:true})
  }
  const costs=rosterAIUsageCost(account.model,actual),cost=(costs.inputNanoUsd+costs.outputNanoUsd+9n)/10n
  yield* sql`UPDATE roster_ai_step_budgets SET actual_usd=${money(cost)}::numeric,usage=${JSON.stringify(actual)}::jsonb,settled_at=now(),outcome=${outcome},provider_response_id=COALESCE(${usage.providerResponseId??null},provider_response_id),failure_code=${usage.failureCode??null},updated_at=now() WHERE usage_id=${body.requestId}::uuid AND step=${body.step}`
  yield* sql`UPDATE roster_ai_usage SET input_tokens=input_tokens+${actual.inputTokens},output_tokens=output_tokens+${actual.outputTokens},cached_input_tokens=cached_input_tokens+${actual.cachedInputTokens},cache_write_tokens=cache_write_tokens+${actual.cacheWriteTokens},reasoning_tokens=reasoning_tokens+${actual.reasoningTokens},total_tokens=total_tokens+${actual.inputTokens+actual.outputTokens},input_cost_usd=input_cost_usd+${money((costs.inputNanoUsd+9n)/10n)}::numeric,output_cost_usd=output_cost_usd+${money(cost-(costs.inputNanoUsd+9n)/10n)}::numeric,total_cost_usd=total_cost_usd+${money(cost)}::numeric WHERE id=${body.requestId}::uuid`
  return Response.json({settled:true})
 })).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"AI usage storage unavailable"}))))
})
