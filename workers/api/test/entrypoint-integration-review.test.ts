import { Effect, Layer } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DatabaseFailure } from "../src/errors.js"
import type { WorkerBindings } from "../src/environment.js"
import { deferredApiRoutes } from "./deferred-runtime-paths.js"

const databaseState = vi.hoisted(() => ({ mode: 'healthy' }))
vi.mock("../src/database.js", async (importOriginal) => {
  const { lazyDatabaseLayer } = await importOriginal<typeof import("../src/database.js")>()
  return {
  databaseLayer: () => {
    if(databaseState.mode==='throw') throw new Error('fixture construction failed')
    if(databaseState.mode==='defect') return Layer.effect(SqlClient.SqlClient,Effect.die(new Error('fixture acquisition defect')))
    if(databaseState.mode==='sql') return lazyDatabaseLayer(Effect.fail(new SqlError.SqlError({reason:new SqlError.ConnectionError({cause:new Error('fixture SQL connection failure')})})))
    if(databaseState.mode==='fail') return Layer.effect(SqlClient.SqlClient,Effect.fail(new DatabaseFailure({cause:new Error('fixture database unavailable'),message:'Database unavailable'})))
    // These boundary cases must not query; accessing a SQL operation fails loudly.
    return Layer.succeed(SqlClient.SqlClient,new Proxy({} as SqlClient.SqlClient,{get:()=>{throw new Error('Unexpected SQL operation in entrypoint boundary test')}}))
  },
  }
})
// Native Cloudflare base classes are not available in the Node test lane.
// These exports are unrelated to fetch; the request layer and router remain real.
import worker, * as workerExports from "../src/index.js"

const bindings = {
  ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com', ACCESS_AUDIENCE:'fixture-audience',
  JWT_ACCESS_SECRET:'fixture-access-secret', JWT_REFRESH_SECRET:'fixture-refresh-secret', API_BOT_TOKEN:'fixture-bot-token',
  DISCORD_API_ORIGIN:'https://discord.example.test/api/v10',
  TENOR_ALLOWED_HOSTS:'tenor.example.test', TENOR_MEDIA_ALLOWED_HOSTS:'media.example.test',
  NATIVE_TOKEN_AUDIENCE:'native', WEB_TOKEN_AUDIENCE:'web',
  ADMIN_ALLOWED_ORIGINS:'https://admin.example.test', WEB_ALLOWED_ORIGINS:'https://app.example.test',
  HYPERDRIVE:{connectionString:'postgres://fixture:fixture@127.0.0.1/fixture'},
} as WorkerBindings
const request = async (path: string, method = 'GET', origin: string | null = 'https://app.example.test', extraHeaders: Record<string, string> = {}, body?: unknown) => {
  const tasks: Promise<unknown>[] = []
  const context = {waitUntil:(promise:Promise<unknown>)=>{tasks.push(promise.catch(()=>undefined))},passThroughOnException:()=>undefined} as ExecutionContext
  try {
    return await worker.fetch(new Request(`https://api.example.test${path}`,{method,headers:{'x-request-id':'entrypoint-fixture',...(origin === null ? {} : {origin}),...extraHeaders},...(body === undefined ? {} : {body:JSON.stringify(body)})}),bindings,context)
  } finally { await Promise.all(tasks) }
}
afterEach(()=>{databaseState.mode='healthy';vi.restoreAllMocks()})

