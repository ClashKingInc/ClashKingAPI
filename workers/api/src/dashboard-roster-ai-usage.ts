import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { sameSecret } from "./auth.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, Unauthenticated } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { lockRosterAIBudget } from "./dashboard-roster-ai-accounting.js"

export const dashboardRosterAIUsageRoutes = [{ method: "POST", path: "/v2/roster/ai/usage" }] as const
const fields = ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens", "reasoningTokens"] as const
const money = (units: bigint) => `${units / 100_000_000n}.${String(units % 100_000_000n).padStart(8, "0")}`

export const dispatchDashboardRosterAIUsage = (request: Request, meteringSecret: string) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/v2/roster/ai/usage") return undefined
  const expected = meteringSecret.trim(), actual = (request.headers.get("X-ClashKing-AI-Metering") ?? "").trim()
  if (expected === "" || actual === "" || !(yield* sameSecret(expected, actual))) {
    return yield* new Unauthenticated({ message: "Invalid AI metering credentials" })
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  const endpoint = dashboardEndpoints.dashboardRosterAIUsage
  const body = yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(endpoint.body)),
    Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Request body failed schema validation" }))))
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(body.requestId)) {
    return yield* new InvalidRequest({ message: "Invalid requestId" })
  }
  if (body.steps.length < 1 || body.steps.length > 8 || body.usage.inputTokens + body.usage.outputTokens <= 0
    || fields.some((key) => !Number.isSafeInteger(body.usage[key]) || body.usage[key] < 0)) {
    return yield* new InvalidRequest({ message: "Invalid roster AI token usage" })
  }
  const total = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  let inputUnits = 0n, outputUnits = 0n
  for (const step of body.steps) {
    if (fields.some((key) => !Number.isSafeInteger(step[key]) || step[key] < 0)
      || step.cachedInputTokens + step.cacheWriteTokens > step.inputTokens || step.reasoningTokens > step.outputTokens
      || step.inputTokens > 10_000_000 || step.outputTokens > 10_000_000) {
      return yield* new InvalidRequest({ message: "Invalid roster AI token usage" })
    }
    for (const key of fields) total[key] += step[key]
    const long = step.inputTokens > 272_000
    inputUnits += BigInt(step.inputTokens - step.cachedInputTokens - step.cacheWriteTokens) * (long ? 40n : 20n)
      + BigInt(step.cachedInputTokens) * (long ? 4n : 2n) + BigInt(step.cacheWriteTokens) * (long ? 50n : 25n)
    outputUnits += BigInt(step.outputTokens) * (long ? 180n : 120n)
  }
  if (fields.some((key) => total[key] !== body.usage[key])) return yield* new InvalidRequest({ message: "Usage totals must equal the sum of steps" })
  const inputCost = money(inputUnits), outputCost = money(outputUnits), totalCost = money(inputUnits + outputUnits)
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockRosterAIBudget(sql)
    const row = (yield* sql<{ input_tokens: string; cached_input_tokens: string; cache_write_tokens: string;
      output_tokens: string; reasoning_tokens: string; total_tokens: string; input_cost_usd: string; output_cost_usd: string }>`
      SELECT input_tokens::text, cached_input_tokens::text, cache_write_tokens::text, output_tokens::text, reasoning_tokens::text,
        total_tokens::text, input_cost_usd::text, output_cost_usd::text FROM roster_ai_usage WHERE id = ${body.requestId} AND model = ${body.model} FOR UPDATE
    `)[0]
    if (row === undefined) return yield* new NotFound({ message: "Roster AI usage request not found" })
    if (row.total_tokens !== "0") {
      if (row.input_tokens === String(total.inputTokens) && row.cached_input_tokens === String(total.cachedInputTokens)
        && row.cache_write_tokens === String(total.cacheWriteTokens) && row.output_tokens === String(total.outputTokens)
        && row.reasoning_tokens === String(total.reasoningTokens) && row.input_cost_usd === inputCost && row.output_cost_usd === outputCost) return
      return yield* new Conflict({ message: "Roster AI usage request was already settled with different usage" })
    }
    yield* sql`SELECT entitlement.user_id FROM subscription_entitlements entitlement JOIN roster_ai_usage_sponsors sponsor ON sponsor.user_id = entitlement.user_id
      WHERE sponsor.usage_id = ${body.requestId} ORDER BY entitlement.user_id FOR UPDATE OF entitlement`
    yield* sql`UPDATE roster_ai_usage SET input_tokens = ${total.inputTokens}::bigint, cached_input_tokens = ${total.cachedInputTokens}::bigint,
      cache_write_tokens = ${total.cacheWriteTokens}::bigint, output_tokens = ${total.outputTokens}::bigint, reasoning_tokens = ${total.reasoningTokens}::bigint,
      total_tokens = ${total.inputTokens + total.outputTokens}::bigint, input_cost_usd = ${inputCost}::numeric,
      output_cost_usd = ${outputCost}::numeric, total_cost_usd = ${totalCost}::numeric WHERE id = ${body.requestId}`
    yield* sql`DELETE FROM roster_ai_usage_credits WHERE usage_id = ${body.requestId}`
    yield* sql`WITH sponsor_balances AS (
      SELECT sponsor.user_id, sponsor.position,
        GREATEST(entitlement.roster_assistant_monthly_credit_usd - COALESCE(spend.spent, 0), 0) AS remaining
      FROM roster_ai_usage_sponsors sponsor JOIN subscription_entitlements entitlement ON entitlement.user_id = sponsor.user_id AND entitlement.active = true
      LEFT JOIN LATERAL (SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits WHERE user_id = sponsor.user_id
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') spend ON true
      WHERE sponsor.usage_id = ${body.requestId}
    ), allocations AS (
      SELECT user_id, GREATEST(LEAST(remaining, ${totalCost}::numeric - COALESCE(sum(remaining) OVER (
        ORDER BY position ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)), 0) AS amount FROM sponsor_balances
    ) INSERT INTO roster_ai_usage_credits (usage_id, user_id, amount_usd)
      SELECT ${body.requestId}, user_id, amount FROM allocations WHERE amount > 0`
  })).pipe(Effect.mapError((cause) => cause instanceof NotFound || cause instanceof Conflict || cause instanceof DatabaseFailure
    ? cause : new DatabaseFailure({ cause, message: "Roster AI settlement failed" })))
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
})
