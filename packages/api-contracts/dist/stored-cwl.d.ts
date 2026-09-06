import { Schema } from "effect";
export declare const StoredCwlGroupResponse: Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
    readonly warLeague: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clanLevel: Schema.Number;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.String;
            readonly large: Schema.String;
            readonly medium: Schema.String;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
        }>>;
    }>>;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            readonly season: Schema.String;
        }>, Schema.Struct<{
            readonly tag: Schema.String;
        }>]>>;
    }>>;
}>;
export declare const StoredCwlGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
    readonly warLeague: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clanLevel: Schema.Number;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.String;
            readonly large: Schema.String;
            readonly medium: Schema.String;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
        }>>;
    }>>;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            readonly season: Schema.String;
        }>, Schema.Struct<{
            readonly tag: Schema.String;
        }>]>>;
    }>>;
}>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
//# sourceMappingURL=stored-cwl.d.ts.map