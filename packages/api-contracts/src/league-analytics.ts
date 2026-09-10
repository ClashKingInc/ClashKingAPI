import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const LeagueBattleMode = Schema.Literals(["ranked", "legend"])
export const LeagueAnalyticsSortDirection = Schema.Literals(["asc", "desc"])
export const ArmyFamilyId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)).annotate({
  description: "Permanent family ID as a decimal string; never convert to a JavaScript number.",
})
export const LeagueReference = Schema.Struct({ id: Schema.Int, name: Schema.String })
export const StarCounts = Schema.Struct({ zero: Schema.Int, one: Schema.Int, two: Schema.Int, three: Schema.Int })
export const LootedResources = Schema.Struct({ gold: Schema.Int, elixir: Schema.Int, darkElixir: Schema.Int })
export const TimeRangeQuery = Schema.Struct({
  "time[after]": Schema.optionalKey(Schema.String),
  "time[before]": Schema.optionalKey(Schema.String),
})

const LeagueBattleFields = {
  time: Schema.String,
  townHallLevel: Schema.Int,
  opponent: Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Int }),
  stars: Schema.Int,
  destructionPercentage: Schema.Number,
  duration: Schema.NullOr(Schema.Int),
  shareCode: Schema.NullOr(Schema.String),
  trophies: Schema.Int,
} as const
export const LeagueBattle = Schema.Struct(LeagueBattleFields).annotate({ parseOptions: { onExcessProperty: "error" } })
export const LeagueDefense = LeagueBattle
export const AutomaticLeagueDefense = Schema.Struct({ trophies: Schema.Int, automatic: Schema.Literal(true) })
const BattlelogTotals = {
  attackTrophies: Schema.Int,
  defenseTrophies: Schema.Int,
  trophies: Schema.Int,
  attacks: Schema.Array(LeagueBattle),
  defenses: Schema.Array(Schema.Union([LeagueDefense, AutomaticLeagueDefense])),
} as const
export const RankedBattlelogResponse = Schema.Struct({
  tag: Schema.String,
  seasonId: Schema.String,
  leagueGroupId: Schema.String,
  league: LeagueReference,
  maxBattles: Schema.Int,
  registeredAttacks: Schema.Int,
  registeredDefenses: Schema.Int,
  ...BattlelogTotals,
})
export const LegendBattlelogResponse = Schema.Struct({ tag: Schema.String, day: Schema.String, ...BattlelogTotals })

export const PlayerBattlelogHistoryItem = Schema.Struct({
  battleMode: Schema.Literals(["farming", "ranked", "legend"]),
  battleTime: Schema.String,
  stars: Schema.Int,
  destructionPercentage: Schema.Number,
  duration: Schema.NullOr(Schema.Int),
  lootedResources: LootedResources,
  shareCode: Schema.NullOr(Schema.String),
})
export const PlayerBattlelogHistoryResponse = Schema.Struct({ items: Schema.Array(PlayerBattlelogHistoryItem) })

export const RankedGroupMember = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  townHallLevel: Schema.NullOr(Schema.Int),
  attackLosses: Schema.Int,
  attackStars: Schema.Int,
  attackWins: Schema.Int,
  defenseLosses: Schema.Int,
  defenseStars: Schema.Int,
  defenseWins: Schema.Int,
  leagueTrophies: Schema.Int,
  placement: Schema.Int,
})
export const RankedGroupResponse = Schema.Struct({
  leagueGroupId: Schema.String,
  seasonId: Schema.String,
  league: LeagueReference,
  maxBattles: Schema.Int,
  members: Schema.Array(RankedGroupMember),
})

export const RankedLeagueHistoryItem = Schema.Struct({
  mode: Schema.Literal("ranked"),
  seasonId: Schema.String,
  leagueGroupId: Schema.String,
  league: LeagueReference,
  maxBattles: Schema.Int,
  ...RankedGroupMember.fields,
})
export const LegendLeagueHistoryItem = Schema.Struct({
  mode: Schema.Literal("legend"),
  season: Schema.String,
  league: Schema.NullOr(LeagueReference),
  trophies: Schema.Int,
  attackWins: Schema.Int,
  defenseWins: Schema.Int,
  rank: Schema.Int,
})
export const PlayerLeagueHistoryResponse = Schema.Struct({
  items: Schema.Array(Schema.Union([RankedLeagueHistoryItem, LegendLeagueHistoryItem])),
})