describe('actual fetch entrypoint service composition and dispatcher order',()=>{
  it.each([undefined, 'x'.repeat(513)])('uses developer-token validation for shared links, not user JWT authentication %#', async (token) => {
    const response = await request('/v2/links/shared', 'POST', null, {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    }, { player_tags: ['#P0Y'] })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'unauthenticated', message: 'Invalid developer API token' })
  })
  it('passes an opaque developer token through the real router to its database lookup', async () => {
    databaseState.mode = 'sql'
    const response = await request('/v2/links/shared', 'POST', null, {
      'content-type': 'application/json', authorization: 'Bearer fixture-developer-token',
    }, { player_tags: ['#P0Y'] })
    // The unavailable SQL fixture proves this reached developer-token lookup;
    // the shadowing user handler rejected this token as a JWT before any SQL.
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' })
  })
  it('continues requiring user or bot authentication for personal link mutations', async () => {
    const response = await request('/v2/links/123456789012345678', 'POST', null, {
      'content-type': 'application/json', authorization: 'Bearer fixture-developer-token',
    }, { player_tag: '#P0Y' })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ message: 'Invalid or expired token' })
  })
  it('exports only the retained API coordinators', () => {
    expect(Object.keys(workerExports).sort()).toEqual(['default'])
  })
  it.each(deferredApiRoutes)('leaves $method $path unmounted without SQL or provider calls', async ({ method, path }) => {
    const outbound = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'))
    for (const headers of [{}, { authorization: 'Bearer fixture-bot-token', 'content-type': 'application/json' }]) {
      const response = await request(path, method, 'https://app.example.test', headers)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: 'not_found', request_id: 'entrypoint-fixture' })
    }
    expect(outbound).not.toHaveBeenCalled()
  })
  it.each([
    ['GET', '/v2/server/123456789012345678/channels'],
    ['GET', '/v2/server/123456789012345678/bans'],
    ['GET', '/v2/server/123456789012345678/strikes'],
    ['GET', '/v2/server/123456789012345678/clans-basic'],
    ['POST', '/v2/links/server/123456789012345678'],
  ])('retains baseline %s %s behind its existing authentication', async (method, path) => {
    const outbound = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'))
    expect((await request(path, method)).status).toBe(401)
    expect(outbound).not.toHaveBeenCalled()
  })
  it.each([
    { method: 'POST', path: '/v2/roster-group', body: { name: 'Group' } },
    { method: 'GET', path: '/v2/roster-group/list' },
    { method: 'GET', path: '/v2/roster-group/80000000-0000-4000-8000-000000000003' },
    { method: 'PATCH', path: '/v2/roster-group/80000000-0000-4000-8000-000000000003', body: { name: 'Renamed group' } },
    { method: 'DELETE', path: '/v2/roster-group/80000000-0000-4000-8000-000000000003' },
    { method: 'POST', path: '/v2/roster/account-groups/query', body: { serverId: '123456789012345678', rosterIds: [] } },
  ])('preserves the original $method $path with valid input behind authentication', async ({ method, path, body }) => {
    const outbound = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'))
    const response = await request(`${path}?server_id=123456789012345678`, method, 'https://app.example.test', { 'content-type': 'application/json' }, body)
    expect(response.status).toBe(401)
    expect(outbound).not.toHaveBeenCalled()
  })
  it('isolates bearer transcript requests from database setup, request IDs, CORS and every application log',async()=>{
    databaseState.mode='throw'
    const log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error')
    const response=await request('/v2/ticket-transcripts/00000000-0000-4000-8000-000000000001')
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
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
  })
  it.each([{}, { authorization: 'Bearer invalid-token' }, { authorization: 'Bearer fixture-bot-token' }])('preserves the public Builder Hall 501 without SQL or provider work %#', async (headers) => {
    const outbound = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'))
    const response = await request('/v2/counts/players/builder-halls', 'GET', null, headers)
    expect(response.status).toBe(501)
    expect(await response.json()).toEqual({
      code: 'not_implemented', message: 'Builder Hall counts are not implemented', request_id: 'entrypoint-fixture',
    })
    expect(outbound).not.toHaveBeenCalled()
  })
  it('does not add a POST alias for Builder Hall counts', async () => {
    expect((await request('/v2/counts/players/builder-halls', 'POST', null)).status).toBe(404)
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
  it.each(['fail'])('recovers a typed service-layer acquisition %s into the HTTP contract',async(mode)=>{
    databaseState.mode=mode
    const response=await request('/v2/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'upstream_unavailable',request_id:'entrypoint-fixture'})
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
  })
  it('keeps health and preflight independent of unavailable SQL while recovering an actual query failure',async()=>{
    databaseState.mode='sql'
    expect((await request('/v2/health')).status).toBe(200)
    expect((await request('/v2/auth/me')).status).toBe(401)
    expect((await request('/v2/counts/players/town-halls','OPTIONS')).status).toBe(204)
    const response=await request('/v2/counts/players/town-halls')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({code:'upstream_unavailable',request_id:'entrypoint-fixture'})
  })
  it.each(['defect','throw'])('recovers service setup %s without leaking it',async(mode)=>{
    databaseState.mode=mode
    const response=await request('/v2/health')
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({code:'internal_error',message:'Internal server error'})
    expect(response.headers.get('x-request-id')).toBe('entrypoint-fixture')
  })
})
