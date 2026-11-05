import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"
const Value=Schema.NullOr(Schema.Number)
export const BotSeasonSummaryEndpoint=defineEndpoint({
 auth:"bot",method:"POST",path:"/v2/bot/players/season-summary",operationId:"botPlayerSeasonSummary",
 pathParams:Schema.Struct({}),query:Schema.Struct({}),body:Schema.Struct({tags:Schema.Array(Schema.String),season:Schema.optionalKey(Schema.String)}),bodyMode:"json",
 response:Schema.Struct({season:Schema.String,start:Schema.String,end:Schema.String,warCoverageComplete:Schema.Boolean,items:Schema.Array(Schema.Struct({tag:Schema.String,attacks:Value,wins:Value,gold:Value,elixir:Value,darkElixir:Value,donated:Value,received:Value,capitalDonated:Value,clanGames:Value,warStars:Value,trophies:Value,snapshotDate:Schema.NullOr(Schema.String)}))}),responseMode:"json",successStatus:200,
 summary:"Read recorded season totals for 1–100 players. Missing observations are null; incomplete war archives invalidate only war stars.",
})
