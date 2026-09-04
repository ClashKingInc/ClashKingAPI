import { Schema } from "effect";
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
import { WarAttack, WarBadgeUrls, WarResponse } from "./expo-war.js";
import { ProxyPlayerResponse, ProxyClanResponse, ProxyWarResponse, ProxyCapitalRaidSeasonsResponse, ProxyWarlogResponse } from "./proxy.js";
import { BotPlayerLegendHistoryEndpoint } from "./bot-public.js";
import { CurrentWarSummary } from "./current-war-summary.js";
export const InitializationMiniMember = Schema.Struct({ name: Schema.String, tag: Schema.String, townhallLevel: Schema.Number, mapPosition: Schema.Number, opponentAttacks: Schema.Number });
export const InitializationAttack = Schema.Struct({ ...WarAttack.fields, attacker: InitializationMiniMember,
    defender: Schema.optionalKey(InitializationMiniMember), attack_order: Schema.Number, fresh: Schema.Boolean, war_type: Schema.String });
export const InitializationMember = Schema.Struct({ ...InitializationMiniMember.fields, attacks: Schema.Array(InitializationAttack), defenses: Schema.Array(InitializationAttack) });
const MiniClan = Schema.Struct({ name: Schema.String, tag: Schema.String, badgeUrls: WarBadgeUrls, clanLevel: Schema.Number, attacks: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number });
export const InitializationWarData = Schema.Struct({ ...WarResponse.fields, clan: MiniClan, opponent: MiniClan, type: Schema.String, war_id: Schema.String });
export const InitializationPlayerWar = Schema.Struct({ war_data: InitializationWarData, members: Schema.Array(InitializationMember), missedAttacks: Schema.Number, missedDefenses: Schema.Number });
const StarsCount = Schema.Struct({ "0": Schema.Number, "1": Schema.Number, "2": Schema.Number, "3": Schema.Number });
const Matchup = Schema.Struct({ averageStars: Schema.Number, averageDestruction: Schema.Number, count: Schema.Number, starsCount: StarsCount });
const Bucket = Schema.Struct({ warsCounts: Schema.Number, totalAttacks: Schema.Number, totalDefenses: Schema.Number, missedAttacks: Schema.Number, missedDefenses: Schema.Number,
    starsCount: StarsCount, starsCountDef: StarsCount, byEnemyTownhall: Schema.Record(Schema.String, Matchup), byEnemyTownhallDef: Schema.Record(Schema.String, Matchup) });
export const InitializationPlayerWarStats = Schema.Struct({ name: Schema.String, tag: Schema.String, townhallLevel: Schema.Number,
    stats: Schema.Struct({ all: Bucket, random: Bucket, cwl: Bucket, friendly: Bucket }), timeRange: Schema.Struct({ start: Schema.Number, end: Schema.Number }), wars: Schema.Array(InitializationPlayerWar) });
export const InitializationClanWarStats = Schema.Struct({ clan_tag: Schema.String, players: Schema.Array(InitializationPlayerWarStats), wars: Schema.Array(Schema.Struct({ war_data: InitializationWarData, members: Schema.Array(InitializationMember) })) });
export const InitializationRequest = Schema.Struct({ player_tags: Schema.Array(Schema.String), clan_tags: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) });
const MobileRankCategory = Schema.Struct({ points: Schema.NullOr(Schema.Number), globalRank: Schema.NullOr(Schema.Number), localRank: Schema.NullOr(Schema.Number),
    locationId: Schema.NullOr(Schema.String), locationName: Schema.NullOr(Schema.String), countryCode: Schema.NullOr(Schema.String) });
export const InitializationRankings = Schema.Struct({ tag: Schema.String, homeVillage: MobileRankCategory, builderBase: MobileRankCategory });
const EmptyObject = Schema.Record(Schema.String, Schema.Never);
export const InitializationPlayer = Schema.Struct({ tag: Schema.String, legends_by_season: EmptyObject,
    legend_eos_ranking: BotPlayerLegendHistoryEndpoint.response.fields.items, rankings: InitializationRankings,
    war_data: Schema.Union([EmptyObject, Schema.Struct({ ...CurrentWarSummary.fields, currentWarInfo: Schema.optionalKey(ProxyWarResponse) })]) });
export const InitializationResponse = Schema.Struct({
    players: Schema.Array(InitializationPlayer), players_basic: Schema.Array(ProxyPlayerResponse),
    clans: Schema.Struct({ clan_details: Schema.Record(Schema.String, ProxyClanResponse), clan_stats: EmptyObject,
        war_data: Schema.Array(CurrentWarSummary), capital_data: Schema.Array(Schema.Struct({ clan_tag: Schema.String, history: ProxyCapitalRaidSeasonsResponse.fields.items })),
        war_log_data: Schema.Array(Schema.Struct({ clan_tag: Schema.String, items: ProxyWarlogResponse.fields.items })),
        clan_war_stats: Schema.Array(InitializationClanWarStats), cwl_data: Schema.Array(Schema.Never) }),
    war_stats: Schema.Array(InitializationPlayerWarStats), clan_tags: Schema.Array(Schema.String),
    metadata: Schema.Struct({ total_players: Schema.Number, total_clans: Schema.Number, fetch_time: Schema.String, user_id: Schema.String }),
});
export const InitializationEndpoint = defineEndpoint({ operationId: "initializeMobileAccount", method: "POST", path: "/v2/initialization", auth: "user",
    summary: "Initialize mobile account data", body: InitializationRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
    response: InitializationResponse, responseMode: "json", successStatus: 200,
    errors: [{ status: 400, body: ErrorResponse }, { status: 401, body: ErrorResponse }, { status: 413, body: ErrorResponse }, { status: 503, body: ErrorResponse }] });
