import { Schema } from "effect";
export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | {
    readonly [key: string]: JsonValue;
};
export declare const JsonValue: Schema.Codec<JsonValue>;
export declare const JsonData: Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>;
export declare const Timestamp: Schema.String;
export declare const NullableString: Schema.NullOr<Schema.String>;
export declare const NullableNumber: Schema.NullOr<Schema.Number>;
export declare const MessageResponse: Schema.Struct<{
    readonly message: Schema.String;
}>;
export declare const SuccessResponse: Schema.Struct<{
    readonly success: Schema.Boolean;
}>;
export declare const BadgeUrls: Schema.Struct<{
    readonly small: Schema.optionalKey<Schema.String>;
    readonly medium: Schema.optionalKey<Schema.String>;
    readonly large: Schema.String;
}>;
export declare const IconUrls: Schema.Struct<{
    readonly small: Schema.optionalKey<Schema.String>;
    readonly medium: Schema.optionalKey<Schema.String>;
    readonly tiny: Schema.optionalKey<Schema.String>;
    readonly large: Schema.optionalKey<Schema.String>;
}>;
export declare const LeagueReference: Schema.Struct<{
    readonly id: Schema.Number;
    readonly name: Schema.String;
    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
        readonly small: Schema.optionalKey<Schema.String>;
        readonly medium: Schema.optionalKey<Schema.String>;
        readonly tiny: Schema.optionalKey<Schema.String>;
        readonly large: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const LocationReference: Schema.Struct<{
    readonly id: Schema.Number;
    readonly name: Schema.String;
    readonly isCountry: Schema.Boolean;
    readonly countryCode: Schema.optionalKey<Schema.String>;
    readonly localizedName: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanReference: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly clanLevel: Schema.optionalKey<Schema.Number>;
    readonly badge: Schema.optionalKey<Schema.String>;
    readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
        readonly small: Schema.optionalKey<Schema.String>;
        readonly medium: Schema.optionalKey<Schema.String>;
        readonly large: Schema.String;
    }>>;
}>;
export declare const TagPath: Schema.Struct<{
    readonly tag: Schema.String;
}>;
export declare const ClanTagPath: Schema.Struct<{
    readonly clanTag: Schema.String;
}>;
export declare const PlayerTagPath: Schema.Struct<{
    readonly playerTag: Schema.String;
}>;
export declare const UserPath: Schema.Struct<{
    readonly userId: Schema.String;
}>;
export declare const PaginationQuery: Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly offset: Schema.optionalKey<Schema.Number>;
}>;
export declare const HistoryQuery: Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>;
export declare const ProxyErrorResponse: Schema.Struct<{
    readonly reason: Schema.String;
    readonly message: Schema.String;
}>;
//# sourceMappingURL=expo-common.d.ts.map