import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { prepareTicketStaff, advanceTicketStaff } from "../../src/ticket-staff-runtime.js"
import { requireTicketStaff } from "../../src/ticket-staff-authorization.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild="1334567890123456789", actor="2334567890123456789", applicant="3334567890123456789", channel="4334567890123456789"
const role="5334567890123456789", silentRole="6334567890123456789", grantRole="7334567890123456789", applicationMessage="8334567890123456789"
let counter=9000000000000000000n
const calls: Array<{path:string;method:string;body:unknown}> = []
let owner="123456789012345678"
const database = databaseLayer({HYPERDRIVE:{connectionString:process.env.TEST_DATABASE_URL}} as WorkerBindings)
const discord = {request:(path:string, options?: {method?:string;body?:unknown})=>{
  calls.push({path,method:options?.method??"GET",body:options?.body})
  if (path===`/guilds/${guild}`) return Effect.succeed({id:guild,owner_id:owner})
  if (path.includes("/members/")) return Effect.succeed({user:{id:path.split("/").at(-1)}})
  if (path.startsWith("/users/")) return Effect.succeed({id:applicant,username:"Applicant"})
  if (path===`/channels/${channel}` && options?.method === undefined) return Effect.succeed({id:channel,guild_id:guild,type:0})
  if (path.endsWith("/messages")) return Effect.succeed({id:String(counter++)})
  if (options?.method==="PATCH") return Effect.succeed({id:channel})
  return Effect.succeed(undefined)
},token:()=>Effect.die("Unexpected OAuth")}
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|DiscordApi>)=>Effect.runPromise(effect.pipe(
  Effect.provide(Layer.mergeAll(database,Layer.succeed(DiscordApi,discord))),Effect.scoped))
