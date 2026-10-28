import { Schema } from "effect"

import { strictObject } from "./strict-object.js"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const LeagueBattleMode = Schema.Literals(["ranked", "legend"])
export const LegendCohort = Schema.Literals(["legend_i", "top_1000", "top_200"])
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
  duration: Schema.Int,
  shareCode: Schema.NullOr(Schema.String),
  familyId: Schema.NullOr(ArmyFamilyId),
  trophies: Schema.Int,
} as const
export const LeagueBattle = strictObject(Schema.Struct(LeagueBattleFields))
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
const LegendArmyGroup = Schema.Struct({ name: Schema.String, attacks: Schema.Int, triples: Schema.Int })
export const LegendBattlelogResponse = Schema.Struct({ tag: Schema.String, day: Schema.String, ...BattlelogTotals,
  topArmy: Schema.optionalKey(LegendArmyGroup),
})
export const LegendPlayerDay = Schema.Struct({
  day: Schema.String,
  attacks: Schema.optionalKey(Schema.Int),
  defenses: Schema.optionalKey(Schema.Int),
  recordedDefenses: Schema.optionalKey(Schema.Int),
  automaticDefenses: Schema.optionalKey(Schema.Int),
  closingTrophies: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  globalRank: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  attackTrophies: Schema.Int,
  defenseTrophies: Schema.Int,
  trophies: Schema.Int,
})
export const LegendPlayerDailySeriesResponse = Schema.Struct({ tag: Schema.String, items: Schema.Array(LegendPlayerDay) })
export const LegendPlayerSeasonResponse = Schema.Struct({
  seasonStart: Schema.String,
  seasonEnd: Schema.String,
  armyShareCodes: Schema.Array(Schema.String),
  rankPopulation: Schema.optionalKey(Schema.Int),
  favorites: Schema.optionalKey(Schema.Array(Schema.Struct({
    category: Schema.Literals(["troop", "spell", "hero", "equipment", "pet", "siege"]),
    id: Schema.Int, name: Schema.String, attacks: Schema.Int,
  }))),
  favoriteTroops: Schema.optionalKey(Schema.Array(Schema.Struct({
    id: Schema.Int, name: Schema.String, attacks: Schema.Int, triples: Schema.Int,
  }))),
  armyGroups: Schema.optionalKey(Schema.Array(LegendArmyGroup)),
  stats: Schema.Struct({
    attacks: Schema.Int, defenses: Schema.Int, attackTriples: Schema.Int, defenseTriples: Schema.Int,
    averageOffense: Schema.NullOr(Schema.Number), averageDefense: Schema.NullOr(Schema.Number),
    offenseStars: Schema.optionalKey(Schema.Struct({ zero: Schema.Int, one: Schema.Int, two: Schema.Int, three: Schema.Int })),
    defenseStars: Schema.optionalKey(Schema.Struct({ zero: Schema.Int, one: Schema.Int, two: Schema.Int, three: Schema.Int })),
  }),
})
export const LegendPerformanceComparison = Schema.Struct({
  cohort: Schema.Literals(["legend_i", "top_1000", "top_200"]), days: Schema.Int,
  attacks: Schema.Int, triples: Schema.Int, playerAttacks: Schema.Int, playerTriples: Schema.Int,
})
export const LegendPlayerComparisonsResponse = Schema.Struct({
  items: Schema.Array(LegendPerformanceComparison),
})

export const PlayerBattlelogHistoryItem = Schema.Struct({
  battleMode: Schema.Literals(["farming", "ranked", "legend"]),
  battleTime: Schema.String,
  stars: Schema.Int,
  destructionPercentage: Schema.Number,
  duration: Schema.Int,
  lootedResources: LootedResources,
  shareCode: Schema.NullOr(Schema.String),
  familyId: Schema.NullOr(ArmyFamilyId),
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
  population: Schema.optionalKey(Schema.Int),
})
export const PlayerLeagueHistoryResponse = Schema.Struct({
  items: Schema.Array(Schema.Union([RankedLeagueHistoryItem, LegendLeagueHistoryItem])),
})

