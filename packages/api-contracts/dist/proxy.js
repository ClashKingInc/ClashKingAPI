import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
import { BadgeUrls, IconUrls, ProxyErrorResponse } from "./expo-common.js";
const ProxyErrors = [
    { status: 400, body: ProxyErrorResponse }, { status: 403, body: ProxyErrorResponse },
    { status: 404, body: ProxyErrorResponse }, { status: 429, body: ProxyErrorResponse },
];
const Paging = Schema.Struct({ cursors: Schema.optionalKey(Schema.Struct({ after: Schema.optionalKey(Schema.String), before: Schema.optionalKey(Schema.String) })) });
const League = Schema.Struct({ id: Schema.Number, name: Schema.String, iconUrls: Schema.optionalKey(IconUrls) });
const PlayerClan = Schema.Struct({ tag: Schema.String, name: Schema.String, clanLevel: Schema.Number, badgeUrls: BadgeUrls });
const PlayerItem = Schema.Struct({ name: Schema.String, level: Schema.Number, maxLevel: Schema.Number, village: Schema.String, superTroopIsActive: Schema.optionalKey(Schema.Boolean), equipment: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String, level: Schema.Number, maxLevel: Schema.Number, village: Schema.String }))) });
const Achievement = Schema.Struct({ name: Schema.String, stars: Schema.Number, value: Schema.Number, target: Schema.Number, info: Schema.String, completionInfo: Schema.optionalKey(Schema.NullOr(Schema.String)), village: Schema.String });
export const ProxyPlayerResponse = Schema.Struct({
    tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number,
    townHallWeaponLevel: Schema.optionalKey(Schema.Number), expLevel: Schema.Number, trophies: Schema.Number,
    bestTrophies: Schema.Number, warStars: Schema.Number, attackWins: Schema.Number, defenseWins: Schema.Number,
    builderHallLevel: Schema.optionalKey(Schema.Number), builderBaseTrophies: Schema.optionalKey(Schema.Number),
    bestBuilderBaseTrophies: Schema.optionalKey(Schema.Number), builderBaseLeague: Schema.optionalKey(League),
    clan: Schema.optionalKey(PlayerClan), role: Schema.optionalKey(Schema.String), warPreference: Schema.optionalKey(Schema.String),
    donations: Schema.optionalKey(Schema.Number), donationsReceived: Schema.optionalKey(Schema.Number),
    clanCapitalContributions: Schema.optionalKey(Schema.Number), league: Schema.optionalKey(League), leagueTier: Schema.optionalKey(League),
    achievements: Schema.Array(Achievement), heroes: Schema.Array(PlayerItem), troops: Schema.Array(PlayerItem),
    spells: Schema.Array(PlayerItem), heroEquipment: Schema.optionalKey(Schema.Array(PlayerItem)),
    currentLeagueGroupTag: Schema.optionalKey(Schema.String), currentLeagueSeasonId: Schema.optionalKey(Schema.Number),
    previousLeagueGroupTag: Schema.optionalKey(Schema.String), previousLeagueSeasonId: Schema.optionalKey(Schema.Number),
});
export const ProxyBattlelogResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({
        battleType: Schema.String, attack: Schema.Boolean, opponentPlayerTag: Schema.String, opponentName: Schema.String,
        opponentTownHallLevel: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number,
        lootedResources: Schema.Array(Schema.Struct({ name: Schema.String, amount: Schema.Number })),
        armyShareCode: Schema.String, battleTimestamp: Schema.String, battleTime: Schema.Number,
    })) });
export const ProxyLeagueHistoryResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ leagueSeasonId: Schema.Number, leagueTrophies: Schema.Number, leagueTierId: Schema.Number, placement: Schema.Number, attackWins: Schema.Number, attackLosses: Schema.Number, attackStars: Schema.Number, defenseWins: Schema.Number, defenseLosses: Schema.Number, defenseStars: Schema.Number, maxBattles: Schema.Number })) });
const LeagueMember = Schema.Struct({ playerTag: Schema.String, playerName: Schema.String, clanTag: Schema.NullOr(Schema.String), clanName: Schema.NullOr(Schema.String), leagueTrophies: Schema.Number, attackWinCount: Schema.Number, attackLoseCount: Schema.Number, defenseWinCount: Schema.Number, defenseLoseCount: Schema.Number });
const LeagueBattle = Schema.Struct({ opponentPlayerTag: Schema.String, opponentName: Schema.String, stars: Schema.Number, destructionPercentage: Schema.Number, trophies: Schema.Number, creationTime: Schema.String });
export const ProxyLeagueGroupResponse = Schema.Struct({ members: Schema.Array(LeagueMember), attackLogs: Schema.Array(LeagueBattle), defenseLogs: Schema.Array(LeagueBattle) });
export const ProxyLeagueTiersResponse = Schema.Struct({ items: Schema.Array(League) });
const Location = Schema.Struct({ id: Schema.Number, name: Schema.String, isCountry: Schema.Boolean, countryCode: Schema.optionalKey(Schema.String) });
const ClanMember = Schema.Struct({ tag: Schema.String, name: Schema.String, role: Schema.String, townHallLevel: Schema.Number, expLevel: Schema.Number, trophies: Schema.Number, donations: Schema.Number, donationsReceived: Schema.Number, builderBaseTrophies: Schema.optionalKey(Schema.Number), league: Schema.optionalKey(League), leagueTier: Schema.optionalKey(League), builderBaseLeague: Schema.optionalKey(League) });
export const ProxyClanResponse = Schema.Struct({
    tag: Schema.String, name: Schema.String, type: Schema.String, description: Schema.String,
    location: Schema.optionalKey(Location), isFamilyFriendly: Schema.Boolean, badgeUrls: BadgeUrls,
    clanLevel: Schema.Number, clanPoints: Schema.Number, clanBuilderBasePoints: Schema.Number,
    clanCapitalPoints: Schema.Number, capitalLeague: Schema.optionalKey(League), requiredTrophies: Schema.Number,
    warFrequency: Schema.String, warWinStreak: Schema.Number, warWins: Schema.Number,
    warTies: Schema.optionalKey(Schema.Number), warLosses: Schema.optionalKey(Schema.Number), isWarLogPublic: Schema.Boolean,
    warLeague: Schema.optionalKey(League), members: Schema.Number, memberList: Schema.Array(ClanMember),
    labels: Schema.Array(League), requiredBuilderBaseTrophies: Schema.optionalKey(Schema.Number),
    requiredTownhallLevel: Schema.optionalKey(Schema.Number),
    clanCapital: Schema.optionalKey(Schema.Struct({ capitalHallLevel: Schema.optionalKey(Schema.Number), districts: Schema.optionalKey(Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String, districtHallLevel: Schema.Number }))) })),
    chatLanguage: Schema.optionalKey(Schema.Struct({ id: Schema.Number, name: Schema.String, languageCode: Schema.String })),
});
// Official clan search omits description and the member list (memberList=false).
const { description: _description, memberList: _memberList, clanCapital: _clanCapital, ...ClanSearchFields } = ProxyClanResponse.fields;
export const ProxyClanSearchResponse = Schema.Struct({ items: Schema.Array(Schema.Struct(ClanSearchFields)), paging: Schema.optionalKey(Paging) });
const RaidLogSide = Schema.Struct({ defender: Schema.Struct({ tag: Schema.String, name: Schema.String, level: Schema.Number, badgeUrls: BadgeUrls }), attackCount: Schema.Number, districtCount: Schema.Number, districtsDestroyed: Schema.Number, districts: Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String, districtHallLevel: Schema.Number, destructionPercent: Schema.Number, stars: Schema.Number, attackCount: Schema.Number, totalLooted: Schema.Number, attacks: Schema.optionalKey(Schema.Array(Schema.Struct({ attacker: Schema.Struct({ tag: Schema.String, name: Schema.String }), destructionPercent: Schema.Number, stars: Schema.Number }))) })) });
const { defender: RaidClanIdentity, ...RaidLogFields } = RaidLogSide.fields;
const RaidDefenseLog = Schema.Struct({ attacker: RaidClanIdentity, ...RaidLogFields });
export const ProxyCapitalRaidSeasonsResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ state: Schema.String, startTime: Schema.String, endTime: Schema.String, capitalTotalLoot: Schema.Number, raidsCompleted: Schema.Number, totalAttacks: Schema.Number, enemyDistrictsDestroyed: Schema.Number, offensiveReward: Schema.Number, defensiveReward: Schema.Number, members: Schema.optionalKey(Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, attacks: Schema.Number, attackLimit: Schema.Number, bonusAttackLimit: Schema.Number, capitalResourcesLooted: Schema.Number }))), attackLog: Schema.Array(RaidLogSide), defenseLog: Schema.Array(RaidDefenseLog) })), paging: Schema.optionalKey(Paging) });
const WarAttack = Schema.Struct({ attackerTag: Schema.String, defenderTag: Schema.String, stars: Schema.Number, destructionPercentage: Schema.Number, order: Schema.Number, duration: Schema.Number });
const WarMember = Schema.Struct({ tag: Schema.String, name: Schema.String, townhallLevel: Schema.Number, mapPosition: Schema.Number, attacks: Schema.optionalKey(Schema.Array(WarAttack)), opponentAttacks: Schema.optionalKey(Schema.Number), bestOpponentAttack: Schema.optionalKey(WarAttack) });
const WarClan = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: BadgeUrls, clanLevel: Schema.Number, attacks: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number, members: Schema.Array(WarMember) });
export const ProxyWarResponse = Schema.Struct({ state: Schema.String, teamSize: Schema.optionalKey(Schema.Number), attacksPerMember: Schema.optionalKey(Schema.Number), battleModifier: Schema.optionalKey(Schema.String), preparationStartTime: Schema.optionalKey(Schema.String), startTime: Schema.optionalKey(Schema.String), endTime: Schema.optionalKey(Schema.String), clan: Schema.optionalKey(WarClan), opponent: Schema.optionalKey(WarClan), warStartTime: Schema.optionalKey(Schema.String), tag: Schema.optionalKey(Schema.String) });
const WarLogSide = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: BadgeUrls, clanLevel: Schema.Number, attacks: Schema.optionalKey(Schema.Number), stars: Schema.Number, destructionPercentage: Schema.Number });
// Deleted opponents omit their identity; CWL summaries omit attacksPerMember.
const WarLogOpponent = Schema.Struct({ ...WarLogSide.fields, tag: Schema.optionalKey(Schema.String), name: Schema.optionalKey(Schema.String) });
export const ProxyWarlogResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ result: Schema.NullOr(Schema.String), endTime: Schema.String, teamSize: Schema.Number, attacksPerMember: Schema.optionalKey(Schema.Number), clan: WarLogSide, opponent: WarLogOpponent })), paging: Schema.optionalKey(Paging) });
const CwlClan = Schema.Struct({ tag: Schema.String, name: Schema.String, clanLevel: Schema.Number, badgeUrls: BadgeUrls, members: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number })) });
export const ProxyCwlGroupResponse = Schema.Struct({ state: Schema.String, season: Schema.String, clans: Schema.Array(CwlClan), rounds: Schema.Array(Schema.Struct({ warTags: Schema.Array(Schema.String) })) });
export const ProxyLocationsResponse = Schema.Struct({ items: Schema.Array(Location), paging: Schema.optionalKey(Paging) });
const RankingClan = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: BadgeUrls });
const RankingItem = Schema.Struct({ tag: Schema.String, name: Schema.String, rank: Schema.Number, previousRank: Schema.optionalKey(Schema.Number), trophies: Schema.optionalKey(Schema.Number), builderBaseTrophies: Schema.optionalKey(Schema.Number), clanPoints: Schema.optionalKey(Schema.Number), clanBuilderBasePoints: Schema.optionalKey(Schema.Number), clanCapitalPoints: Schema.optionalKey(Schema.Number), members: Schema.optionalKey(Schema.Number), clanLevel: Schema.optionalKey(Schema.Number), badgeUrls: Schema.optionalKey(BadgeUrls), clan: Schema.optionalKey(RankingClan), league: Schema.optionalKey(League), leagueTier: Schema.optionalKey(League), builderBaseLeague: Schema.optionalKey(League), location: Schema.optionalKey(Location), expLevel: Schema.optionalKey(Schema.Number), attackWins: Schema.optionalKey(Schema.Number), defenseWins: Schema.optionalKey(Schema.Number) });
export const ProxyRankingsResponse = Schema.Struct({ items: Schema.Array(RankingItem), paging: Schema.optionalKey(Paging) });
const proxyGet = (operationId, path, pathParams, response, query = NoQuery) => defineEndpoint({ operationId, method: "GET", path, auth: "user", summary: operationId, body: NoBody, bodyMode: "none", pathParams, query, response, responseMode: "json", successStatus: 200, errors: ProxyErrors });
const PlayerPath = Schema.Struct({ playerTag: Schema.String });
const ClanPath = Schema.Struct({ clanTag: Schema.String });
const LocationPath = Schema.Struct({ locationId: Schema.String });
const LimitQuery = Schema.Struct({ limit: Schema.optionalKey(Schema.Number) });
export const ProxyPlayerEndpoint = proxyGet("getExpoProxyPlayer", "/proxy/v1/players/:playerTag", PlayerPath, ProxyPlayerResponse);
export const ProxyPlayerBattlelogEndpoint = proxyGet("getExpoProxyPlayerBattlelog", "/proxy/v1/players/:playerTag/battlelog", PlayerPath, ProxyBattlelogResponse);
export const ProxyPlayerLeagueHistoryEndpoint = proxyGet("getExpoProxyPlayerLeagueHistory", "/proxy/v1/players/:playerTag/leaguehistory", PlayerPath, ProxyLeagueHistoryResponse);
export const ProxyLeagueGroupEndpoint = proxyGet("getExpoProxyLeagueGroup", "/proxy/v1/leaguegroup/:leagueGroupTag/:seasonId", Schema.Struct({ leagueGroupTag: Schema.String, seasonId: Schema.Number }), ProxyLeagueGroupResponse, Schema.Struct({ playerTag: Schema.String }));
export const ProxyLeagueTiersEndpoint = proxyGet("getExpoProxyLeagueTiers", "/proxy/v1/leaguetiers", NoPathParams, ProxyLeagueTiersResponse);
export const ProxyClanEndpoint = proxyGet("getExpoProxyClan", "/proxy/v1/clans/:clanTag", ClanPath, ProxyClanResponse);
export const ProxyClanSearchEndpoint = proxyGet("searchExpoProxyClans", "/proxy/v1/clans", NoPathParams, ProxyClanSearchResponse, Schema.Struct({ name: Schema.String, warFrequency: Schema.optionalKey(Schema.String), locationId: Schema.optionalKey(Schema.Number), minMembers: Schema.optionalKey(Schema.Number), maxMembers: Schema.optionalKey(Schema.Number), minClanLevel: Schema.optionalKey(Schema.Number), limit: Schema.Number, memberList: Schema.Boolean }));
export const ProxyCapitalRaidSeasonsEndpoint = proxyGet("getExpoProxyCapitalRaidSeasons", "/proxy/v1/clans/:clanTag/capitalraidseasons", ClanPath, ProxyCapitalRaidSeasonsResponse, LimitQuery);
export const ProxyClanWarlogEndpoint = proxyGet("getExpoProxyClanWarlog", "/proxy/v1/clans/:clanTag/warlog", ClanPath, ProxyWarlogResponse, LimitQuery);
// Official notInWar responses can contain empty clan/opponent placeholders.
// Keep active-war decoding strict, and discard placeholders only in this state.
export const ProxyCurrentWarResponse = Schema.Union([Schema.Struct({ state: Schema.Literal("notInWar") }), ProxyWarResponse]);
export const ProxyCurrentWarEndpoint = proxyGet("getExpoProxyCurrentWar", "/proxy/v1/clans/:clanTag/currentwar", ClanPath, ProxyCurrentWarResponse);
export const ProxyCurrentLeagueGroupEndpoint = proxyGet("getExpoProxyCurrentLeagueGroup", "/proxy/v1/clans/:clanTag/currentwar/leaguegroup", ClanPath, ProxyCwlGroupResponse);
export const ProxyCwlWarEndpoint = proxyGet("getExpoProxyCwlWar", "/proxy/v1/clanwarleagues/wars/:warTag", Schema.Struct({ warTag: Schema.String }), ProxyWarResponse);
export const ProxyLocationsEndpoint = proxyGet("getExpoProxyLocations", "/proxy/v1/locations", NoPathParams, ProxyLocationsResponse);
export const ProxyPlayerRankingsEndpoint = proxyGet("getExpoProxyPlayerRankings", "/proxy/v1/locations/:locationId/rankings/players", LocationPath, ProxyRankingsResponse, LimitQuery);
export const ProxyBuilderPlayerRankingsEndpoint = proxyGet("getExpoProxyBuilderPlayerRankings", "/proxy/v1/locations/:locationId/rankings/players-builder-base", LocationPath, ProxyRankingsResponse, LimitQuery);
export const ProxyClanRankingsEndpoint = proxyGet("getExpoProxyClanRankings", "/proxy/v1/locations/:locationId/rankings/clans", LocationPath, ProxyRankingsResponse, LimitQuery);
export const ProxyBuilderClanRankingsEndpoint = proxyGet("getExpoProxyBuilderClanRankings", "/proxy/v1/locations/:locationId/rankings/clans-builder-base", LocationPath, ProxyRankingsResponse, LimitQuery);
export const ProxyCapitalRankingsEndpoint = proxyGet("getExpoProxyCapitalRankings", "/proxy/v1/locations/:locationId/rankings/capitals", LocationPath, ProxyRankingsResponse, LimitQuery);
