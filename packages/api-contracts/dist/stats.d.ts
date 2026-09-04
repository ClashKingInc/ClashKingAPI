import { Schema } from "effect";
export declare const StatsDateFilter: Schema.Struct<{
    readonly start_date: Schema.optionalKey<Schema.String>;
    readonly end_date: Schema.optionalKey<Schema.String>;
}>;
export declare const StatsDateRange: Schema.Struct<{
    readonly start: Schema.String;
    readonly end: Schema.String;
}>;
export declare const StatsItemQuantityFilter: Schema.Struct<{
    readonly item: Schema.String;
    readonly min_quantity: Schema.optionalKey<Schema.Number>;
    readonly max_quantity: Schema.optionalKey<Schema.Number>;
}>;
export declare const StatsBattleFilters: {
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly ranked_league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly include_items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly min_quantity: Schema.optionalKey<Schema.Number>;
        readonly max_quantity: Schema.optionalKey<Schema.Number>;
    }>>>;
    readonly exclude_items: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly minimum_sample_size: Schema.optionalKey<Schema.Number>;
};
export declare const StatsArmiesRequest: Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly ranked_league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly include_items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly min_quantity: Schema.optionalKey<Schema.Number>;
        readonly max_quantity: Schema.optionalKey<Schema.Number>;
    }>>>;
    readonly exclude_items: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly minimum_sample_size: Schema.optionalKey<Schema.Number>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly sort_by: Schema.optionalKey<Schema.Literals<readonly ["usage_rate", "three_star_rate", "average_stars", "average_destruction"]>>;
}>;
export declare const StatsItemSelector: Schema.Struct<{
    readonly item: Schema.String;
    readonly type: Schema.Literals<readonly ["troop", "spell", "hero", "pet", "equipment"]>;
    readonly hero: Schema.optionalKey<Schema.String>;
}>;
export declare const StatsItemsRequest: Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly ranked_league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly include_items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly min_quantity: Schema.optionalKey<Schema.Number>;
        readonly max_quantity: Schema.optionalKey<Schema.Number>;
    }>>>;
    readonly exclude_items: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly minimum_sample_size: Schema.optionalKey<Schema.Number>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly type: Schema.Literals<readonly ["troop", "spell", "hero", "pet", "equipment"]>;
        readonly hero: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const StatsRankedRequest: Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.Number;
    readonly ranked_league_tier_id: Schema.Number;
}>;
export declare const StatsWarRequest: Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const StatsCwlRequest: Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
    readonly seasons: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>;
export declare const StatsDailyPoint: Schema.Struct<{
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
}>;
export declare const StatsMetrics: Schema.Struct<{
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
export declare const StatsArmyItem: Schema.Struct<{
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
    readonly army_share_code: Schema.String;
    readonly army_items: Schema.$Array<Schema.String>;
    readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
}>;
export declare const StatsArmiesResponse: Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly items: Schema.$Array<Schema.Struct<{
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
        readonly army_share_code: Schema.String;
        readonly army_items: Schema.$Array<Schema.String>;
        readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const StatsItemResult: Schema.Struct<{
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
    readonly item: Schema.String;
    readonly type: Schema.String;
    readonly hero: Schema.optionalKey<Schema.String>;
    readonly use_count: Schema.Number;
    readonly hit_rate: Schema.Number;
    readonly composition_share: Schema.optionalKey<Schema.Number>;
}>;
export declare const StatsItemsResponse: Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly items: Schema.$Array<Schema.Struct<{
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
        readonly item: Schema.String;
        readonly type: Schema.String;
        readonly hero: Schema.optionalKey<Schema.String>;
        readonly use_count: Schema.Number;
        readonly hit_rate: Schema.Number;
        readonly composition_share: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const StatsBreakdown: Schema.Struct<{
    readonly key: Schema.String;
    readonly metrics: Schema.Struct<{
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
export declare const StatsPerformanceResponse: Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly metrics: Schema.Struct<{
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
    readonly breakdowns: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly metrics: Schema.Struct<{
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
    }>>>;
}>;
export declare const StatsArmiesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly ranked_league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly include_items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly min_quantity: Schema.optionalKey<Schema.Number>;
        readonly max_quantity: Schema.optionalKey<Schema.Number>;
    }>>>;
    readonly exclude_items: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly minimum_sample_size: Schema.optionalKey<Schema.Number>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly sort_by: Schema.optionalKey<Schema.Literals<readonly ["usage_rate", "three_star_rate", "average_stars", "average_destruction"]>>;
}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly items: Schema.$Array<Schema.Struct<{
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
        readonly army_share_code: Schema.String;
        readonly army_items: Schema.$Array<Schema.String>;
        readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 415;
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
export declare const StatsItemsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly ranked_league_tier_id: Schema.optionalKey<Schema.Number>;
    readonly include_items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly min_quantity: Schema.optionalKey<Schema.Number>;
        readonly max_quantity: Schema.optionalKey<Schema.Number>;
    }>>>;
    readonly exclude_items: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly minimum_sample_size: Schema.optionalKey<Schema.Number>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly item: Schema.String;
        readonly type: Schema.Literals<readonly ["troop", "spell", "hero", "pet", "equipment"]>;
        readonly hero: Schema.optionalKey<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly items: Schema.$Array<Schema.Struct<{
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
        readonly item: Schema.String;
        readonly type: Schema.String;
        readonly hero: Schema.optionalKey<Schema.String>;
        readonly use_count: Schema.Number;
        readonly hit_rate: Schema.Number;
        readonly composition_share: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 415;
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
export declare const StatsRankedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.Number;
    readonly ranked_league_tier_id: Schema.Number;
}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly metrics: Schema.Struct<{
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
    readonly breakdowns: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly metrics: Schema.Struct<{
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
    }>>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 415;
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
export declare const StatsWarEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly metrics: Schema.Struct<{
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
    readonly breakdowns: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly metrics: Schema.Struct<{
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
    }>>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 415;
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
export declare const StatsCwlEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly dates: Schema.Struct<{
        readonly start_date: Schema.optionalKey<Schema.String>;
        readonly end_date: Schema.optionalKey<Schema.String>;
    }>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
    readonly opponent_townhall_level: Schema.optionalKey<Schema.Number>;
    readonly equal_townhalls: Schema.optionalKey<Schema.Boolean>;
    readonly cwl_league_id: Schema.optionalKey<Schema.Number>;
    readonly seasons: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, Schema.Struct<{
    readonly date_range: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
    readonly metrics: Schema.Struct<{
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
    readonly breakdowns: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly metrics: Schema.Struct<{
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
    }>>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 415;
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
export type StatsArmiesRequest = typeof StatsArmiesRequest.Type;
export type StatsArmiesResponse = typeof StatsArmiesResponse.Type;
export type StatsCwlRequest = typeof StatsCwlRequest.Type;
export type StatsItemsRequest = typeof StatsItemsRequest.Type;
export type StatsItemsResponse = typeof StatsItemsResponse.Type;
export type StatsRankedRequest = typeof StatsRankedRequest.Type;
export type StatsWarRequest = typeof StatsWarRequest.Type;
export type StatsPerformanceResponse = typeof StatsPerformanceResponse.Type;
//# sourceMappingURL=stats.d.ts.map