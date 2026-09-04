import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { prepareTicketNotification } from "../../src/ticket-notifications.js"
import { runTicketOperation } from "../../src/ticket-effects.js"
import { NotFound, UpstreamUnavailable } from "../../src/errors.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild="1434567890123456789",applicant="2434567890123456789",channel="3434567890123456789",application="4434567890123456789"
const staff="5434567890123456789",messageId="6434567890123456789",sentId="7434567890123456789"
const settings={DISCORD_TICKET_NOTIFICATIONS_ENABLED:"true",DISCORD_MAIN_APPLICATION_ID:application}
let currentTicket="",bot=false,webhook:string|undefined,topicOverride:string|undefined,foreignApp=false,foreignChannel=false,uncertain=false
let deleteMissing=false
const calls:Array<{path:string;method:string;body:unknown;at:number}>=[]
const sent:Array<{id:string;nonce:unknown;author:{id:string};components:unknown[]}> = []
const database=databaseLayer({HYPERDRIVE:{connectionString:process.env.TEST_DATABASE_URL}} as WorkerBindings)
const discord={request:(path:string,options?:{method?:string;body?:unknown})=>{
  const method=options?.method??"GET";calls.push({path,method,body:options?.body,at:Date.now()})
  if(path==="/oauth2/applications/@me")return Effect.succeed({id:foreignApp?staff:application})
  if(path===`/guilds/${guild}`)return Effect.succeed({id:guild})
  if(path===`/channels/${channel}`)return Effect.succeed({id:channel,guild_id:foreignChannel?staff:guild,type:0,topic:topicOverride??`ClashKing ticket ${currentTicket}`})
  if(path===`/channels/${channel}/messages/${messageId}`)return Effect.succeed({id:messageId,channel_id:channel,author:{id:applicant,bot},...(webhook?{webhook_id:webhook}:{})})
  if(method==="POST"&&path===`/channels/${channel}/messages`){
    sent.push({id:sentId,nonce:(options?.body as {nonce:string}|undefined)?.nonce,author:{id:application},components:[]})
    if(uncertain)return Effect.fail(new UpstreamUnavailable({cause:"test-lost-response",message:"Uncertain fixture response"}))
    return Effect.succeed({id:sentId})
  }
  if(path==="/users/@me")return Effect.succeed({id:application})
  if(path===`/channels/${channel}/messages?limit=100`)return Effect.succeed(sent)
  if(method==="DELETE"&&path===`/channels/${channel}/messages/${sentId}`)return deleteMissing
    ?Effect.fail(new NotFound({message:"Already deleted fixture message"})):Effect.succeed(undefined)
  return Effect.die(new Error(`Unexpected Discord fixture call ${method} ${path}`))
},token:()=>Effect.die("Unexpected OAuth")}
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|DiscordApi>,adapter:typeof DiscordApi.Service=discord)=>Effect.runPromise(effect.pipe(
  Effect.provide(Layer.mergeAll(database,Layer.succeed(DiscordApi,adapter))),Effect.scoped))
