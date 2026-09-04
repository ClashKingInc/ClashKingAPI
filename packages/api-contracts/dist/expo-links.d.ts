import { Schema } from "effect";
export declare const LinkedPlayer: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly townHallLevel: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
}>;
export declare const LinkResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>;
export declare const AccountConflictErrorResponse: Schema.Struct<{
    readonly code: Schema.Literal<"conflict">;
    readonly message: Schema.String;
    readonly request_id: Schema.optionalKey<Schema.String>;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>;
export declare const LinkedAccount: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly order_index: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
    readonly added_at: Schema.String;
    readonly verified_at: Schema.optionalKey<Schema.String>;
    readonly last_login: Schema.NullOr<Schema.String>;
}>;
export declare const LinksResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly order_index: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
        readonly added_at: Schema.String;
        readonly verified_at: Schema.optionalKey<Schema.String>;
        readonly last_login: Schema.NullOr<Schema.String>;
    }>>;
}>;
export declare const BookmarkType: Schema.Literals<readonly ["player", "clan"]>;
export declare const Bookmark: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
    readonly tag: Schema.String;
    readonly player_tag: Schema.optionalKey<Schema.String>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly order_index: Schema.Number;
    readonly created_at: Schema.String;
}>;
export declare const BookmarksResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["player", "clan"]>;
        readonly tag: Schema.String;
        readonly player_tag: Schema.optionalKey<Schema.String>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly order_index: Schema.Number;
        readonly created_at: Schema.String;
    }>>;
}>;
export declare const RecentSearchesResponse: Schema.Struct<{
    readonly players: Schema.$Array<Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townHallLevel: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>>;
        }>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.optionalKey<Schema.Number>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly created_at: Schema.String;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
    }>>;
}>;
export declare const UpgradesResponse: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>;
export declare const UpgradePreferencesResponse: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly preferences: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>;
export declare const LinksListEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly order_index: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
        readonly added_at: Schema.String;
        readonly verified_at: Schema.optionalKey<Schema.String>;
        readonly last_login: Schema.NullOr<Schema.String>;
    }>>;
}>, readonly []>;
export declare const LinksAddEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly api_token: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>, readonly [{
    readonly status: 403;
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
}, {
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literal<"conflict">;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly account: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
            readonly is_verified: Schema.Boolean;
            readonly hidden: Schema.Boolean;
        }>;
    }>;
}]>;
export declare const LinksRemoveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const LinksVisibilityEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly hidden: Schema.Boolean;
}>, Schema.Struct<{
    readonly user_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly order_index: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
    readonly added_at: Schema.String;
    readonly verified_at: Schema.optionalKey<Schema.String>;
    readonly last_login: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const LinksOrderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ordered_tags: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const BookmarksListEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["player", "clan"]>;
        readonly tag: Schema.String;
        readonly player_tag: Schema.optionalKey<Schema.String>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly order_index: Schema.Number;
        readonly created_at: Schema.String;
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
export declare const BookmarksAddEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
    readonly tag: Schema.String;
    readonly player_tag: Schema.optionalKey<Schema.String>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly order_index: Schema.Number;
    readonly created_at: Schema.String;
}>, readonly []>;
export declare const BookmarksDeleteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
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
export declare const BookmarksOrderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player", "clan"]>;
    readonly ordered_tags: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const RecentSearchesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly players: Schema.$Array<Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townHallLevel: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>>;
        }>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.optionalKey<Schema.Number>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly created_at: Schema.String;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
    }>>;
}>, readonly []>;
export declare const UpgradesGetEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const UpgradesPutEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly data: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const UpgradePreferencesGetEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly preferences: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const UpgradePreferencesPatchEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly preferences: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly preferences: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly updated_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
//# sourceMappingURL=expo-links.d.ts.map