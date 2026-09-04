import { Effect, Layer } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DatabaseFailure } from "../src/errors.js"
import type { WorkerBindings } from "../src/environment.js"

const databaseState = vi.hoisted(() => ({ mode: 'healthy' }))
vi.mock("../src/database.js", () => ({
  databaseLayer: () => {
    if(databaseState.mode==='throw') throw new Error('fixture construction failed')
    if(databaseState.mode==='defect') return Layer.effect(SqlClient.SqlClient,Effect.die(new Error('fixture acquisition defect')))
    if(databaseState.mode==='sql') return Layer.effect(SqlClient.SqlClient,Effect.fail(new SqlError.SqlError({reason:new SqlError.ConnectionError({cause:new Error('fixture SQL connection failure')})})))
    if(databaseState.mode==='fail') return Layer.effect(SqlClient.SqlClient,Effect.fail(new DatabaseFailure({cause:new Error('fixture database unavailable'),message:'Database unavailable'})))
    // These boundary cases must not query; accessing a SQL operation fails loudly.
    return Layer.succeed(SqlClient.SqlClient,new Proxy({} as SqlClient.SqlClient,{get:()=>{throw new Error('Unexpected SQL operation in entrypoint boundary test')}}))
  },
}))
// Native Cloudflare base classes are not available in the Node test lane.
// These exports are unrelated to fetch; the request layer and router remain real.
vi.mock("../src/materialized-view-refresher.js", () => ({MaterializedViewRefresher:class {}}))
vi.mock("../src/shared-links-rate-limiter.js", () => ({SharedLinksRateLimiter:class {}}))
vi.mock("../src/ticket-runtime-coordinator.js", () => ({TicketRuntimeCoordinator:class {}}))
vi.mock("../src/runtime-recovery-coordinator.js", () => ({RuntimeRecoveryCoordinator:class {}}))
import worker from "../src/index.js"

const bindings = {
  ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com', ACCESS_AUDIENCE:'fixture-audience',
  JWT_ACCESS_SECRET:'fixture-access-secret', JWT_REFRESH_SECRET:'fixture-refresh-secret', API_BOT_TOKEN:'fixture-bot-token',
  DISCORD_API_ORIGIN:'https://discord.example.test/api/v10',
  TENOR_ALLOWED_HOSTS:'tenor.example.test', TENOR_MEDIA_ALLOWED_HOSTS:'media.example.test',
  NATIVE_TOKEN_AUDIENCE:'native', WEB_TOKEN_AUDIENCE:'web',
  ADMIN_ALLOWED_ORIGINS:'https://admin.example.test', WEB_ALLOWED_ORIGINS:'https://app.example.test',
  HYPERDRIVE:{connectionString:'postgres://fixture:fixture@127.0.0.1/fixture'},
} as WorkerBindings
const request = async (path: string, method = 'GET', origin: string | null = 'https://app.example.test') => {
  const tasks: Promise<unknown>[] = []
  const context = {waitUntil:(promise:Promise<unknown>)=>{tasks.push(promise.catch(()=>undefined))},passThroughOnException:()=>undefined} as ExecutionContext
  try {
    return await worker.fetch(new Request(`https://api.example.test${path}`,{method,headers:{'x-request-id':'entrypoint-fixture',...(origin === null ? {} : {origin})}}),bindings,context)
  } finally { await Promise.all(tasks) }
}
afterEach(()=>{databaseState.mode='healthy';vi.restoreAllMocks()})

