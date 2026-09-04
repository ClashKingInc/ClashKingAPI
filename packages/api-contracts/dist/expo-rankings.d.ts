import { Schema } from "effect";
export declare const LeaderboardHistoryItem: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly expLevel: Schema.optionalKey<Schema.Number>;
    readonly trophies: Schema.optionalKey<Schema.Number>;
    readonly attackWins: Schema.optionalKey<Schema.Number>;
    readonly defenseWins: Schema.optionalKey<Schema.Number>;
    readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
    readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
    readonly clan: Schema.optionalKey<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
    }>>;
    readonly league: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly leagueTier: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
        readonly small: Schema.optionalKey<Schema.String>;
        readonly medium: Schema.optionalKey<Schema.String>;
        readonly large: Schema.String;
    }>>;
    readonly clanLevel: Schema.optionalKey<Schema.Number>;
    readonly clanPoints: Schema.optionalKey<Schema.Number>;
    readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
    readonly capitalPoints: Schema.optionalKey<Schema.Number>;
    readonly members: Schema.optionalKey<Schema.Number>;
    readonly location: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
        readonly localizedName: Schema.optionalKey<Schema.String>;
    }>>;
    readonly rank: Schema.Number;
    readonly previousRank: Schema.optionalKey<Schema.Number>;
}>;
export declare const LeaderboardHistoryResponse: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies", "clan_home_points", "clan_builder_base_points", "clan_capital_points"]>;
    readonly locationId: Schema.String;
    readonly date: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
        }>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly capitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
        }>>;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
    }>>;
}>;
export declare const PlayerLeaderboardResponse: Schema.Struct<{
    readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly badge: Schema.String;
        }>>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badge: Schema.String;
        }>>;
        readonly townhall_level: Schema.Number;
        readonly trophies: Schema.Number;
        readonly country_code: Schema.optionalKey<Schema.String>;
        readonly country_name: Schema.optionalKey<Schema.String>;
    }>>;
    readonly count: Schema.Number;
    readonly generated_at: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanLeaderboardResponse: Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.Number>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const LeaderboardHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leaderboardType: Schema.String;
    readonly locationId: Schema.String;
    readonly date: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies", "clan_home_points", "clan_builder_base_points", "clan_capital_points"]>;
    readonly locationId: Schema.String;
    readonly date: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
        }>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly capitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
        }>>;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
    }>>;
}>, readonly [{
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const LeaderboardTownhallsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly townhallLevel: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly badge: Schema.String;
        }>>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badge: Schema.String;
        }>>;
        readonly townhall_level: Schema.Number;
        readonly trophies: Schema.Number;
        readonly country_code: Schema.optionalKey<Schema.String>;
        readonly country_name: Schema.optionalKey<Schema.String>;
    }>>;
    readonly count: Schema.Number;
    readonly generated_at: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const LeaderboardLeagueEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leagueTierId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly badge: Schema.String;
        }>>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badge: Schema.String;
        }>>;
        readonly townhall_level: Schema.Number;
        readonly trophies: Schema.Number;
        readonly country_code: Schema.optionalKey<Schema.String>;
        readonly country_name: Schema.optionalKey<Schema.String>;
    }>>;
    readonly count: Schema.Number;
    readonly generated_at: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const LeaderboardClanDonationsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.Number>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const LeaderboardClanWarWinsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.Number>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const LeaderboardClanWinStreakEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.Number>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
//# sourceMappingURL=expo-rankings.d.ts.map