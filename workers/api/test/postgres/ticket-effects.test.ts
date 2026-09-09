import { readFileSync,readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Effect,Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe,expect,it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { NotFound,UpstreamUnavailable } from "../../src/errors.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if(!process.env.TEST_DATABASE_URL||process.env.CLASHKING_DISPOSABLE_TIMESCALE!=="1")throw new Error("Disposable Goose Timescale required")
const guild="1834567890123456789",actor="2834567890123456789",originChannel="3834567890123456789",originMessage="4834567890123456789"
const database=databaseLayer({ HYPERDRIVE:{ connectionString:process.env.TEST_DATABASE_URL } } as WorkerBindings)
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient>)=>Effect.runPromise(effect.pipe(Effect.provide(database),Effect.scoped))
const runDiscord=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|DiscordApi>,discord:typeof DiscordApi.Service)=>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database,Layer.succeed(DiscordApi,discord))),Effect.scoped))
const settings={ questions:[],mod_role:[],no_ping_mod_role:[],private_thread:false,th_min:0,num_apply:25,
  naming:"{ticket_count}-{user}",account_apply:false,player_info:false,apply_clans:[],roles_to_add:[],roles_to_remove:[],
  townhall_requirements:{},new_message:null }
interface EffectFixture { readonly key:string;readonly type:string;readonly request:unknown;readonly state?:string
  readonly result?:unknown;readonly leaseToken?:string;readonly expired?:boolean;readonly attempts?:number }