describe('actual fetch entrypoint service composition and dispatcher order',()=>{
  it('schedules the persisted recovery singleton instead of querying an initial SQL batch',async()=>{
    databaseState.mode='throw'
    const wake=vi.fn(async()=>undefined), refresh=vi.fn(async()=>({ refreshed:true }))
    const recovery=vi.fn(()=>({wake})), refresher=vi.fn(()=>({refresh}))
    const tasks:Promise<unknown>[]=[]
    worker.scheduled({} as ScheduledController,{...bindings,RUNTIME_RECOVERY:{getByName:recovery},
      MATERIALIZED_VIEW_REFRESHER:{getByName:refresher}} as unknown as WorkerBindings,
    {waitUntil:(promise:Promise<unknown>)=>tasks.push(promise)} as unknown as ExecutionContext)
    await Promise.all(tasks)
    expect(recovery).toHaveBeenCalledExactlyOnceWith('persistent-runtime-recovery')
    expect(wake).toHaveBeenCalledOnce()
    expect(refresher).toHaveBeenCalledExactlyOnceWith('stats-materialized-views',{locationHint:'enam'})
    expect(refresh).toHaveBeenCalledOnce()
    expect(tasks).toHaveLength(2)
  })
  it('isolates bearer transcript requests from database setup, request IDs, CORS and every application log',async()=>{
    databaseState.mode='throw'
    const log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error')
    const response=await request('/v2/ticket-transcripts/00000000-0000-4000-8000-000000000001/channel.html')
    // No TICKETING fixture is supplied here: storage failure stays private too.
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({code:'upstream_unavailable',message:'Transcript unavailable'})
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.has('x-request-id')).toBe(false)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
  it('serves health with the complete live service graph and transport metadata',async()=>{
    const response=await request('/v2/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({status:'ok',runtime:'cloudflare-worker'})
    expect(response.headers.get('x-request-id')).toBe('entrypoint-fixture')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.test')
  })
  it('reaches the new player dispatcher and recovers its typed validation error',async()=>{
    const response=await request('/v2/player/%23P0Y/ranked/invalid/group')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({code:'invalid_request',request_id:'entrypoint-fixture'})
  })
  it('keeps player join-leave authentication ahead of database access',async()=>{
    const response=await request('/v2/player/%23P0Y/join-leave')
    expect(response.status).toBe(401)
  })
  it.each([null, 'null', 'https://app.example.test.attacker.invalid'])('rejects web auth origin %s before body or database access', async (origin) => {
    for (const path of ['email', 'refresh', 'logout', 'discord', 'verify-email-code', 'reset-password']) {
      const response = await request(`/v2/auth/web/${path}`, 'POST', origin)
      expect(response.status).toBe(403)
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
      expect(await response.json()).toMatchObject({ request_id: 'entrypoint-fixture' })
    }
  })
  it('does not clear a successor cookie when a browser refresh is missing', async () => {
    const response = await request('/v2/auth/web/refresh', 'POST')
    expect(response.status).toBe(401)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ request_id: 'entrypoint-fixture' })
  })
  it('clears only the secure host-only refresh scope on allowed-origin logout', async () => {
    const response = await request('/v2/auth/web/logout', 'POST')
    expect(response.status).toBe(204)
    const cookie = response.headers.get('set-cookie')!
    for (const attribute of ['ck_web_refresh=;', 'Path=/v2/auth/web', 'HttpOnly', 'Secure', 'SameSite=None', 'Max-Age=0']) expect(cookie).toContain(attribute)
    expect(cookie).not.toContain('Domain=')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('requires a user principal for the mounted current-user route', async () => {
    expect((await request('/v2/auth/me')).status).toBe(401)
  })
  it('does not shadow an unsupported method with a GET-only handler',async()=>{
    const response=await request('/v2/player/%23P0Y/rankings','POST')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({request_id:response.headers.get('x-request-id')})
  })
  it.each(['fail','sql'])('recovers a typed service-layer acquisition %s into the HTTP contract',async(mode)=>{
    databaseState.mode=mode
    const response=await request('/v2/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'upstream_unavailable',request_id:'entrypoint-fixture'})
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.test')
  })
  it.each(['defect','throw'])('recovers service setup %s without leaking it',async(mode)=>{
    databaseState.mode=mode
    const response=await request('/v2/health')
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({code:'internal_error',message:'Internal server error'})
    expect(response.headers.get('x-request-id')).toBe('entrypoint-fixture')
  })
})