export const ArmySearchQuery = Schema.Struct({
  ...TimeRangeQuery.fields,
  cohort: Schema.optionalKey(LegendCohort),
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
export const ArmySearchResponse = Schema.Struct({ cohort: LegendCohort, items: Schema.Array(ArmyStatistics) })
export const ArmyDetailResponse = Schema.Struct({ cohort: LegendCohort, ...ArmyStatistics.fields })
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
  cohort: LegendCohort,
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
export const EquipmentPairUse = Schema.Struct({
  heroId: Schema.Int,
  equipmentIds: Schema.Tuple([Schema.Int, Schema.Int]),
  uses: Schema.Int,
  triples: Schema.Int,
})
export const PetComboUse = Schema.Struct({
  petIds: Schema.Array(Schema.Int),
  uses: Schema.Int,
  triples: Schema.Int,
})
export const LegendDay = Schema.Struct({
  day: Schema.String,
  attacks: Schema.Int,
  players: Schema.Int,
  starCounts: StarCounts,
  averageDuration: Schema.NullOr(Schema.Number),
  averageDestruction: Schema.NullOr(Schema.Number),
  heroes: Schema.Array(ItemUse),
  pets: Schema.Array(ItemUse),
  equipment: Schema.Array(ItemUse),
  petAssignments: Schema.Array(PetAssignmentUse),
  troops: Schema.optionalKey(Schema.Array(ItemUse)),
  spells: Schema.optionalKey(Schema.Array(ItemUse)),
  sieges: Schema.optionalKey(Schema.Array(ItemUse)),
  equipmentPairs: Schema.optionalKey(Schema.Array(EquipmentPairUse)),
  petCombos: Schema.optionalKey(Schema.Array(PetComboUse)),
  attackTypes: Schema.optionalKey(Schema.Struct({
    air: Schema.Int,
    ground: Schema.Int,
    mixed: Schema.Int,
    unknown: Schema.Int,
  })),
})
export const LegendDaysQuery = Schema.Struct({ ...TimeRangeQuery.fields, cohort: Schema.optionalKey(LegendCohort) })
export const LegendDaysResponse = Schema.Struct({ cohort: LegendCohort, items: Schema.Array(LegendDay) })

// Ratios use 0..1. A missing period is not a zero-performance period.
export const LegendDayPerformanceSide = Schema.Struct({
  eligiblePlayerDays: Schema.Int,
  observedPlayerDays: Schema.Int,
  completePlayerDays: Schema.Int,
  partialPlayerDays: Schema.Int,
  missingPlayerDays: Schema.Int,
  invalidPlayerDays: Schema.Int,
  observedBattles: Schema.Int,
  observedTriples: Schema.Int,
  perfectPlayerDays: Schema.Int,
  tripleRate: Schema.NullOr(Schema.Number),
  perfectDayRate: Schema.NullOr(Schema.Number),
  meanTrophies: Schema.NullOr(Schema.Number),
  buckets: Schema.Array(Schema.Struct({
    minimum: Schema.Int, maximum: Schema.Int, playerDays: Schema.Int, share: Schema.NullOr(Schema.Number),
  })),
})
export const LegendDayPerformanceResponse = Schema.Struct({
  cohort: LegendCohort,
  periods: Schema.Array(Schema.Struct({
    kind: Schema.Literals(["selected", "previous_30", "previous_90"]),
    firstDay: Schema.String, lastDay: Schema.String,
    expectedDays: Schema.Int, availableDays: Schema.Int,
    offense: LegendDayPerformanceSide,
    defense: LegendDayPerformanceSide,
    // Null signals that retained player observations do not reconcile with
    // the rollup. Never present player-days as distinct people.
    perfectOffensePlayers: Schema.NullOr(Schema.Int),
    perfectedDefensePlayers: Schema.NullOr(Schema.Int),
  })),
  perfectDayContributions: Schema.Array(Schema.Struct({
    rankBand: Schema.Literals(["1_200", "201_1000", "1001_plus"]),
    offensePlayerDays: Schema.Int, defensePlayerDays: Schema.Int,
  })).annotate({ description: "Selected-period perfect days across all saved Legend ranks, independent of the selected overlapping cohort." }),
  items: Schema.Array(Schema.Struct({
    day: Schema.String, sourceWindowStart: Schema.String, sourceWindowEnd: Schema.String,
    offense: LegendDayPerformanceSide, defense: LegendDayPerformanceSide,
  })),
})

const PublicErrors = [{ status: 400, body: ErrorResponse }, { status: 404, body: ErrorResponse }] as const
const publicGet = <P extends Schema.Codec<unknown, unknown, never, never>, Q extends Schema.Codec<unknown, unknown, never, never>, R extends Schema.Codec<unknown, unknown, never, never>>(
  operationId: string, path: `/v2/${string}`, pathParams: P, query: Q, response: R, summary: string,
) => defineEndpoint({ operationId, method: "GET", path, auth: "public", summary, body: NoBody, bodyMode: "none", pathParams, query,
  response, responseMode: "json", successStatus: 200, errors: PublicErrors })

const PlayerSeasonPath = Schema.Struct({ playerTag: Schema.String, seasonId: Schema.String })
export const ArmyLinkQuery = Schema.Struct({ ...TimeRangeQuery.fields, cohort: Schema.optionalKey(LegendCohort), armyLink: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192)).annotate({ description: "Clash CopyArmy link or raw army share code. URL-encode links when supplying this query parameter." }) })
export const PlayerBattlelogHistoryEndpoint = publicGet("getPlayerBattlelogHistory", "/v2/player/:playerTag/battlelog/history",
  Schema.Struct({ playerTag: Schema.String }), TimeRangeQuery, PlayerBattlelogHistoryResponse, "Get stored player battle history")
