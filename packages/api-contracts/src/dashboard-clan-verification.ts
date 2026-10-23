import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
const pathParams = Schema.Struct({ serverId: DecimalSnowflake, clanTag: Schema.String })
export const ClanVerification = Schema.Struct({
  state: Schema.Literals(["unverified", "pending", "verified", "expired"]),
  marker: Schema.NullOr(Schema.String),
  checkAfter: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  lastCheckedAt: Schema.NullOr(Schema.String),
  verifiedAt: Schema.NullOr(Schema.String),
})
export const ClanVerificationEndpoint = defineEndpoint({
  auth: "server-read", body: NoBody, bodyMode: "none", method: "GET", operationId: "clanVerification",
  path: "/v2/server/:serverId/clan/:clanTag/verification", pathParams, query: NoQuery,
  response: ClanVerification, responseMode: "json", successStatus: 200, errors: [],
  summary: "Read server-scoped clan verification progress",
})
export const StartClanVerificationEndpoint = defineEndpoint({
  auth: "server-write", body: NoBody, bodyMode: "none", method: "POST", operationId: "startClanVerification",
  path: "/v2/server/:serverId/clan/:clanTag/verification", pathParams, query: NoQuery,
  response: ClanVerification, responseMode: "json", successStatus: 200, errors: [],
  summary: "Issue a fresh clan description marker to verify this server's clan",
})
export const CheckClanVerificationEndpoint = defineEndpoint({
  auth: "server-write", body: NoBody, bodyMode: "none", method: "POST", operationId: "checkClanVerification",
  path: "/v2/server/:serverId/clan/:clanTag/verification/check", pathParams, query: NoQuery,
  response: ClanVerification, responseMode: "json", successStatus: 200, errors: [],
  summary: "Check a due clan description challenge against Clash of Clans",
})
