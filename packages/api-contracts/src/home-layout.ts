import { Schema } from "effect"
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"

export const HomeItemKind = Schema.Literals(["todo", "ranked", "upgrade", "activity"])
export const HomeLayoutItem = Schema.Struct({
  id: Schema.String,
  kind: HomeItemKind,
  entityTag: Schema.NullOr(Schema.String),
  size: Schema.Literals(["small", "wide"]),
})
export const HomeLayout = Schema.Struct({ revision: Schema.Int, items: Schema.Array(HomeLayoutItem) })
export const PlayerActivityDay = Schema.Struct({
  from: Schema.String,
  until: Schema.String,
  gold: Schema.String,
  elixir: Schema.String,
  darkElixir: Schema.String,
  donated: Schema.String,
  received: Schema.String,
  farmingAttacks: Schema.Number,
  rankedAttacks: Schema.Number,
  legendAttacks: Schema.Number,
  upgradeLevels: Schema.Number,
})
export const PlayerActivitySummary = Schema.Struct({
  from: Schema.String, until: Schema.String,
  gold: Schema.String, elixir: Schema.String, darkElixir: Schema.String,
  donated: Schema.String, received: Schema.String,
  farmingAttacks: Schema.Number, rankedAttacks: Schema.Number, legendAttacks: Schema.Number,
  upgradeLevels: Schema.Number,
  days: Schema.optionalKey(Schema.Array(PlayerActivityDay)),
})
export const PlayerActivityEndpoint = defineEndpoint({operationId:"getPlayerActivity",method:"GET",path:"/v2/player/:playerTag/activity-summary",auth:"public",summary:"Recorded player activity during the rolling past 30 days",body:NoBody,bodyMode:"none",pathParams:Schema.Struct({playerTag:Schema.String}),query:NoQuery,response:PlayerActivitySummary,responseMode:"json",successStatus:200,errors:[]})
export const HomeLayoutGetEndpoint = defineEndpoint({operationId:"getHomeLayout",method:"GET",path:"/v2/users/me/home-layout",auth:"user",summary:"Read the user's Home layout",body:NoBody,bodyMode:"none",pathParams:NoPathParams,query:NoQuery,response:HomeLayout,responseMode:"json",successStatus:200,errors:[]})
export const HomeLayoutPutEndpoint = defineEndpoint({operationId:"putHomeLayout",method:"PUT",path:"/v2/users/me/home-layout",auth:"user",summary:"Save the user's Home layout with revision checking",body:HomeLayout,bodyMode:"json",pathParams:NoPathParams,query:NoQuery,response:HomeLayout,responseMode:"json",successStatus:200,errors:[]})
export const PlayerFarmingSummary = Schema.Struct({
  from: Schema.String, until: Schema.String, asOf: Schema.String,
  gold: Schema.String, elixir: Schema.String, darkElixir: Schema.String, totalLoot: Schema.String,
  attacks: Schema.Number, timedAttacks: Schema.Number, attackSeconds: Schema.Number,
  sessionSeconds: Schema.NullOr(Schema.Number),
})
export const PlayerFarmingEndpoint = defineEndpoint({operationId:"getPlayerFarming",method:"GET",path:"/v2/player/:playerTag/farming",auth:"public",summary:"Recorded farming totals for a player",body:NoBody,bodyMode:"none",pathParams:Schema.Struct({playerTag:Schema.String}),query:Schema.Struct({from:Schema.optionalKey(Schema.String),until:Schema.optionalKey(Schema.String)}),response:PlayerFarmingSummary,responseMode:"json",successStatus:200,errors:[]})
export const ClanDonationSummaryEndpoint = defineEndpoint({operationId:"getClanDonationSummary",method:"GET",path:"/v2/clan/:clanTag/donations/summary",auth:"public",summary:"Recorded clan donations in the current calendar month",body:NoBody,bodyMode:"none",pathParams:Schema.Struct({clanTag:Schema.String}),query:NoQuery,response:Schema.Struct({from:Schema.String,asOf:Schema.String,donated:Schema.String,received:Schema.String,observations:Schema.Number}),responseMode:"json",successStatus:200,errors:[]})
