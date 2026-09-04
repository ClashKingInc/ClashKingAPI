import { Schema } from "effect";
import { defineEndpoint, NoBody, } from "./endpoint.js";
const OptionalNumber = Schema.optionalKey(Schema.Number);
const OptionalString = Schema.optionalKey(Schema.String);
const NullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number));
const NullableString = Schema.optionalKey(Schema.NullOr(Schema.String));
const TimeWindowQuery = {
    "time[after]": OptionalString,
    "time[before]": OptionalString,
};
const WarHistoryQuery = Schema.Struct({
    ...TimeWindowQuery,
    type: Schema.optionalKey(Schema.Literals(["cwl", "random", "friendly"])),
    limit: OptionalNumber,
});
const ClashTagPath = Schema.Struct({ tag: Schema.String });
export const PublicBadgeUrls = Schema.Struct({
    small: OptionalString,
    medium: OptionalString,
    large: OptionalString,
});
export const PublicIconUrls = Schema.Struct({
    tiny: OptionalString,
    small: OptionalString,
    medium: OptionalString,
    large: OptionalString,
});
const LeagueReference = Schema.Struct({ id: Schema.Number, name: Schema.String });
const ClanBadgeUrls = Schema.Struct({
    small: Schema.String,
    medium: Schema.String,
    large: Schema.String,
});
const SearchLocation = Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    isCountry: Schema.Boolean,
    countryCode: OptionalString,
    localizedName: OptionalString,
});
const ClanCachedMember = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townHallLevel: Schema.Number,
});
export const ClanCachedResponse = Schema.NullOr(Schema.Struct({
    name: Schema.String,
    tag: Schema.String,
    badgeUrls: ClanBadgeUrls,
    description: Schema.String,
    clanLevel: Schema.Number,
    clanPoints: Schema.Number,
    capitalGoldTotal: Schema.Number,
    location: Schema.optionalKey(SearchLocation),
    warLeague: LeagueReference,
    capitalLeague: Schema.optionalKey(LeagueReference),
    publicWarLog: Schema.Boolean,
    warWins: Schema.Number,
    warWinStreak: Schema.Number,
    memberCount: Schema.Number,
    troopsDonated: Schema.Number,
    troopsReceived: Schema.Number,
    lastActive: OptionalString,
    members: Schema.Array(ClanCachedMember),
}));
const PlayerChangeItem = Schema.Struct({ name: Schema.String, id: Schema.Number });
const PlayerChangeRecord = Schema.Struct({
    time: Schema.String,
    townhall_level: Schema.NullOr(Schema.Number),
    type: Schema.String,
    item: Schema.optionalKey(PlayerChangeItem),
    previous: Schema.optionalKey(Schema.Json),
    current: Schema.optionalKey(Schema.Json),
});
const PlayerChangesResponse = Schema.Struct({ items: Schema.Array(PlayerChangeRecord) });
const ClanChangeRecord = Schema.Struct({
    time: Schema.String,
    type: Schema.String,
    previous: Schema.Json,
    current: Schema.Json,
});
const ClanChangesResponse = Schema.Struct({ items: Schema.Array(ClanChangeRecord) });
const RankingCategory = Schema.Struct({
    trophies: NullableNumber,
    globalRank: NullableNumber,
    localRank: NullableNumber,
});
const PlayerRankingsResponse = Schema.Struct({
    tag: Schema.String,
    homeVillage: Schema.optionalKey(RankingCategory),
    builderBase: Schema.optionalKey(RankingCategory),
    location: Schema.optionalKey(Schema.Struct({ ...SearchLocation.fields, name: OptionalString })),
});
const ClanRankingPlacement = Schema.Struct({
    locationId: Schema.String,
    rank: Schema.Number,
    points: Schema.Number,
});
const ClanRankingCategory = Schema.Struct({
    points: Schema.Number,
    placements: Schema.Array(ClanRankingPlacement),
});
const ClanRankingsResponse = Schema.Struct({
    name: Schema.NullOr(Schema.String),
    tag: Schema.String,
    badge: Schema.NullOr(Schema.String),
    homeVillage: ClanRankingCategory,
    builderBase: ClanRankingCategory,
    clanCapital: ClanRankingCategory,
});
const PlayerTimer = Schema.Struct({
    type: Schema.Literals(["war", "cwl", "capital"]),
    expiresAt: Schema.String,
    warTag: OptionalString,
    clans: Schema.Array(Schema.String),
});
const PlayerTimersResponse = Schema.Struct({ items: Schema.Array(PlayerTimer) });
const WarBadgeUrls = Schema.Struct({
    small: Schema.String,
    medium: Schema.String,
    large: Schema.String,
});
const WarAttack = Schema.Struct({
    attackerTag: Schema.String,
    defenderTag: Schema.String,
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
    order: Schema.Number,
    duration: Schema.Number,
});
const WarMember = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townhallLevel: Schema.Number,
    mapPosition: Schema.Number,
    attacks: Schema.optionalKey(Schema.Array(WarAttack)),
    opponentAttacks: OptionalNumber,
    bestOpponentAttack: Schema.optionalKey(WarAttack),
});
const WarClan = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    badgeUrls: WarBadgeUrls,
    clanLevel: Schema.Number,
    attacks: Schema.Number,
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
    members: Schema.Array(WarMember),
});
const WarResponse = Schema.Struct({
    state: Schema.String,
    teamSize: Schema.Number,
    attacksPerMember: OptionalNumber,
    battleModifier: OptionalString,
    preparationStartTime: Schema.String,
    startTime: OptionalString,
    endTime: Schema.String,
    clan: WarClan,
    opponent: WarClan,
    warStartTime: OptionalString,
    tag: OptionalString,
});
const WarListResponse = Schema.Struct({ items: Schema.Array(WarResponse) });
const BasicWarClan = Schema.Struct({
    tag: Schema.String,
    publicWarLog: Schema.NullOr(Schema.Boolean),
});
const BasicWarResponse = Schema.Struct({
    clan: BasicWarClan,
    opponent: BasicWarClan,
    preparationStartTime: Schema.String,
    endTime: Schema.String,
    type: Schema.String,
    warTag: OptionalString,
});
const PlayerWarAttackItem = Schema.Struct({
    war_id: Schema.String,
    warEndTime: Schema.String,
    warType: Schema.String,
    warSize: Schema.Number,
    attackingClanTag: Schema.String,
    defendingClanTag: Schema.String,
    attackerTag: Schema.String,
    attackerName: Schema.String,
    defenderTag: Schema.String,
    defenderName: Schema.String,
    attackerTownhall: Schema.Number,
    defenderTownhall: Schema.Number,
    attackerMapPosition: Schema.Number,
    defenderMapPosition: Schema.Number,
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
    duration: Schema.Number,
    attackOrder: Schema.Number,
    battleModifier: Schema.String,
    side: Schema.String,
});
const PlayerWarAttacksResponse = Schema.Struct({ items: Schema.Array(PlayerWarAttackItem) });
const PlayerWarHistoryClan = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    badgeUrls: PublicBadgeUrls,
    clanLevel: Schema.Number,
    attacks: Schema.Number,
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
});
const PlayerWarHistoryPlayer = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townhallLevel: Schema.Number,
    mapPosition: Schema.Number,
});
const PlayerWarHistoryAttack = Schema.Struct({
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
    order: Schema.Number,
    duration: Schema.Number,
    fresh: Schema.Boolean,
    player: PlayerWarHistoryPlayer,
});
const PlayerWarHistoryItem = Schema.Struct({
    teamSize: Schema.Number,
    attacksPerMember: Schema.Number,
    preparationStartTime: Schema.String,
    startTime: OptionalString,
    endTime: Schema.String,
    clan: PlayerWarHistoryClan,
    opponent: PlayerWarHistoryClan,
    type: Schema.String,
    player: PlayerWarHistoryPlayer,
    attacks: Schema.Array(PlayerWarHistoryAttack),
    defenses: Schema.Array(PlayerWarHistoryAttack),
});
const PlayerWarStatsResponse = Schema.Struct({ items: Schema.Array(PlayerWarHistoryItem) });
const ClanWarLogSide = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    badgeUrls: WarBadgeUrls,
    clanLevel: Schema.Number,
    attacks: Schema.Number,
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
});
const ClanWarLogItem = Schema.Struct({
    result: Schema.String,
    type: Schema.String,
    endTime: Schema.String,
    teamSize: Schema.Number,
    attacksPerMember: Schema.Number,
    clan: ClanWarLogSide,
    opponent: ClanWarLogSide,
});
const ClanWarLogResponse = Schema.Struct({ items: Schema.Array(ClanWarLogItem) });
const ClanRecordEntry = Schema.Struct({ value: Schema.Number, time: Schema.String });
const ClanBasicRecords = Schema.Struct({
    clanPoints: Schema.optionalKey(ClanRecordEntry),
    warWinStreak: Schema.optionalKey(ClanRecordEntry),
});
const JoinLeaveClan = Schema.Struct({ name: Schema.String, tag: Schema.String });
const JoinLeaveEvent = Schema.Struct({
    time: Schema.String,
    type: Schema.String,
    tag: Schema.String,
    name: OptionalString,
    townHallLevel: OptionalNumber,
    clan: Schema.optionalKey(JoinLeaveClan),
});
const JoinLeaveResponse = Schema.Struct({
    items: Schema.Array(JoinLeaveEvent),
    available: Schema.Number,
    uniquePlayers: OptionalNumber,
});
const CWLStanding = Schema.Struct({
    clanTag: Schema.String,
    season: Schema.String,
    cwlLeagueId: Schema.Number,
    warSize: Schema.Number,
    stars: Schema.Number,
    destruction: Schema.Number,
    wins: Schema.Number,
    losses: Schema.Number,
    ties: Schema.Number,
    warsFinished: Schema.Number,
    totalClansInGroup: Schema.Number,
    groupRank: OptionalNumber,
    globalRank: OptionalNumber,
    updatedAt: Schema.String,
});
const CWLMember = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townHallLevel: Schema.Number,
});
const CWLStoredGroupClan = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    clanLevel: Schema.Number,
    badgeUrls: PublicBadgeUrls,
    members: Schema.Array(CWLMember),
});
const CWLStoredWar = Schema.Struct({ ...WarResponse.fields, season: Schema.String });
const CWLWarPlaceholder = Schema.Struct({ tag: Schema.String });
const CWLRound = Schema.Struct({ warTags: Schema.Array(Schema.Union([CWLStoredWar, CWLWarPlaceholder])) });
const CWLResponse = Schema.Struct({
    state: Schema.String,
    season: Schema.String,
    warLeague: Schema.NullOr(LeagueReference),
    clans: Schema.Array(CWLStoredGroupClan),
    rounds: Schema.Array(CWLRound),
});
const CWLSeasonItem = Schema.Struct({
    season: Schema.String,
    state: Schema.String,
    warSize: Schema.NullOr(Schema.Number),
    warLeague: Schema.NullOr(LeagueReference),
    rank: Schema.NullOr(Schema.Number),
    stars: Schema.NullOr(Schema.Number),
    destruction: Schema.NullOr(Schema.Number),
    rounds: Schema.NullOr(Schema.Struct({
        won: Schema.Number,
        tied: Schema.Number,
        lost: Schema.Number,
    })),
});
const CWLSeasonsResponse = Schema.Struct({ items: Schema.Array(CWLSeasonItem) });
const CWLGroupClan = Schema.Struct({
    clanTag: Schema.String,
    name: Schema.String,
    clanLevel: Schema.Number,
    badgeToken: Schema.String,
    members: Schema.Array(CWLMember),
});
const CWLHistoryItem = Schema.Struct({
    season: Schema.String,
    cwlLeagueId: OptionalNumber,
    state: Schema.String,
    warSize: OptionalNumber,
    rounds: Schema.Array(Schema.Struct({ warTags: Schema.Array(Schema.String) })),
    clan: CWLGroupClan,
    standing: Schema.optionalKey(CWLStanding),
});
const CWLClanHistoryResponse = Schema.Struct({
    clanTag: Schema.String,
    items: Schema.Array(CWLHistoryItem),
});
const CWLPlayerHistoryAttack = Schema.Struct({
    warTag: Schema.String,
    round: Schema.Number,
    opponent: Schema.Struct({ tag: Schema.String, name: Schema.String }),
    defender: Schema.Struct({
        tag: Schema.String,
        name: Schema.String,
        townHallLevel: Schema.Number,
        mapPosition: Schema.Number,
    }),
    stars: Schema.Number,
    destructionPercentage: Schema.Number,
    order: Schema.Number,
    duration: Schema.Number,
});
const CWLPlayerHistoryItem = Schema.Struct({
    season: Schema.String,
    townHallLevel: Schema.Number,
    teamSize: Schema.NullOr(Schema.Number),
    clan: Schema.Struct({
        tag: Schema.String,
        name: Schema.String,
        badgeUrls: WarBadgeUrls,
        warLeague: Schema.NullOr(LeagueReference),
        wars: Schema.NullOr(Schema.Struct({ won: Schema.Number, lost: Schema.Number, tied: Schema.Number })),
        totalStars: Schema.NullOr(Schema.Number),
        placement: Schema.NullOr(Schema.Struct({
            group: Schema.NullOr(Schema.Number),
            global: Schema.NullOr(Schema.Number),
        })),
    }),
    attacks: Schema.Array(CWLPlayerHistoryAttack),
    placement: Schema.NullOr(Schema.Struct({ clan: Schema.Number, group: Schema.Number })),
    missedAttacks: Schema.Number,
});
const CWLPlayerHistoryResponse = Schema.Struct({ items: Schema.Array(CWLPlayerHistoryItem) });
const CWLLeagueRankingsResponse = Schema.Struct({
    season: Schema.String,
    cwlLeagueId: Schema.Number,
    warSize: Schema.Number,
    items: Schema.Array(CWLStanding),
});
const LegendHistoryItem = Schema.Struct({
    season: Schema.String,
    tag: Schema.String,
    name: Schema.String,
    expLevel: Schema.Number,
    trophies: Schema.Number,
    attackWins: Schema.Number,
    defenseWins: Schema.Number,
    rank: Schema.Number,
    clan: Schema.optionalKey(Schema.Struct({
        tag: OptionalString,
        name: OptionalString,
        badgeUrls: Schema.optionalKey(PublicBadgeUrls),
    })),
    leagueTier: Schema.optionalKey(Schema.Struct({
        id: Schema.Number,
        name: OptionalString,
        iconUrls: Schema.optionalKey(PublicIconUrls),
    })),
});
const LegendHistoryResponse = Schema.Struct({ items: Schema.Array(LegendHistoryItem) });
const ClanLegendSummaryResponse = Schema.Struct({
    seasons: Schema.Array(Schema.Struct({
        season: Schema.String,
        after: Schema.String,
        before: Schema.String,
        playerCount: Schema.Number,
    })),
    topFinishes: Schema.Array(Schema.Struct({
        season: Schema.String,
        tag: Schema.String,
        name: Schema.String,
        trophies: Schema.Number,
        attackWins: Schema.Number,
        defenseWins: Schema.Number,
        rank: Schema.Number,
    })),
});
const LeaderboardLeague = Schema.Struct({ id: Schema.Number, name: Schema.String, badge: Schema.String });
const LeaderboardClan = Schema.Struct({
    tag: Schema.String,
    name: Schema.optionalKey(Schema.NullOr(Schema.String)),
    badge: Schema.String,
});
const PlayerLeaderboardItem = Schema.Struct({
    rank: Schema.Number,
    tag: Schema.String,
    name: Schema.String,
    league_id: NullableNumber,
    league: Schema.optionalKey(LeaderboardLeague),
    clan_tag: NullableString,
    clan: Schema.optionalKey(LeaderboardClan),
    townhall_level: Schema.Number,
    trophies: Schema.Number,
    country_code: OptionalString,
    country_name: OptionalString,
});
const PlayerLeaderboardResponse = Schema.Struct({
    league_tier_id: NullableNumber,
    townhall_level: NullableNumber,
    items: Schema.Array(PlayerLeaderboardItem),
    count: Schema.Number,
    generated_at: OptionalString,
});
const PublicClanLeaderboardItem = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    location_id: NullableNumber,
    badge_url: Schema.String,
    badgeUrls: PublicBadgeUrls,
    donations: OptionalNumber,
    war_wins: OptionalNumber,
    capital_gold_total: OptionalNumber,
    war_win_streak: Schema.Number,
    rank: NullableNumber,
});
const PublicClanLeaderboardResponse = Schema.Struct({
    location_id: NullableNumber,
    kind: OptionalString,
    items: Schema.Array(PublicClanLeaderboardItem),
    count: Schema.Number,
});
const GlobalCountsResponse = Schema.Struct({
    players_in_war: Schema.Number,
    clans_in_war: Schema.Number,
    total_join_leaves: Schema.Number,
    players_in_legends: Schema.Number,
    player_count: Schema.Number,
    clan_count: Schema.Number,
    wars_stored: Schema.Number,
});
const publicGet = (operationId, path, pathParams, query, response, summary) => defineEndpoint({
    auth: "public",
    body: NoBody,
    bodyMode: "none",
    method: "GET",
    operationId,
    path,
    pathParams,
    query,
    response,
    responseMode: "json",
    successStatus: 200,
    summary,
});
export const BotPlayerHistoryEndpoint = publicGet("botPlayerHistory", "/v2/player/:tag/history/changes", ClashTagPath, Schema.Struct({
    type: Schema.Literals(["troop_level", "super_troop_boost", "hero_level", "spell_level", "pet_level", "equipment_level", "townhall_level", "best_trophies", "best_builder_base_trophies", "exp_level", "war_preference", "name"]),
    ...TimeWindowQuery,
    limit: OptionalNumber,
}), PlayerChangesResponse, "Get typed player changes");
export const BotPlayerRankingsEndpoint = publicGet("botPlayerRankings", "/v2/player/:tag/rankings", ClashTagPath, Schema.Struct({}), PlayerRankingsResponse, "Get player rankings");
export const BotPlayerTimersEndpoint = publicGet("botPlayerTimers", "/v2/player/:tag/timers", ClashTagPath, Schema.Struct({}), PlayerTimersResponse, "Get player timers");
export const BotPlayerWarStatsEndpoint = publicGet("botPlayerWarStats", "/v2/player/:tag/war/stats", ClashTagPath, WarHistoryQuery, PlayerWarStatsResponse, "Get player war statistics");
export const BotPlayerWarAttacksEndpoint = publicGet("botPlayerWarAttacks", "/v2/player/:tag/war/attacks", ClashTagPath, WarHistoryQuery, PlayerWarAttacksResponse, "Get player war attacks");
export const BotPlayerCwlHistoryEndpoint = publicGet("botPlayerCwlHistory", "/v2/player/:tag/cwl/history", ClashTagPath, Schema.Struct({ limit: OptionalNumber }), CWLPlayerHistoryResponse, "Get player CWL history");
export const BotPlayerLegendHistoryEndpoint = publicGet("botPlayerLegendHistory", "/v2/player/:tag/legend-history", ClashTagPath, Schema.Struct({}), LegendHistoryResponse, "Get player Legend history");
export const BotClanCachedEndpoint = publicGet("botClanCached", "/v2/clan/:tag/cached", ClashTagPath, Schema.Struct({}), ClanCachedResponse, "Get cached clan profile");
export const BotClanHistoryEndpoint = publicGet("botClanHistory", "/v2/clan/:tag/history/changes", ClashTagPath, Schema.Struct({ type: Schema.optionalKey(Schema.Literals(["description", "clanLevel"])), ...TimeWindowQuery, limit: OptionalNumber }), ClanChangesResponse, "Get clan changes");
export const BotClanRecordsEndpoint = publicGet("botClanRecords", "/v2/clan/:tag/records", ClashTagPath, Schema.Struct({}), ClanBasicRecords, "Get clan records");
export const BotClanRankingsEndpoint = publicGet("botClanRankings", "/v2/clan/:tag/rankings", ClashTagPath, Schema.Struct({}), ClanRankingsResponse, "Get clan rankings");
export const BotClanWarLogEndpoint = publicGet("botClanWarLog", "/v2/clan/:tag/warlog", ClashTagPath, WarHistoryQuery, ClanWarLogResponse, "Get clan war log");
export const BotClanWarsEndpoint = publicGet("botClanWars", "/v2/clan/:tag/wars", ClashTagPath, WarHistoryQuery, WarListResponse, "Get stored clan wars");
export const BotClanJoinLeaveEndpoint = publicGet("botClanJoinLeave", "/v2/clan/:tag/join-leave", ClashTagPath, Schema.Struct({ ...TimeWindowQuery, limit: OptionalNumber }), JoinLeaveResponse, "Get clan join and leave history");
export const BotClanLegendSummaryEndpoint = publicGet("botClanLegendSummary", "/v2/clan/:tag/history/legends/summary", ClashTagPath, Schema.Struct({ top: OptionalNumber }), ClanLegendSummaryResponse, "Get clan Legend summary");
export const BotCurrentWarEndpoint = publicGet("botCurrentWar", "/v2/war/:tag/basic", ClashTagPath, Schema.Struct({}), BasicWarResponse, "Get current basic war");
export const BotPreviousWarEndpoint = publicGet("botPreviousWar", "/v2/war/:tag/previous/:endTime", Schema.Struct({ tag: Schema.String, endTime: Schema.String }), Schema.Struct({}), WarResponse, "Get archived war");
export const BotCwlGroupEndpoint = publicGet("botCwlGroup", "/v2/cwl/:tag/group", ClashTagPath, Schema.Struct({ season: OptionalString }), CWLResponse, "Get stored CWL group");
export const BotCwlSeasonsEndpoint = publicGet("botCwlSeasons", "/v2/cwl/:tag/seasons", ClashTagPath, Schema.Struct({ limit: OptionalNumber }), CWLSeasonsResponse, "Get CWL seasons");
export const BotCwlRankingHistoryEndpoint = publicGet("botCwlRankingHistory", "/v2/cwl/:tag/ranking-history", ClashTagPath, Schema.Struct({}), CWLClanHistoryResponse, "Get clan CWL ranking history");
export const BotCwlLeaderboardEndpoint = publicGet("botCwlLeaderboard", "/v2/leaderboard/cwl/:leagueId", Schema.Struct({ leagueId: Schema.String }), Schema.Struct({ season: Schema.String, team_size: Schema.Number }), CWLLeagueRankingsResponse, "Get CWL leaderboard");
export const BotLegendSeasonEndpoint = publicGet("botLegendSeason", "/v2/legends/history/:season", Schema.Struct({ season: Schema.String }), Schema.Struct({ limit: OptionalNumber }), LegendHistoryResponse, "Get Legend season history");
const LocationPath = Schema.Struct({ locationId: Schema.Number });
const LeaderboardLimit = Schema.Struct({ limit: OptionalNumber });
export const BotClanDonationsLeaderboardEndpoint = publicGet("botClanDonationsLeaderboard", "/v2/leaderboard/:locationId/clan/donations", LocationPath, LeaderboardLimit, PublicClanLeaderboardResponse, "Get clan donation leaderboard");
export const BotClanWarWinsLeaderboardEndpoint = publicGet("botClanWarWinsLeaderboard", "/v2/leaderboard/:locationId/clan/war-wins", LocationPath, LeaderboardLimit, PublicClanLeaderboardResponse, "Get clan war-win leaderboard");
export const BotClanCapitalLeaderboardEndpoint = publicGet("botClanCapitalLeaderboard", "/v2/leaderboard/:locationId/clan/capital-gold", LocationPath, LeaderboardLimit, PublicClanLeaderboardResponse, "Get clan capital-gold leaderboard");
export const BotClanWinStreakLeaderboardEndpoint = publicGet("botClanWinStreakLeaderboard", "/v2/leaderboard/clan/win-streak", Schema.Struct({}), LeaderboardLimit, PublicClanLeaderboardResponse, "Get clan win-streak leaderboard");
export const BotTownHallLeaderboardEndpoint = publicGet("botTownHallLeaderboard", "/v2/leaderboard/townhalls/:townHallLevel", Schema.Struct({ townHallLevel: Schema.Number }), LeaderboardLimit, PlayerLeaderboardResponse, "Get Town Hall leaderboard");
export const BotLeagueLeaderboardEndpoint = publicGet("botLeagueLeaderboard", "/v2/leaderboard/league/:leagueId", Schema.Struct({ leagueId: Schema.String }), LeaderboardLimit, PlayerLeaderboardResponse, "Get league leaderboard");
export const BotCountsEndpoint = publicGet("botCounts", "/v2/counts", Schema.Struct({}), Schema.Struct({}), GlobalCountsResponse, "Get global ClashKing counts");
