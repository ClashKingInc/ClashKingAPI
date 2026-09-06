export { StoredCwlGroupEndpoint, StoredCwlGroupResponse } from "./stored-cwl.js";
export * from "./expo-auth.js";
export * from "./expo-clan.js";
export * from "./expo-content.js";
export * from "./expo-exports.js";
export * from "./expo-links.js";
export * from "./expo-notifications.js";
export * from "./expo-player.js";
export * from "./expo-rankings.js";
export * from "./expo-stats.js";
export * from "./expo-war.js";
export * from "./proxy.js";
export { AppConfigEndpoint, AppConfigResponse } from "./app-config.js";
export type { AnyEndpoint, EndpointRequest, EndpointResponse } from "./endpoint.js";
export { StatsArmiesEndpoint, StatsArmiesRequest, StatsCwlEndpoint, StatsCwlRequest, StatsItemsEndpoint, StatsItemsRequest, StatsRankedEndpoint, StatsRankedRequest, StatsWarEndpoint, StatsWarRequest } from "./stats.js";
export declare const expoEndpoints: {
    readonly storedCwlGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly season: import("effect/Schema").String;
        readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
        }>>;
        readonly clans: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clanLevel: import("effect/Schema").Number;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").String;
                readonly large: import("effect/Schema").String;
                readonly medium: import("effect/Schema").String;
            }>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townHallLevel: import("effect/Schema").Number;
            }>>;
        }>>;
        readonly rounds: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly warTags: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly state: import("effect/Schema").String;
                readonly teamSize: import("effect/Schema").Number;
                readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly preparationStartTime: import("effect/Schema").String;
                readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly endTime: import("effect/Schema").String;
                readonly clan: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").String;
                        readonly large: import("effect/Schema").String;
                        readonly medium: import("effect/Schema").String;
                    }>;
                    readonly clanLevel: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly tag: import("effect/Schema").String;
                        readonly name: import("effect/Schema").String;
                        readonly townhallLevel: import("effect/Schema").Number;
                        readonly mapPosition: import("effect/Schema").Number;
                        readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>>;
                        readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>;
                    }>>;
                }>;
                readonly opponent: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").String;
                        readonly large: import("effect/Schema").String;
                        readonly medium: import("effect/Schema").String;
                    }>;
                    readonly clanLevel: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly tag: import("effect/Schema").String;
                        readonly name: import("effect/Schema").String;
                        readonly townhallLevel: import("effect/Schema").Number;
                        readonly mapPosition: import("effect/Schema").Number;
                        readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>>;
                        readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>;
                    }>>;
                }>;
                readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly season: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
            }>]>>;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly appConfig: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly flags: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly key: import("effect/Schema").String;
            readonly enabled: import("effect/Schema").Boolean;
            readonly rollout_percentage: import("effect/Schema").Number;
            readonly min_app_version: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly platforms: import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["android", "ios", "web"]>>;
            readonly starts_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ends_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly updates: import("effect/Schema").Struct<{
            readonly ios: import("effect/Schema").Struct<{
                readonly minimum_version: import("effect/Schema").String;
                readonly store_url: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>;
            readonly android: import("effect/Schema").Struct<{
                readonly minimum_version: import("effect/Schema").String;
                readonly store_url: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>;
            readonly web: import("effect/Schema").Null;
        }>;
        readonly generated_at: import("effect/Schema").String;
    }>, readonly []>;
    readonly authMe: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").String;
        readonly username: import("effect/Schema").String;
        readonly avatar_url: import("effect/Schema").String;
        readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly account_summary: import("effect/Schema").Struct<{
            readonly follower_count: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly authDiscord: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly code: import("effect/Schema").String;
        readonly redirect_uri: import("effect/Schema").String;
        readonly code_verifier: import("effect/Schema").String;
        readonly device_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly refresh_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authWebDiscord: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly code: import("effect/Schema").String;
        readonly redirect_uri: import("effect/Schema").String;
        readonly code_verifier: import("effect/Schema").String;
        readonly device_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authEmail: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly device_name: import("effect/Schema").String;
        readonly email: import("effect/Schema").String;
        readonly password: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly refresh_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authWebEmail: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly device_name: import("effect/Schema").String;
        readonly email: import("effect/Schema").String;
        readonly password: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authRegister: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly device_name: import("effect/Schema").String;
        readonly email: import("effect/Schema").String;
        readonly password: import("effect/Schema").String;
        readonly username: import("effect/Schema").String;
        readonly locale: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly verification_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authVerifyEmail: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly email: import("effect/Schema").String;
        readonly code: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly refresh_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authWebVerifyEmail: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly email: import("effect/Schema").String;
        readonly code: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authResendVerification: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly email: import("effect/Schema").String;
        readonly locale: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly verification_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 410;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authForgotPassword: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly email: import("effect/Schema").String;
        readonly locale: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly reset_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly authResetPassword: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly device_name: import("effect/Schema").String;
        readonly email: import("effect/Schema").String;
        readonly reset_code: import("effect/Schema").String;
        readonly new_password: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly refresh_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authWebResetPassword: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly device_name: import("effect/Schema").String;
        readonly email: import("effect/Schema").String;
        readonly reset_code: import("effect/Schema").String;
        readonly new_password: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly user: import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly auth_methods: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly is_admin: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authRefresh: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly refresh_token: import("effect/Schema").String;
        readonly device_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
        readonly refresh_token: import("effect/Schema").String;
    }>, readonly []>;
    readonly authWebRefresh: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly access_token: import("effect/Schema").String;
    }>, readonly []>;
    readonly authExport: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly account: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        readonly player_links: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly bookmarks: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly recent_searches: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly legacy_search_settings: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly discord_sessions: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly notification_accounts: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly notification_devices: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly billing_subscription: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
        readonly subscription_entitlements: import("effect/Schema").$Array<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly authDelete: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly ok: import("effect/Schema").Boolean;
        readonly message: import("effect/Schema").String;
        readonly deleted: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
    }>, readonly []>;
    readonly authWebLogout: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Void, readonly []>;
    readonly linksList: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly player_tag: import("effect/Schema").String;
            readonly order_index: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
            readonly added_at: import("effect/Schema").String;
            readonly verified_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_login: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly linksAdd: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly api_token: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly account: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
        }>;
    }>, readonly [{
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literal<"conflict">;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly account: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townHallLevel: import("effect/Schema").Number;
                readonly is_verified: import("effect/Schema").Boolean;
                readonly hidden: import("effect/Schema").Boolean;
            }>;
        }>;
    }]>;
    readonly linksRemove: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly linksVisibility: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly hidden: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly order_index: import("effect/Schema").Number;
        readonly is_verified: import("effect/Schema").Boolean;
        readonly hidden: import("effect/Schema").Boolean;
        readonly added_at: import("effect/Schema").String;
        readonly verified_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly last_login: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly linksOrder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly ordered_tags: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly bookmarksList: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
            readonly tag: import("effect/Schema").String;
            readonly player_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly order_index: import("effect/Schema").Number;
            readonly created_at: import("effect/Schema").String;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly bookmarksAdd: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
        readonly tag: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly order_index: import("effect/Schema").Number;
        readonly created_at: import("effect/Schema").String;
    }>, readonly []>;
    readonly bookmarksDelete: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly bookmarksOrder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literals<readonly ["player", "clan"]>;
        readonly ordered_tags: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly recentSearches: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly players: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly created_at: import("effect/Schema").String;
        }>>;
        readonly clans: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly created_at: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly upgradesGet: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly data: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        readonly updated_at: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly upgradesPut: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly data: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    }>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly data: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        readonly updated_at: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly upgradePreferencesGet: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly preferences: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        readonly updated_at: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly upgradePreferencesPatch: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly preferences: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    }>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly preferences: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        readonly updated_at: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly playerSearch: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly query: import("effect/Schema").String;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly cursor: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clanTags: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly leagueIds: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly townhallLevels: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tag: import("effect/Schema").String;
                readonly badge: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            }>>;
        }>>;
        readonly pagination: import("effect/Schema").Struct<{
            readonly limit: import("effect/Schema").Number;
            readonly hasMore: import("effect/Schema").Boolean;
            readonly nextCursor: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>;
    }>, readonly []>;
    readonly playerBattlelogHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly start: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly end: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly attack: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly battle_id: import("effect/Schema").String;
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly player_townhall: import("effect/Schema").Number;
            readonly opponent_tag: import("effect/Schema").String;
            readonly opponent_name: import("effect/Schema").String;
            readonly opponent_townhall: import("effect/Schema").Number;
            readonly battle_type: import("effect/Schema").String;
            readonly attack: import("effect/Schema").Boolean;
            readonly stars: import("effect/Schema").Number;
            readonly destruction_percentage: import("effect/Schema").Number;
            readonly gold: import("effect/Schema").Number;
            readonly elixir: import("effect/Schema").Number;
            readonly dark_elixir: import("effect/Schema").Number;
            readonly timestamp: import("effect/Schema").String;
            readonly army_items: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly army_counts: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
            readonly duration: import("effect/Schema").Number;
            readonly army_share_code: import("effect/Schema").String;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly limit: import("effect/Schema").Number;
        readonly time: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerChanges: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly type: import("effect/Schema").String;
            readonly item: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly id: import("effect/Schema").Number;
            }>>;
            readonly previous: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
            readonly current: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerCwlHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly teamSize: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                }>>;
                readonly wars: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly won: import("effect/Schema").Number;
                    readonly lost: import("effect/Schema").Number;
                    readonly tied: import("effect/Schema").Number;
                }>>;
                readonly totalStars: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                readonly placement: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly group: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                    readonly global: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                }>>;
            }>;
            readonly attacks: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly warTag: import("effect/Schema").String;
                readonly round: import("effect/Schema").Number;
                readonly opponent: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                }>;
                readonly defender: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townHallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
            }>>;
            readonly placement: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly clan: import("effect/Schema").Number;
                readonly group: import("effect/Schema").Number;
            }>>;
            readonly missedAttacks: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerTimers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly type: import("effect/Schema").Literals<readonly ["war", "cwl", "capital"]>;
            readonly expiresAt: import("effect/Schema").String;
            readonly warTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clans: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerJoinLeave: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
            }>>;
        }>>;
        readonly available: import("effect/Schema").Number;
        readonly uniquePlayers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerJoinLeaveTotals: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan: import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
            }>;
            readonly visits: import("effect/Schema").Number;
            readonly minutes: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerWarStats: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").Number;
            readonly preparationStartTime: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly endTime: import("effect/Schema").String;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly type: import("effect/Schema").String;
            readonly player: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
            }>;
            readonly attacks: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
                readonly fresh: import("effect/Schema").Boolean;
                readonly player: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
            }>>;
            readonly defenses: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
                readonly fresh: import("effect/Schema").Boolean;
                readonly player: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanCwlSeasons: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly state: import("effect/Schema").String;
            readonly warSize: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
            }>>;
            readonly rank: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly stars: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly destruction: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly rounds: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly won: import("effect/Schema").Number;
                readonly tied: import("effect/Schema").Number;
                readonly lost: import("effect/Schema").Number;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanLeaderboardHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly date: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").Number;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly localizedName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanLeaderboardSummary: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly seasons: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly after: import("effect/Schema").String;
            readonly before: import("effect/Schema").String;
            readonly daysInTop200: import("effect/Schema").Number;
            readonly bestRank: import("effect/Schema").Number;
            readonly peakPoints: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanLegendHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanLegendSummary: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly top: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly seasons: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly after: import("effect/Schema").String;
            readonly before: import("effect/Schema").String;
            readonly playerCount: import("effect/Schema").Number;
        }>>;
        readonly topFinishes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanRecords: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly time: import("effect/Schema").String;
        }>>;
        readonly warWinStreak: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly time: import("effect/Schema").String;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanChanges: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly previous: import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>;
            readonly current: import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanWarlog: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly result: import("effect/Schema").Literals<readonly ["win", "lose", "tie"]>;
            readonly type: import("effect/Schema").Literals<readonly ["cwl", "random", "friendly"]>;
            readonly endTime: import("effect/Schema").String;
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").Number;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanWars: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly state: import("effect/Schema").String;
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly preparationStartTime: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly endTime: import("effect/Schema").String;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>>;
                    readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>;
                }>>;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>>;
                    readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>;
                }>>;
            }>;
            readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly clanJoinLeave: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
            }>>;
        }>>;
        readonly available: import("effect/Schema").Number;
        readonly uniquePlayers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly warBasic: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").NullOr<import("effect/Schema").Struct<{
        readonly clan: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly publicWarLog: import("effect/Schema").NullOr<import("effect/Schema").Boolean>;
        }>;
        readonly opponent: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly publicWarLog: import("effect/Schema").NullOr<import("effect/Schema").Boolean>;
        }>;
        readonly preparationStartTime: import("effect/Schema").String;
        readonly endTime: import("effect/Schema").String;
        readonly type: import("effect/Schema").String;
        readonly warTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>>, readonly []>;
    readonly warPrevious: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
        readonly endTime: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly teamSize: import("effect/Schema").Number;
        readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly preparationStartTime: import("effect/Schema").String;
        readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly endTime: import("effect/Schema").String;
        readonly clan: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").String;
                readonly large: import("effect/Schema").String;
                readonly medium: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>;
        readonly opponent: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").String;
                readonly large: import("effect/Schema").String;
                readonly medium: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>;
        readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly leaderboardHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly leaderboardType: import("effect/Schema").String;
        readonly locationId: import("effect/Schema").String;
        readonly date: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literals<readonly ["player_home_trophies", "player_builder_base_trophies", "clan_home_points", "clan_builder_base_points", "clan_capital_points"]>;
        readonly locationId: import("effect/Schema").String;
        readonly date: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseBattleWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly localizedName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly leaderboardTownhalls: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly townhallLevel: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly townhall_level: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly generated_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly leaderboardLeague: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly leagueTierId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly townhall_level: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly generated_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly leaderboardClanDonations: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly leaderboardClanWarWins: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly leaderboardClanWinStreak: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly notificationDeviceRegister: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly token: import("effect/Schema").String;
        readonly device_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly provider: import("effect/Schema").optionalKey<import("effect/Schema").Literal<"fcm">>;
        readonly platform: import("effect/Schema").Literals<readonly ["ios", "android"]>;
        readonly environment: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["sandbox", "production"]>>;
        readonly app_version: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly locale: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly authorization_status: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["authorized", "provisional", "denied", "not_determined"]>>;
    }>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly provider: import("effect/Schema").String;
        readonly platform: import("effect/Schema").String;
        readonly environment: import("effect/Schema").String;
        readonly authorization_status: import("effect/Schema").String;
        readonly enabled: import("effect/Schema").Boolean;
        readonly last_seen_at: import("effect/Schema").String;
    }>, readonly []>;
    readonly notificationDeviceDelete: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly environment: import("effect/Schema").Literals<readonly ["sandbox", "production"]>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly notificationPreferencesGet: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly device_id: import("effect/Schema").String;
        readonly environment: import("effect/Schema").Literals<readonly ["sandbox", "production"]>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly notificationsEnabled: import("effect/Schema").Boolean;
        readonly warAttacksEnabled: import("effect/Schema").Boolean;
        readonly warStateEnabled: import("effect/Schema").Boolean;
        readonly warRemindersEnabled: import("effect/Schema").Boolean;
        readonly raidRemindersEnabled: import("effect/Schema").Boolean;
        readonly eventsEnabled: import("effect/Schema").Boolean;
        readonly announcementsEnabled: import("effect/Schema").Boolean;
        readonly monthlySupportEnabled: import("effect/Schema").Boolean;
        readonly reminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
        readonly raidReminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
        readonly deviceId: import("effect/Schema").String;
        readonly environment: import("effect/Schema").String;
        readonly accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly source: import("effect/Schema").Literal<"verified">;
            readonly active: import("effect/Schema").Boolean;
        }>>;
    }>, readonly []>;
    readonly notificationPreferencesPut: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly deviceId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly environment: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["sandbox", "production"]>>;
        readonly notificationsEnabled: import("effect/Schema").Boolean;
        readonly warAttacksEnabled: import("effect/Schema").Boolean;
        readonly warStateEnabled: import("effect/Schema").Boolean;
        readonly warRemindersEnabled: import("effect/Schema").Boolean;
        readonly raidRemindersEnabled: import("effect/Schema").Boolean;
        readonly eventsEnabled: import("effect/Schema").Boolean;
        readonly announcementsEnabled: import("effect/Schema").Boolean;
        readonly monthlySupportEnabled: import("effect/Schema").Boolean;
        readonly reminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
        readonly raidReminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly notificationsEnabled: import("effect/Schema").Boolean;
        readonly warAttacksEnabled: import("effect/Schema").Boolean;
        readonly warStateEnabled: import("effect/Schema").Boolean;
        readonly warRemindersEnabled: import("effect/Schema").Boolean;
        readonly raidRemindersEnabled: import("effect/Schema").Boolean;
        readonly eventsEnabled: import("effect/Schema").Boolean;
        readonly announcementsEnabled: import("effect/Schema").Boolean;
        readonly monthlySupportEnabled: import("effect/Schema").Boolean;
        readonly reminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
        readonly raidReminderTimings: import("effect/Schema").$Array<import("effect/Schema").Number>;
        readonly deviceId: import("effect/Schema").String;
        readonly environment: import("effect/Schema").String;
        readonly accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly source: import("effect/Schema").Literal<"verified">;
            readonly active: import("effect/Schema").Boolean;
        }>>;
    }>, readonly []>;
    readonly notificationAccountPut: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly enabled: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
        readonly source: import("effect/Schema").Literal<"verified">;
        readonly active: import("effect/Schema").Boolean;
    }>, readonly []>;
    readonly achievementsCheck: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly asset_url: import("effect/Schema").String;
            readonly repeatable: import("effect/Schema").Boolean;
            readonly earned_count: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly appUpdateManifest: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Union<readonly [import("effect/Schema").instanceOf<Response, unknown>, import("effect/Schema").Void]>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly activeAnnouncements: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly target: import("effect/Schema").Literals<readonly ["ios", "android", "all"]>;
        readonly locale: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly item: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly version: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly subtitle: import("effect/Schema").String;
            readonly banner_image_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly body_blocks: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"heading">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"paragraph">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"bullet_list">;
                readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"image">;
                readonly url: import("effect/Schema").String;
                readonly caption: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>]>>;
            readonly presentation_type: import("effect/Schema").Literals<readonly ["article", "story"]>;
            readonly story_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly show_on_home: import("effect/Schema").Boolean;
            readonly pinned_on_home: import("effect/Schema").Boolean;
            readonly target_route: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["live", "expired"]>;
            readonly published_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly starts_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ends_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly version: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly subtitle: import("effect/Schema").String;
            readonly banner_image_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly body_blocks: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"heading">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"paragraph">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"bullet_list">;
                readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"image">;
                readonly url: import("effect/Schema").String;
                readonly caption: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>]>>;
            readonly presentation_type: import("effect/Schema").Literals<readonly ["article", "story"]>;
            readonly story_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly show_on_home: import("effect/Schema").Boolean;
            readonly pinned_on_home: import("effect/Schema").Boolean;
            readonly target_route: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["live", "expired"]>;
            readonly published_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly starts_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ends_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly announcement: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly announcementId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly locale: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly item: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly version: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly subtitle: import("effect/Schema").String;
            readonly banner_image_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly body_blocks: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"heading">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"paragraph">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"bullet_list">;
                readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"image">;
                readonly url: import("effect/Schema").String;
                readonly caption: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>]>>;
            readonly presentation_type: import("effect/Schema").Literals<readonly ["article", "story"]>;
            readonly story_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly show_on_home: import("effect/Schema").Boolean;
            readonly pinned_on_home: import("effect/Schema").Boolean;
            readonly target_route: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["live", "expired"]>;
            readonly published_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly starts_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ends_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
    }>, readonly [{
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly posts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly target: import("effect/Schema").Literals<readonly ["ios", "android", "all"]>;
        readonly limit: import("effect/Schema").Number;
        readonly offset: import("effect/Schema").Number;
        readonly locale: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly version: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly subtitle: import("effect/Schema").String;
            readonly banner_image_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly body_blocks: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"heading">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"paragraph">;
                readonly text: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"bullet_list">;
                readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>, import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").Literal<"image">;
                readonly url: import("effect/Schema").String;
                readonly caption: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>]>>;
            readonly presentation_type: import("effect/Schema").Literals<readonly ["article", "story"]>;
            readonly story_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly show_on_home: import("effect/Schema").Boolean;
            readonly pinned_on_home: import("effect/Schema").Boolean;
            readonly target_route: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["live", "expired"]>;
            readonly published_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly starts_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ends_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly has_more: import("effect/Schema").Boolean;
        readonly next_offset: import("effect/Schema").Number;
    }>, readonly []>;
    readonly billingSubscription: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly provider: import("effect/Schema").String;
        readonly status: import("effect/Schema").String;
        readonly active: import("effect/Schema").Boolean;
        readonly checkoutEnabled: import("effect/Schema").Boolean;
        readonly bookmarkNotificationsLimit: import("effect/Schema").Number;
        readonly rosterAssistantMonthlyCreditUsd: import("effect/Schema").Number;
        readonly assignedServerId: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly rosterAssistantSpentUsd: import("effect/Schema").Number;
        readonly rosterAssistantRemainingUsd: import("effect/Schema").Number;
    }>, readonly []>;
    readonly cwlSummaryExport: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").instanceOf<Response, Response>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly playerWarStatsExport: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly timestamp_start: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly timestamp_end: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Int>;
    }>, import("effect/Schema").instanceOf<Response, Response>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly statsOverview: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly counts: import("effect/Schema").Struct<{
            readonly players_in_war: import("effect/Schema").Number;
            readonly clans_in_war: import("effect/Schema").Number;
            readonly total_join_leaves: import("effect/Schema").Number;
            readonly players_in_legends: import("effect/Schema").Number;
            readonly player_count: import("effect/Schema").Number;
            readonly clan_count: import("effect/Schema").Number;
            readonly wars_stored: import("effect/Schema").Number;
        }>;
        readonly ranked: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
        readonly war: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
        readonly cwl: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
    }>, readonly []>;
    readonly globalCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly players_in_war: import("effect/Schema").Number;
        readonly clans_in_war: import("effect/Schema").Number;
        readonly total_join_leaves: import("effect/Schema").Number;
        readonly players_in_legends: import("effect/Schema").Number;
        readonly player_count: import("effect/Schema").Number;
        readonly clan_count: import("effect/Schema").Number;
        readonly wars_stored: import("effect/Schema").Number;
    }>, readonly []>;
    readonly playerTownhallCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly count: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly playerBuilderhallCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Never, readonly [{
        readonly status: 501;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literal<"not_implemented">;
            readonly message: import("effect/Schema").Literal<"Builder Hall counts are not implemented">;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
    }]>;
    readonly playerLeagueTierCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly count: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanLocationCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly count: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly cwlLeagueCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly count: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanCapitalLeagueCounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly count: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly statsArmies: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly dates: import("effect/Schema").Struct<{
            readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly opponent_townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly equal_townhalls: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly ranked_league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly include_items: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly item: import("effect/Schema").String;
            readonly min_quantity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_quantity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>>;
        readonly exclude_items: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly minimum_sample_size: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly sort_by: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["usage_rate", "three_star_rate", "average_stars", "average_destruction"]>>;
    }>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
            readonly army_share_code: import("effect/Schema").String;
            readonly army_items: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly army_counts: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 415;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly statsItems: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly dates: import("effect/Schema").Struct<{
            readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly opponent_townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly equal_townhalls: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly ranked_league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly include_items: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly item: import("effect/Schema").String;
            readonly min_quantity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_quantity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>>;
        readonly exclude_items: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly minimum_sample_size: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly item: import("effect/Schema").String;
            readonly type: import("effect/Schema").Literals<readonly ["troop", "spell", "hero", "pet", "equipment"]>;
            readonly hero: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
            readonly item: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly hero: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly use_count: import("effect/Schema").Number;
            readonly hit_rate: import("effect/Schema").Number;
            readonly composition_share: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 415;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly statsRanked: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly dates: import("effect/Schema").Struct<{
            readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
        readonly townhall_level: import("effect/Schema").Number;
        readonly ranked_league_tier_id: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly metrics: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
        readonly breakdowns: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly key: import("effect/Schema").String;
            readonly metrics: import("effect/Schema").Struct<{
                readonly available: import("effect/Schema").Boolean;
                readonly sample_size: import("effect/Schema").Number;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
                readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly date: import("effect/Schema").String;
                    readonly sample_size: import("effect/Schema").Number;
                    readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly average_stars: import("effect/Schema").Number;
                    readonly average_destruction: import("effect/Schema").Number;
                    readonly zero_star_rate: import("effect/Schema").Number;
                    readonly one_star_rate: import("effect/Schema").Number;
                    readonly two_star_rate: import("effect/Schema").Number;
                    readonly three_star_rate: import("effect/Schema").Number;
                }>>;
            }>;
        }>>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 415;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly statsWar: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly dates: import("effect/Schema").Struct<{
            readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly opponent_townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly equal_townhalls: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly metrics: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
        readonly breakdowns: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly key: import("effect/Schema").String;
            readonly metrics: import("effect/Schema").Struct<{
                readonly available: import("effect/Schema").Boolean;
                readonly sample_size: import("effect/Schema").Number;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
                readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly date: import("effect/Schema").String;
                    readonly sample_size: import("effect/Schema").Number;
                    readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly average_stars: import("effect/Schema").Number;
                    readonly average_destruction: import("effect/Schema").Number;
                    readonly zero_star_rate: import("effect/Schema").Number;
                    readonly one_star_rate: import("effect/Schema").Number;
                    readonly two_star_rate: import("effect/Schema").Number;
                    readonly three_star_rate: import("effect/Schema").Number;
                }>>;
            }>;
        }>>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 415;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly statsCwl: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly dates: import("effect/Schema").Struct<{
            readonly start_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly end_date: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly opponent_townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly equal_townhalls: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly cwl_league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly seasons: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
    }>, import("effect/Schema").Struct<{
        readonly date_range: import("effect/Schema").Struct<{
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
        }>;
        readonly metrics: import("effect/Schema").Struct<{
            readonly available: import("effect/Schema").Boolean;
            readonly sample_size: import("effect/Schema").Number;
            readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly zero_star_rate: import("effect/Schema").Number;
            readonly one_star_rate: import("effect/Schema").Number;
            readonly two_star_rate: import("effect/Schema").Number;
            readonly three_star_rate: import("effect/Schema").Number;
            readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly date: import("effect/Schema").String;
                readonly sample_size: import("effect/Schema").Number;
                readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
            }>>;
        }>;
        readonly breakdowns: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly key: import("effect/Schema").String;
            readonly metrics: import("effect/Schema").Struct<{
                readonly available: import("effect/Schema").Boolean;
                readonly sample_size: import("effect/Schema").Number;
                readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly average_stars: import("effect/Schema").Number;
                readonly average_destruction: import("effect/Schema").Number;
                readonly zero_star_rate: import("effect/Schema").Number;
                readonly one_star_rate: import("effect/Schema").Number;
                readonly two_star_rate: import("effect/Schema").Number;
                readonly three_star_rate: import("effect/Schema").Number;
                readonly daily: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly date: import("effect/Schema").String;
                    readonly sample_size: import("effect/Schema").Number;
                    readonly use_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly usage_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly average_stars: import("effect/Schema").Number;
                    readonly average_destruction: import("effect/Schema").Number;
                    readonly zero_star_rate: import("effect/Schema").Number;
                    readonly one_star_rate: import("effect/Schema").Number;
                    readonly two_star_rate: import("effect/Schema").Number;
                    readonly three_star_rate: import("effect/Schema").Number;
                }>>;
            }>;
        }>>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }, {
        readonly status: 415;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }]>;
    readonly proxyPlayer: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly townHallLevel: import("effect/Schema").Number;
        readonly townHallWeaponLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly expLevel: import("effect/Schema").Number;
        readonly trophies: import("effect/Schema").Number;
        readonly bestTrophies: import("effect/Schema").Number;
        readonly warStars: import("effect/Schema").Number;
        readonly attackWins: import("effect/Schema").Number;
        readonly defenseWins: import("effect/Schema").Number;
        readonly builderHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly bestBuilderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clanLevel: import("effect/Schema").Number;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
        }>>;
        readonly role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly warPreference: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly donationsReceived: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly clanCapitalContributions: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly achievements: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly stars: import("effect/Schema").Number;
            readonly value: import("effect/Schema").Number;
            readonly target: import("effect/Schema").Number;
            readonly info: import("effect/Schema").String;
            readonly completionInfo: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly village: import("effect/Schema").String;
        }>>;
        readonly heroes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly troops: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly spells: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly heroEquipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>>;
        readonly currentLeagueGroupTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly currentLeagueSeasonId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly previousLeagueGroupTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly previousLeagueSeasonId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyPlayerBattlelog: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly battleType: import("effect/Schema").String;
            readonly attack: import("effect/Schema").Boolean;
            readonly opponentPlayerTag: import("effect/Schema").String;
            readonly opponentName: import("effect/Schema").String;
            readonly opponentTownHallLevel: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly lootedResources: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly amount: import("effect/Schema").Number;
            }>>;
            readonly armyShareCode: import("effect/Schema").String;
            readonly battleTimestamp: import("effect/Schema").String;
            readonly battleTime: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyPlayerLeagueHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly leagueSeasonId: import("effect/Schema").Number;
            readonly leagueTrophies: import("effect/Schema").Number;
            readonly leagueTierId: import("effect/Schema").Number;
            readonly placement: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly attackLosses: import("effect/Schema").Number;
            readonly attackStars: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly defenseLosses: import("effect/Schema").Number;
            readonly defenseStars: import("effect/Schema").Number;
            readonly maxBattles: import("effect/Schema").Number;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyLeagueGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly leagueGroupTag: import("effect/Schema").String;
        readonly seasonId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly playerName: import("effect/Schema").String;
            readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly clanName: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly leagueTrophies: import("effect/Schema").Number;
            readonly attackWinCount: import("effect/Schema").Number;
            readonly attackLoseCount: import("effect/Schema").Number;
            readonly defenseWinCount: import("effect/Schema").Number;
            readonly defenseLoseCount: import("effect/Schema").Number;
        }>>;
        readonly attackLogs: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly opponentPlayerTag: import("effect/Schema").String;
            readonly opponentName: import("effect/Schema").String;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly creationTime: import("effect/Schema").String;
        }>>;
        readonly defenseLogs: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly opponentPlayerTag: import("effect/Schema").String;
            readonly opponentName: import("effect/Schema").String;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly creationTime: import("effect/Schema").String;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyLeagueTiers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyClan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly type: import("effect/Schema").String;
        readonly description: import("effect/Schema").String;
        readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly isCountry: import("effect/Schema").Boolean;
            readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly isFamilyFriendly: import("effect/Schema").Boolean;
        readonly badgeUrls: import("effect/Schema").Struct<{
            readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly large: import("effect/Schema").String;
        }>;
        readonly clanLevel: import("effect/Schema").Number;
        readonly clanPoints: import("effect/Schema").Number;
        readonly clanBuilderBasePoints: import("effect/Schema").Number;
        readonly clanCapitalPoints: import("effect/Schema").Number;
        readonly capitalLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly requiredTrophies: import("effect/Schema").Number;
        readonly warFrequency: import("effect/Schema").String;
        readonly warWinStreak: import("effect/Schema").Number;
        readonly warWins: import("effect/Schema").Number;
        readonly warTies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly warLosses: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly isWarLogPublic: import("effect/Schema").Boolean;
        readonly warLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly members: import("effect/Schema").Number;
        readonly memberList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly role: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly expLevel: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly donations: import("effect/Schema").Number;
            readonly donationsReceived: import("effect/Schema").Number;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
        }>>;
        readonly labels: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly requiredBuilderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly requiredTownhallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly clanCapital: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly capitalHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly districts: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly districtHallLevel: import("effect/Schema").Number;
            }>>>;
        }>>;
        readonly chatLanguage: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly languageCode: import("effect/Schema").String;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyClanSearch: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly warFrequency: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly locationId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly minMembers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly maxMembers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly minClanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly limit: import("effect/Schema").Number;
        readonly memberList: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            tag: import("effect/Schema").String;
            name: import("effect/Schema").String;
            type: import("effect/Schema").String;
            location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            isFamilyFriendly: import("effect/Schema").Boolean;
            badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            clanLevel: import("effect/Schema").Number;
            clanPoints: import("effect/Schema").Number;
            clanBuilderBasePoints: import("effect/Schema").Number;
            clanCapitalPoints: import("effect/Schema").Number;
            capitalLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            requiredTrophies: import("effect/Schema").Number;
            warFrequency: import("effect/Schema").String;
            warWinStreak: import("effect/Schema").Number;
            warWins: import("effect/Schema").Number;
            warTies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            warLosses: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            isWarLogPublic: import("effect/Schema").Boolean;
            warLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            members: import("effect/Schema").Number;
            labels: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            requiredBuilderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            requiredTownhallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            chatLanguage: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly languageCode: import("effect/Schema").String;
            }>>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyCapitalRaidSeasons: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly state: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").String;
            readonly endTime: import("effect/Schema").String;
            readonly capitalTotalLoot: import("effect/Schema").Number;
            readonly raidsCompleted: import("effect/Schema").Number;
            readonly totalAttacks: import("effect/Schema").Number;
            readonly enemyDistrictsDestroyed: import("effect/Schema").Number;
            readonly offensiveReward: import("effect/Schema").Number;
            readonly defensiveReward: import("effect/Schema").Number;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly attacks: import("effect/Schema").Number;
                readonly attackLimit: import("effect/Schema").Number;
                readonly bonusAttackLimit: import("effect/Schema").Number;
                readonly capitalResourcesLooted: import("effect/Schema").Number;
            }>>>;
            readonly attackLog: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly defender: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly level: import("effect/Schema").Number;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly large: import("effect/Schema").String;
                    }>;
                }>;
                readonly attackCount: import("effect/Schema").Number;
                readonly districtCount: import("effect/Schema").Number;
                readonly districtsDestroyed: import("effect/Schema").Number;
                readonly districts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                    readonly districtHallLevel: import("effect/Schema").Number;
                    readonly destructionPercent: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly attackCount: import("effect/Schema").Number;
                    readonly totalLooted: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attacker: import("effect/Schema").Struct<{
                            readonly tag: import("effect/Schema").String;
                            readonly name: import("effect/Schema").String;
                        }>;
                        readonly destructionPercent: import("effect/Schema").Number;
                        readonly stars: import("effect/Schema").Number;
                    }>>>;
                }>>;
            }>>;
            readonly defenseLog: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly attackCount: import("effect/Schema").Number;
                readonly districtCount: import("effect/Schema").Number;
                readonly districtsDestroyed: import("effect/Schema").Number;
                readonly districts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                    readonly districtHallLevel: import("effect/Schema").Number;
                    readonly destructionPercent: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly attackCount: import("effect/Schema").Number;
                    readonly totalLooted: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attacker: import("effect/Schema").Struct<{
                            readonly tag: import("effect/Schema").String;
                            readonly name: import("effect/Schema").String;
                        }>;
                        readonly destructionPercent: import("effect/Schema").Number;
                        readonly stars: import("effect/Schema").Number;
                    }>>>;
                }>>;
                readonly attacker: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly level: import("effect/Schema").Number;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly large: import("effect/Schema").String;
                    }>;
                }>;
            }>>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyClanWarlog: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly result: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly endTime: import("effect/Schema").String;
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyCurrentWar: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").Literal<"notInWar">;
    }>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly teamSize: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly preparationStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly endTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>>;
        readonly opponent: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>>;
        readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>]>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyCurrentLeagueGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly season: import("effect/Schema").String;
        readonly clans: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clanLevel: import("effect/Schema").Number;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townHallLevel: import("effect/Schema").Number;
            }>>;
        }>>;
        readonly rounds: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly warTags: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyCwlWar: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly warTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly teamSize: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly preparationStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly endTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>>;
        readonly opponent: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>>;
        readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyLocations: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly isCountry: import("effect/Schema").Boolean;
            readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyPlayerRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanBuilderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanCapitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyBuilderPlayerRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanBuilderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanCapitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyClanRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanBuilderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanCapitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyBuilderClanRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanBuilderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanCapitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyCapitalRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly rank: import("effect/Schema").Number;
            readonly previousRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanBuilderBasePoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanCapitalPoints: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clanLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").String;
                }>;
            }>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly expLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attackWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly defenseWins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
};
//# sourceMappingURL=expo.d.ts.map