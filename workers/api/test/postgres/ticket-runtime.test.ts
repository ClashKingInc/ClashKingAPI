import { Effect,Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { advanceTicketOperation, prepareTicketOpen, ticketOperationStatus } from "../../src/ticket-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild="1634567890123456789",channel="2634567890123456789",panelMessage="3634567890123456789"
const actor="4634567890123456789",otherActor="5634567890123456789"
const database=databaseLayer({ HYPERDRIVE:{ connectionString:process.env.TEST_DATABASE_URL } } as WorkerBindings)
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(database),Effect.scoped))
let interactionCounter=6634567890123456789n
const interaction=(customId:string,type:3|5=3,options:Partial<VerifiedRuntimeInteraction>={}):VerifiedRuntimeInteraction => ({
  id:String(interactionCounter++),actorId:actor,actorLabel:"Applicant",actorRoleIds:[],permissions:"0",guildId:guild,channelId:channel,
  messageId:type === 3 && customId.startsWith("ck:ticket:open:") ? panelMessage : "7634567890123456789",
  type,data:{ custom_id:customId,...(type === 3 ? { component_type:2 } : {}),...options.data },
  requestHash:String(interactionCounter).slice(-1).repeat(64),signedAt:Date.now(),...options,
})
const settings=(questions:readonly string[]=[],account=false) => ({ questions,mod_role:[],no_ping_mod_role:[],private_thread:false,
  th_min:0,num_apply:25,naming:"{ticket_count}-{user}",account_apply:account,player_info:false,apply_clans:[],
  roles_to_add:[],roles_to_remove:[],townhall_requirements:{},new_message:null })
const fixture=(suffix:string,questions:readonly string[]=[],account=false,minTh=0,privateThread=false,newMessage:string|null=null) => Effect.gen(function* () {
  const sql=yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Ticket runtime fixture') ON CONFLICT DO NOTHING`
  const panelId=`00000000-0000-4000-8000-0000000000${suffix}`,buttonId=`10000000-0000-4000-8000-0000000000${suffix}`
  const customId=`ck:ticket:open:${panelId}:${buttonId}`,messageId=String(BigInt(panelMessage)+BigInt(Number(suffix)))
  const component={ id:buttonId,type:2,custom_id:customId,style:1,label:"Apply" }
  const rows=yield* sql<{ updated_at:string }>`INSERT INTO ticket_panels(id,server_id,name,components,data)
    VALUES(${panelId}::uuid,${guild},${`Panel ${suffix}`},${JSON.stringify([component])}::jsonb,
      ${JSON.stringify({ [`${customId}_settings`]:{...settings(questions,account),th_min:minTh,private_thread:privateThread,new_message:newMessage} })}::jsonb) RETURNING updated_at::text`
  const effectId=suffix.repeat(32)
  yield* sql`INSERT INTO ticket_panel_publication_effects(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,
    payload,state,result_message_id) VALUES(${effectId},${panelId}::uuid,${guild},1,${rows[0]!.updated_at}::timestamptz,${channel},'{}'::jsonb,'succeeded',${messageId})`
  yield* sql`INSERT INTO ticket_panel_publications(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,message_id)
    VALUES(${effectId},${panelId}::uuid,${guild},1,${rows[0]!.updated_at}::timestamptz,${channel},${messageId})`
  return { panelId,buttonId,customId,messageId }
})
const formValues=(page:number,count:number,value="answer") => Array.from({ length:count },(_,offset) => ({
  type:18,component:{ type:4,custom_id:`q:${page*5+offset}`,value },
}))