const proof=(name:string,value:string,permission="32"):VerifiedRuntimeInteraction=>({
  id:String(counter++),actorId:actor,actorLabel:"Staff",actorRoleIds:[],guildId:guild,channelId:channel,messageId:undefined,
  type:2,data:{name:"ticket",options:[{type:1,name,options:[{type:name==="add"?6:3,name:name==="add"?"member":name,value}]}]},
  permissions:permission,requestHash:crypto.randomUUID().replaceAll("-","").repeat(2),signedAt:Date.now(),
})
const fixture=()=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Staff fixture') ON CONFLICT DO NOTHING`
  yield* sql`DELETE FROM ticket_runtime_effects WHERE operation_id IN (SELECT id FROM ticket_runtime_operations WHERE server_id=${guild})`
  yield* sql`DELETE FROM ticket_runtime_operations WHERE server_id=${guild}`
  yield* sql`DELETE FROM tickets WHERE server_id=${guild}`
  const panelId=crypto.randomUUID(),buttonId=crypto.randomUUID(),ticketId=crypto.randomUUID(),opening=crypto.randomUUID()
  const customId=`ck:ticket:open:${panelId}:${buttonId}`,settings={questions:[],mod_role:[role],no_ping_mod_role:[silentRole],private_thread:false,
    th_min:0,num_apply:25,naming:"{ticket_status}-{user}",account_apply:false,player_info:false,apply_clans:[],roles_to_add:[],roles_to_remove:[],townhall_requirements:{}}
  yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panelId}::uuid,${guild},${panelId},'[]'::jsonb,
    ${JSON.stringify({[`${customId}_settings`]:settings})}::jsonb)`
  const number=(yield* sql<{number:number}>`SELECT nextval('tickets_number_seq')::int AS number`)[0]!.number
  yield* sql`INSERT INTO tickets(id,server_id,channel_id,panel_id,number,status_id,is_thread,applicant_user_id,status,naming_convention)
    VALUES(${ticketId}::uuid,${guild},${channel},${panelId}::uuid,${number},0,false,${applicant},'open','{ticket_status}-{user}')`
  const identity=String(counter++)
  yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
    origin_channel_id,origin_message_id,context,request,request_hash,state,submission_interaction_id,submitted_request,submitted_request_hash)
    VALUES(${opening}::uuid,${identity},'open',${ticketId}::uuid,${number},${guild},${applicant},${panelId}::uuid,${buttonId}::uuid,
      ${channel},${applicationMessage},'{}','{}',${"a".repeat(64)},'completed',${identity},'{}',${"a".repeat(64)})`
  yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state,result)
    VALUES(${opening}::uuid,'application:0',0,'send_message','{}','succeeded',${JSON.stringify({id:applicationMessage,channelId:channel})}::jsonb)`
  calls.length=0;owner="123456789012345678"
  return {panelId,ticketId}
})

describe("ticket staff authorization and durable actions",()=>{
  it("allows exactly managers, original-button staff, ticket manage grants, or owner",async()=>{
    const {panelId,ticketId}=await run(fixture())
    for(const permissions of ["8","32"])await run(requireTicketStaff({...proof("opt","In"),permissions},panelId,ticketId))
    for(const staffRole of [role,silentRole])await run(requireTicketStaff({...proof("opt","In","0"),actorRoleIds:[staffRole]},panelId,ticketId))
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO dashboard_role_grants(server_id,role_id,section,access_level) VALUES(${guild},${grantRole},'tickets','manage') ON CONFLICT DO NOTHING`
    }))
    await run(requireTicketStaff({...proof("opt","In","0"),actorRoleIds:[grantRole]},panelId,ticketId))
    await expect(run(requireTicketStaff(proof("opt","In","0"),panelId,ticketId))).rejects.toMatchObject({_tag:"Forbidden"})
    owner=actor;await run(requireTicketStaff(proof("opt","In","0"),panelId,ticketId))
  })
  it("journals concurrent identical opt once, changes only actor subscription and replays",async()=>{
    const {ticketId}=await run(fixture()), interaction=proof("opt","In")
    const [one,two]=await Promise.all([run(prepareTicketStaff(interaction)),run(prepareTicketStaff(interaction))])
    expect(one.operationId).toBe(two.operationId)
    expect(await run(runTicketOperation(one.operationId))).toBe("completed")
    expect((await run(prepareTicketStaff(interaction))).outcome).toBe("complete")
    const subscribers=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient;return (yield* sql<{ids:string[]}>`SELECT opted_in_user_ids AS ids FROM tickets WHERE id=${ticketId}::uuid`)[0]!.ids}))
    expect(subscribers).toEqual([actor]);expect(calls).toHaveLength(0)
    const out=await run(prepareTicketStaff(proof("opt","Out")));await run(runTicketOperation(out.operationId))
    expect(await run(runTicketOperation(out.operationId))).toBe("completed")
  })
  it("runs member and status effects once, fails closed for wrong actors and sources",async()=>{
    const {ticketId}=await run(fixture())
    await expect(run(prepareTicketStaff(proof("status","close","0")))).rejects.toMatchObject({_tag:"Forbidden"})
    calls.length=0
    const add=await run(prepareTicketStaff(proof("add",actor)));await run(runTicketOperation(add.operationId))
    const writes=calls.filter(call=>call.method!=="GET").length
    expect(writes).toBe(2);await run(runTicketOperation(add.operationId));expect(calls.filter(call=>call.method!=="GET")).toHaveLength(writes)
    for(const status of ["close","open","sleep"]){
      const operation=await run(prepareTicketStaff(proof("status",status)))
      expect(await run(runTicketOperation(operation.operationId))).toBe("completed")
    }
    const bad={...proof("status","close"),type:3 as const,messageId:"123456789012345678",data:{component_type:2,custom_id:`ck:ticket:close:${ticketId}`}}
    await expect(run(prepareTicketStaff(bad))).rejects.toMatchObject({_tag:"Forbidden"})
    await expect(run(advanceTicketStaff(add.operationId,{...bad,actorId:applicant}))).resolves.toBeUndefined()
  })
})
