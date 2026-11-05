import { readServerLimits, limitMessage } from "./server-limits.js"
import { requireAiNotice } from "./ai-notice.js"
import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, PayloadTooLarge, RateLimited } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"
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
  if (rosterIds.length > 25 || rosterIds.some((id) => !uuid.test(id))
    || new Set(rosterIds).size !== rosterIds.length || viewId !== null && !uuid.test(viewId)
    || body.messages.length < 1 || body.messages.length > 30) {
    return yield* new InvalidRequest({ message: "AI requests require 1 to 30 messages and up to 25 unique roster UUIDs, with a valid optional viewId" })
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
  yield* requireAiNotice(principal.userId)
  yield* (yield* ServerAuthorization).require(request, body.serverId, { section: "rosters", write: true })
  const sql = yield* SqlClient.SqlClient
  const encoded = yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT pg_advisory_xact_lock(hashtext('roster_ai_free_monthly_budget'))`
    // Zero-token rows are pending admissions, not free capacity. Allow one
    // active request per server/person; abandoned calls expire without a charge.
    // This bounds concurrency without inventing estimated settled usage.
    const pending = yield* sql`SELECT id FROM roster_ai_usage
      WHERE total_tokens=0 AND created_at>now()-interval '10 minutes'
        AND (server_id=${body.serverId} OR discord_user_id=${principal.userId}) LIMIT 1`
    if (pending.length) return yield* new RateLimited({ message: "A roster AI request is already in progress", retryAfterSeconds: 30 })
    const identity = yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${principal.userId} AND provider = 'discord' FOR SHARE`
    if (identity.length !== 1) return yield* new Forbidden({ message: "A Discord identity is required for roster management" })
    const rows = yield* sql<{ id: string; alias: string; clan_tag: string | null; revision: number; signup_questions: unknown; member_count: number }>`
      SELECT r.id::text, r.alias, r.clan_tag, r.revision::integer, r.signup_questions,
        (SELECT count(*)::integer FROM roster_members member WHERE member.roster_id = r.id) AS member_count
      FROM rosters r WHERE r.server_id = ${body.serverId} AND (${rosterIds.length === 0} OR r.id = ANY(${rosterIds}::uuid[])) ORDER BY r.id LIMIT 25 FOR SHARE
    `
    if (rosterIds.length > 0 && rows.length !== rosterIds.length) return yield* new InvalidRequest({ message: "One or more roster attachments do not belong to this server" })
    const attachments = (rosterIds.length === 0 ? rows.map(row => row.id) : rosterIds).map((id) => {
      const row = rows.find((candidate) => candidate.id === id)!
      return { rosterId: row.id, alias: row.alias, clanTag: row.clan_tag, revision: row.revision,
        signupQuestions: row.signup_questions, memberCount: row.member_count }
    })
    const view = viewId === null ? null : (yield* loadViews(sql, body.serverId, viewId))[0]
    if (view === undefined) return yield* new NotFound({ message: "Roster view not found" })
    const limits=yield* readServerLimits(body.serverId)
    if(limits.aiSpentUsd+limits.aiReservedUsd>=limits.aiMonthlyLimitUsd)return yield* new RateLimited({message:limitMessage("Monthly AI spend"),retryAfterSeconds:60})
    const requestId = crypto.randomUUID()
    const response = yield* Schema.encodeUnknownEffect(endpoint.response)({ requestId, model: "gpt-6-luna",
      budget: { serverSpentUsd:limits.aiSpentUsd, serverReservedUsd:limits.aiReservedUsd, serverLimitUsd:limits.aiMonthlyLimitUsd, resetsAt:limits.resetsAt },
      context: { attachments, metrics: rosterMetrics, currentView: view === null ? null : viewJson(view) },
    }).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Roster AI context failed response encoding" })))
    // Preserve zero-cost authorization: this records admission, not an estimated charge.
    yield* sql`INSERT INTO roster_ai_usage (id, server_id, roster_id, view_id, discord_user_id, operation, provider, model)
      VALUES (${requestId}, ${body.serverId}, ${rosterIds[0] ?? null}, ${viewId}, ${principal.userId}, 'view_or_membership_proposal', 'openai', 'gpt-6-luna')`
    return response
  })).pipe(Effect.mapError((cause) => cause instanceof Forbidden || cause instanceof InvalidRequest || cause instanceof NotFound
    || cause instanceof RateLimited || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Roster AI authorization failed" })))
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
