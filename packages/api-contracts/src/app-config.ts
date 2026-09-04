import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"

export const AppPlatform = Schema.Literals(["android", "ios", "web"])

export const PublicFeatureFlag = Schema.Struct({
  key: Schema.String,
  enabled: Schema.Boolean,
  rollout_percentage: Schema.Number,
  min_app_version: Schema.optionalKey(Schema.String),
  platforms: Schema.Array(AppPlatform),
  starts_at: Schema.optionalKey(Schema.String),
  ends_at: Schema.optionalKey(Schema.String),
})

export const NativeUpdatePolicy = Schema.Struct({
  minimum_version: Schema.String,
  store_url: Schema.String,
  message: Schema.String,
})

export const AppUpdatePolicy = Schema.Struct({
  ios: NativeUpdatePolicy,
  android: NativeUpdatePolicy,
  web: Schema.Null,
})

export const AppConfigResponse = Schema.Struct({
  flags: Schema.Array(PublicFeatureFlag),
  updates: AppUpdatePolicy,
  generated_at: Schema.String,
})

export const AppConfigEndpoint = defineEndpoint({
  operationId: "getAppConfig",
  method: "GET",
  path: "/v2/app/config",
  auth: "public",
  summary: "Get public app feature flags and native minimum-version policy",
  body: NoBody,
  bodyMode: "none",
  pathParams: NoPathParams,
  query: NoQuery,
  response: AppConfigResponse,
  responseMode: "json",
  successStatus: 200,
})

export type AppConfigResponse = typeof AppConfigResponse.Type
export type AppPlatform = typeof AppPlatform.Type
export type AppUpdatePolicy = typeof AppUpdatePolicy.Type