const fixture=(suffix:string,effects:ReadonlyArray<EffectFixture>)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Ticket effect fixture') ON CONFLICT DO NOTHING`
  const panelId=`70000000-0000-4000-8000-0000000000${suffix}`,buttonId=`71000000-0000-4000-8000-0000000000${suffix}`
  const operationId=`72000000-0000-4000-8000-0000000000${suffix}`,ticketId=`73000000-0000-4000-8000-0000000000${suffix}`
  const customId=`ck:ticket:open:${panelId}:${buttonId}`,hash=suffix.repeat(32),interactionId=`8${suffix}4567890123456789`
  yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panelId}::uuid,${guild},${`Effects ${suffix}`},
    ${JSON.stringify([{ id:buttonId,type:2,custom_id:customId,style:1,label:"Apply" }])}::jsonb,
    ${JSON.stringify({ [`${customId}_settings`]:settings })}::jsonb)`
  yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
    origin_channel_id,origin_message_id,context,request,request_hash,progress,submission_interaction_id,submitted_request,
    submitted_request_hash,state) VALUES(${operationId}::uuid,${interactionId},'open',${ticketId}::uuid,${100+Number(suffix)},${guild},${actor},
    ${panelId}::uuid,${buttonId}::uuid,${originChannel},${originMessage},${JSON.stringify({ actorLabel:"Applicant",settings })}::jsonb,
    '{}'::jsonb,${hash},'{"accounts":[]}'::jsonb,${String(BigInt(interactionId)+1n)},'{}'::jsonb,${hash},'submitted')`
  for(const [ordinal,effect] of effects.entries())yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,
    state,lease_token,claimed_at,lease_expires_at,attempt_count,result) VALUES(${operationId}::uuid,${effect.key},${ordinal},${effect.type},
    ${JSON.stringify(effect.request)}::jsonb,${effect.state??"pending"},${effect.leaseToken??null}::uuid,
    ${effect.leaseToken?"2026-01-01T00:00:00Z":null}::timestamptz,
    ${effect.leaseToken?(effect.expired?"2026-01-01T00:01:00Z":"2099-01-01T00:01:00Z"):null}::timestamptz,
    ${effect.attempts??0},${JSON.stringify(effect.result??{})}::jsonb)`
  return { operationId,ticketId,panelId }
})

describe("ticket external effect executor",()=>{
  it("reconciles a staff application only with the exact account viewer control and never repeats its POST",async()=>{
    const channelId="8134567890123456701",threadId="8134567890123456702",botId="8134567890123456703",nonce="ticket-128-staff-0"
    const work=await run(fixture("28",[
      {key:"channel",type:"create_channel",request:{},state:"succeeded",result:{id:channelId}},
      {key:"thread",type:"create_thread",request:{},state:"succeeded",result:{id:threadId}},
      {key:"thread-application:0",type:"send_message",request:{target:"thread",nonce,accounts:["#P0Y"]},state:"executing",
        leaseToken:"33333333-3333-4333-8333-333333333333",expired:true,attempts:1},
    ]))
    let includeControl=false,posts=0
    const discord={request:(path:string,options?:{method?:string})=>{
      if(options?.method==="POST"){posts++;return Effect.die("Reconciliation must not repost")}
      if(path==="/users/@me")return Effect.succeed({id:botId})
      if(path===`/channels/${threadId}/messages?limit=100`)return Effect.succeed([{id:"8134567890123456704",nonce,
        author:{id:botId},components:includeControl?[{type:1,components:[{custom_id:`ck:ticket:accounts-view:${work.ticketId}`}]}]:[]}])
      return Effect.die(`Unexpected Discord request ${path}`)
    },token:()=>Effect.die("Unexpected OAuth")}
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("reconciling")
    includeControl=true
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("completed")
    expect(posts).toBe(0)
  })
  it("fails stored everyone-as-staff effects before any Discord lookup or mutation",async()=>{
    const work=await run(fixture("27",[{key:"channel",type:"create_channel",request:{serverId:guild,
      ticketId:"73000000-0000-4000-8000-000000000027",name:"Unsafe",applicantUserId:actor,moderatorRoleIds:[guild],originChannelId:originChannel}}]))
    let calls=0
    const discord={request:()=>{calls++;return Effect.die("Unsafe permissions must fail before Discord")},token:()=>Effect.die("Unexpected OAuth")}
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("failed")
    expect(calls).toBe(0)
  })
  it("runs a complete channel, message, pin, thread, member, and role lifecycle exactly once",async()=>{
    const work=await run(fixture("21",[
      { key:"channel",type:"create_channel",request:{ serverId:guild,ticketId:"73000000-0000-4000-8000-000000000021",name:"101-Applicant",applicantUserId:actor,moderatorRoleIds:["5834567890123456789"] } },
      { key:"application:0",type:"send_message",request:{ target:"channel",nonce:"ticket-121-0",applicantUserId:actor,pingRoleIds:["5834567890123456789"],questions:["Why?"],answers:["Because"],accounts:["#P0Y"] } },
      { key:"pin-application",type:"pin_message",request:{ messageEffectKey:"application:0" } },
      { key:"thread",type:"create_thread",request:{ name:"Private | 101-Applicant" } },
      { key:"thread-application:0",type:"send_message",request:{target:"thread",nonce:"ticket-121-staff-0",pingRoleIds:["5834567890123456789"],questions:["Why?"],answers:["Because"],accounts:["#P0Y"]} },
      { key:"pin-thread-application",type:"pin_message",request:{target:"thread",messageEffectKey:"thread-application:0"} },
      { key:"add-role:1",type:"add_role",request:{ roleId:"6834567890123456789",userId:actor } },
      { key:"remove-role:1",type:"remove_role",request:{ roleId:"7834567890123456789",userId:actor } },
    ]))
    const calls:Array<{path:string;method:string;body:unknown}>=[]
    const discord={ request:(path:string,options?:{method?:string;body?:unknown})=>{
      calls.push({ path,method:options?.method??"GET",body:options?.body })
      if(path===`/guilds/${guild}/channels`)return Effect.succeed({ id:"8834567890123456789" })
      if(path==="/channels/8834567890123456789/messages")return Effect.succeed({ id:"9834567890123456789" })
      if(path==="/channels/8834567890123456789/threads")return Effect.succeed({ id:"1934567890123456789" })
      if(path==="/channels/1934567890123456789/messages")return Effect.succeed({ id:"2934567890123456789" })
      return Effect.succeed({})
    },token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("completed")
    const callCount=calls.length
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("completed")
    expect(calls).toHaveLength(callCount)
    expect(calls.find(call=>call.path === `/guilds/${guild}/channels`)?.body).toMatchObject({permission_overwrites:[
      {id:guild,type:0,deny:"1024",allow:"262144"},{id:actor,type:1,deny:"0",allow:"379968"},
      {id:"5834567890123456789",type:0,deny:"0",allow:"277025762384"},
    ]})
    const message=calls.find((call)=>call.path.endsWith("/messages"))?.body as Record<string,unknown>
    expect(message).toMatchObject({ nonce:"ticket-121-0",enforce_nonce:true,allowed_mentions:{ parse:[],users:[actor],roles:["5834567890123456789"] } })
    expect(message.components).toEqual([{ type:1,components:[
      { type:2,style:2,label:"Delete Ticket",custom_id:`ck:ticket:delete:${work.ticketId}` },
      { type:2,style:2,label:"Assign",custom_id:`ck:ticket:assign:${work.ticketId}` },
      { type:2,style:3,label:"Approve",custom_id:`ck:ticket:approve:${work.ticketId}` },
      { type:2,style:2,label:"Accounts",custom_id:`ck:ticket:accounts-view:${work.ticketId}` },
    ] }])
    expect(calls.some((call)=>call.path==="/channels/8834567890123456789/pins/9834567890123456789"&&call.method==="PUT")).toBe(true)
    expect(calls.some((call)=>call.path.includes("/thread-members/"))).toBe(false)
    expect(calls.find(call=>call.path==="/channels/1934567890123456789/messages")?.body).toMatchObject({
      content:"<@&5834567890123456789>",allowed_mentions:{parse:[],users:[],roles:["5834567890123456789"]},
      embeds:[{title:"Ticket application",description:"**Accounts**\n`#P0Y`\n\n**1. Why?**\n> Because"}],components:[{type:1,components:[
        {type:2,style:2,label:"Accounts",custom_id:`ck:ticket:accounts-view:${work.ticketId}`},
      ]}],
    })
    expect(calls.some(call=>call.path==="/channels/1934567890123456789/pins/2934567890123456789"&&call.method==="PUT")).toBe(true)
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ state:string;channel_id:string;thread_id:string }>`SELECT operation.state,ticket.channel_id,ticket.thread_id
        FROM ticket_runtime_operations operation JOIN tickets ticket ON ticket.id=operation.ticket_id WHERE operation.id=${work.operationId}::uuid`)[0])
        .toEqual({ state:"completed",channel_id:"8834567890123456789",thread_id:"1934567890123456789" })
      expect((yield* sql<{ count:number }>`SELECT count(*)::integer AS count FROM ticket_runtime_effects WHERE operation_id=${work.operationId}::uuid AND state='succeeded'`)[0]?.count).toBe(8)
    }))
  })

  it("reconciles a lost create-channel response without a second POST",async()=>{
    const work=await run(fixture("22",[
      { key:"channel",type:"create_channel",request:{ serverId:guild,ticketId:"73000000-0000-4000-8000-000000000022",name:"122-Applicant",applicantUserId:actor,moderatorRoleIds:[] } },
      { key:"application:0",type:"send_message",request:{ target:"channel",nonce:"ticket-122-0",applicantUserId:actor,pingRoleIds:[],questions:[],answers:[],accounts:[] } },
    ]))
    let creates=0
    const lost={ request:(_path:string,options?:{method?:string})=>{
      if(options?.method==="POST")creates++
      return Effect.fail(new UpstreamUnavailable({ cause:undefined,message:"Lost Discord response" }))
    },token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(work.operationId),lost)).toBe("reconciling")
    const recovered={ request:(path:string,options?:{method?:string})=>{
      if(path===`/guilds/${guild}/channels`&&options?.method===undefined)return Effect.succeed([{ id:"8934567890123456789",topic:`ClashKing ticket ${work.ticketId}` }])
      if(path==="/channels/8934567890123456789/messages")return Effect.succeed({ id:"9934567890123456789" })
      return Effect.die(`Unexpected Discord call ${path}`)
    },token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(work.operationId),recovered)).toBe("completed")
    expect(creates).toBe(1)
  })

  it("reconciles an expired message claim without replaying its POST and treats an already deleted channel as success",async()=>{
    const lease="11111111-1111-4111-8111-111111111111"
    const work=await run(fixture("23",[
      { key:"channel",type:"create_channel",request:{},state:"succeeded",result:{ id:"8134567890123456789" } },
      { key:"application:0",type:"send_message",request:{ target:"channel",nonce:"ticket-123-0",applicantUserId:actor,pingRoleIds:[],questions:[],answers:[],accounts:[] },state:"executing",leaseToken:lease,expired:true,attempts:1 },
      { key:"delete",type:"delete_channel",request:{} },
    ]))
    let messagePosts=0
    const discord={ request:(path:string,options?:{method?:string})=>{
      if(path==="/users/@me")return Effect.succeed({ id:"9234567890123456789" })
      if(path.endsWith("/messages?limit=100"))return Effect.succeed([{ id:"9134567890123456789",nonce:"ticket-123-0",
        author:{ id:"9234567890123456789" },components:[{ type:1,components:[
          { custom_id:`ck:ticket:delete:${work.ticketId}` },{ custom_id:`ck:ticket:assign:${work.ticketId}` },
          { custom_id:`ck:ticket:approve:${work.ticketId}` },
        ] }] }])
      if(path.endsWith("/messages")&&options?.method==="POST"){messagePosts++;return Effect.die("Expired message claim must not be replayed")}
      return Effect.fail(new NotFound({ message:"Already deleted" }))
    },token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("completed")
    expect(messagePosts).toBe(0)
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ attempt_count:number;state:string }>`SELECT attempt_count,state FROM ticket_runtime_effects
        WHERE operation_id=${work.operationId}::uuid AND effect_key='application:0'`)[0]).toEqual({ attempt_count:1,state:"succeeded" })
      expect((yield* sql<{ result:unknown }>`SELECT result FROM ticket_runtime_effects WHERE operation_id=${work.operationId}::uuid AND effect_key='delete'`)[0]?.result)
        .toEqual({ id:"8134567890123456789" })
    }))
  })

  it("continues a queue larger than one alarm batch and makes a conflicting finalization terminal",async()=>{
    const effects:EffectFixture[]=[{ key:"channel",type:"create_channel",request:{},state:"succeeded",result:{ id:"8234567890123456789" } }]
    for(let index=0;index<40;index++)effects.push({ key:`add-role:${index}`,type:"add_role",request:{ roleId:String(5000000000000000000n+BigInt(index)),userId:actor } })
    const batched=await run(fixture("24",effects)),discord={ request:()=>Effect.succeed({}),token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(batched.operationId),discord)).toBe("waiting")
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ count:number }>`SELECT count(*)::integer AS count FROM ticket_runtime_effects
        WHERE operation_id=${batched.operationId}::uuid AND state='succeeded'`)[0]?.count).toBe(33)
    }))
    expect(await runDiscord(runTicketOperation(batched.operationId),discord)).toBe("completed")

    const conflict=await run(fixture("25",[{ key:"channel",type:"create_channel",request:{},state:"succeeded",result:{ id:"8334567890123456789" } }]))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO tickets(id,server_id,channel_id,number,panel_id,applicant_user_id,status)
        VALUES(${conflict.ticketId}::uuid,${guild},'8434567890123456789',125,${conflict.panelId}::uuid,${actor},'open')`
    }))
    expect(await runDiscord(runTicketOperation(conflict.operationId),discord)).toBe("failed")
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ state:string;result:unknown }>`SELECT state,result FROM ticket_runtime_operations WHERE id=${conflict.operationId}::uuid`)[0])
        .toEqual({ state:"failed",result:{ failure:"ticket_finalization_conflict" } })
    }))
  })

  it("reconciles an auto-archived private thread only under the known parent and bot owner",async()=>{
    const lease="22222222-2222-4222-8222-222222222222",channelId="8534567890123456789",threadId="8634567890123456789"
    const work=await run(fixture("26",[
      { key:"channel",type:"create_channel",request:{},state:"succeeded",result:{ id:channelId } },
      { key:"thread",type:"create_thread",request:{ name:"Private | 126-Applicant" },state:"executing",leaseToken:lease,expired:true,attempts:1 },
    ]))
    let threadPosts=0
    const discord={ request:(path:string,options?:{method?:string})=>{
      if(options?.method==="POST"){threadPosts++;return Effect.die("Expired thread claim must not be replayed")}
      if(path==="/users/@me")return Effect.succeed({ id:"8734567890123456789" })
      if(path===`/guilds/${guild}/threads/active`)return Effect.succeed({ threads:[{
        id:"8834567890123456789",name:"Private | 126-Applicant",parent_id:"wrong",owner_id:"8734567890123456789",
      }] })
      if(path===`/channels/${channelId}/users/@me/threads/archived/private?limit=100`)return Effect.succeed({ threads:[{
        id:"8934567890123456789",name:"Private | 126-Applicant",parent_id:"wrong",owner_id:"8734567890123456789",
      }],has_more:true })
      if(path===`/channels/${channelId}/users/@me/threads/archived/private?limit=100&before=8934567890123456789`)return Effect.succeed({ threads:[{
        id:threadId,name:"Private | 126-Applicant",parent_id:channelId,owner_id:"8734567890123456789",
      }],has_more:false })
      return Effect.die(`Unexpected Discord call ${path}`)
    },token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketOperation(work.operationId),discord)).toBe("completed")
    expect(threadPosts).toBe(0)
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ thread_id:string }>`SELECT thread_id FROM tickets WHERE id=${work.ticketId}::uuid`)[0]?.thread_id).toBe(threadId)
    }))
  })

  it("contains no PostgreSQL advisory lock dependency in the Worker runtime",()=>{
    const root=fileURLToPath(new URL("../../src",import.meta.url))
    for(const file of readdirSync(root,{ recursive:true,encoding:"utf8" }).filter((name)=>name.endsWith(".ts"))){
      expect(readFileSync(`${root}/${file}`,"utf8")).not.toMatch(/pg_advisory|advisory_xact/u)
    }
  })
})
