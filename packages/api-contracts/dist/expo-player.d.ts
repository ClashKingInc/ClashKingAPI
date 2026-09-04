import { Schema } from "effect";
import { JsonValue } from "./expo-common.js";
export declare const SearchLeagueReference: Schema.Struct<{
    readonly id: Schema.Number;
    readonly name: Schema.String;
}>;
export declare const SearchPlayerClan: Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly tag: Schema.String;
    readonly badge: Schema.optionalKey<Schema.String>;
    readonly clanLevel: Schema.optionalKey<Schema.Number>;
}>;
export declare const SearchPlayerResult: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly townHallLevel: Schema.Number;
    readonly leagueTier: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly clan: Schema.optionalKey<Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly badge: Schema.optionalKey<Schema.String>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
    }>>;
}>;
export declare const SearchPlayerResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.optionalKey<Schema.String>;
            readonly tag: Schema.String;
            readonly badge: Schema.optionalKey<Schema.String>;
            readonly clanLevel: Schema.optionalKey<Schema.Number>;
        }>>;
    }>>;
    readonly pagination: Schema.Struct<{
        readonly limit: Schema.Number;
        readonly hasMore: Schema.Boolean;
        readonly nextCursor: Schema.NullOr<Schema.String>;
    }>;
}>;
export declare const BattlelogEntry: Schema.Struct<{
    readonly battle_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.String;
    readonly player_townhall: Schema.Number;
    readonly opponent_tag: Schema.String;
    readonly opponent_name: Schema.String;
    readonly opponent_townhall: Schema.Number;
    readonly battle_type: Schema.String;
    readonly attack: Schema.Boolean;
    readonly stars: Schema.Number;
    readonly destruction_percentage: Schema.Number;
    readonly gold: Schema.Number;
    readonly elixir: Schema.Number;
    readonly dark_elixir: Schema.Number;
    readonly timestamp: Schema.String;
    readonly army_items: Schema.$Array<Schema.String>;
    readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
    readonly duration: Schema.Number;
    readonly army_share_code: Schema.String;
}>;
export declare const PlayerBattlelogHistoryResponse: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly battle_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly player_townhall: Schema.Number;
        readonly opponent_tag: Schema.String;
        readonly opponent_name: Schema.String;
        readonly opponent_townhall: Schema.Number;
        readonly battle_type: Schema.String;
        readonly attack: Schema.Boolean;
        readonly stars: Schema.Number;
        readonly destruction_percentage: Schema.Number;
        readonly gold: Schema.Number;
        readonly elixir: Schema.Number;
        readonly dark_elixir: Schema.Number;
        readonly timestamp: Schema.String;
        readonly army_items: Schema.$Array<Schema.String>;
        readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
        readonly duration: Schema.Number;
        readonly army_share_code: Schema.String;
    }>>;
    readonly count: Schema.Number;
    readonly limit: Schema.Number;
    readonly time: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
}>;
export declare const PlayerChangeRecord: Schema.Struct<{
    readonly time: Schema.String;
    readonly townhall_level: Schema.NullOr<Schema.Number>;
    readonly type: Schema.String;
    readonly item: Schema.optionalKey<Schema.Struct<{
        readonly name: Schema.String;
        readonly id: Schema.Number;
    }>>;
    readonly previous: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
    readonly current: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
}>;
export declare const PlayerChangesResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly townhall_level: Schema.NullOr<Schema.Number>;
        readonly type: Schema.String;
        readonly item: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly id: Schema.Number;
        }>>;
        readonly previous: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
        readonly current: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
    }>>;
}>;
export declare const PlayerCwlHistoryResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly teamSize: Schema.NullOr<Schema.Number>;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly warLeague: Schema.NullOr<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
            }>>;
            readonly wars: Schema.NullOr<Schema.Struct<{
                readonly won: Schema.Number;
                readonly lost: Schema.Number;
                readonly tied: Schema.Number;
            }>>;
            readonly totalStars: Schema.NullOr<Schema.Number>;
            readonly placement: Schema.NullOr<Schema.Struct<{
                readonly group: Schema.NullOr<Schema.Number>;
                readonly global: Schema.NullOr<Schema.Number>;
            }>>;
        }>;
        readonly attacks: Schema.$Array<Schema.Struct<{
            readonly warTag: Schema.String;
            readonly round: Schema.Number;
            readonly opponent: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
            }>;
            readonly defender: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townHallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
        }>>;
        readonly placement: Schema.NullOr<Schema.Struct<{
            readonly clan: Schema.Number;
            readonly group: Schema.Number;
        }>>;
        readonly missedAttacks: Schema.Number;
    }>>;
}>;
export declare const PlayerTimersResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["war", "cwl", "capital"]>;
        readonly expiresAt: Schema.String;
        readonly warTag: Schema.optionalKey<Schema.String>;
        readonly clans: Schema.$Array<Schema.String>;
    }>>;
}>;
export declare const PlayerJoinLeaveResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly type: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly townHallLevel: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>>;
    }>>;
    readonly available: Schema.Number;
    readonly uniquePlayers: Schema.optionalKey<Schema.Number>;
}>;
export declare const PlayerJoinLeaveTotalsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly clan: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>;
        readonly visits: Schema.Number;
        readonly minutes: Schema.Number;
    }>>;
}>;
export declare const PlayerWarStatsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.Number;
        readonly preparationStartTime: Schema.String;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.String;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly opponent: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly type: Schema.String;
        readonly player: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
        }>;
        readonly attacks: Schema.$Array<Schema.Struct<{
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly player: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
        }>>;
        readonly defenses: Schema.$Array<Schema.Struct<{
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly player: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
        }>>;
    }>>;
}>;
export declare const PlayerSearchEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly query: Schema.String;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly cursor: Schema.optionalKey<Schema.String>;
    readonly clanTags: Schema.optionalKey<Schema.String>;
    readonly leagueIds: Schema.optionalKey<Schema.String>;
    readonly townhallLevels: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.optionalKey<Schema.String>;
            readonly tag: Schema.String;
            readonly badge: Schema.optionalKey<Schema.String>;
            readonly clanLevel: Schema.optionalKey<Schema.Number>;
        }>>;
    }>>;
    readonly pagination: Schema.Struct<{
        readonly limit: Schema.Number;
        readonly hasMore: Schema.Boolean;
        readonly nextCursor: Schema.NullOr<Schema.String>;
    }>;
}>, readonly []>;
export declare const PlayerBattlelogHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly days: Schema.optionalKey<Schema.Number>;
    readonly start: Schema.optionalKey<Schema.String>;
    readonly end: Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.String>;
    readonly attack: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly battle_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly player_townhall: Schema.Number;
        readonly opponent_tag: Schema.String;
        readonly opponent_name: Schema.String;
        readonly opponent_townhall: Schema.Number;
        readonly battle_type: Schema.String;
        readonly attack: Schema.Boolean;
        readonly stars: Schema.Number;
        readonly destruction_percentage: Schema.Number;
        readonly gold: Schema.Number;
        readonly elixir: Schema.Number;
        readonly dark_elixir: Schema.Number;
        readonly timestamp: Schema.String;
        readonly army_items: Schema.$Array<Schema.String>;
        readonly army_counts: Schema.$Record<Schema.String, Schema.Number>;
        readonly duration: Schema.Number;
        readonly army_share_code: Schema.String;
    }>>;
    readonly count: Schema.Number;
    readonly limit: Schema.Number;
    readonly time: Schema.Struct<{
        readonly start: Schema.String;
        readonly end: Schema.String;
    }>;
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
export declare const PlayerChangesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly townhall_level: Schema.NullOr<Schema.Number>;
        readonly type: Schema.String;
        readonly item: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly id: Schema.Number;
        }>>;
        readonly previous: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
        readonly current: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
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
export declare const PlayerCwlHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly teamSize: Schema.NullOr<Schema.Number>;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly warLeague: Schema.NullOr<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
            }>>;
            readonly wars: Schema.NullOr<Schema.Struct<{
                readonly won: Schema.Number;
                readonly lost: Schema.Number;
                readonly tied: Schema.Number;
            }>>;
            readonly totalStars: Schema.NullOr<Schema.Number>;
            readonly placement: Schema.NullOr<Schema.Struct<{
                readonly group: Schema.NullOr<Schema.Number>;
                readonly global: Schema.NullOr<Schema.Number>;
            }>>;
        }>;
        readonly attacks: Schema.$Array<Schema.Struct<{
            readonly warTag: Schema.String;
            readonly round: Schema.Number;
            readonly opponent: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
            }>;
            readonly defender: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townHallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
        }>>;
        readonly placement: Schema.NullOr<Schema.Struct<{
            readonly clan: Schema.Number;
            readonly group: Schema.Number;
        }>>;
        readonly missedAttacks: Schema.Number;
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
export declare const PlayerTimersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["war", "cwl", "capital"]>;
        readonly expiresAt: Schema.String;
        readonly warTag: Schema.optionalKey<Schema.String>;
        readonly clans: Schema.$Array<Schema.String>;
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
export declare const PlayerJoinLeaveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly type: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly townHallLevel: Schema.optionalKey<Schema.Number>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>>;
    }>>;
    readonly available: Schema.Number;
    readonly uniquePlayers: Schema.optionalKey<Schema.Number>;
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
export declare const PlayerJoinLeaveTotalsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly clan: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>;
        readonly visits: Schema.Number;
        readonly minutes: Schema.Number;
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
export declare const PlayerWarStatsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.Number;
        readonly preparationStartTime: Schema.String;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.String;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly opponent: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly medium: Schema.String;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly type: Schema.String;
        readonly player: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
        }>;
        readonly attacks: Schema.$Array<Schema.Struct<{
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly player: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
        }>>;
        readonly defenses: Schema.$Array<Schema.Struct<{
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly player: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
            }>;
        }>>;
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
//# sourceMappingURL=expo-player.d.ts.map