const event=()=>({id:messageId,guild_id:guild,channel_id:channel,author_id:applicant,application_id:application})
const fixture=()=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Notification fixture') ON CONFLICT DO NOTHING`
  yield* sql`DELETE FROM ticket_runtime_effects WHERE operation_id IN (SELECT id FROM ticket_runtime_operations WHERE server_id=${guild})`
  yield* sql`DELETE FROM ticket_runtime_operations WHERE server_id=${guild}`
  yield* sql`DELETE FROM tickets WHERE server_id=${guild}`
  const panel=crypto.randomUUID();currentTicket=crypto.randomUUID()
  yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panel}::uuid,${guild},${panel},'[]','{}')`
  yield* sql`INSERT INTO tickets(id,server_id,channel_id,panel_id,number,status_id,is_thread,applicant_user_id,status,opted_in_user_ids)
    VALUES(${currentTicket}::uuid,${guild},${channel},${panel}::uuid,nextval('tickets_number_seq'),0,false,${applicant},'open',${[staff,staff,applicant]})`
  calls.length=0;sent.length=0;bot=false;webhook=undefined;topicOverride=undefined;foreignApp=false;foreignChannel=false;uncertain=false;deleteMissing=false
})
const readyDeletion=(id:string)=>Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
  yield* sql`UPDATE ticket_runtime_effects SET updated_at=clock_timestamp()-interval '2 seconds'
    WHERE operation_id=${id}::uuid AND effect_key='notify:0'`
  yield* sql`UPDATE ticket_runtime_effects SET next_attempt_at=clock_timestamp()-interval '1 second'
    WHERE operation_id=${id}::uuid AND effect_key='notify:0:delete'`
})

describe("ID-only ticket notification journal and effects",()=>{
  it("journals concurrent delivery once and deletes only after its successful send plus one second",async()=>{
    await run(fixture())
    const [one,two]=await Promise.all([run(prepareTicketNotification(event(),settings)),run(prepareTicketNotification(event(),settings))])
    expect(one).toEqual(two)
    if(one.outcome!=="accepted")throw new Error("Expected accepted notification")
    expect(await run(runTicketOperation(one.operationId))).toBe("waiting")
    expect(calls.filter(call=>call.method==="POST")).toHaveLength(1)
    expect(calls.find(call=>call.method==="POST")?.body).toMatchObject({content:`<@${staff}>`,allowed_mentions:{parse:[],users:[staff]}})
    expect(calls.some(call=>call.method==="DELETE")).toBe(false)
    const journal=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      return {operation:(yield* sql<{request:unknown;context:unknown}>`SELECT request,context FROM ticket_runtime_operations WHERE id=${one.operationId}::uuid`)[0],
        delay:(yield* sql<{seconds:number}>`SELECT extract(epoch FROM removal.next_attempt_at-sent.updated_at)::float8 AS seconds
          FROM ticket_runtime_effects removal JOIN ticket_runtime_effects sent ON sent.operation_id=removal.operation_id
          WHERE removal.operation_id=${one.operationId}::uuid AND removal.effect_key='notify:0:delete' AND sent.effect_key='notify:0'`)[0]!.seconds}
    }))
    expect(journal.operation?.request).toEqual(event());expect(journal.delay).toBeGreaterThanOrEqual(1)
    await new Promise(resolve=>setTimeout(resolve,1100))
    expect(await run(runTicketOperation(one.operationId))).toBe("completed")
    expect(calls.filter(call=>call.method==="DELETE")).toHaveLength(1)
    const readsBeforeReplay=calls.length
    expect(await run(prepareTicketNotification(event(),settings))).toEqual(one)
    expect(await run(runTicketOperation(one.operationId))).toBe("completed")
    expect(calls).toHaveLength(readsBeforeReplay)
    await expect(run(prepareTicketNotification({...event(),author_id:staff},settings))).rejects.toMatchObject({_tag:"Conflict"})
  })
  it("defaults off and rejects foreign identities, old topics, bots and webhooks before journaling",async()=>{
    await run(fixture())
    expect(await run(prepareTicketNotification(event(),{...settings,DISCORD_TICKET_NOTIFICATIONS_ENABLED:"false"}))).toEqual({outcome:"ignored"})
    expect(calls).toHaveLength(0)
    expect(await run(prepareTicketNotification({...event(),application_id:staff},settings))).toEqual({outcome:"ignored"})
    foreignApp=true;await expect(run(prepareTicketNotification(event(),settings))).rejects.toMatchObject({_tag:"Forbidden"});foreignApp=false
    foreignChannel=true;expect(await run(prepareTicketNotification(event(),settings))).toEqual({outcome:"ignored"});foreignChannel=false
    topicOverride="ticket-legacy";expect(await run(prepareTicketNotification(event(),settings))).toEqual({outcome:"ignored"});topicOverride=undefined
    bot=true;expect(await run(prepareTicketNotification(event(),settings))).toEqual({outcome:"ignored"});bot=false
    webhook=staff;expect(await run(prepareTicketNotification(event(),settings))).toEqual({outcome:"ignored"});webhook=undefined
    const operations=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient;return yield* sql`SELECT id FROM ticket_runtime_operations WHERE server_id=${guild}`}))
    expect(operations).toHaveLength(0)
  })
  it("reconciles a lost send response without repinging and preserves the delete delay",async()=>{
    await run(fixture());uncertain=true
    const accepted=await run(prepareTicketNotification(event(),settings))
    if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
    expect(await run(runTicketOperation(accepted.operationId))).toBe("reconciling")
    expect(await run(runTicketOperation(accepted.operationId))).toBe("waiting")
    expect(calls.filter(call=>call.method==="POST")).toHaveLength(1)
    expect(calls.some(call=>call.method==="DELETE")).toBe(false)
    await new Promise(resolve=>setTimeout(resolve,1100))
    expect(await run(runTicketOperation(accepted.operationId))).toBe("completed")
    expect(calls.filter(call=>call.method==="POST")).toHaveLength(1)
    expect(calls.filter(call=>call.method==="DELETE")).toHaveLength(1)
  })
  it("never resends or deletes while an uncertain send has no exact bot-authored nonce match",async()=>{
    await run(fixture());uncertain=true
    const accepted=await run(prepareTicketNotification(event(),settings))
    if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
    expect(await run(runTicketOperation(accepted.operationId))).toBe("reconciling")
    const original=sent[0]!
    sent.length=0
    expect(await run(runTicketOperation(accepted.operationId))).toBe("reconciling")
    sent.push({...original,author:{id:staff}})
    expect(await run(runTicketOperation(accepted.operationId))).toBe("reconciling")
    expect(calls.filter(call=>call.method==="POST")).toHaveLength(1)
    expect(calls.some(call=>call.method==="DELETE")).toBe(false)
  })
  it("retries an expired delete lease and treats exact-target 404 as successful cleanup",async()=>{
    await run(fixture())
    const accepted=await run(prepareTicketNotification(event(),settings))
    if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
    await run(runTicketOperation(accepted.operationId));await run(readyDeletion(accepted.operationId))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_runtime_effects SET state='executing',lease_token=${crypto.randomUUID()}::uuid,
        claimed_at=clock_timestamp()-interval '2 minutes',lease_expires_at=clock_timestamp()-interval '1 second',attempt_count=1
        WHERE operation_id=${accepted.operationId}::uuid AND effect_key='notify:0:delete'`
    }))
    deleteMissing=true
    expect(await run(runTicketOperation(accepted.operationId))).toBe("completed")
    expect(calls.filter(call=>call.method==="DELETE")).toMatchObject([{path:`/channels/${channel}/messages/${sentId}`}])
  })
  it("rejects missing message identity and mismatched dependency channels without deleting",async()=>{
    for(const result of [{},{id:sentId,channelId:staff}]){
      await run(fixture())
      const accepted=await run(prepareTicketNotification(event(),settings))
      if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
      await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
        // Seed corrupt initial dependency evidence only in this disposable
        // fixture. Real succeeded evidence is immutable and must stay so.
        yield* sql`DELETE FROM ticket_runtime_effects WHERE operation_id=${accepted.operationId}::uuid`
        yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state,result,updated_at) VALUES
          (${accepted.operationId}::uuid,'notify:0',0,'send_message','{}','succeeded',${JSON.stringify(result)}::jsonb,clock_timestamp()-interval '2 seconds'),
          (${accepted.operationId}::uuid,'notify:0:delete',1,'delete_message',${JSON.stringify({channelId:channel,messageEffectKey:"notify:0"})}::jsonb,'pending','{}',clock_timestamp())`
      }))
      expect(await run(runTicketOperation(accepted.operationId))).toBe("failed")
      expect(calls.some(call=>call.method==="DELETE")).toBe(false)
    }
  })
  it("requeues a dependency SQL failure before Discord I/O and later cleans up the same target",async()=>{
    await run(fixture())
    const accepted=await run(prepareTicketNotification(event(),settings))
    if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
    await run(runTicketOperation(accepted.operationId));await run(readyDeletion(accepted.operationId))
    let faulted=false
    const failure=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      const faulty=new Proxy(sql,{apply(target,thisArg,args){
        if(!faulted&&String(args[0]).includes("SELECT effect_key,result")){
          faulted=true;return sql`SELECT 1/0 AS fixture_dependency_failure`
        }
        return Reflect.apply(target,thisArg,args)
      }})
      return yield* runTicketOperation(accepted.operationId).pipe(Effect.provideService(SqlClient.SqlClient,faulty))
    }))
    expect(faulted).toBe(true);expect(failure).toBe("waiting")
    expect(calls.some(call=>call.method==="DELETE")).toBe(false)
    const effect=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      return (yield* sql<{state:string;last_error:string}>`SELECT state,last_error FROM ticket_runtime_effects
        WHERE operation_id=${accepted.operationId}::uuid AND effect_key='notify:0:delete'`)[0]
    }))
    expect(effect).toMatchObject({state:"pending",last_error:"dependency_read_unavailable"})
    await run(readyDeletion(accepted.operationId))
    expect(await run(runTicketOperation(accepted.operationId))).toBe("completed")
    expect(calls.filter(call=>call.method==="DELETE")).toMatchObject([{path:`/channels/${channel}/messages/${sentId}`}])
  })
  it("fences a stale deletion completion after a replacement worker owns and completes the effect",async()=>{
    await run(fixture())
    const accepted=await run(prepareTicketNotification(event(),settings))
    if(accepted.outcome!=="accepted")throw new Error("Expected accepted notification")
    await run(runTicketOperation(accepted.operationId));await run(readyDeletion(accepted.operationId))
    const entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>()
    const slow:typeof DiscordApi.Service={...discord,request:(path,options)=>options?.method==="DELETE"
      ?Effect.promise(async()=>{entered.resolve();await release.promise;return undefined}):discord.request(path,options)}
    const old=run(runTicketOperation(accepted.operationId),slow).then(value=>value,cause=>cause as {_tag:string})
    await entered.promise
    try {
      await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
        yield* sql`UPDATE ticket_runtime_effects SET lease_expires_at=clock_timestamp()-interval '1 second'
          WHERE operation_id=${accepted.operationId}::uuid AND effect_key='notify:0:delete' AND state='executing'`
      }))
      expect(await run(runTicketOperation(accepted.operationId))).toBe("completed")
    } finally {release.resolve()}
    expect(await old).toMatchObject({_tag:"Conflict"})
    const saved=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      return (yield* sql<{state:string;attempt_count:number;result:unknown}>`SELECT state,attempt_count,result FROM ticket_runtime_effects
        WHERE operation_id=${accepted.operationId}::uuid AND effect_key='notify:0:delete'`)[0]
    }))
    expect(saved).toMatchObject({state:"succeeded",attempt_count:2,result:{id:sentId,channelId:channel}})
  })
})
