import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, PayloadTooLarge, RateLimited } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"
import { lockRosterAIBudget } from "./dashboard-roster-ai-accounting.js"
import { loadViews, rosterMetrics, viewJson } from "./dashboard-roster-runtime.js"

export const dashboardRosterAIContextRoutes = [{ method: "POST", path: "/v2/roster/ai/context" }] as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export const dispatchDashboardRosterAIContext = (request: Request, maxPromptChars: string) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/v2/roster/ai/context") return undefined
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  const endpoint = dashboardEndpoints.dashboardRosterAIContext
  const body = yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(endpoint.body)),
    Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Request body failed schema validation" }))))
  const rosterIds = body.rosterIds.map((id) => id.toLowerCase())
  const viewId = body.viewId?.trim() || null
  if (rosterIds.length < 1 || rosterIds.length > 25 || rosterIds.some((id) => !uuid.test(id))
    || new Set(rosterIds).size !== rosterIds.length || viewId !== null && !uuid.test(viewId)
    || body.messages.length < 1 || body.messages.length > 30) {
    return yield* new InvalidRequest({ message: "AI requests require 1 to 30 messages and 1 to 25 unique roster UUIDs, with a valid optional viewId" })
  }
  const limit = Number(maxPromptChars)
  if (!Number.isSafeInteger(limit) || limit < 1000) return yield* new DatabaseFailure({ cause: "Invalid AI_ROSTER_MAX_PROMPT_CHARS", message: "Roster AI prompt limit is not configured" })
  let promptBytes = 0
  for (const message of body.messages) {
    const content = message.content?.trim() || message.parts?.filter((part) => part.type === "text" && part.text?.trim())
      .map((part) => part.text!.trim()).join("\n") || ""
    if (content === "") return yield* new InvalidRequest({ message: "AI messages require non-empty text parts" })
    // Match Go len(string): the historical setting name says chars, but counts UTF-8 bytes.
    promptBytes += new TextEncoder().encode(content).length
  }
  if (promptBytes > limit) return yield* new PayloadTooLarge({ message: "AI roster prompt is too large" })
  const principal = yield* (yield* AuthIdentity).requireUser(request)
  yield* (yield* ServerAuthorization).require(request, body.serverId, { section: "rosters", write: true })
  const sql = yield* SqlClient.SqlClient
  const encoded = yield* sql.withTransaction(Effect.gen(function* () {
    const identity = yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${principal.userId} AND provider = 'discord' FOR SHARE`
    if (identity.length !== 1) return yield* new Forbidden({ message: "A Discord identity is required for roster management" })
    yield* lockRosterAIBudget(sql)
    const rows = yield* sql<{ id: string; alias: string; clan_tag: string | null; revision: number; signup_questions: unknown; member_count: number }>`
      SELECT r.id::text, r.alias, r.clan_tag, r.revision::integer, r.signup_questions,
        (SELECT count(*)::integer FROM roster_members member WHERE member.roster_id = r.id) AS member_count
      FROM rosters r WHERE r.server_id = ${body.serverId} AND r.id = ANY(${rosterIds}::uuid[]) ORDER BY r.id FOR SHARE
    `
    if (rows.length !== rosterIds.length) return yield* new InvalidRequest({ message: "One or more roster attachments do not belong to this server" })
    const attachments = rosterIds.map((id) => {
      const row = rows.find((candidate) => candidate.id === id)!
      return { rosterId: row.id, alias: row.alias, clanTag: row.clan_tag, revision: row.revision,
        signupQuestions: row.signup_questions, memberCount: row.member_count }
    })
    const view = viewId === null ? null : (yield* loadViews(sql, body.serverId, viewId))[0]
    if (view === undefined) return yield* new NotFound({ message: "Roster view not found" })
    const spent = (yield* sql<{ server: number; global: number; user: number }>`
      WITH monthly AS (SELECT usage.*, COALESCE((SELECT sum(amount_usd) FROM roster_ai_usage_credits credit WHERE credit.usage_id = usage.id), 0) AS credited
        FROM roster_ai_usage usage WHERE usage.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      SELECT COALESCE(sum(total_cost_usd) FILTER (WHERE server_id = ${body.serverId}), 0)::float8 AS server,
        COALESCE(sum(GREATEST(total_cost_usd - credited, 0)), 0)::float8 AS global,
        COALESCE(sum(total_cost_usd) FILTER (WHERE discord_user_id = ${principal.userId}), 0)::float8 AS user FROM monthly
    `)[0]!
    yield* sql`SELECT entitlement.user_id FROM subscription_roster_assignments assignment JOIN subscription_entitlements entitlement ON entitlement.user_id = assignment.user_id
      WHERE assignment.server_id = ${body.serverId} ORDER BY entitlement.user_id FOR UPDATE OF entitlement, assignment`
    const sponsors = yield* sql<{ user_id: string; monthly_limit: number; spent: number; remaining: number }>`
      SELECT assignment.user_id, entitlement.roster_assistant_monthly_credit_usd::float8 AS monthly_limit,
        COALESCE(spend.spent, 0)::float8 AS spent,
        GREATEST(entitlement.roster_assistant_monthly_credit_usd - COALESCE(spend.spent, 0), 0)::float8 AS remaining
      FROM subscription_roster_assignments assignment JOIN subscription_entitlements entitlement ON entitlement.user_id = assignment.user_id AND entitlement.active = true
      LEFT JOIN LATERAL (SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits WHERE user_id = assignment.user_id
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') spend ON true
      WHERE assignment.server_id = ${body.serverId} ORDER BY assignment.user_id
    `
    const paidLimit = sponsors.reduce((sum, item) => sum + item.monthly_limit, 0)
    const paidSpent = sponsors.reduce((sum, item) => sum + Math.min(item.spent, item.monthly_limit), 0)
    const paidRemaining = sponsors.reduce((sum, item) => sum + item.remaining, 0)
    const now = new Date(), resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const exhausted = sponsors.length > 0 ? paidRemaining <= 0 : spent.server >= 0.05 || spent.global >= 10
    if (exhausted) return yield* new RateLimited({ message: sponsors.length > 0 ? "This server's monthly roster assistant credit has been used"
      : spent.server >= 0.05 ? "This server has used its monthly roster AI budget" : "The monthly free roster AI budget has been used",
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1000)) })
    const requestId = crypto.randomUUID()
    const response = yield* Schema.encodeUnknownEffect(endpoint.response)({ requestId, model: "gpt-5.6-luna",
      budget: { serverSpentUsd: spent.server, serverLimitUsd: 0.05, globalSpentUsd: spent.global, globalLimitUsd: 10,
        userSpentUsd: spent.user, userLimitUsd: 0, paidSpentUsd: paidSpent, paidLimitUsd: paidLimit, paidRemainingUsd: paidRemaining,
        usesPaidPool: sponsors.length > 0, resetsAt: resetsAt.toISOString() },
      context: { attachments, metrics: rosterMetrics, currentView: view === null ? null : viewJson(view) },
    }).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Roster AI context failed response encoding" })))
    // Preserve zero-cost authorization: this records admission, not an estimated charge.
    yield* sql`INSERT INTO roster_ai_usage (id, server_id, roster_id, view_id, discord_user_id, operation, provider, model)
      VALUES (${requestId}, ${body.serverId}, ${rosterIds[0]!}, ${viewId}, ${principal.userId}, 'view_or_membership_proposal', 'openai', 'gpt-5.6-luna')`
    for (const [position, sponsor] of sponsors.entries()) {
      if (sponsor.remaining > 0) yield* sql`INSERT INTO roster_ai_usage_sponsors (usage_id, user_id, position) VALUES (${requestId}, ${sponsor.user_id}, ${position})`
    }
    return response
  })).pipe(Effect.mapError((cause) => cause instanceof Forbidden || cause instanceof InvalidRequest || cause instanceof NotFound
    || cause instanceof RateLimited || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Roster AI authorization failed" })))
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