describe("ticket runtime journal",() => {
  it("directly submits a no-form open once and binds status to the applicant proof",async() => {
    const panel=await run(fixture("01")),proof=interaction(panel.customId,3,{ messageId:panel.messageId })
    const opened=await run(prepareTicketOpen(proof))
    expect(opened).toMatchObject({ outcome:"accepted",state:"submitted" })
    if (opened.outcome !== "accepted") throw new Error("Expected submitted ticket")
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      const message=(yield* sql<{request:unknown}>`SELECT request FROM ticket_runtime_effects WHERE operation_id=${opened.operationId}::uuid AND effect_key='application:0'`)[0]
      expect(message?.request).toMatchObject({embeds:[{description:"This ticket will be handled shortly!\nPlease be patient.",color:3066993}]})
    }))
    expect(await run(prepareTicketOpen(proof))).toEqual(opened)
    const statusProof=interaction(`ck:ticket:status:${opened.operationId}`,3)
    expect(await run(ticketOperationStatus(opened.operationId,statusProof))).toMatchObject({ state:"submitted",ticketId:opened.ticketId })
    await expect(run(ticketOperationStatus(opened.operationId,{ ...statusProof,id:String(interactionCounter++),actorId:otherActor }))).rejects.toMatchObject({ _tag:"Forbidden" })
  })

  it("journals one actor-bound link preparation without a ticket and replays it after accounts change",async() => {
    const panel=await run(fixture("06",[],true)),proof=interaction(panel.customId,3,{messageId:panel.messageId,actorId:otherActor})
    const attempts=await Promise.all(Array.from({length:8},()=>run(prepareTicketOpen(proof))))
    const prepared=attempts[0]!
    if (prepared.outcome !== "link_required") throw new Error("Expected account link preparation")
    expect(attempts.every(value=>JSON.stringify(value)===JSON.stringify(prepared))).toBe(true)
    expect(prepared.link.customId).toBe(`ck:ticket:link:${prepared.preparationId}`)
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      const rows=yield* sql<{actor_user_id:string;origin_message_id:string;button_id:string;context:unknown}>`SELECT actor_user_id,origin_message_id,button_id::text,context
        FROM ticket_account_preparations WHERE interaction_id=${proof.id}`
      expect(rows).toEqual([{actor_user_id:otherActor,origin_message_id:panel.messageId,button_id:panel.buttonId,context:{}}])
      expect((yield* sql`SELECT 1 FROM ticket_runtime_operations WHERE interaction_id=${proof.id}`).length).toBe(0)
      expect((yield* sql`SELECT 1 FROM ticket_account_receipts WHERE preparation_id=${prepared.preparationId}::uuid`).length).toBe(0)
    }))
    await expect(run(prepareTicketOpen({...proof,actorId:actor}))).rejects.toMatchObject({_tag:"Conflict"})
    await expect(run(prepareTicketOpen({...proof,requestHash:"f".repeat(64)}))).rejects.toMatchObject({_tag:"Conflict"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO basic_player(tag,name,townhall_level) VALUES('#P2Y','New link',17)`
      yield* sql`INSERT INTO player_links(tag,user_id,source) VALUES('#P2Y',${otherActor},'test')`
    }))
    expect(await run(prepareTicketOpen({...proof,signedAt:0}))).toEqual(prepared)
    const next=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId,actorId:otherActor})))
    expect(next).toMatchObject({outcome:"ready",form:{kind:"account_select"}})
  })

  it("keeps linked-but-ineligible applicants distinct from applicants needing a link",async() => {
    const panel=await run(fixture("07",[],true,18)),proof=interaction(panel.customId,3,{messageId:panel.messageId,actorId:otherActor})
    // This actor's unverified TH17 account remains selectable in the previous
    // case; only this panel's actual TH18 requirement rejects it here.
    await expect(run(prepareTicketOpen(proof))).rejects.toMatchObject({_tag:"Forbidden",reason:"linked_account"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      expect((yield* sql`SELECT 1 FROM ticket_account_preparations WHERE interaction_id=${proof.id}`).length).toBe(0)
      expect((yield* sql`SELECT 1 FROM ticket_runtime_operations WHERE interaction_id=${proof.id}`).length).toBe(0)
    }))
  })

  it("commits concurrent no-form preparation, submission and effects as one operation",async() => {
    const panel=await run(fixture("08")),proof=interaction(panel.customId,3,{messageId:panel.messageId})
    const attempts=await Promise.all(Array.from({length:8},()=>run(prepareTicketOpen(proof))))
    expect(attempts.every(value=>JSON.stringify(value)===JSON.stringify(attempts[0]))).toBe(true)
    expect(attempts[0]).toMatchObject({outcome:"accepted",state:"submitted"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      expect((yield* sql`SELECT 1 FROM ticket_runtime_operations WHERE interaction_id=${proof.id} AND state='submitted'`).length).toBe(1)
      expect((yield* sql`SELECT 1 FROM ticket_runtime_effects e JOIN ticket_runtime_operations o ON o.id=e.operation_id WHERE o.interaction_id=${proof.id}`).length).toBe(3)
    }))
  })

  it("journals the application and pin in a private staff thread without inviting the applicant",async() => {
    const panel=await run(fixture("09",["Staff should see this"],false,0,true))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId})))
    if (prepared.outcome !== "ready" || prepared.form.kind !== "modal") throw new Error("Expected application modal")
    const submitted=await run(advanceTicketOperation(prepared.operationId,interaction(prepared.form.customId,5,
      {data:{custom_id:prepared.form.customId,components:formValues(0,1,"Private answer copy")}})))
    expect(submitted).toMatchObject({outcome:"accepted",state:"submitted"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      const effects=yield* sql<{effect_key:string;effect_type:string;request:unknown}>`SELECT effect_key,effect_type,request FROM ticket_runtime_effects WHERE operation_id=${prepared.operationId}::uuid ORDER BY ordinal`
      expect(effects.some(effect=>effect.effect_type === "add_thread_member")).toBe(false)
      expect(effects.find(effect=>effect.effect_key === "thread-application:0")?.request).toMatchObject({
        target:"thread",embeds:[{title:"Ticket application",description:"**1. Staff should see this**\n> Private answer copy"}],accounts:[],
      })
      expect(effects.find(effect=>effect.effect_key === "pin-thread-application")?.request).toEqual({target:"thread",messageEffectKey:"thread-application:0"})
    }))
  })

  it("snapshots configured embeds and preserves the staff-only copy when the saved template changes",async()=>{
    const panel=await run(fixture("10",["Why?"],false,0,true,"Application intro"))
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO server_custom_embeds(server_id,name,data) VALUES(${guild},'Application intro',
        ${JSON.stringify({content:"@everyone",embeds:[{description:"Applicant welcome"},{description:"Retained staff instructions"}]})}::jsonb)`
    }))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId})))
    if (prepared.outcome !== "ready" || prepared.form.kind !== "modal") throw new Error("Expected questionnaire")
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE server_custom_embeds SET data='{"embeds":[{"description":"Changed later"}]}'::jsonb WHERE server_id=${guild} AND name='Application intro'`
    }))
    await run(advanceTicketOperation(prepared.operationId,interaction(prepared.form.customId,5,{data:{custom_id:prepared.form.customId,components:formValues(0,1,"Because")}})))
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      const rows=yield* sql<{effect_key:string;request:Record<string,unknown>}>`SELECT effect_key,request FROM ticket_runtime_effects WHERE operation_id=${prepared.operationId}::uuid AND effect_type='send_message'`
      expect(rows.find(row=>row.effect_key === "application:0")?.request.embeds).toEqual([
        {description:"Applicant welcome"},{description:"Retained staff instructions"},{title:"Ticket application",description:"**1. Why?**\n> Because"}])
      expect(rows.find(row=>row.effect_key === "thread-application:0")?.request.embeds).toEqual([
        {description:"Retained staff instructions"},{title:"Ticket application",description:"**1. Why?**\n> Because"}])
      expect(JSON.stringify(rows)).not.toContain("@everyone")
      expect(rows.every(row=>String(row.request.nonce).length<=25)).toBe(true)
    }))
  })

  it("rejects a missing or oversized configured intro before creating an opening journal",async()=>{
    const panel=await run(fixture("11",[],false,0,false,"Invalid intro"))
    const proof=interaction(panel.customId,3,{messageId:panel.messageId})
    await expect(run(prepareTicketOpen(proof))).rejects.toMatchObject({_tag:"Conflict"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO server_custom_embeds(server_id,name,data) VALUES(${guild},'Invalid intro',${JSON.stringify({embeds:[{description:"x".repeat(4097)}]})}::jsonb)`
    }))
    await expect(run(prepareTicketOpen(proof))).rejects.toMatchObject({_tag:"Conflict"})
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      expect((yield* sql`SELECT 1 FROM ticket_runtime_operations WHERE interaction_id=${proof.id}`).length).toBe(0)
    }))
  })

  it("executes an actually prepared open with category fallback, private visibility, intro and no applicant thread invitation",async()=>{
    const panel=await run(fixture("12",[],false,0,true))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId})))
    if (prepared.outcome !== "accepted") throw new Error("Expected direct acceptance")
    const calls:Array<{path:string;method:string;body:unknown}>=[]
    const createdChannel="8734567890123456789",createdThread="8734567890123456790",category="8734567890123456791"
    let messageId=8734567890123456792n
    const discord={request:(path:string,options?:{method?:string;body?:unknown})=>{
      calls.push({path,method:options?.method ?? "GET",body:options?.body})
      if (path === `/channels/${channel}`) return Effect.succeed({id:channel,guild_id:guild,type:0,parent_id:category})
      if (path === `/guilds/${guild}/channels`) return Effect.succeed({id:createdChannel})
      if (path === `/channels/${createdChannel}/threads`) return Effect.succeed({id:createdThread})
      if (path.endsWith("/messages")) return Effect.succeed({id:String(messageId++)})
      if (path.includes("/pins/") && options?.method === "PUT") return Effect.succeed({})
      return Effect.die(`Unexpected Discord request ${path}`)
    },token:()=>Effect.die("Unexpected OAuth")}
    const execute=()=>run(runTicketOperation(prepared.operationId).pipe(Effect.provide(Layer.succeed(DiscordApi,discord))))
    expect(await execute()).toBe("completed")
    expect(calls.find(call=>call.path === `/guilds/${guild}/channels`)?.body).toMatchObject({parent_id:category,
      permission_overwrites:[{id:guild,type:0,deny:"1024",allow:"262144"},{id:actor,type:1,deny:"0",allow:"379968"}]})
    expect(calls.find(call=>call.path === `/channels/${createdChannel}/messages`)?.body).toMatchObject({
      embeds:[{description:"This ticket will be handled shortly!\nPlease be patient.",color:3066993}],allowed_mentions:{users:[actor]},
    })
    expect(calls.find(call=>call.path === `/channels/${createdThread}/messages`)?.body).toMatchObject({allowed_mentions:{users:[]},components:[]})
    expect(calls.some(call=>call.path.includes("/thread-members/"))).toBe(false)
    const count=calls.length
    expect(await execute()).toBe("completed");expect(calls).toHaveLength(count)
  })

  it("rejects everyone as staff before journaling a new open",async()=>{
    const panel=await run(fixture("13"))
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET data=${JSON.stringify({[`${panel.customId}_settings`]:{...settings(),mod_role:[guild]}})}::jsonb WHERE id=${panel.panelId}::uuid`
    }))
    const proof=interaction(panel.customId,3,{messageId:panel.messageId})
    await expect(run(prepareTicketOpen(proof))).rejects.toMatchObject({_tag:"Conflict"})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      expect((yield* sql`SELECT 1 FROM ticket_runtime_operations WHERE interaction_id=${proof.id}`).length).toBe(0)
    }))
  })

  it("rechecks selected ownership after the questionnaire but never reapplies an accepted replay",async()=>{
    const panel=await run(fixture("14",["Why?"],true)),applicant="4934567890123456789",tag="#QPJ"
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO basic_player(tag,name,townhall_level) VALUES(${tag},'Unverified applicant',17)`
      yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES(${tag},${applicant},'fixture',false)`
    }))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId,actorId:applicant})))
    if (prepared.outcome !== "ready" || prepared.form.kind !== "account_select") throw new Error("Expected account selection")
    const modal=await run(advanceTicketOperation(prepared.operationId,interaction(prepared.form.customId,3,{actorId:applicant,
      data:{custom_id:prepared.form.customId,component_type:3,values:[tag]}})))
    if (modal.outcome !== "ready" || modal.form.kind !== "modal") throw new Error("Expected questionnaire")
    const submitted=interaction(modal.form.customId,5,{actorId:applicant,data:{custom_id:modal.form.customId,components:formValues(0,1,"Answer")}})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE player_links SET user_id=${otherActor} WHERE tag=${tag}`
    }))
    await expect(run(advanceTicketOperation(prepared.operationId,submitted))).rejects.toMatchObject({_tag:"Forbidden",reason:"linked_account"})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      expect((yield* sql`SELECT 1 FROM ticket_runtime_effects WHERE operation_id=${prepared.operationId}::uuid`).length).toBe(0)
      expect((yield* sql<{state:string}>`SELECT state FROM ticket_runtime_operations WHERE id=${prepared.operationId}::uuid`)[0]?.state).toBe("preparing")
      yield* sql`UPDATE player_links SET user_id=${applicant} WHERE tag=${tag}`
    }))
    const accepted=await run(advanceTicketOperation(prepared.operationId,submitted))
    expect(accepted).toMatchObject({outcome:"accepted"})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE player_links SET user_id=${otherActor} WHERE tag=${tag}`
    }))
    expect(await run(advanceTicketOperation(prepared.operationId,{...submitted,signedAt:0}))).toEqual(accepted)
  })

  it("rechecks current TH eligibility at acceptance without adding a verified-link requirement",async()=>{
    const panel=await run(fixture("15",[],true,17)),applicant="4934567890123456790",tag="#QPQJ"
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO basic_player(tag,name,townhall_level) VALUES(${tag},'Unverified applicant',17)`
      yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES(${tag},${applicant},'fixture',false)`
    }))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{messageId:panel.messageId,actorId:applicant})))
    if (prepared.outcome !== "ready" || prepared.form.kind !== "account_select") throw new Error("Expected account selection")
    const submitted=interaction(prepared.form.customId,3,{actorId:applicant,data:{custom_id:prepared.form.customId,component_type:3,values:[tag]}})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE basic_player SET townhall_level=16 WHERE tag=${tag}`
    }))
    await expect(run(advanceTicketOperation(prepared.operationId,submitted))).rejects.toMatchObject({_tag:"Forbidden",reason:"linked_account"})
    await run(Effect.gen(function* () {const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE basic_player SET townhall_level=17 WHERE tag=${tag}`
    }))
    expect(await run(advanceTicketOperation(prepared.operationId,submitted))).toMatchObject({outcome:"accepted"})
  })

  it("advances account select, modal, continuation, and modal with exact replay and scope fences",async() => {
    const panel=await run(fixture("02",Array.from({ length:6 },(_,index) => `Question ${index+1}`),true))
    await run(Effect.gen(function* () {
      const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO basic_player(tag,name,townhall_level) VALUES('#P0Y','Player',17)`
      yield* sql`INSERT INTO player_links(tag,user_id,source) VALUES('#P0Y',${actor},'test')`
    }))
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{ messageId:panel.messageId })))
    if (prepared.outcome !== "ready") throw new Error("Expected account selection")
    expect(prepared.form.kind).toBe("account_select")
    const accountProof=interaction(prepared.form.customId,3,{ data:{ custom_id:prepared.form.customId,component_type:3,values:["#P0Y"] } })
    const firstModal=await run(advanceTicketOperation(prepared.operationId,accountProof))
    expect(firstModal).toMatchObject({ outcome:"ready",form:{ kind:"modal",fields:expect.any(Array) } })
    expect(await run(advanceTicketOperation(prepared.operationId,accountProof))).toEqual(firstModal)
    await expect(run(advanceTicketOperation(prepared.operationId,interaction(prepared.form.customId,3,
      { data:{ custom_id:prepared.form.customId,component_type:2,values:["#P0Y"] } })))).rejects.toMatchObject({ _tag:"Forbidden" })
    if (firstModal.outcome !== "ready" || firstModal.form.kind !== "modal") throw new Error("Expected first modal")
    const firstAnswers=interaction(firstModal.form.customId,5,{ data:{ custom_id:firstModal.form.customId,components:formValues(0,5) } })
    const continuation=await run(advanceTicketOperation(prepared.operationId,firstAnswers))
    expect(continuation).toMatchObject({ outcome:"ready",form:{ kind:"continue" } })
    if (continuation.outcome !== "ready") throw new Error("Expected continuation")
    await expect(run(advanceTicketOperation(prepared.operationId,interaction(continuation.form.customId,3,{ actorId:otherActor })))).rejects.toMatchObject({ _tag:"Forbidden" })
    const secondModal=await run(advanceTicketOperation(prepared.operationId,interaction(continuation.form.customId,3)))
    if (secondModal.outcome !== "ready" || secondModal.form.kind !== "modal") throw new Error("Expected second modal")
    const accepted=await run(advanceTicketOperation(prepared.operationId,interaction(secondModal.form.customId,5,
      { data:{ custom_id:secondModal.form.customId,components:formValues(1,1) } })))
    expect(accepted).toMatchObject({ outcome:"accepted",state:"submitted" })
    await expect(run(advanceTicketOperation(prepared.operationId,interaction(firstModal.form.customId,5,
      { data:{ custom_id:firstModal.form.customId,components:formValues(0,5) } })))).rejects.toMatchObject({ _tag:"Conflict" })
  })

  it("completes the largest durable questionnaire and rejects configurations that cannot fit",async() => {
    const questions=Array.from({ length:50 },(_,index) => `Question ${index+1}`)
    const panel=await run(fixture("03",questions))
    let response=await run(prepareTicketOpen(interaction(panel.customId,3,{ messageId:panel.messageId })))
    for (let page=0;page<10;page++) {
      if (response.outcome !== "ready") throw new Error("Expected questionnaire")
      if (response.form.kind !== "modal") throw new Error("Expected modal page")
      const operationId=response.operationId,customId=response.form.customId
      response=await run(advanceTicketOperation(operationId,interaction(customId,5,
        { data:{ custom_id:customId,components:formValues(page,5,"x".repeat(500)) } })))
      if (page<9) {
        if (response.outcome !== "ready" || response.form.kind !== "continue") throw new Error("Expected continuation")
        response=await run(advanceTicketOperation(response.operationId,interaction(response.form.customId,3)))
      }
    }
    expect(response).toMatchObject({ outcome:"accepted",state:"submitted" })
    const oversized=await run(fixture("04",Array.from({ length:100 },(_,index) => `Question ${index+1}`)))
    await expect(run(prepareTicketOpen(interaction(oversized.customId,3,{ messageId:oversized.messageId })))).rejects.toMatchObject({ _tag:"Conflict" })
  })

  it("rejects wrong initial publication scope and expired sessions",async() => {
    const panel=await run(fixture("05",["Question"]))
    await expect(run(prepareTicketOpen(interaction(panel.customId,3,{ messageId:"8634567890123456789" })))).rejects.toMatchObject({ _tag:"Forbidden" })
    const prepared=await run(prepareTicketOpen(interaction(panel.customId,3,{ messageId:panel.messageId })))
    if (prepared.outcome !== "ready") throw new Error("Expected questionnaire")
    await run(Effect.gen(function* () { const sql=yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_runtime_operations SET expires_at=now()-interval '1 second' WHERE id=${prepared.operationId}::uuid` }))
    await expect(run(advanceTicketOperation(prepared.operationId,interaction(prepared.form.customId,5,
      { data:{ custom_id:prepared.form.customId,components:formValues(0,1) } })))).rejects.toMatchObject({ _tag:"Conflict" })
  })
})
