import { Schema } from "effect";
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js";
export const BotTaskProgressEndpoint = defineEndpoint({
  operationId: "botTaskProgress",
  method: "POST",
  path: "/v2/bot/players/task-progress",
  auth: "bot",
  summary: "Read observed monthly game-task progress for linked player reports",
  pathParams: NoPathParams,
  query: NoQuery,
  body: Schema.Struct({ tags: Schema.Array(Schema.String) }),
  bodyMode: "json",
  response: Schema.Struct({
    month: Schema.String,
    clanGamesActive: Schema.Boolean,
    clanGamesStart: Schema.String,
    clanGamesEnd: Schema.String,
    items: Schema.Array(
      Schema.Struct({
        tag: Schema.String,
        clanGamesPoints: Schema.NullOr(Schema.Number),
        seasonPoints: Schema.NullOr(Schema.Number),
        lastCapitalDonation: Schema.NullOr(Schema.String),
      }),
    ),
  }),
  responseMode: "json",
  successStatus: 200,
  errors: [],
});
