import { Schema } from "effect";
export declare const GlobalCounts: Schema.Struct<{
    readonly players_in_war: Schema.Number;
    readonly clans_in_war: Schema.Number;
    readonly total_join_leaves: Schema.Number;
    readonly players_in_legends: Schema.Number;
    readonly player_count: Schema.Number;
    readonly clan_count: Schema.Number;
    readonly wars_stored: Schema.Number;
}>;
export declare const StatsOverviewResponse: Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly counts: Schema.Struct<{
        readonly players_in_war: Schema.Number;
        readonly clans_in_war: Schema.Number;
        readonly total_join_leaves: Schema.Number;
        readonly players_in_legends: Schema.Number;
        readonly player_count: Schema.Number;
        readonly clan_count: Schema.Number;
        readonly wars_stored: Schema.Number;
    }>;
    readonly ranked: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
    readonly war: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
    readonly cwl: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
}>;
export declare const GroupedCountsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const StatsOverviewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly start_date: Schema.optionalKey<Schema.String>;
    readonly end_date: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly counts: Schema.Struct<{
        readonly players_in_war: Schema.Number;
        readonly clans_in_war: Schema.Number;
        readonly total_join_leaves: Schema.Number;
        readonly players_in_legends: Schema.Number;
        readonly player_count: Schema.Number;
        readonly clan_count: Schema.Number;
        readonly wars_stored: Schema.Number;
    }>;
    readonly ranked: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
    readonly war: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
    readonly cwl: Schema.Struct<{
        readonly available: Schema.Boolean;
        readonly sample_size: Schema.Number;
        readonly usage_rate: Schema.optionalKey<Schema.Number>;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly zero_star_rate: Schema.Number;
        readonly one_star_rate: Schema.Number;
        readonly two_star_rate: Schema.Number;
        readonly three_star_rate: Schema.Number;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly sample_size: Schema.Number;
            readonly use_count: Schema.optionalKey<Schema.Number>;
            readonly usage_rate: Schema.optionalKey<Schema.Number>;
            readonly average_stars: Schema.Number;
            readonly average_destruction: Schema.Number;
            readonly zero_star_rate: Schema.Number;
            readonly one_star_rate: Schema.Number;
            readonly two_star_rate: Schema.Number;
            readonly three_star_rate: Schema.Number;
        }>>;
    }>;
}>, readonly []>;
export declare const GlobalCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly players_in_war: Schema.Number;
    readonly clans_in_war: Schema.Number;
    readonly total_join_leaves: Schema.Number;
    readonly players_in_legends: Schema.Number;
    readonly player_count: Schema.Number;
    readonly clan_count: Schema.Number;
    readonly wars_stored: Schema.Number;
}>, readonly []>;
export declare const PlayerTownhallCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const PlayerLeagueTierCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const ClanLocationCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const CwlLeagueCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const ClanCapitalLeagueCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
        readonly location_id: Schema.optionalKey<Schema.Number>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly capital_league_id: Schema.optionalKey<Schema.Number>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        readonly count: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
//# sourceMappingURL=expo-stats.d.ts.map