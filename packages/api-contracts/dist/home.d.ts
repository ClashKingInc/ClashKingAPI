import { Schema } from "effect";
export declare const HomeActivityPlayerMapping: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly clan_tag: Schema.NullOr<Schema.String>;
}>;
export declare const HomeActivityRequest: Schema.Struct<{
    readonly account_id: Schema.String;
    readonly mappings: Schema.$Array<Schema.Struct<{
        readonly player_tag: Schema.String;
        readonly clan_tag: Schema.NullOr<Schema.String>;
    }>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>;
export declare const HomeActivityItem: Schema.Struct<{
    readonly type: Schema.Literal<"join_leave">;
    readonly timestamp: Schema.String;
    readonly event_type: Schema.String;
    readonly player_tag: Schema.String;
    readonly clan_tag: Schema.NullOr<Schema.String>;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly clan_name: Schema.optionalKey<Schema.String>;
    readonly townhall_level: Schema.optionalKey<Schema.Number>;
}>;
export declare const HomeActivityResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"join_leave">;
        readonly timestamp: Schema.String;
        readonly event_type: Schema.String;
        readonly player_tag: Schema.String;
        readonly clan_tag: Schema.NullOr<Schema.String>;
        readonly player_name: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
    }>>;
}>;
export declare const HomeActivityEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly account_id: Schema.String;
    readonly mappings: Schema.$Array<Schema.Struct<{
        readonly player_tag: Schema.String;
        readonly clan_tag: Schema.NullOr<Schema.String>;
    }>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"join_leave">;
        readonly timestamp: Schema.String;
        readonly event_type: Schema.String;
        readonly player_tag: Schema.String;
        readonly clan_tag: Schema.NullOr<Schema.String>;
        readonly player_name: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
    }>>;
}>, readonly []>;
export type HomeActivityRequest = typeof HomeActivityRequest.Type;
export type HomeActivityResponse = typeof HomeActivityResponse.Type;
//# sourceMappingURL=home.d.ts.map