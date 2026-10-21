import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
import { DecimalSnowflake } from "./discord.js"

export const AnalyticsMetrics = Schema.Struct({ gold: Schema.Number, elixir: Schema.Number, darkElixir: Schema.Number,
  attacks: Schema.Number, donated: Schema.Number, received: Schema.Number, active: Schema.Number, upgrades: Schema.Number,
  joins: Schema.Number, leaves: Schema.Number, capital: Schema.Number, clanGames: Schema.Number })
export const AnalyticsPlayer = Schema.Struct({ name: Schema.String, tag: Schema.String, clanTag: Schema.String,
  townHall: Schema.Number, leagueId: Schema.NullOr(Schema.Number), trophies: Schema.Number, currentMember: Schema.Boolean, metrics: AnalyticsMetrics })
export const ServerAnalyticsResponse = Schema.Struct({
  serverId: DecimalSnowflake, generatedAt: Schema.String, start: Schema.String, end: Schema.String,
  attribution: Schema.Literal("current_roster"), totals: AnalyticsMetrics,
  clans: Schema.Array(Schema.Struct({ name: Schema.String, tag: Schema.String, badge: Schema.String, members: Schema.Number,
    warWins: Schema.Number, warWinStreak: Schema.Number, points: Schema.Number, cwlLeagueId: Schema.Number, metrics: AnalyticsMetrics })),
  days: Schema.Array(Schema.Struct({ day: Schema.String, metrics: AnalyticsMetrics })),
  progress: Schema.Array(Schema.Struct({ type: Schema.Number, levels: Schema.Number, events: Schema.Number })),
  movement: Schema.Struct({ arrivals: Schema.Number, departures: Schema.Number, transfers: Schema.Number, arrivalsStillPresent: Schema.Number }),
  retention: Schema.Struct({ eligible: Schema.Number, retained: Schema.Number, immature: Schema.Number }),
  leagues: Schema.Array(Schema.Struct({id: Schema.Number, name: Schema.String, count: Schema.Number})),
  legends: Schema.Array(Schema.Struct({name: Schema.String, tag: Schema.String, season: Schema.String, rank: Schema.Number, trophies: Schema.Number})),
  cwl: Schema.Array(Schema.Struct({ clanTag: Schema.String, season: Schema.String, leagueId: Schema.Number, stars: Schema.Number,
    wins: Schema.Number, rank: Schema.NullOr(Schema.Number) })),
  rankings: Schema.Array(Schema.Struct({ clanTag: Schema.String, type: Schema.String, rank: Schema.Number, points: Schema.Number })),
  players: Schema.Array(AnalyticsPlayer),
  movements: Schema.Array(Schema.Struct({ time: Schema.String, type: Schema.String, clanTag: Schema.String, name: Schema.String, tag: Schema.String, townHall: Schema.Number })),
})
export const ServerAnalyticsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET", operationId: "serverAnalytics",
  path: "/v2/server/:serverId/analytics", pathParams: Schema.Struct({ serverId: DecimalSnowflake }),
  query: Schema.Struct({ start: Schema.String, end: Schema.String, clans: Schema.optionalKey(Schema.String) }),
  response: ServerAnalyticsResponse, responseMode: "json", successStatus: 200,
  summary: "Read family analytics from existing tracked facts and current rosters",
})