export const RankedBattlelogEndpoint = publicGet("getRankedBattlelog", "/v2/player/:playerTag/ranked/:seasonId/battlelog",
  PlayerSeasonPath, NoQuery, RankedBattlelogResponse, "Get one player's Ranked tournament battles")
export const LegendBattlelogEndpoint = publicGet("getLegendBattlelog", "/v2/player/:playerTag/legend/:day/battlelog",
  Schema.Struct({ playerTag: Schema.String, day: Schema.String }), NoQuery, LegendBattlelogResponse, "Get one player's Legend-day battles")
export const LegendPlayerDailySeriesEndpoint = publicGet("getLegendPlayerDailySeries", "/v2/player/:playerTag/legend/series",
  Schema.Struct({ playerTag: Schema.String }), TimeRangeQuery, LegendPlayerDailySeriesResponse, "Get one player's daily Legend trophy series")
export const LegendPlayerSeasonEndpoint = publicGet("getLegendPlayerSeason", "/v2/player/:playerTag/legend/season",
  Schema.Struct({ playerTag: Schema.String }), NoQuery, LegendPlayerSeasonResponse, "Get current Legend season totals and recorded attack armies")
export const LegendPlayerComparisonsEndpoint = publicGet("getLegendPlayerComparisons", "/v2/player/:playerTag/legend/comparisons",
  Schema.Struct({ playerTag: Schema.String }), NoQuery, LegendPlayerComparisonsResponse, "Compare real attack results on matching finalized Legend days")
export const RankedGroupEndpoint = publicGet("getRankedLeagueGroup", "/v2/ranked/:seasonId/groups/:leagueGroupId",
  Schema.Struct({ seasonId: Schema.String, leagueGroupId: Schema.String }), NoQuery, RankedGroupResponse, "Get one Ranked league group")
export const PlayerLeagueHistoryEndpoint = publicGet("getPlayerLeagueHistory", "/v2/player/:playerTag/league/history",
  Schema.Struct({ playerTag: Schema.String }), TimeRangeQuery, PlayerLeagueHistoryResponse, "Get a player's Ranked and completed Legend history")
export const LeagueHitRateHistoryEndpoint = publicGet("getLeagueHitRateHistory", "/v2/stats/league/hit-rates",
  NoPathParams, LeagueHitRateQuery, LeagueHitRateHistoryResponse, "Get Ranked-season and Legend-day hit rates")
export const LeagueTierStatisticsEndpoint = publicGet("getLeagueTierStatistics", "/v2/stats/league/tournaments/:seasonId/tiers/:leagueTierId",
  Schema.Struct({ seasonId: Schema.String, leagueTierId: Schema.Number }), NoQuery, LeagueTierStatisticsResponse, "Get one Ranked season and tier")
export const LegendDaysEndpoint = publicGet("getLegendDays", "/v2/stats/legend/days",
  NoPathParams, LegendDaysQuery, LegendDaysResponse, "Get detailed Legend-day statistics")

export const LegendDayPerformanceEndpoint = publicGet("getLegendDayPerformance", "/v2/stats/legend/performance",
  NoPathParams, LegendDaysQuery, LegendDayPerformanceResponse, "Get recorded Legend-day trophy distributions and perfect-day rates")

export const leagueAnalyticsEndpoints = {
  legendDayPerformance: LegendDayPerformanceEndpoint,
  playerBattlelogHistory: PlayerBattlelogHistoryEndpoint,
  rankedBattlelog: RankedBattlelogEndpoint,
  legendBattlelog: LegendBattlelogEndpoint,
  legendPlayerDailySeries: LegendPlayerDailySeriesEndpoint,
  legendPlayerSeason: LegendPlayerSeasonEndpoint,
  legendPlayerComparisons: LegendPlayerComparisonsEndpoint,
  rankedGroup: RankedGroupEndpoint,
  playerLeagueHistory: PlayerLeagueHistoryEndpoint,
  leagueHitRateHistory: LeagueHitRateHistoryEndpoint,
  leagueTierStatistics: LeagueTierStatisticsEndpoint,
  legendDays: LegendDaysEndpoint,
} as const
