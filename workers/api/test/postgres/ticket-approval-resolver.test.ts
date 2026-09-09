import { Effect,Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe,expect,it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { resolveTicketApproval,TicketApprovalGuildCounts } from "../../src/ticket-approval-resolver.js"
import type { StaffTicketSnapshot } from "../../src/ticket-staff-runtime.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const database=databaseLayer({HYPERDRIVE:{connectionString:process.env.TEST_DATABASE_URL}} as WorkerBindings)
const providers=Layer.mergeAll(Layer.succeed(DiscordApi,{request:()=>Effect.die("Leader-only template must not query Discord"),token:()=>Effect.die("Unexpected OAuth")}),
  Layer.succeed(TicketApprovalGuildCounts,{exact:()=>Effect.die("Leader-only template must not query the Gateway count service")}))
const layer=Layer.mergeAll(database,providers)
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|DiscordApi|TicketApprovalGuildCounts>)=>Effect.runPromise(effect.pipe(Effect.provide(layer),Effect.scoped))
const ticket:StaffTicketSnapshot={id:"82000000-0000-4000-8000-000000000001",server_id:"1854567890123456789",channel_id:"2854567890123456789",
  panel_id:"83000000-0000-4000-8000-000000000001",applicant_user_id:"3854567890123456789",thread_id:null,status:"open",number:1,
  naming_convention:"ticket",applicant_accounts:[],data:{},panel_name:"Approval",panel_revision:"test",assigned_clan_tag:"#PYL"}
const bindings=(leaderTag:string|undefined)=>({DISCORD_APPLICATION_ID:"4854567890123456789",CLASH_PROXY:{fetch:async(request:Request)=>{
  expect(request.method).toBe("GET");expect(new URL(request.url).pathname).toBe("/v1/clans/%23PYL")
  return Response.json({tag:"#PYL",name:"Family clan",clanLevel:20,members:leaderTag ? 1 : 0,
    memberList:leaderTag ? [{tag:leaderTag,name:"Current leader",role:"leader"}] : []})
}},ASSETS:{} as R2Bucket})

describe("approval clan leader resolution against canonical player links",()=>{
  it("uses the current leader account's current owner without mutating verification or links",()=>run(Effect.gen(function* () {
    const sql=yield* SqlClient.SqlClient,leader="#PYY",owner="5854567890123456789",nextOwner="6854567890123456789"
    yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES(${leader},${owner},'fixture',false)`
    const snapshot=()=>sql`SELECT to_jsonb(link) AS value,xmin::text AS version FROM player_links link WHERE tag=${leader}`
    const before=yield* snapshot()
    const first=yield* resolveTicketApproval(ticket,"{clan_leader} {clan_leader_mention}",bindings(leader))
    expect(first).toEqual({builtins:{clan_leader:"Current leader",clan_leader_mention:`<@${owner}>`},userMentions:[owner]})
    expect(yield* snapshot()).toEqual(before)
    yield* sql`UPDATE player_links SET user_id=${nextOwner} WHERE tag=${leader}`
    const transferred=yield* snapshot()
    const second=yield* resolveTicketApproval(ticket,"{clan_leader_mention}",bindings(leader))
    expect(second).toEqual({builtins:{clan_leader_mention:`<@${nextOwner}>`},userMentions:[nextOwner]})
    expect(yield* snapshot()).toEqual(transferred)
  })))
  it("does not reuse a previous leader or another account's owner when the current leader is unlinked",()=>run(Effect.gen(function* () {
    const sql=yield* SqlClient.SqlClient
    yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES('#PQP','7854567890123456789','fixture',true)`
    expect(yield* resolveTicketApproval(ticket,"{clan_leader_mention}",bindings("#PQU"))).toEqual({builtins:{clan_leader_mention:""},userMentions:[]})
  })))
  it("fails an incomplete current clan snapshot instead of selecting a cached leader",async()=>{
    await expect(run(resolveTicketApproval(ticket,"{clan_leader_mention}",bindings(undefined)))).rejects.toMatchObject({_tag:"UpstreamUnavailable"})
  })
})
