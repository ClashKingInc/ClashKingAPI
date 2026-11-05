import { Schema } from "effect";
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js";
export const BotModerationImageEndpoint = defineEndpoint({
  operationId: "botModerationImage",
  method: "POST",
  path: "/v2/bot/moderation/images",
  auth: "bot",
  summary: "Store an image attached to a Discord moderation record",
  pathParams: NoPathParams,
  query: NoQuery,
  body: Schema.FormData,
  bodyMode: "multipart",
  response: Schema.Struct({ url: Schema.String, filename: Schema.String }),
  responseMode: "json",
  successStatus: 200,
  errors: [],
});
