import { Schema } from "effect";
import { JsonValue } from "./expo-common.js";
export declare const ClanCwlSeasonsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly state: Schema.String;
        readonly warSize: Schema.NullOr<Schema.Number>;
        readonly warLeague: Schema.NullOr<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly rank: Schema.NullOr<Schema.Number>;
        readonly stars: Schema.NullOr<Schema.Number>;
        readonly destruction: Schema.NullOr<Schema.Number>;
        readonly rounds: Schema.NullOr<Schema.Struct<{
            readonly won: Schema.Number;
            readonly tied: Schema.Number;
            readonly lost: Schema.Number;
        }>>;
    }>>;
}>;
export declare const ClanLeaderboardHistoryResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly rank: Schema.Number;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly capitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.Number;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ClanLeaderboardSummaryResponse: Schema.Struct<{
    readonly seasons: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly after: Schema.String;
        readonly before: Schema.String;
        readonly daysInTop200: Schema.Number;
        readonly bestRank: Schema.Number;
        readonly peakPoints: Schema.Number;
    }>>;
}>;
export declare const ClanLegendHistoryResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
    }>>;
}>;
export declare const ClanLegendSummaryResponse: Schema.Struct<{
    readonly seasons: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly after: Schema.String;
        readonly before: Schema.String;
        readonly playerCount: Schema.Number;
    }>>;
    readonly topFinishes: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
    }>>;
}>;
export declare const ClanRecordsResponse: Schema.Struct<{
    readonly clanPoints: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
    }>>;
    readonly warWinStreak: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
    }>>;
}>;
export declare const ClanChangesResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly type: Schema.String;
        readonly previous: Schema.Codec<JsonValue, JsonValue, never, never>;
        readonly current: Schema.Codec<JsonValue, JsonValue, never, never>;
    }>>;
}>;
export declare const ClanWarlogResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly result: Schema.Literals<readonly ["win", "lose", "tie"]>;
        readonly type: Schema.Literals<readonly ["cwl", "random", "friendly"]>;
        readonly endTime: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.Number;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
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
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
    }>>;
}>;
export declare const ClanWarsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly state: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
        readonly battleModifier: Schema.optionalKey<Schema.String>;
        readonly preparationStartTime: Schema.String;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.String;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>>;
                readonly opponentAttacks: Schema.optionalKey<Schema.Number>;
                readonly bestOpponentAttack: Schema.optionalKey<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>;
            }>>;
        }>;
        readonly opponent: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>>;
                readonly opponentAttacks: Schema.optionalKey<Schema.Number>;
                readonly bestOpponentAttack: Schema.optionalKey<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>;
            }>>;
        }>;
        readonly warStartTime: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const ClanJoinLeaveResponse: Schema.Struct<{
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
export declare const ClanCwlSeasonsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly state: Schema.String;
        readonly warSize: Schema.NullOr<Schema.Number>;
        readonly warLeague: Schema.NullOr<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly rank: Schema.NullOr<Schema.Number>;
        readonly stars: Schema.NullOr<Schema.Number>;
        readonly destruction: Schema.NullOr<Schema.Number>;
        readonly rounds: Schema.NullOr<Schema.Struct<{
            readonly won: Schema.Number;
            readonly tied: Schema.Number;
            readonly lost: Schema.Number;
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
export declare const ClanLeaderboardHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly rank: Schema.Number;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly capitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.Number;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
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
export declare const ClanLeaderboardSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly seasons: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly after: Schema.String;
        readonly before: Schema.String;
        readonly daysInTop200: Schema.Number;
        readonly bestRank: Schema.Number;
        readonly peakPoints: Schema.Number;
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
export declare const ClanLegendHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
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
export declare const ClanLegendSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly top: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly seasons: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly after: Schema.String;
        readonly before: Schema.String;
        readonly playerCount: Schema.Number;
    }>>;
    readonly topFinishes: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
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
export declare const ClanRecordsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clanPoints: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
    }>>;
    readonly warWinStreak: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
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
export declare const ClanChangesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly type: Schema.String;
        readonly previous: Schema.Codec<JsonValue, JsonValue, never, never>;
        readonly current: Schema.Codec<JsonValue, JsonValue, never, never>;
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
export declare const ClanWarlogEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly result: Schema.Literals<readonly ["win", "lose", "tie"]>;
        readonly type: Schema.Literals<readonly ["cwl", "random", "friendly"]>;
        readonly endTime: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.Number;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
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
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
    }>>;
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
}]>;
export declare const ClanWarsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly state: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
        readonly battleModifier: Schema.optionalKey<Schema.String>;
        readonly preparationStartTime: Schema.String;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.String;
        readonly clan: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>>;
                readonly opponentAttacks: Schema.optionalKey<Schema.Number>;
                readonly bestOpponentAttack: Schema.optionalKey<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>;
            }>>;
        }>;
        readonly opponent: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>>;
                readonly opponentAttacks: Schema.optionalKey<Schema.Number>;
                readonly bestOpponentAttack: Schema.optionalKey<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                }>>;
            }>>;
        }>;
        readonly warStartTime: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.optionalKey<Schema.String>;
    }>>;
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
}]>;
export declare const ClanJoinLeaveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
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
//# sourceMappingURL=expo-clan.d.ts.map