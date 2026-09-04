import { Schema } from "effect";
export declare const PublicBadgeUrls: Schema.Struct<{
    readonly small: Schema.optionalKey<Schema.String>;
    readonly medium: Schema.optionalKey<Schema.String>;
    readonly large: Schema.optionalKey<Schema.String>;
}>;
export declare const PublicIconUrls: Schema.Struct<{
    readonly tiny: Schema.optionalKey<Schema.String>;
    readonly small: Schema.optionalKey<Schema.String>;
    readonly medium: Schema.optionalKey<Schema.String>;
    readonly large: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanCachedResponse: Schema.NullOr<Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly badgeUrls: Schema.Struct<{
        readonly small: Schema.String;
        readonly medium: Schema.String;
        readonly large: Schema.String;
    }>;
    readonly description: Schema.String;
    readonly clanLevel: Schema.Number;
    readonly clanPoints: Schema.Number;
    readonly capitalGoldTotal: Schema.Number;
    readonly location: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
        readonly localizedName: Schema.optionalKey<Schema.String>;
    }>>;
    readonly warLeague: Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>;
    readonly capitalLeague: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly publicWarLog: Schema.Boolean;
    readonly warWins: Schema.Number;
    readonly warWinStreak: Schema.Number;
    readonly memberCount: Schema.Number;
    readonly troopsDonated: Schema.Number;
    readonly troopsReceived: Schema.Number;
    readonly lastActive: Schema.optionalKey<Schema.String>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
    }>>;
}>>;
export declare const BotPlayerHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.Literals<readonly ["troop_level", "super_troop_boost", "hero_level", "spell_level", "pet_level", "equipment_level", "townhall_level", "best_trophies", "best_builder_base_trophies", "exp_level", "war_preference", "name"]>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly townhall_level: Schema.NullOr<Schema.Number>;
        readonly type: Schema.String;
        readonly item: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly id: Schema.Number;
        }>>;
        readonly previous: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly current: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>;
}>, readonly []>;
export declare const BotPlayerRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly tag: Schema.String;
    readonly homeVillage: Schema.optionalKey<Schema.Struct<{
        readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly globalRank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly localRank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly builderBase: Schema.optionalKey<Schema.Struct<{
        readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly globalRank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly localRank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly location: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
        readonly localizedName: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const BotPlayerTimersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["war", "cwl", "capital"]>;
        readonly expiresAt: Schema.String;
        readonly warTag: Schema.optionalKey<Schema.String>;
        readonly clans: Schema.$Array<Schema.String>;
    }>>;
}>, readonly []>;
export declare const BotPlayerWarStatsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["cwl", "random", "friendly"]>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
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
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
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
                readonly large: Schema.optionalKey<Schema.String>;
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
}>, readonly []>;
export declare const BotPlayerWarAttacksEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["cwl", "random", "friendly"]>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly war_id: Schema.String;
        readonly warEndTime: Schema.String;
        readonly warType: Schema.String;
        readonly warSize: Schema.Number;
        readonly attackingClanTag: Schema.String;
        readonly defendingClanTag: Schema.String;
        readonly attackerTag: Schema.String;
        readonly attackerName: Schema.String;
        readonly defenderTag: Schema.String;
        readonly defenderName: Schema.String;
        readonly attackerTownhall: Schema.Number;
        readonly defenderTownhall: Schema.Number;
        readonly attackerMapPosition: Schema.Number;
        readonly defenderMapPosition: Schema.Number;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly duration: Schema.Number;
        readonly attackOrder: Schema.Number;
        readonly battleModifier: Schema.String;
        readonly side: Schema.String;
    }>>;
}>, readonly []>;
export declare const BotPlayerCwlHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
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
}>, readonly []>;
export declare const BotPlayerLegendHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly expLevel: Schema.Number;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
    }>>;
}>, readonly []>;
export declare const BotClanCachedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.NullOr<Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly badgeUrls: Schema.Struct<{
        readonly small: Schema.String;
        readonly medium: Schema.String;
        readonly large: Schema.String;
    }>;
    readonly description: Schema.String;
    readonly clanLevel: Schema.Number;
    readonly clanPoints: Schema.Number;
    readonly capitalGoldTotal: Schema.Number;
    readonly location: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
        readonly localizedName: Schema.optionalKey<Schema.String>;
    }>>;
    readonly warLeague: Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>;
    readonly capitalLeague: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly publicWarLog: Schema.Boolean;
    readonly warWins: Schema.Number;
    readonly warWinStreak: Schema.Number;
    readonly memberCount: Schema.Number;
    readonly troopsDonated: Schema.Number;
    readonly troopsReceived: Schema.Number;
    readonly lastActive: Schema.optionalKey<Schema.String>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
    }>>;
}>>, readonly []>;
export declare const BotClanHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["description", "clanLevel"]>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly time: Schema.String;
        readonly type: Schema.String;
        readonly previous: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly current: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
}>, readonly []>;
export declare const BotClanRecordsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clanPoints: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
    }>>;
    readonly warWinStreak: Schema.optionalKey<Schema.Struct<{
        readonly value: Schema.Number;
        readonly time: Schema.String;
    }>>;
}>, readonly []>;
export declare const BotClanRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.NullOr<Schema.String>;
    readonly tag: Schema.String;
    readonly badge: Schema.NullOr<Schema.String>;
    readonly homeVillage: Schema.Struct<{
        readonly points: Schema.Number;
        readonly placements: Schema.$Array<Schema.Struct<{
            readonly locationId: Schema.String;
            readonly rank: Schema.Number;
            readonly points: Schema.Number;
        }>>;
    }>;
    readonly builderBase: Schema.Struct<{
        readonly points: Schema.Number;
        readonly placements: Schema.$Array<Schema.Struct<{
            readonly locationId: Schema.String;
            readonly rank: Schema.Number;
            readonly points: Schema.Number;
        }>>;
    }>;
    readonly clanCapital: Schema.Struct<{
        readonly points: Schema.Number;
        readonly placements: Schema.$Array<Schema.Struct<{
            readonly locationId: Schema.String;
            readonly rank: Schema.Number;
            readonly points: Schema.Number;
        }>>;
    }>;
}>, readonly []>;
export declare const BotClanWarLogEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["cwl", "random", "friendly"]>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly result: Schema.String;
        readonly type: Schema.String;
        readonly endTime: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.Number;
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
    }>>;
}>, readonly []>;
export declare const BotClanWarsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["cwl", "random", "friendly"]>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
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
                readonly medium: Schema.String;
                readonly large: Schema.String;
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
                readonly medium: Schema.String;
                readonly large: Schema.String;
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
}>, readonly []>;
export declare const BotClanJoinLeaveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
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
}>, readonly []>;
export declare const BotClanLegendSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
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
}>, readonly []>;
export declare const BotCurrentWarEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
}>, readonly []>;
export declare const BotPreviousWarEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
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
            readonly medium: Schema.String;
            readonly large: Schema.String;
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
            readonly medium: Schema.String;
            readonly large: Schema.String;
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
}>, readonly []>;
export declare const BotCwlGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
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
                    readonly medium: Schema.String;
                    readonly large: Schema.String;
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
                    readonly medium: Schema.String;
                    readonly large: Schema.String;
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
}>, readonly []>;
export declare const BotCwlSeasonsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
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
}>, readonly []>;
export declare const BotCwlRankingHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clanTag: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly cwlLeagueId: Schema.optionalKey<Schema.Number>;
        readonly state: Schema.String;
        readonly warSize: Schema.optionalKey<Schema.Number>;
        readonly rounds: Schema.$Array<Schema.Struct<{
            readonly warTags: Schema.$Array<Schema.String>;
        }>>;
        readonly clan: Schema.Struct<{
            readonly clanTag: Schema.String;
            readonly name: Schema.String;
            readonly clanLevel: Schema.Number;
            readonly badgeToken: Schema.String;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townHallLevel: Schema.Number;
            }>>;
        }>;
        readonly standing: Schema.optionalKey<Schema.Struct<{
            readonly clanTag: Schema.String;
            readonly season: Schema.String;
            readonly cwlLeagueId: Schema.Number;
            readonly warSize: Schema.Number;
            readonly stars: Schema.Number;
            readonly destruction: Schema.Number;
            readonly wins: Schema.Number;
            readonly losses: Schema.Number;
            readonly ties: Schema.Number;
            readonly warsFinished: Schema.Number;
            readonly totalClansInGroup: Schema.Number;
            readonly groupRank: Schema.optionalKey<Schema.Number>;
            readonly globalRank: Schema.optionalKey<Schema.Number>;
            readonly updatedAt: Schema.String;
        }>>;
    }>>;
}>, readonly []>;
export declare const BotCwlLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leagueId: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.String;
    readonly team_size: Schema.Number;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly season: Schema.String;
    readonly cwlLeagueId: Schema.Number;
    readonly warSize: Schema.Number;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly clanTag: Schema.String;
        readonly season: Schema.String;
        readonly cwlLeagueId: Schema.Number;
        readonly warSize: Schema.Number;
        readonly stars: Schema.Number;
        readonly destruction: Schema.Number;
        readonly wins: Schema.Number;
        readonly losses: Schema.Number;
        readonly ties: Schema.Number;
        readonly warsFinished: Schema.Number;
        readonly totalClansInGroup: Schema.Number;
        readonly groupRank: Schema.optionalKey<Schema.Number>;
        readonly globalRank: Schema.optionalKey<Schema.Number>;
        readonly updatedAt: Schema.String;
    }>>;
}>, readonly []>;
export declare const BotLegendSeasonEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly season: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly season: Schema.String;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly expLevel: Schema.Number;
        readonly trophies: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly rank: Schema.Number;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.optionalKey<Schema.String>;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
    }>>;
}>, readonly []>;
export declare const BotClanDonationsLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotClanWarWinsLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotClanCapitalLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotClanWinStreakLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly kind: Schema.optionalKey<Schema.String>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly badge_url: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly war_wins: Schema.optionalKey<Schema.Number>;
        readonly capital_gold_total: Schema.optionalKey<Schema.Number>;
        readonly war_win_streak: Schema.Number;
        readonly rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotTownHallLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly townHallLevel: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly league_tier_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly townhall_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly league_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly badge: Schema.String;
        }>>;
        readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly badge: Schema.String;
        }>>;
        readonly townhall_level: Schema.Number;
        readonly trophies: Schema.Number;
        readonly country_code: Schema.optionalKey<Schema.String>;
        readonly country_name: Schema.optionalKey<Schema.String>;
    }>>;
    readonly count: Schema.Number;
    readonly generated_at: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const BotLeagueLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leagueId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly league_tier_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly townhall_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly league_id: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly badge: Schema.String;
        }>>;
        readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly badge: Schema.String;
        }>>;
        readonly townhall_level: Schema.Number;
        readonly trophies: Schema.Number;
        readonly country_code: Schema.optionalKey<Schema.String>;
        readonly country_name: Schema.optionalKey<Schema.String>;
    }>>;
    readonly count: Schema.Number;
    readonly generated_at: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const BotCountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly players_in_war: Schema.Number;
    readonly clans_in_war: Schema.Number;
    readonly total_join_leaves: Schema.Number;
    readonly players_in_legends: Schema.Number;
    readonly player_count: Schema.Number;
    readonly clan_count: Schema.Number;
    readonly wars_stored: Schema.Number;
}>, readonly []>;
//# sourceMappingURL=bot-public.d.ts.map