export const ArmySearchQuery = Schema.Struct({
  ...TimeRangeQuery.fields,
  heroIds: Schema.optionalKey(Schema.String),
  equipmentIds: Schema.optionalKey(Schema.String),
  minimumAttacks: Schema.optionalKey(Schema.Number),
  minimumPlayers: Schema.optionalKey(Schema.Number),
  minimumTripleRate: Schema.optionalKey(Schema.Number),
  sort: Schema.optionalKey(Schema.Literals(["usage", "tripleRate", "zeroStarRate", "averageDuration", "averageDestruction"])),
  direction: Schema.optionalKey(LeagueAnalyticsSortDirection),
  limit: Schema.optionalKey(Schema.Number),
})
export const ArmyResultStatistics = Schema.Struct({
  attacks: Schema.Int,
  players: Schema.NullOr(Schema.Int).annotate({ description: "Exact collected players. Null when retained raw rows cannot reproduce every selected daily closeout population; never a sum of player-days." }),
  starCounts: StarCounts,
  averageDuration: Schema.NullOr(Schema.Number),
  averageDestruction: Schema.NullOr(Schema.Number),
})
export const ArmyStatistics = Schema.Struct({
  familyId: ArmyFamilyId,
  name: Schema.NullOr(Schema.String),
  shareCode: Schema.String,
  ...ArmyResultStatistics.fields,
  totalLegendAttacks: Schema.Int.annotate({ description: "All selected Legend attacks including missing army codes; usage is attacks divided by this total." }),
})
export const ArmySearchResponse = Schema.Struct({ items: Schema.Array(ArmyStatistics) })
export const ArmyDetailResponse = ArmyStatistics
export const ArmyTimelineItem = Schema.Struct({
  day: Schema.String,
  totalLegendAttacks: Schema.Int,
  attacks: Schema.Int,
  players: Schema.Int,
  starCounts: StarCounts,
  averageDuration: Schema.NullOr(Schema.Number),
  averageDestruction: Schema.NullOr(Schema.Number),
})
export const ArmyTimelineResponse = Schema.Struct({
  familyId: ArmyFamilyId,
  name: Schema.NullOr(Schema.String),
  shareCode: Schema.String,
  items: Schema.Array(ArmyTimelineItem),
})

export const LeagueHitRateQuery = Schema.Struct({
  ...TimeRangeQuery.fields,
  mode: Schema.optionalKey(LeagueBattleMode),
  leagueTierId: Schema.optionalKey(Schema.Number),
  townHallLevel: Schema.optionalKey(Schema.Number),
})
const LeagueHitRateBase = {
  league: LeagueReference,
  townHallLevel: Schema.Int,
  attacks: Schema.Int,
  starCounts: StarCounts,
} as const
export const RankedHitRatePoint = Schema.Struct({ mode: Schema.Literal("ranked"), seasonId: Schema.String, ...LeagueHitRateBase })
export const LegendHitRatePoint = Schema.Struct({ mode: Schema.Literal("legend"), day: Schema.String, attacks: Schema.Int, starCounts: StarCounts })
export const LeagueHitRateHistoryResponse = Schema.Struct({
  items: Schema.Array(Schema.Union([RankedHitRatePoint, LegendHitRatePoint])),
})

export const TrophyPercentiles = Schema.Struct({
  p10: Schema.NullOr(Schema.Int), p25: Schema.NullOr(Schema.Int), p50: Schema.NullOr(Schema.Int),
  p75: Schema.NullOr(Schema.Int), p90: Schema.NullOr(Schema.Int),
})
export const LeagueTierStatisticsResponse = Schema.Struct({
  seasonId: Schema.String,
  league: LeagueReference,
  groupCount: Schema.Int,
  playerCount: Schema.Int,
  participatingPlayers: Schema.Int,
  trophyPercentiles: TrophyPercentiles,
  townHallDistribution: Schema.Array(Schema.Struct({ level: Schema.Int, count: Schema.Int })),
  groupCompetitiveness: Schema.Struct({
    averageTrophyRange: Schema.NullOr(Schema.Number), averageFirstPlaceGap: Schema.NullOr(Schema.Number),
  }),
})

export const ItemUse = Schema.Struct({ id: Schema.Int, uses: Schema.Int, triples: Schema.Int })
export const PetAssignmentUse = Schema.Struct({ petId: Schema.Int, heroId: Schema.Int, uses: Schema.Int, triples: Schema.Int })
export const LegendDay = Schema.Struct({
  day: Schema.String,
  attacks: Schema.Int,
  players: Schema.Int,
  perfectDays: Schema.Int,
  starCounts: StarCounts,
  averageDuration: Schema.NullOr(Schema.Number),
  averageDestruction: Schema.NullOr(Schema.Number),
  heroes: Schema.Array(ItemUse),
  pets: Schema.Array(ItemUse),
  equipment: Schema.Array(ItemUse),
  petAssignments: Schema.Array(PetAssignmentUse),
})
export const LegendDaysQuery = TimeRangeQuery
export const LegendDaysResponse = Schema.Struct({ items: Schema.Array(LegendDay) })

