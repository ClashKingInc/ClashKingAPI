import { Schema } from "effect"

import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js"
import { DecimalSnowflake } from "./discord.js"
import { DashboardRosterMembershipChange, DashboardRosterMetric, DashboardRosterView } from "./dashboard-roster.js"
import { ErrorResponse } from "./errors.js"

const OptionalString = Schema.optionalKey(Schema.String)
const OptionalNumber = Schema.optionalKey(Schema.Number)
const OptionalNullableString = Schema.optionalKey(Schema.NullOr(Schema.String))
const OptionalNullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number))
const JsonObject = Schema.Record(Schema.String, Schema.Json)
const errors = [400, 401, 403, 404, 409, 413, 429, 503].map((status) => ({ status, body: ErrorResponse }))
const BuilderPath = Schema.Struct({ serverId: DecimalSnowflake, rosterId: Schema.String })
const RosterQuery = Schema.Struct({ server_id: DecimalSnowflake, roster_id: Schema.String })

export const DashboardRosterBatchRequest = Schema.Struct({
  serverId: DecimalSnowflake,
  rosterIds: Schema.Array(Schema.String),
  fields: Schema.optionalKey(Schema.Array(Schema.Literals([
    "playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName",
    "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers",
  ]))),
})
export const DashboardRosterSnapshotRow = Schema.Struct({
  rosterId: Schema.String, playerTag: Schema.String, playerName: OptionalString,
  townhall: OptionalNumber, trophies: OptionalNullableNumber, clanName: OptionalNullableString,
  clanTag: OptionalNullableString, leagueId: OptionalNullableNumber, leagueName: OptionalNullableString,
  heroLevelSum: OptionalNumber, maxPercent: OptionalNullableNumber,
  warPreference: Schema.optionalKey(Schema.NullOr(Schema.Boolean)), lastOnline: OptionalNullableString,
  discordUsername: OptionalNullableString, signupAnswers: Schema.optionalKey(JsonObject),
})
export const DashboardRosterMembersQueryEndpoint = defineEndpoint({
  operationId: "dashboardRosterMembersQuery", method: "POST", path: "/v2/roster/members/query",
  auth: "server-read", body: DashboardRosterBatchRequest, bodyMode: "json", pathParams: NoPathParams,
  query: NoQuery, response: Schema.Struct({ rows: Schema.Array(DashboardRosterSnapshotRow) }),
  responseMode: "json", successStatus: 200, errors, summary: "Query selected roster snapshot fields",
})
export const DashboardRosterAccountGroupsQueryEndpoint = defineEndpoint({
  operationId: "dashboardRosterAccountGroupsQuery", method: "POST", path: "/v2/roster/account-groups/query",
  auth: "server-read", body: DashboardRosterBatchRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ groups: Schema.Array(Schema.Struct({ group: Schema.Number, accounts: Schema.Array(
    Schema.Struct({ rosterId: Schema.String, playerTag: Schema.String, playerName: Schema.String }),
  ) })), note: Schema.String }), responseMode: "json", successStatus: 200, errors,
  summary: "Group roster accounts by linked owner without exposing owner IDs",
})
export const DashboardRosterRefreshBatchEndpoint = defineEndpoint({
  operationId: "dashboardRosterRefreshBatch", method: "POST", path: "/v2/roster/refresh-batch",
  auth: "server-write", body: DashboardRosterBatchRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ rosters: Schema.Array(Schema.Struct({
    rosterId: Schema.String, status: Schema.Literals(["completed", "reused", "waiting"]),
    message: OptionalString, refreshedPlayers: OptionalNumber, failedPlayers: OptionalNumber, refreshedAt: OptionalString,
  })) }), responseMode: "json", successStatus: 200, errors, summary: "Refresh attached roster snapshots",
})
export const DashboardRosterMembershipValidateEndpoint = defineEndpoint({
  operationId: "dashboardRosterMembershipValidate", method: "POST", path: "/v2/roster/membership-changes/validate",
  auth: "server-read", body: Schema.Struct({ serverId: DecimalSnowflake, rosterIds: Schema.Array(Schema.String),
    changes: Schema.Array(DashboardRosterMembershipChange) }), bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ type: Schema.Literal("membershipProposal"), changes: Schema.Array(DashboardRosterMembershipChange),
    expectedRevisions: Schema.Record(Schema.String, Schema.Number), generatedAt: Schema.String,
    counts: Schema.Struct({ add: Schema.Number, move: Schema.Number, remove: Schema.Number }),
    items: Schema.Array(Schema.Struct({ action: Schema.Literals(["add", "move", "remove"]), playerTag: Schema.String,
      fromRoster: Schema.String, toRoster: Schema.String, reason: Schema.String })),
  }), responseMode: "json", successStatus: 200, errors, summary: "Validate an exact transient roster membership proposal",
})

