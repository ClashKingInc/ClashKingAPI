import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"

import { dispatchDashboardRosterAIUsage } from "../../src/dashboard-roster-ai-usage.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = "6934567890123456704", userId = "7934567890123456704"
const secret = "disposable-metering-fixture"
const usage = { inputTokens: 100000, cachedInputTokens: 20000, cacheWriteTokens: 10000, outputTokens: 10000, reasoningTokens: 1000 }
const settle = (requestId: string, metering = secret, tokens = usage) => dispatchDashboardRosterAIUsage(new Request(
  'https://api.clashk.ing/v2/roster/ai/usage', { method: 'POST', headers: { 'content-type': 'application/json', 'X-ClashKing-AI-Metering': metering },
    body: JSON.stringify({ requestId, model: 'gpt-5.6-luna', usage: tokens, steps: [tokens] }) }), secret)

it("settles exact Luna token costs once, permits identical retries, and rejects conflicting settlement", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'AI usage fixture')`
    const id = (yield* sql<{ id: string }>`INSERT INTO roster_ai_usage (server_id, discord_user_id, operation, provider, model)
      VALUES (${serverId}, ${userId}, 'view_or_membership_proposal', 'openai', 'gpt-5.6-luna') RETURNING id::text`)[0]!.id
    expect(yield* settle(id, 'wrong-secret').pipe(Effect.flip)).toMatchObject({ _tag: 'Unauthenticated' })
    expect((yield* settle(id))?.status).toBe(204)
    expect((yield* settle(id))?.status).toBe(204)
    expect(yield* settle(id, secret, { ...usage, outputTokens: 10001 }).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    expect(yield* sql`SELECT input_cost_usd::text, output_cost_usd::text, total_cost_usd::text, total_tokens::text FROM roster_ai_usage WHERE id = ${id}`)
      .toEqual([{ input_cost_usd: '0.01690000', output_cost_usd: '0.01200000', total_cost_usd: '0.02890000', total_tokens: '110000' }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("allocates shared sponsor credit at most once across competing settlements and retries", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sponsorId = '7934567890123456707'
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'AI usage fixture') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${sponsorId}, 'discord')`
    yield* sql`INSERT INTO subscription_entitlements (user_id, active, roster_assistant_monthly_credit_usd) VALUES (${sponsorId}, true, 0.04)`
    const first = (yield* sql<{ id: string }>`INSERT INTO roster_ai_usage (server_id, discord_user_id, operation, provider, model)
      VALUES (${serverId}, ${userId}, 'view_or_membership_proposal', 'openai', 'gpt-5.6-luna') RETURNING id::text`)[0]!.id
    const second = (yield* sql<{ id: string }>`INSERT INTO roster_ai_usage (server_id, discord_user_id, operation, provider, model)
      VALUES (${serverId}, ${userId}, 'view_or_membership_proposal', 'openai', 'gpt-5.6-luna') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_ai_usage_sponsors (usage_id, user_id, position) VALUES (${first}, ${sponsorId}, 0), (${second}, ${sponsorId}, 0)`
    const responses = yield* Effect.all([settle(first), settle(second), settle(first)], { concurrency: 3 })
    expect(responses.map((response) => response?.status)).toEqual([204, 204, 204])
    expect(yield* sql`SELECT sum(amount_usd)::text AS credited FROM roster_ai_usage_credits WHERE user_id = ${sponsorId}`)
      .toEqual([{ credited: '0.04000000' }])
    expect(yield* sql`SELECT sum(usage.total_cost_usd - credit.amount_usd)::text AS uncovered
      FROM roster_ai_usage usage JOIN roster_ai_usage_credits credit ON credit.usage_id = usage.id WHERE credit.user_id = ${sponsorId}`)
      .toEqual([{ uncovered: '0.01780000' }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
