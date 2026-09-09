import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { dashboardEndpoints } from "@clashking/api-contracts"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"

import { dispatchDashboardRosterAIContext } from "../../src/dashboard-roster-ai-context.js"
import { AuthIdentity } from "../../src/auth.js"
import { ServerAuthorization } from "../../src/server-authorization.js"
import { Forbidden } from "../../src/errors.js"
import { dispatchDashboardRosterAIUsage } from "../../src/dashboard-roster-ai-usage.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const serverId = "6934567890123456705", foreignServerId = "6934567890123456706", userId = "7934567890123456705"
const principal = { kind: 'user' as const, userId }
const access = { principal, manager: true, sections: {} }
const layer = Layer.mergeAll(PgClient.layer({ url: Redacted.make(databaseUrl) }), Layer.succeed(AuthIdentity, {
  requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal), requireBot: () => Effect.die('No bot identity'),
}), Layer.succeed(ServerAuthorization, {
  resolve: () => Effect.succeed(access), require: (_request, id) => id === serverId
    ? Effect.succeed(access) : Effect.fail(new Forbidden({ message: 'Unauthorized server' })),
}))
const context = (rosterIds: string[], server = serverId) => dispatchDashboardRosterAIContext(new Request(
  'https://api.clashk.ing/v2/roster/ai/context', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: server, rosterIds, messages: [{ role: 'user', content: 'Build my war roster' }] }) }), '12000')

it("authorizes trusted roster attachments, rejects cross-server attachment reuse, and enforces the existing free budget", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'AI context'), (${foreignServerId}, 'Foreign AI context')`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord')`
    const own = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
      VALUES (${serverId}, 'Own roster', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
    const foreign = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
      VALUES (${foreignServerId}, 'Foreign roster', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
    expect(yield* context([foreign]).pipe(Effect.flip)).toMatchObject({ _tag: 'InvalidRequest' })
    expect(yield* context([own], foreignServerId).pipe(Effect.flip)).toMatchObject({ _tag: 'Forbidden' })
    const response = yield* context([own])
    expect(response?.status).toBe(200)
    expect(yield* Effect.promise(() => response!.json())).toMatchObject({ model: 'gpt-5.6-luna',
      budget: { serverSpentUsd: 0, serverLimitUsd: 0.05, globalLimitUsd: 10, usesPaidPool: false },
      context: { attachments: [{ rosterId: own, alias: 'Own roster', memberCount: 0 }], currentView: null } })
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_ai_usage WHERE server_id = ${serverId}`).toEqual([{ count: 1 }])
    yield* sql`UPDATE roster_ai_usage SET input_tokens = 1, total_tokens = 1, input_cost_usd = 0.05, total_cost_usd = 0.05 WHERE server_id = ${serverId}`
    expect(yield* context([own]).pipe(Effect.flip)).toMatchObject({ _tag: 'RateLimited' })
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_ai_usage WHERE server_id = ${serverId}`).toEqual([{ count: 1 }])
    yield* sql`UPDATE roster_ai_usage SET input_cost_usd = 0, total_cost_usd = 0 WHERE server_id = ${serverId}`
    const globalCost = (yield* sql<{ id: string }>`INSERT INTO roster_ai_usage (server_id, discord_user_id, operation, provider, model, input_tokens, total_tokens, input_cost_usd, total_cost_usd)
      VALUES (${foreignServerId}, ${userId}, 'global-budget-fixture', 'openai', 'gpt-5.6-luna', 1, 1, 10, 10) RETURNING id::text`)[0]!.id
    expect(yield* context([own]).pipe(Effect.flip)).toMatchObject({ _tag: 'RateLimited', message: 'The monthly free roster AI budget has been used' })
    yield* sql`UPDATE roster_ai_usage SET input_cost_usd = 0, total_cost_usd = 0 WHERE id = ${globalCost}`
    // The shared lock serializes admission against settled spend. It does not
    // reserve an estimated charge, so two unsettled admissions remain valid.
    const admissions = yield* Effect.all([context([own]), context([own])], { concurrency: 2 })
    for (const admission of admissions) {
      const authorized = Schema.decodeUnknownSync(dashboardEndpoints.dashboardRosterAIContext.response)(yield* Effect.promise(() => admission!.json()))
      const usage = { inputTokens: 300000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10000, reasoningTokens: 0 }
      const settled = yield* dispatchDashboardRosterAIUsage(new Request('https://api.clashk.ing/v2/roster/ai/usage', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-ClashKing-AI-Metering': 'fixture-secret' },
        body: JSON.stringify({ requestId: authorized.requestId, model: 'gpt-5.6-luna', usage, steps: [usage] }),
      }), 'fixture-secret')
      expect(settled?.status).toBe(204)
    }
    expect(yield* sql`SELECT sum(total_cost_usd)::text AS spent FROM roster_ai_usage WHERE server_id = ${serverId}`)
      .toEqual([{ spent: '0.27600000' }])
    expect(yield* context([own]).pipe(Effect.flip)).toMatchObject({ _tag: 'RateLimited' })
  }).pipe(Effect.provide(layer), Effect.scoped))
})
