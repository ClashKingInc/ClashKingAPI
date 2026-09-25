import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DashboardRosterOperations } from "../../src/dashboard-roster-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { addLink } from "../../src/link-mutations.js"
import { NotFound } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })

it('atomically admits multiple owned accounts only without questions and within all limits', async () => {
  const guild = '6834567890123456801', actor = '7834567890123456801'
  const discord = Layer.succeed(DiscordApi, { request: () => Effect.succeed({ user: { id: actor, username: 'Batch fixture', avatar: null } }), token: () => Effect.die('Unexpected OAuth') })
  const layer = Layer.merge(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))))
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, operations = yield* DashboardRosterOperations
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Batch fixture')`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${actor}, 'discord')`
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#8PQQ', ${actor}, 'bot'), ('#8PQP', ${actor}, 'bot')`
    const roster = (yield* sql<{id: string; max_signups: number}>`INSERT INTO rosters (server_id, alias, signup_scope, max_accounts_per_user) VALUES (${guild}, 'Batch', 'anyone', 1) RETURNING id::text, max_signups`)[0]!
    expect(roster.max_signups).toBe(50)
    const url = new URL(`https://api.clashk.ing/v2/server/${guild}/rosters/${roster.id}/submissions/batch`)
    const context = { bindings, principal: { kind: 'user' as const, userId: actor }, params: { serverId: guild, rosterId: roster.id }, url }
    const signup = (tags: string[]) => operations.execute('submitBatchSignup', { ...context, request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerTags: tags }) }) })
    expect((yield* Effect.result(signup(['#8PQQ', '#8PQP'])))._tag).toBe('Failure')
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${roster.id}::uuid`).toEqual([])
    yield* sql`UPDATE rosters SET max_accounts_per_user = NULL WHERE id = ${roster.id}::uuid`
    const response = yield* signup(['#8PQQ', '#8PQP'])
    expect(yield* Effect.promise(() => response.json())).toEqual({ signedUpCount: 2 })
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${roster.id}::uuid ORDER BY tag`).toEqual([{ tag: '#8PQP' }, { tag: '#8PQQ' }])
    yield* sql`UPDATE rosters SET signup_questions = '[{"id":"ready","label":"Ready?","type":"boolean","required":false,"options":[],"order":0}]'::jsonb WHERE id = ${roster.id}::uuid`
    expect((yield* Effect.result(signup(['#8PQQ'])))._tag).toBe('Failure')
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it('limits account discovery and withdrawal to the signed owner without requiring verification', async () => {
  const guild = '6834567890123456899', actor = '7834567890123456899', other = '7834567890123456898'
  const discord = Layer.succeed(DiscordApi, { request: () => Effect.die('Withdrawal must not call Discord'), token: () => Effect.die('Unexpected OAuth') })
  const layer = Layer.merge(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))))
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, operations = yield* DashboardRosterOperations
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Withdrawal fixture')`
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES ('#8PU', ${actor}, 'bot', false), ('#8PY', ${other}, 'bot', true)`
    const id = (yield* sql<{id: string}>`INSERT INTO rosters (server_id, alias, require_verified) VALUES (${guild}, 'Withdrawal', true) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${id}::uuid, '#8PU', 'Own'), (${id}::uuid, '#8PY', 'Other')`
    const url = new URL(`https://api.clashk.ing/v2/server/${guild}/rosters/${id}/accounts?discordUserId=${other}`)
    const context = { bindings, principal: { kind: 'user' as const, userId: actor }, params: { serverId: guild, rosterId: id }, url }
    const accounts = yield* operations.execute('signupAccounts', { ...context, request: new Request(url) })
    expect(yield* Effect.promise(() => accounts.json())).toMatchObject({ items: [{ tag: '#8PU', isVerified: false, signedUp: true }] })
    const withdraw = (tag: string) => operations.execute('withdrawSignup', { ...context,
      request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerTag: tag, discordUserId: other }) }) })
    expect(yield* withdraw('#8PY').pipe(Effect.map(() => 'allowed'), Effect.catch(error => Effect.succeed(error._tag)))).toBe('Forbidden')
    const removed = yield* withdraw('#8PU')
    expect(yield* Effect.promise(() => removed.json())).toEqual({ removed: true })
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid`).toEqual([{ tag: '#8PY' }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
const serverId = '6834567890123456811', owner = '7834567890123456811'
const bindings = { CLASH_PROXY: { fetch: async (request: Request) => Response.json({
  tag: decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? ''), name: 'Signup player',
  townHallLevel: 17, trophies: 5000, clan: { tag: '#8QQ', name: 'Signup clan' }, troops: [], spells: [], heroes: [],
}) } } as unknown as WorkerBindings

it('looks up Discord identity without holding a roster lock, then admits only the affected owner', async () => {
  const rosterId = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Signup admission')`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${owner}, 'discord')`
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, max_accounts_per_user, clan_tag)
      VALUES (${serverId}, 'Signup overage', 1, '#8QQ') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES
      ('#8Q2', ${owner}, 'bot'), ('#8Q8', '7834567890123456812', 'bot'), ('#8Q9', '7834567890123456812', 'bot')`
    yield* sql`INSERT INTO basic_player (tag, name, townhall_level, trophies) VALUES ('#8Q2', 'Signup player', 17, 5000)`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES
      (${id}::uuid, '#8Q8', 'Preserved first'), (${id}::uuid, '#8Q9', 'Preserved transfer')`
    return id
  }).pipe(Effect.provide(db), Effect.scoped))
  const discord = Layer.succeed(DiscordApi, {
    request: () => Effect.promise(async () => {
      // An independent connection must be able to lock the roster while the
      // external identity lookup is in progress, without timing assumptions.
      await Effect.runPromise(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.withTransaction(sql`SELECT id FROM rosters WHERE id = ${rosterId}::uuid FOR UPDATE NOWAIT`)
      }).pipe(Effect.provide(db), Effect.scoped))
      return { user: { id: owner, username: 'Verified identity', avatar: null } }
    }),
    token: () => Effect.die('Unexpected OAuth'),
  })
  const layer = DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord)))
  await Effect.runPromise(Effect.gen(function* () {
    const operations = yield* DashboardRosterOperations
    const url = new URL(`https://api.clashk.ing/v2/server/${serverId}/rosters/${rosterId}/submissions`)
    const response = yield* operations.execute('submitSignup', { bindings, principal: { kind: 'user', userId: owner },
      params: { serverId, rosterId }, url, request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerTag: '#8Q2', answers: {} }) }) })
    expect(response.status).toBe(201)
    const getUrl = new URL(`https://api.clashk.ing/v2/roster/${rosterId}?server_id=${serverId}`)
    const saved = yield* operations.execute('getRoster', { bindings, params: { rosterId }, url: getUrl, request: new Request(getUrl) })
    expect(yield* Effect.promise(() => saved.json())).toMatchObject({ roster: { members: expect.arrayContaining([
      expect.objectContaining({ tag: '#8Q2', discord: owner, discord_cache_ready: false }),
      expect.objectContaining({ tag: '#8Q8' }), expect.objectContaining({ tag: '#8Q9' }),
    ]) } })
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it.each([
  { name: 'verification required', scope: 'anyone', clan: '#8QQ', configuredClan: '#8QQ', inGuild: true, family: false, requireVerified: true, isVerified: false, full: false, expected: 'Forbidden' },
  { name: 'verified account accepted', scope: 'anyone', clan: '#8QQ', configuredClan: '#8QQ', inGuild: true, family: false, requireVerified: true, isVerified: true, full: false, expected: 'accepted' },
  { name: 'maximum signups enforced', scope: 'anyone', clan: '#8QQ', configuredClan: '#8QQ', inGuild: true, family: false, requireVerified: false, isVerified: false, full: true, expected: 'Conflict' },
  { name: 'wrong clan', scope: 'clan-only', clan: '#8PQ', configuredClan: '#8QQ', inGuild: true, family: false, expected: 'Forbidden' },
  { name: 'missing configured clan', scope: 'clan-only', clan: '#8QQ', configuredClan: null, inGuild: true, family: false, expected: 'Conflict' },
  { name: 'outside family', scope: 'family-only', clan: '#8PQ', configuredClan: null, inGuild: true, family: false, expected: 'Forbidden' },
  { name: 'current family clan', scope: 'family-only', clan: '#8QQ', configuredClan: null, inGuild: true, family: true, expected: 'accepted' },
  { name: 'anyone outside family', scope: 'anyone', clan: '#OUTSIDE', configuredClan: '#8QQ', inGuild: true, family: false, expected: 'accepted' },
  { name: 'anyone still needs guild membership', scope: 'anyone', clan: '#OUTSIDE', configuredClan: null, inGuild: false, family: false, expected: 'Forbidden' },
  { name: 'not in Discord guild', scope: 'clan-only', clan: '#8QQ', configuredClan: '#8QQ', inGuild: false, family: false, expected: 'Forbidden' },
])('enforces new self-service signup scope: $name', async ({ name, scope, clan, configuredClan, inGuild, family, expected, requireVerified = false, isVerified = false, full = false }) => {
  const guild = '6834567890123456841', actor = '7834567890123456841', tag = '#8QL'
  const rosterId = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Scope fixture') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${actor}, 'discord') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES (${tag}, ${actor}, 'bot', ${isVerified}) ON CONFLICT (tag) DO UPDATE SET is_verified = EXCLUDED.is_verified`
    if (family) {
      yield* sql`INSERT INTO basic_clan (tag, name, public_war_log, war_wins, member_count, badge_token, troops_donated, troops_received)
        VALUES (${clan}, 'Scope clan', true, 1, 1, 'fixture', 0, 0) ON CONFLICT DO NOTHING`
      yield* sql`INSERT INTO server_clans (server_id, tag) VALUES (${guild}, ${clan}) ON CONFLICT DO NOTHING`
    }
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, signup_scope, clan_tag, min_townhall, max_townhall, require_verified, max_signups)
      VALUES (${guild}, ${name}, ${scope}, ${configuredClan}, 16, 18, ${requireVerified}, ${full ? 1 : null}) RETURNING id::text`)[0]!.id
    if (full) yield* sql`INSERT INTO roster_members (roster_id, tag, name, townhall) VALUES (${id}::uuid, '#FULL', 'Existing member', 17)`
    return id
  }).pipe(Effect.provide(db), Effect.scoped))
  const scopedBindings = { CLASH_PROXY: { fetch: async () => Response.json({ tag, name: 'Live player', townHallLevel: 17, trophies: 5000,
    clan: { tag: clan, name: 'Live clan' }, troops: [], spells: [], heroes: [] }) } } as unknown as WorkerBindings
  const discord = Layer.succeed(DiscordApi, { request: () => inGuild
    ? Effect.succeed({ user: { id: actor, username: 'Guild member', avatar: null } }) : Effect.fail(new NotFound({ message: 'Guild member missing' })),
  token: () => Effect.die('Unexpected OAuth') })
  const layer = Layer.merge(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))))
  await Effect.runPromise(Effect.gen(function* () {
    const operations = yield* DashboardRosterOperations, sql = yield* SqlClient.SqlClient
    const url = new URL(`https://api.clashk.ing/v2/server/${guild}/rosters/${rosterId}/submissions`)
    const outcome = yield* operations.execute('submitSignup', { bindings: scopedBindings, principal: { kind: 'user', userId: actor },
      params: { serverId: guild, rosterId }, url, request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerTag: tag, answers: {} }) }) }).pipe(Effect.map(() => 'accepted'), Effect.catch((error) => Effect.succeed(error._tag)))
    expect(outcome).toBe(expected)
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${rosterId}::uuid`).toEqual(expected === 'accepted' ? [{ tag }] : full ? [{ tag: '#FULL' }] : [])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it('rejects stale signup ownership after a verified addLink transfer during identity lookup', async () => {
  const oldOwner = '7834567890123456821', newOwner = '7834567890123456822', guild = '6834567890123456821', tag = '#8QC'
  const rosterId = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Signup transfer')`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${oldOwner}, 'discord')`
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias)
      VALUES (${guild}, 'Transfer preserved') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES (${tag}, ${oldOwner}, 'bot', true)`
    yield* sql`INSERT INTO basic_player (tag, name, townhall_level, trophies) VALUES (${tag}, 'Transferred player', 17, 5000)`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, signup_answers) VALUES (${id}::uuid, ${tag}, 'Preserved member', '{"old":"answer"}'::jsonb)`
    return id
  }).pipe(Effect.provide(db), Effect.scoped))
  const discord = Layer.succeed(DiscordApi, {
    request: () => Effect.promise(async () => {
      await Effect.runPromise(addLink({ kind: 'bot' }, newOwner, { player_tag: tag, api_token: 'fixture-valid' }, {
        CLASH_PROXY: { fetch: async (request: Request) => request.url.endsWith('/verifytoken')
          ? Response.json({ status: 'ok' }) : Response.json({ tag, name: 'Transferred player', townHallLevel: 17 }) },
      }).pipe(Effect.provide(db), Effect.scoped))
      return { user: { id: oldOwner, username: 'Old identity', avatar: null } }
    }), token: () => Effect.die('Unexpected OAuth'),
  })
  const layer = Layer.merge(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))))
  await Effect.runPromise(Effect.gen(function* () {
    const operations = yield* DashboardRosterOperations, sql = yield* SqlClient.SqlClient
    const url = new URL(`https://api.clashk.ing/v2/server/${guild}/rosters/${rosterId}/submissions`)
    const result = yield* operations.execute('submitSignup', { bindings, principal: { kind: 'user', userId: oldOwner },
      params: { serverId: guild, rosterId }, url, request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerTag: tag, answers: {} }) }) }).pipe(Effect.map(() => 'accepted'), Effect.catch((error) => Effect.succeed(error._tag)))
    expect(result).toBe('Forbidden')
    expect(yield* sql`SELECT user_id, is_verified FROM player_links WHERE tag = ${tag}`).toEqual([{ user_id: newOwner, is_verified: true }])
    expect(yield* sql`SELECT tag, signup_answers FROM roster_members WHERE roster_id = ${rosterId}::uuid`).toEqual([{ tag, signup_answers: { old: 'answer' } }])
    expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ${rosterId}::uuid`).toEqual([{ revision: 1 }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
