import { Deferred,Effect,Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeAll,describe,expect,it } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { DeferredRuntimeBindings, WorkerBindings } from "../../src/environment.js"
import { UpstreamUnavailable } from "../../src/errors.js"
import { dispatchPersistentRuntime } from "../../src/persistent-runtime.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { prepareTicketPanelPublication,runTicketPanelPublication,ticketPanelPublicationStatus } from "../../src/ticket-panel-publications.js"
import { pendingRuntimePage, type RecoveryCursor, type RecoveryJob } from "../../src/runtime-recovery.js"

if(!process.env.TEST_DATABASE_URL||process.env.CLASHKING_DISPOSABLE_TIMESCALE!=="1")throw new Error("Disposable Goose Timescale required")
const guild="1734567890123456789",channel="2734567890123456789",actor="3734567890123456789"
const database=databaseLayer({ HYPERDRIVE:{ connectionString:process.env.TEST_DATABASE_URL } } as WorkerBindings)
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient>)=>Effect.runPromise(effect.pipe(Effect.provide(database),Effect.scoped))
const runDiscord=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|DiscordApi>,discord:typeof DiscordApi.Service)=>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database,Layer.succeed(DiscordApi,discord))),Effect.scoped))
let counter=8734567890123456789n
let keys:CryptoKeyPair,publicKey=""
const bytesHex=(value:ArrayBuffer)=>[...new Uint8Array(value)].map((byte)=>byte.toString(16).padStart(2,"0")).join("")
beforeAll(async()=>{
  keys=await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]) as CryptoKeyPair
  publicKey=bytesHex(await crypto.subtle.exportKey("raw",keys.publicKey))
})
const command=(panelId:string,options:Partial<VerifiedRuntimeInteraction>={}):VerifiedRuntimeInteraction=>({
  id:String(counter++),actorId:actor,actorLabel:"Manager",actorRoleIds:[],permissions:"32",guildId:guild,channelId:channel,
  messageId:undefined,type:2,data:{ name:"ticket",options:[{ name:"panel-post",type:1,options:[{ name:"panel-id",type:3,value:panelId }] }] },
  requestHash:"b".repeat(64),signedAt:Date.now(),...options,
})
const fixture=(suffix:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Panel publication fixture') ON CONFLICT DO NOTHING`
  const panelId=`20000000-0000-4000-8000-0000000000${suffix}`,buttonId=`30000000-0000-4000-8000-0000000000${suffix}`
  const customId=`ck:ticket:open:${panelId}:${buttonId}`
  yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panelId}::uuid,${guild},${`Panel ${suffix}`},
    ${JSON.stringify([{ id:buttonId,type:2,custom_id:customId,style:1,label:"Apply",emoji:{ id:null,name:null,animated:true } }])}::jsonb,'{}'::jsonb)`
  return { panelId,buttonId,customId }
})

describe("ticket panel publication journal",()=>{
  it("does not reuse another runner's live lease to issue a second Discord POST",async()=>{
    const panel=await run(fixture("16")),prepared=await run(prepareTicketPanelPublication(command(panel.panelId)))
    const entered=await Effect.runPromise(Deferred.make<void>()),release=await Effect.runPromise(Deferred.make<void>())
    let posts=0
    const discord={request:()=>Effect.gen(function*(){
      posts++
      yield* Deferred.succeed(entered,undefined)
      yield* Deferred.await(release)
      return {id:"4734567890123456799"}
    }),token:()=>Effect.die("Unexpected OAuth")}
    const first=runDiscord(runTicketPanelPublication(prepared.effectId),discord)
    try {
      await Effect.runPromise(Deferred.await(entered))
      const second=await runDiscord(runTicketPanelPublication(prepared.effectId),{
        request:()=>Effect.die("A runner observing a live lease must not call Discord"),token:()=>Effect.die("Unexpected OAuth"),
      })
      expect(second).toMatchObject({state:"executing"})
      expect(posts).toBe(1)
    } finally { await Effect.runPromise(Deferred.succeed(release,undefined)) }
    expect(await first).toMatchObject({state:"succeeded",messageId:"4734567890123456799"})
    expect(posts).toBe(1)
  })
  it("publishes a sanitized canonical panel once and atomically records its active occurrence",async()=>{
    const panel=await run(fixture("11")),proof=command(panel.panelId),prepared=await run(prepareTicketPanelPublication(proof))
    const calls:Array<{ path:string;body:unknown }>=[]
    const discord={ request:(path:string,options?:{body?:unknown})=>{ calls.push({ path,body:options?.body });return Effect.succeed({ id:"4734567890123456789" }) },
      token:()=>Effect.die("Unexpected OAuth") }
    const completed=await runDiscord(runTicketPanelPublication(prepared.effectId),discord)
    expect(completed).toMatchObject({ state:"succeeded",messageId:"4734567890123456789" })
    expect(calls).toHaveLength(1)
    const body=calls[0]!.body as { components:Array<{components:Array<Record<string,unknown>>}>;nonce:string }
    expect(body.nonce).toBe(proof.id)
    expect(body.components[0]?.components[0]).toEqual({ type:2,custom_id:panel.customId,style:1,label:"Apply" })
    expect(body.components[0]?.components[0]).not.toHaveProperty("id")
    expect(body.components[0]?.components[0]).not.toHaveProperty("emoji")
    expect(await run(prepareTicketPanelPublication(proof))).toEqual({ ...prepared,state:"succeeded" })
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      expect((yield* sql<{ state:string;message_id:string }>`SELECT state,message_id FROM ticket_panel_publications WHERE panel_id=${panel.panelId}::uuid`)[0])
        .toEqual({ state:"active",message_id:"4734567890123456789" }) }))
  })

  it("enforces signed manager scope and fails a prepared effect after configuration changes",async()=>{
    const panel=await run(fixture("12"))
    await expect(run(prepareTicketPanelPublication(command(panel.panelId,{ permissions:"0" })))).rejects.toMatchObject({ _tag:"Forbidden" })
    await expect(run(prepareTicketPanelPublication(command(panel.panelId,{ guildId:"9734567890123456789" })))).rejects.toMatchObject({ _tag:"NotFound" })
    const prepared=await run(prepareTicketPanelPublication(command(panel.panelId)))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET updated_at=clock_timestamp()+interval '1 second' WHERE id=${panel.panelId}::uuid` }))
    const discord={ request:()=>Effect.die("Discord must not be called"),token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),discord)).toMatchObject({ state:"failed" })
  })

  it("rejects a panel revision change even within the same JavaScript millisecond",async()=>{
    const panel=await run(fixture("17"))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET updated_at=date_trunc('milliseconds',clock_timestamp())+interval '1 microsecond' WHERE id=${panel.panelId}::uuid` }))
    const prepared=await run(prepareTicketPanelPublication(command(panel.panelId)))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${panel.panelId}::uuid` }))
    const discord={request:()=>Effect.die("A stale panel revision must not publish"),token:()=>Effect.die("Unexpected OAuth")}
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),discord)).toMatchObject({state:"failed"})
  })

  it("reconciles one nonce-matched uncertain create without issuing another POST",async()=>{
    const panel=await run(fixture("13")),proof=command(panel.panelId),prepared=await run(prepareTicketPanelPublication(proof))
    let posts=0
    const message={ id:"5734567890123456789",nonce:proof.id,author:{ id:"9734567890123456789" },
      components:[{ type:1,components:[{ custom_id:panel.customId }] }] }
    const service=(messages:ReadonlyArray<unknown>)=>({ request:(path:string)=>Effect.succeed(path==="/users/@me"?{ id:"9734567890123456789" }:messages),
      token:()=>Effect.die("Unexpected OAuth") })
    const uncertain={ request:(path:string,options?:{method?:string})=>{
      if(options?.method==="POST"){posts++;return Effect.fail(new UpstreamUnavailable({ cause:undefined,message:"Lost response" }))}
      return Effect.succeed(path==="/users/@me"?{ id:"9734567890123456789" }:[])
    },
      token:()=>Effect.die("Unexpected OAuth") }
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),uncertain)).toMatchObject({ state:"uncertain" })
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),service([]))).toMatchObject({ state:"uncertain" })
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),service([message,{ ...message,id:"5734567890123456788" }]))).toMatchObject({ state:"uncertain" })
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),service([{ ...message,author:{ id:"wrong" } }]))).toMatchObject({ state:"uncertain" })
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),service([{ ...message,components:[] }]))).toMatchObject({ state:"uncertain" })
    expect(await runDiscord(runTicketPanelPublication(prepared.effectId),service([message]))).toMatchObject({ state:"succeeded",messageId:"5734567890123456789" })
    expect(posts).toBe(1)
    const statusProof:VerifiedRuntimeInteraction={ ...command(panel.panelId),type:3,messageId:"6734567890123456789",
      data:{ custom_id:prepared.statusCustomId,component_type:2 } }
    expect(await run(ticketPanelPublicationStatus(prepared.effectId,statusProof))).toMatchObject({ state:"succeeded" })
    await expect(run(ticketPanelPublicationStatus(prepared.effectId,{ ...statusProof,id:String(counter++),actorId:"7734567890123456789" }))).rejects.toMatchObject({ _tag:"Forbidden" })
  })

  it("always admits actionable publications when more than one hundred uncertain effects exist",async()=>{
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data)
        SELECT ('40000000-0000-4000-8000-'||lpad(to_hex(value),12,'0'))::uuid,${guild},'Uncertain '||value,
          jsonb_build_array(jsonb_build_object('id',('50000000-0000-4000-8000-'||lpad(to_hex(value),12,'0'))::text,'type',2,
            'custom_id','ck:ticket:open:'||('40000000-0000-4000-8000-'||lpad(to_hex(value),12,'0'))||':'||('50000000-0000-4000-8000-'||lpad(to_hex(value),12,'0')),'style',1,'label','Apply')),
          '{}'::jsonb FROM generate_series(1,105) value`
      yield* sql`INSERT INTO ticket_panel_publication_effects(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,payload,state)
        SELECT lpad(to_hex(value),64,'a'),panel.id,${guild},1,panel.updated_at,${channel},'{}'::jsonb,'uncertain'
        FROM generate_series(1,105) value JOIN ticket_panels panel
          ON panel.id=('40000000-0000-4000-8000-'||lpad(to_hex(value),12,'0'))::uuid`
      const actionable=yield* fixture("14")
      yield* sql`INSERT INTO ticket_panel_publication_effects(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,payload)
        SELECT ${"f".repeat(64)},id,server_id,1,updated_at,${channel},'{}'::jsonb FROM ticket_panels WHERE id=${actionable.panelId}::uuid`
    }))
    const due:RecoveryJob[]=[]
    let cursor:RecoveryCursor|undefined
    do {
      const page=await run(pendingRuntimePage("panel",cursor))
      due.push(...page.jobs)
      cursor=page.nextCursor
    } while(cursor)
    expect(due.some((effect)=>effect.id==="f".repeat(64))).toBe(true)
    expect(due.length).toBeGreaterThanOrEqual(106)
  })

  it("dispatches the exact signed panel-post route to the canonical guild coordinator",async()=>{
    const panel=await run(fixture("15")),interactionId=String(counter++)
    const rawBody=JSON.stringify({ id:interactionId,application_id:"9934567890123456789",type:2,guild_id:guild,channel_id:channel,
      member:{ user:{ id:actor,username:"Manager" },permissions:"32",roles:[] },
      data:{ name:"ticket",options:[{ name:"panel-post",type:1,options:[{ name:"panel-id",type:3,value:panel.panelId }] }] } })
    const timestamp=String(Math.floor(Date.now()/1000)),proof={ interaction:{ rawBody,timestamp,
      signature:bytesHex(await crypto.subtle.sign("Ed25519",keys.privateKey,new TextEncoder().encode(timestamp+rawBody))) } }
    const calls:Array<{ name:string;effectId:string }>=[]
    const bindings={ DISCORD_PUBLIC_KEY:publicKey,DISCORD_APPLICATION_ID:"9934567890123456789",TICKET_RUNTIME:{
      getByName:(name:string)=>({ wake:async(effectId:string)=>{ calls.push({ name,effectId }) } }),
    } } as unknown as DeferredRuntimeBindings
    const reject=()=>Effect.die("Unexpected user authentication")
    const auth=Layer.succeed(AuthIdentity,{ requireBot:()=>Effect.succeed({ kind:"bot" as const }),requireUser:reject,requireUserOrBot:reject })
    const unusedDiscord=Layer.succeed(DiscordApi,{ request:()=>Effect.die("Unexpected Discord request"),token:()=>Effect.die("Unexpected OAuth") })
    const request=new Request("https://api.test/v2/runtime/ticket-panel-publications/prepare",{ method:"POST",
      headers:{ "content-type":"application/json","authorization":"Bearer fixture" },body:JSON.stringify(proof) })
    const dispatched=await Effect.runPromise(dispatchPersistentRuntime(request,bindings).pipe(Effect.provide(Layer.mergeAll(database,auth,unusedDiscord)),Effect.scoped))
    expect(dispatched).toBeInstanceOf(Response)
    const body=await (dispatched as Response).json() as { effectId:string;panelId:string;state:string }
    expect(body).toMatchObject({ panelId:panel.panelId,state:"pending" })
    expect(calls).toEqual([{ name:`${guild}:panel:${panel.panelId}`,effectId:body.effectId }])
  })
})
