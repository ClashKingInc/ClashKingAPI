import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { BotModerationStore, dispatchBotRuntime } from "../../src/bot-runtime.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const server="1534567890123456789",other="2534567890123456789",user="3534567890123456789",role="4534567890123456789"
let permission="0",roles=[role],proxyCalls=0
const bindings={HYPERDRIVE:{connectionString:process.env.TEST_DATABASE_URL},CLASH_PROXY:{fetch:async()=>{
  proxyCalls++;return Response.json({name:"Moderation fixture"})
}}} as unknown as WorkerBindings
const db=databaseLayer(bindings)
const dependencies=Layer.mergeAll(db,WorkerEnvironment.layer(bindings),
  Layer.succeed(AuthIdentity,{requireBot:()=>Effect.die("Unexpected bot-only authentication"),
    requireUser:()=>Effect.succeed({kind:"user" as const,userId:user}),
    requireUserOrBot:(request:Request)=>Effect.succeed(request.headers.get("authorization")==="Bearer fixture-bot"
      ?{kind:"bot" as const}:{kind:"user" as const,userId:user})}),
  Layer.succeed(DiscordCredentials,{accessToken:()=>Effect.succeed("fixture-access")}),
  Layer.succeed(DiscordApi,{request:(path:string)=>{
    if(path==="/users/@me/guilds?limit=200")return Effect.succeed([{id:server,owner:false,permissions:permission}])
    if(path===`/guilds/${server}/members/${user}`||path===`/guilds/${other}/members/${user}`)return Effect.succeed({roles})
    return Effect.die(new Error(`Unexpected Discord path ${path}`))
  },token:()=>Effect.die("Unexpected OAuth mutation")}),
)
const layer=Layer.mergeAll(BotModerationStore.layer,ServerAuthorization.layer).pipe(Layer.provideMerge(dependencies))
const run=<A,E>(effect:Effect.Effect<A,E,SqlClient.SqlClient|ServerAuthorization|BotModerationStore>)=>Effect.runPromise(effect.pipe(Effect.provide(layer),Effect.scoped))
const request=(method:string,path:string,body?:unknown,bot=false)=>new Request(`https://api.test/v2/server/${path}`,{
  method,headers:{"content-type":"application/json",...(bot?{authorization:"Bearer fixture-bot"}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
})
const dispatch=(method:string,path:string,body?:unknown,bot=false)=>run(dispatchBotRuntime(request(method,path,body,bot),bindings))

it("runs all moderation routes through canonical section authorization and real SQL with cross-server denial",async()=>{
  await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers(id,name) VALUES(${server},'Moderation fixture'),(${other},'Other fixture') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO auth_users(user_id,provider) VALUES(${user},'discord') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO dashboard_role_grants(server_id,role_id,section,access_level) VALUES(${server},${role},'moderation','view')`
  }))
  expect((await dispatch("GET",`${server}/bans`))?.status).toBe(200)
  await expect(dispatch("GET",`${other}/bans`)).rejects.toMatchObject({_tag:"Forbidden"})
  const ban={added_by:user,reason:"Fixture reason",image:""}
  const strike={...ban,rollover_days:0,strike_weight:2}
  await expect(dispatch("POST",`${server}/bans/%23P0Y`,ban)).rejects.toMatchObject({_tag:"Forbidden"})
  await expect(dispatch("POST",`${server}/strikes/%23P0Y`,strike)).rejects.toMatchObject({_tag:"Forbidden"})
  expect(proxyCalls).toBe(0)
  await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient;yield* sql`UPDATE dashboard_role_grants SET access_level='manage'
    WHERE server_id=${server} AND role_id=${role} AND section='moderation'`}))
  expect(await (await dispatch("POST",`${server}/bans/%23P0Y`,ban))?.json()).toMatchObject({status:"created",player_tag:"#P0Y"})
  expect(await (await dispatch("POST",`${server}/bans/%23P0Y`,{...ban,reason:"Updated"}))?.json()).toMatchObject({status:"updated"})
  const bans=await (await dispatch("GET",`${server}/bans`))?.json() as {count:number;items:Array<{edited_by:unknown[]}>}
  expect(bans.count).toBe(1);expect(bans.items[0]!.edited_by).toEqual([{user,previous:{reason:ban.reason}}])
  const created=await (await dispatch("POST",`${server}/strikes/%23P0Y`,strike))?.json() as {strike_id:string;total_weight:number}
  expect(created.total_weight).toBe(2)
  expect(await (await dispatch("GET",`${server}/strikes`))?.json()).toMatchObject({count:1})
  expect(await (await dispatch("GET",`${server}/strikes/player/%23P0Y/summary`))?.json()).toMatchObject({total_strikes:1,total_weight:2})
  await expect(dispatch("DELETE",`${other}/strikes/${created.strike_id}`)).rejects.toMatchObject({_tag:"Forbidden"})
  expect((await dispatch("DELETE",`${server}/strikes/${created.strike_id}`))?.status).toBe(200)
  expect((await dispatch("DELETE",`${server}/bans/%23P0Y`))?.status).toBe(200)
  roles=[];await expect(dispatch("GET",`${server}/bans`)).rejects.toMatchObject({_tag:"Forbidden"})
  for(const bits of ["8","32"]){permission=bits;expect((await dispatch("GET",`${server}/strikes`))?.status).toBe(200)}
  permission="0";expect((await dispatch("GET",`${other}/bans`,undefined,true))?.status).toBe(200)
})

it("preserves omitted strike defaults and counts only active strikes after creation", async () => {
  await run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers(id,name) VALUES(${server},'Moderation fixture') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO strikes(id,server_id,tag,date_created,reason,added_by,strike_weight,rollover_date)
      VALUES('EXPIRED_FIXTURE',${server},'#QGR',now(),'Expired','',9,now()-interval '1 day')`
  }))
  const result = await (await dispatch("POST", `${server}/strikes/%23QGR`, {}, true))?.json() as { strike_id: string }
  expect(result).toMatchObject({ status: "created", total_strikes: 1, total_weight: 1 })
  const row = await run(Effect.gen(function* () {
    return (yield* (yield* SqlClient.SqlClient)`SELECT reason,added_by,strike_weight,rollover_date,image FROM strikes WHERE id=${result.strike_id}`)[0]
  }))
  expect(row).toEqual({ reason: "", added_by: "", strike_weight: 1, rollover_date: null, image: null })
  expect(await (await dispatch("GET", `${server}/strikes/player/%23QGR/summary`, undefined, true))?.json())
    .toMatchObject({ total_strikes: 2, total_weight: 10 })
  const negative = await (await dispatch("POST", `${server}/strikes/%23QGR`, { strike_weight: 0, rollover_days: -2 }, true))?.json() as { strike_id: string }
  expect(negative).toMatchObject({ total_strikes: 2, total_weight: 2 })
  expect(await run(Effect.gen(function* () {
    return (yield* (yield* SqlClient.SqlClient)`SELECT rollover_date FROM strikes WHERE id=${negative.strike_id}`)[0]
  }))).toEqual({ rollover_date: null })
})