export const DashboardRosterQuestion = Schema.Struct({
  id: Schema.String, label: Schema.String, type: Schema.Literals(["text", "boolean", "single_select"]),
  required: Schema.Boolean, options: Schema.Array(Schema.String), order: Schema.Number,
})
export const DashboardRosterQuestionnaire = Schema.Struct({
  accountSelector: Schema.Struct({ id: Schema.Literal("account"), type: Schema.Literal("account"), required: Schema.Literal(true) }),
  questions: Schema.Array(DashboardRosterQuestion),
})
export const DashboardRosterQuestionnaireEndpoint = defineEndpoint({
  operationId: "dashboardRosterQuestionnaire", method: "PUT", path: "/v2/roster/questionnaire",
  auth: "server-write", body: Schema.Struct({ questions: Schema.Array(DashboardRosterQuestion) }), bodyMode: "json",
  pathParams: NoPathParams, query: RosterQuery,
  response: Schema.Struct({ questionnaire: DashboardRosterQuestionnaire, affectedMemberCount: Schema.Number }),
  responseMode: "json", successStatus: 200, errors, summary: "Replace roster signup questions",
})
export const DashboardRosterSignupFormEndpoint = defineEndpoint({
  operationId: "dashboardRosterSignupForm", method: "GET", path: "/v2/server/:serverId/rosters/:rosterId/signup-form",
  auth: "user-or-bot", body: NoBody, bodyMode: "none", pathParams: BuilderPath, query: NoQuery,
  response: DashboardRosterQuestionnaire, responseMode: "json", successStatus: 200, errors, summary: "Get roster signup form",
})
export const DashboardRosterSubmission = Schema.Struct({
  id: Schema.String, rosterId: Schema.String, playerTag: Schema.String, answers: JsonObject,
  createdAt: Schema.String, updatedAt: Schema.String,
})
export const DashboardRosterSubmissionEndpoint = defineEndpoint({
  operationId: "dashboardRosterSubmission", method: "POST", path: "/v2/server/:serverId/rosters/:rosterId/submissions",
  auth: "user-or-bot", body: Schema.Struct({ playerTag: Schema.String, answers: JsonObject,
    discordUserId: Schema.optionalKey(DecimalSnowflake), discordUsername: OptionalString, discordAvatarUrl: OptionalString,
  }), bodyMode: "json", pathParams: BuilderPath, query: NoQuery,
  response: Schema.Struct({ submission: DashboardRosterSubmission }), responseMode: "json", successStatus: 201,
  errors, summary: "Submit linked account roster signup answers",
})
export const DashboardRosterBuilderMissingMembersEndpoint = defineEndpoint({
  operationId: "dashboardRosterBuilderMissingMembers", method: "GET", path: "/v2/server/:serverId/rosters/:rosterId/missing-members",
  auth: "server-read", body: NoBody, bodyMode: "none", pathParams: BuilderPath, query: NoQuery,
  response: Schema.Struct({ items: Schema.Array(Schema.Struct({ playerTag: Schema.String, playerName: Schema.String,
    townhall: Schema.Number, trophies: Schema.NullOr(Schema.Number), clanTag: Schema.NullOr(Schema.String),
    clanName: Schema.NullOr(Schema.String), discordUserId: Schema.NullOr(DecimalSnowflake),
  })), count: Schema.Number }), responseMode: "json", successStatus: 200, errors, summary: "Get roster members outside its configured clan",
})
export const DashboardRosterRefreshDataEndpoint = defineEndpoint({
  operationId: "dashboardRosterRefreshData", method: "POST", path: "/v2/roster/refresh-data",
  auth: "server-write", body: Schema.Struct({ scope: Schema.Literals(["data", "role"]) }), bodyMode: "json",
  pathParams: NoPathParams, query: RosterQuery,
  response: Schema.Struct({ refreshId: Schema.String, scope: Schema.Literals(["data", "role"]), status: Schema.String,
    refreshedPlayers: Schema.Number, failedPlayers: Schema.Number, refreshedAt: Schema.String, reused: Schema.Boolean,
    roleId: Schema.optionalKey(DecimalSnowflake), roleMemberUserIds: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
  }), responseMode: "json", successStatus: 200, errors, summary: "Refresh roster data or prepare role reconciliation",
})

