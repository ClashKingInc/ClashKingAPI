import { Schema } from "effect";
export declare const WarBadgeUrls: Schema.Struct<{
    readonly small: Schema.String;
    readonly large: Schema.String;
    readonly medium: Schema.String;
}>;
export declare const WarAttack: Schema.Struct<{
    readonly attackerTag: Schema.String;
    readonly defenderTag: Schema.String;
    readonly stars: Schema.Number;
    readonly destructionPercentage: Schema.Number;
    readonly order: Schema.Number;
    readonly duration: Schema.Number;
}>;
export declare const WarMember: Schema.Struct<{
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
}>;
export declare const WarClan: Schema.Struct<{
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
export declare const WarResponse: Schema.Struct<{
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
}>;
export declare const BasicWarResponse: Schema.Struct<{
    readonly clan: Schema.Struct<{
        readonly tag: Schema.String;
        readonly publicWarLog: Schema.NullOr<Schema.Boolean>;
    }>;
    readonly opponent: Schema.Struct<{
        readonly tag: Schema.String;
        readonly publicWarLog: Schema.NullOr<Schema.Boolean>;
    }>;
    readonly preparationStartTime: Schema.String;
    readonly endTime: Schema.String;
    readonly type: Schema.String;
    readonly warTag: Schema.optionalKey<Schema.String>;
}>;
export declare const WarBasicEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.NullOr<Schema.Struct<{
    readonly clan: Schema.Struct<{
        readonly tag: Schema.String;
        readonly publicWarLog: Schema.NullOr<Schema.Boolean>;
    }>;
    readonly opponent: Schema.Struct<{
        readonly tag: Schema.String;
        readonly publicWarLog: Schema.NullOr<Schema.Boolean>;
    }>;
    readonly preparationStartTime: Schema.String;
    readonly endTime: Schema.String;
    readonly type: Schema.String;
    readonly warTag: Schema.optionalKey<Schema.String>;
}>>, readonly []>;
export declare const WarPreviousEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
    readonly endTime: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
//# sourceMappingURL=expo-war.d.ts.map