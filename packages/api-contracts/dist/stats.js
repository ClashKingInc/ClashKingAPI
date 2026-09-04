import { Schema } from "effect";
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
const StatsErrors = [
    { status: 400, body: ErrorResponse },
    { status: 415, body: ErrorResponse },
];
const OptionalPositiveInt = Schema.optionalKey(Schema.Number);
export const StatsDateFilter = Schema.Struct({
    start_date: Schema.optionalKey(Schema.String),
    end_date: Schema.optionalKey(Schema.String),
});
export const StatsDateRange = Schema.Struct({
    start: Schema.String,
    end: Schema.String,
});
export const StatsItemQuantityFilter = Schema.Struct({
    item: Schema.String,
    min_quantity: OptionalPositiveInt,
    max_quantity: OptionalPositiveInt,
});
export const StatsBattleFilters = {
    dates: StatsDateFilter,
    townhall_level: OptionalPositiveInt,
    opponent_townhall_level: OptionalPositiveInt,
    equal_townhalls: Schema.optionalKey(Schema.Boolean),
    ranked_league_tier_id: OptionalPositiveInt,
    include_items: Schema.optionalKey(Schema.Array(StatsItemQuantityFilter)),
    exclude_items: Schema.optionalKey(Schema.Array(Schema.String)),
    minimum_sample_size: OptionalPositiveInt,
};
export const StatsArmiesRequest = Schema.Struct({
    ...StatsBattleFilters,
    limit: OptionalPositiveInt,
    sort_by: Schema.optionalKey(Schema.Literals(["usage_rate", "three_star_rate", "average_stars", "average_destruction"])),
});
export const StatsItemSelector = Schema.Struct({
    item: Schema.String,
    type: Schema.Literals(["troop", "spell", "hero", "pet", "equipment"]),
    hero: Schema.optionalKey(Schema.String),
});
export const StatsItemsRequest = Schema.Struct({
    ...StatsBattleFilters,
    items: Schema.Array(StatsItemSelector),
});
export const StatsRankedRequest = Schema.Struct({
    dates: StatsDateFilter,
    townhall_level: Schema.Number,
    ranked_league_tier_id: Schema.Number,
});
export const StatsWarRequest = Schema.Struct({
    dates: StatsDateFilter,
    townhall_level: OptionalPositiveInt,
    opponent_townhall_level: OptionalPositiveInt,
    equal_townhalls: Schema.optionalKey(Schema.Boolean),
});
export const StatsCwlRequest = Schema.Struct({
    ...StatsWarRequest.fields,
    cwl_league_id: OptionalPositiveInt,
    seasons: Schema.optionalKey(Schema.Array(Schema.String)),
});
export const StatsDailyPoint = Schema.Struct({
    date: Schema.String,
    sample_size: Schema.Number,
    use_count: Schema.optionalKey(Schema.Number),
    usage_rate: Schema.optionalKey(Schema.Number),
    average_stars: Schema.Number,
    average_destruction: Schema.Number,
    zero_star_rate: Schema.Number,
    one_star_rate: Schema.Number,
    two_star_rate: Schema.Number,
    three_star_rate: Schema.Number,
});
export const StatsMetrics = Schema.Struct({
    available: Schema.Boolean,
    sample_size: Schema.Number,
    usage_rate: Schema.optionalKey(Schema.Number),
    average_stars: Schema.Number,
    average_destruction: Schema.Number,
    zero_star_rate: Schema.Number,
    one_star_rate: Schema.Number,
    two_star_rate: Schema.Number,
    three_star_rate: Schema.Number,
    daily: Schema.Array(StatsDailyPoint),
});
export const StatsArmyItem = Schema.Struct({
    army_share_code: Schema.String,
    army_items: Schema.Array(Schema.String),
    army_counts: Schema.Record(Schema.String, Schema.Number),
    ...StatsMetrics.fields,
});
export const StatsArmiesResponse = Schema.Struct({
    date_range: StatsDateRange,
    items: Schema.Array(StatsArmyItem),
    count: Schema.Number,
});
export const StatsItemResult = Schema.Struct({
    item: Schema.String,
    type: Schema.String,
    hero: Schema.optionalKey(Schema.String),
    use_count: Schema.Number,
    hit_rate: Schema.Number,
    composition_share: Schema.optionalKey(Schema.Number),
    ...StatsMetrics.fields,
});
export const StatsItemsResponse = Schema.Struct({
    date_range: StatsDateRange,
    items: Schema.Array(StatsItemResult),
    count: Schema.Number,
});
export const StatsBreakdown = Schema.Struct({
    key: Schema.String,
    metrics: StatsMetrics,
});
export const StatsPerformanceResponse = Schema.Struct({
    date_range: StatsDateRange,
    metrics: StatsMetrics,
    breakdowns: Schema.optionalKey(Schema.Array(StatsBreakdown)),
});
export const StatsArmiesEndpoint = defineEndpoint({
    operationId: "statsArmies",
    method: "POST",
    path: "/v2/stats/armies",
    auth: "public",
    summary: "Query ranked army intelligence",
    body: StatsArmiesRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: StatsArmiesResponse,
    responseMode: "json",
    successStatus: 200,
    errors: StatsErrors,
});
export const StatsItemsEndpoint = defineEndpoint({
    operationId: "statsItems",
    method: "POST",
    path: "/v2/stats/items",
    auth: "public",
    summary: "Query ranked item intelligence",
    body: StatsItemsRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: StatsItemsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: StatsErrors,
});
export const StatsRankedEndpoint = defineEndpoint({
    operationId: "statsRanked",
    method: "POST",
    path: "/v2/stats/ranked",
    auth: "public",
    summary: "Query ranked performance",
    body: StatsRankedRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: StatsPerformanceResponse,
    responseMode: "json",
    successStatus: 200,
    errors: StatsErrors,
});
export const StatsWarEndpoint = defineEndpoint({
    operationId: "statsWar",
    method: "POST",
    path: "/v2/stats/war",
    auth: "public",
    summary: "Query regular-war performance",
    body: StatsWarRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: StatsPerformanceResponse,
    responseMode: "json",
    successStatus: 200,
    errors: StatsErrors,
});
export const StatsCwlEndpoint = defineEndpoint({
    operationId: "statsCwl",
    method: "POST",
    path: "/v2/stats/cwl",
    auth: "public",
    summary: "Query CWL performance",
    body: StatsCwlRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: StatsPerformanceResponse,
    responseMode: "json",
    successStatus: 200,
    errors: StatsErrors,
});