export const DashboardRosterAIMessagePart = Schema.Struct({
  type: Schema.String, text: OptionalString, toolCallId: OptionalString, state: OptionalString,
  input: Schema.optionalKey(Schema.Json), approval: Schema.optionalKey(Schema.Struct({
    id: Schema.String, approved: Schema.optionalKey(Schema.Boolean), reason: OptionalString,
  })),
})
export const DashboardRosterAIContextRequest = Schema.Struct({
  serverId: DecimalSnowflake, rosterIds: Schema.Array(Schema.String), viewId: OptionalString,
  messages: Schema.Array(Schema.Struct({ id: OptionalString, role: Schema.Literals(["user", "assistant"]),
    content: OptionalString, parts: Schema.optionalKey(Schema.Array(DashboardRosterAIMessagePart)),
  })),
})
export const DashboardRosterAIContextResponse = Schema.Struct({
  requestId: Schema.String, model: Schema.Literal("gpt-5.6-luna"),
  budget: Schema.Struct({ serverSpentUsd: Schema.Number, serverLimitUsd: Schema.Number,
    globalSpentUsd: Schema.Number, globalLimitUsd: Schema.Number, userSpentUsd: Schema.Number, userLimitUsd: Schema.Number,
    paidSpentUsd: Schema.Number, paidLimitUsd: Schema.Number, paidRemainingUsd: Schema.Number,
    usesPaidPool: Schema.Boolean, resetsAt: Schema.String,
  }),
  context: Schema.Struct({ attachments: Schema.NullOr(Schema.Array(Schema.Struct({
    rosterId: Schema.String, alias: Schema.String, clanTag: Schema.NullOr(Schema.String), memberCount: Schema.Number,
    revision: Schema.Number, signupQuestions: Schema.Array(DashboardRosterQuestion),
  }))), metrics: Schema.Array(DashboardRosterMetric), currentView: Schema.NullOr(DashboardRosterView) }),
})
export const DashboardRosterAIContextEndpoint = defineEndpoint({
  operationId: "dashboardRosterAIContext", method: "POST", path: "/v2/roster/ai/context",
  auth: "user", body: DashboardRosterAIContextRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: DashboardRosterAIContextResponse, responseMode: "json", successStatus: 200, errors,
  summary: "Authorize and reserve an AI request with trusted roster context",
})
export const DashboardRosterAITokenUsage = Schema.Struct({
  inputTokens: Schema.Number, cachedInputTokens: Schema.Number, cacheWriteTokens: Schema.Number,
  outputTokens: Schema.Number, reasoningTokens: Schema.Number,
})
export const DashboardRosterAIUsageEndpoint = defineEndpoint({
  operationId: "dashboardRosterAIUsage", method: "POST", path: "/v2/roster/ai/usage",
  auth: "ai-metering", body: Schema.Struct({ requestId: Schema.String, model: Schema.Literal("gpt-5.6-luna"),
    usage: DashboardRosterAITokenUsage, steps: Schema.Array(DashboardRosterAITokenUsage),
  }), bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: NoContent,
  responseMode: "none", successStatus: 204, errors, summary: "Settle AI usage with the dedicated metering secret",
})

export const dashboardRosterExtraEndpoints = {
  dashboardRosterMembersQuery: DashboardRosterMembersQueryEndpoint,
  dashboardRosterAccountGroupsQuery: DashboardRosterAccountGroupsQueryEndpoint,
  dashboardRosterRefreshBatch: DashboardRosterRefreshBatchEndpoint,
  dashboardRosterMembershipValidate: DashboardRosterMembershipValidateEndpoint,
  dashboardRosterQuestionnaire: DashboardRosterQuestionnaireEndpoint,
  dashboardRosterSignupForm: DashboardRosterSignupFormEndpoint,
  dashboardRosterSubmission: DashboardRosterSubmissionEndpoint,
  dashboardRosterBuilderMissingMembers: DashboardRosterBuilderMissingMembersEndpoint,
  dashboardRosterRefreshData: DashboardRosterRefreshDataEndpoint,
  dashboardRosterAIContext: DashboardRosterAIContextEndpoint,
  dashboardRosterAIUsage: DashboardRosterAIUsageEndpoint,
} as const