const PublicErrors = [{ status: 400, body: ErrorResponse }, { status: 404, body: ErrorResponse }] as const
const publicGet = <P extends Schema.Codec<unknown, unknown, never, never>, Q extends Schema.Codec<unknown, unknown, never, never>, R extends Schema.Codec<unknown, unknown, never, never>>(
  operationId: string, path: `/v2/${string}`, pathParams: P, query: Q, response: R, summary: string,
) => defineEndpoint({ operationId, method: "GET", path, auth: "public", summary, body: NoBody, bodyMode: "none", pathParams, query,
  response, responseMode: "json", successStatus: 200, errors: PublicErrors })

const PlayerSeasonPath = Schema.Struct({ playerTag: Schema.String, seasonId: Schema.String })
export const ArmyLinkQuery = Schema.Struct({ ...TimeRangeQuery.fields, armyLink: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192)).annotate({ description: "Clash CopyArmy link or raw army share code. URL-encode links when supplying this query parameter." }) })
export const PlayerBattlelogHistoryEndpoint = publicGet("getPlayerBattlelogHistory", "/v2/player/:playerTag/battlelog/history",
  Schema.Struct({ playerTag: Schema.String }), TimeRangeQuery, PlayerBattlelogHistoryResponse, "Get stored player battle history")
export const RankedBattlelogEndpoint = publicGet("getRankedBattlelog", "/v2/player/:playerTag/ranked/:seasonId/battlelog",
  PlayerSeasonPath, NoQuery, RankedBattlelogResponse, "Get one player's Ranked tournament battles")
export const LegendBattlelogEndpoint = publicGet("getLegendBattlelog", "/v2/player/:playerTag/legend/:day/battlelog",
  Schema.Struct({ playerTag: Schema.String, day: Schema.String }), NoQuery, LegendBattlelogResponse, "Get one player's Legend-day battles")
export const RankedGroupEndpoint = publicGet("getRankedLeagueGroup", "/v2/ranked/:seasonId/groups/:leagueGroupId",
  Schema.Struct({ seasonId: Schema.String, leagueGroupId: Schema.String }), NoQuery, RankedGroupResponse, "Get one Ranked league group")
export const PlayerLeagueHistoryEndpoint = publicGet("getPlayerLeagueHistory", "/v2/player/:playerTag/league/history",
  Schema.Struct({ playerTag: Schema.String }), TimeRangeQuery, PlayerLeagueHistoryResponse, "Get a player's Ranked and completed Legend history")
export const ArmySearchEndpoint = publicGet("searchLeagueArmies", "/v2/stats/armies",
  NoPathParams, ArmySearchQuery, ArmySearchResponse, "Discover similar Legend army families")
export const ArmyDetailEndpoint = publicGet("getArmyFamily", "/v2/stats/armies/detail",
  NoPathParams, ArmyLinkQuery, ArmyDetailResponse, "Get a Legend army family")
export const ArmyTimelineEndpoint = publicGet("getArmyFamilyTimeline", "/v2/stats/armies/timeline",
  NoPathParams, ArmyLinkQuery, ArmyTimelineResponse, "Get a Legend army family's daily timeline")
export const LeagueHitRateHistoryEndpoint = publicGet("getLeagueHitRateHistory", "/v2/stats/league/hit-rates",
  NoPathParams, LeagueHitRateQuery, LeagueHitRateHistoryResponse, "Get Ranked-season and Legend-day hit rates")
export const LeagueTierStatisticsEndpoint = publicGet("getLeagueTierStatistics", "/v2/stats/league/tournaments/:seasonId/tiers/:leagueTierId",
  Schema.Struct({ seasonId: Schema.String, leagueTierId: Schema.Number }), NoQuery, LeagueTierStatisticsResponse, "Get one Ranked season and tier")
export const LegendDaysEndpoint = publicGet("getLegendDays", "/v2/stats/legend/days",
  NoPathParams, LegendDaysQuery, LegendDaysResponse, "Get detailed Legend-day statistics")

export const leagueAnalyticsEndpoints = {
  playerBattlelogHistory: PlayerBattlelogHistoryEndpoint,
  rankedBattlelog: RankedBattlelogEndpoint,
  legendBattlelog: LegendBattlelogEndpoint,
  rankedGroup: RankedGroupEndpoint,
  playerLeagueHistory: PlayerLeagueHistoryEndpoint,
  armySearch: ArmySearchEndpoint,
  armyDetail: ArmyDetailEndpoint,
  armyTimeline: ArmyTimelineEndpoint,
  leagueHitRateHistory: LeagueHitRateHistoryEndpoint,
  leagueTierStatistics: LeagueTierStatisticsEndpoint,
  legendDays: LegendDaysEndpoint,
} as const
