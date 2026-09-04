import { Schema } from "effect";
export declare const RankedPlayerMember: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly clan_name: Schema.optionalKey<Schema.String>;
    readonly placement: Schema.Number;
    readonly league_trophies: Schema.Number;
    readonly attack_win_count: Schema.Number;
    readonly attack_lose_count: Schema.Number;
    readonly defense_win_count: Schema.Number;
    readonly defense_lose_count: Schema.Number;
    readonly group_tag: Schema.optionalKey<Schema.String>;
    readonly league_tier_id: Schema.optionalKey<Schema.Number>;
}>;
export declare const PlayerRankedBattlelogResponse: Schema.Struct<{
    readonly tag: Schema.String;
    readonly season: Schema.Number;
    readonly member: Schema.NullOr<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly battlelogs: Schema.$Array<Schema.Struct<{
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
}>;
export declare const PlayerRankedGroupResponse: Schema.Union<readonly [Schema.Struct<{
    readonly tag: Schema.String;
    readonly season: Schema.Number;
    readonly group: Schema.Null;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
}>, Schema.Struct<{
    readonly season: Schema.Number;
    readonly group_tag: Schema.String;
    readonly league_tier_id: Schema.Number;
    readonly player: Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>]>;
export declare const PlayerTypedLeaderboardHistoryResponse: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies"]>;
    readonly playerTag: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly locationId: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly details: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly expLevel: Schema.optionalKey<Schema.Number>;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly attackWins: Schema.optionalKey<Schema.Number>;
            readonly defenseWins: Schema.optionalKey<Schema.Number>;
            readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
            readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
            readonly clan: Schema.optionalKey<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.String;
                }>;
            }>>;
            readonly league: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly leagueTier: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>>;
            readonly clanLevel: Schema.optionalKey<Schema.Number>;
            readonly clanPoints: Schema.optionalKey<Schema.Number>;
            readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
            readonly capitalPoints: Schema.optionalKey<Schema.Number>;
            readonly members: Schema.optionalKey<Schema.Number>;
            readonly location: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly isCountry: Schema.Boolean;
                readonly countryCode: Schema.optionalKey<Schema.String>;
                readonly localizedName: Schema.optionalKey<Schema.String>;
            }>>;
            readonly rank: Schema.Number;
            readonly previousRank: Schema.optionalKey<Schema.Number>;
        }>;
    }>>;
}>;
export declare const PlayerJoinLeaveSharedResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly clan: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>;
        readonly minutes: Schema.Number;
    }>>;
}>;
export declare const PlayerStatType: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
export declare const PlayerStatHistoryResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly eventTime: Schema.String;
        readonly clanTag: Schema.NullOr<Schema.String>;
        readonly statType: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
        readonly previousValue: Schema.Number;
        readonly currentValue: Schema.Number;
        readonly delta: Schema.Number;
    }>>;
}>;
export declare const TrophyBucketsResponse: Schema.Struct<{
    readonly league_tier_id: Schema.Number;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly bucket: Schema.Number;
        readonly players: Schema.Number;
        readonly trophies: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const PlayerRankedBattlelogEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly season: Schema.Number;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly tag: Schema.String;
    readonly season: Schema.Number;
    readonly member: Schema.NullOr<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly battlelogs: Schema.$Array<Schema.Struct<{
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
}>, readonly []>;
export declare const PlayerRankedGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly season: Schema.Number;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.Struct<{
    readonly tag: Schema.String;
    readonly season: Schema.Number;
    readonly group: Schema.Null;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
}>, Schema.Struct<{
    readonly season: Schema.Number;
    readonly group_tag: Schema.String;
    readonly league_tier_id: Schema.Number;
    readonly player: Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly placement: Schema.Number;
        readonly league_trophies: Schema.Number;
        readonly attack_win_count: Schema.Number;
        readonly attack_lose_count: Schema.Number;
        readonly defense_win_count: Schema.Number;
        readonly defense_lose_count: Schema.Number;
        readonly group_tag: Schema.optionalKey<Schema.String>;
        readonly league_tier_id: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>]>, readonly []>;
export declare const PlayerTypedLeaderboardHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly leaderboardType: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies"]>;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies"]>;
    readonly playerTag: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly locationId: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly details: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly expLevel: Schema.optionalKey<Schema.Number>;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly attackWins: Schema.optionalKey<Schema.Number>;
            readonly defenseWins: Schema.optionalKey<Schema.Number>;
            readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
            readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
            readonly clan: Schema.optionalKey<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.String;
                }>;
            }>>;
            readonly league: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly leagueTier: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>>;
            readonly clanLevel: Schema.optionalKey<Schema.Number>;
            readonly clanPoints: Schema.optionalKey<Schema.Number>;
            readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
            readonly capitalPoints: Schema.optionalKey<Schema.Number>;
            readonly members: Schema.optionalKey<Schema.Number>;
            readonly location: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly isCountry: Schema.Boolean;
                readonly countryCode: Schema.optionalKey<Schema.String>;
                readonly localizedName: Schema.optionalKey<Schema.String>;
            }>>;
            readonly rank: Schema.Number;
            readonly previousRank: Schema.optionalKey<Schema.Number>;
        }>;
    }>>;
}>, readonly []>;
export declare const PlayerJoinLeaveSharedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly clan: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
        }>;
        readonly minutes: Schema.Number;
    }>>;
}>, readonly []>;
export declare const PlayerStatHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly "time[after]": Schema.optionalKey<Schema.String>;
    readonly "time[before]": Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly eventTime: Schema.String;
        readonly clanTag: Schema.NullOr<Schema.String>;
        readonly statType: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
        readonly previousValue: Schema.Number;
        readonly currentValue: Schema.Number;
        readonly delta: Schema.Number;
    }>>;
}>, readonly []>;
export declare const TrophyBucketsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leagueTierId: Schema.Number;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly league_tier_id: Schema.Number;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly bucket: Schema.Number;
        readonly players: Schema.Number;
        readonly trophies: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const publicPlayerExtraEndpoints: {
    readonly playerRankedBattlelog: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly season: Schema.Number;
    }>, Schema.Struct<{
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly tag: Schema.String;
        readonly season: Schema.Number;
        readonly member: Schema.NullOr<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.String>;
            readonly placement: Schema.Number;
            readonly league_trophies: Schema.Number;
            readonly attack_win_count: Schema.Number;
            readonly attack_lose_count: Schema.Number;
            readonly defense_win_count: Schema.Number;
            readonly defense_lose_count: Schema.Number;
            readonly group_tag: Schema.optionalKey<Schema.String>;
            readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        }>>;
        readonly battlelogs: Schema.$Array<Schema.Struct<{
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
    }>, readonly []>;
    readonly playerRankedGroup: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly season: Schema.Number;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.Struct<{
        readonly tag: Schema.String;
        readonly season: Schema.Number;
        readonly group: Schema.Null;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.String>;
            readonly placement: Schema.Number;
            readonly league_trophies: Schema.Number;
            readonly attack_win_count: Schema.Number;
            readonly attack_lose_count: Schema.Number;
            readonly defense_win_count: Schema.Number;
            readonly defense_lose_count: Schema.Number;
            readonly group_tag: Schema.optionalKey<Schema.String>;
            readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        }>>;
    }>, Schema.Struct<{
        readonly season: Schema.Number;
        readonly group_tag: Schema.String;
        readonly league_tier_id: Schema.Number;
        readonly player: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.String>;
            readonly placement: Schema.Number;
            readonly league_trophies: Schema.Number;
            readonly attack_win_count: Schema.Number;
            readonly attack_lose_count: Schema.Number;
            readonly defense_win_count: Schema.Number;
            readonly defense_lose_count: Schema.Number;
            readonly group_tag: Schema.optionalKey<Schema.String>;
            readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.String>;
            readonly placement: Schema.Number;
            readonly league_trophies: Schema.Number;
            readonly attack_win_count: Schema.Number;
            readonly attack_lose_count: Schema.Number;
            readonly defense_win_count: Schema.Number;
            readonly defense_lose_count: Schema.Number;
            readonly group_tag: Schema.optionalKey<Schema.String>;
            readonly league_tier_id: Schema.optionalKey<Schema.Number>;
        }>>;
        readonly count: Schema.Number;
    }>]>, readonly []>;
    readonly playerTypedLeaderboardHistory: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly leaderboardType: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies"]>;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly type: Schema.Literals<readonly ["player_home_trophies", "player_builder_base_trophies"]>;
        readonly playerTag: Schema.String;
        readonly items: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly locationId: Schema.String;
            readonly name: Schema.String;
            readonly rank: Schema.Number;
            readonly details: Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly expLevel: Schema.optionalKey<Schema.Number>;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly attackWins: Schema.optionalKey<Schema.Number>;
                readonly defenseWins: Schema.optionalKey<Schema.Number>;
                readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
                readonly builderBaseBattleWins: Schema.optionalKey<Schema.Number>;
                readonly clan: Schema.optionalKey<Schema.Struct<{
                    readonly tag: Schema.String;
                    readonly name: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.String;
                    }>;
                }>>;
                readonly league: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.optionalKey<Schema.String>;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly leagueTier: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.optionalKey<Schema.String>;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.optionalKey<Schema.String>;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.String;
                }>>;
                readonly clanLevel: Schema.optionalKey<Schema.Number>;
                readonly clanPoints: Schema.optionalKey<Schema.Number>;
                readonly builderBasePoints: Schema.optionalKey<Schema.Number>;
                readonly capitalPoints: Schema.optionalKey<Schema.Number>;
                readonly members: Schema.optionalKey<Schema.Number>;
                readonly location: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.optionalKey<Schema.String>;
                    readonly isCountry: Schema.Boolean;
                    readonly countryCode: Schema.optionalKey<Schema.String>;
                    readonly localizedName: Schema.optionalKey<Schema.String>;
                }>>;
                readonly rank: Schema.Number;
                readonly previousRank: Schema.optionalKey<Schema.Number>;
            }>;
        }>>;
    }>, readonly []>;
    readonly playerJoinLeaveShared: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly playerTag: Schema.String;
    }>, Schema.Struct<{
        readonly tag: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly clan: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
            }>;
            readonly minutes: Schema.Number;
        }>>;
    }>, readonly []>;
    readonly playerStatHistory: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly playerTag: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
        readonly limit: Schema.optionalKey<Schema.Number>;
        readonly "time[after]": Schema.optionalKey<Schema.String>;
        readonly "time[before]": Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly eventTime: Schema.String;
            readonly clanTag: Schema.NullOr<Schema.String>;
            readonly statType: Schema.Literals<readonly ["donated", "received", "clan_games", "capital_gold_donated"]>;
            readonly previousValue: Schema.Number;
            readonly currentValue: Schema.Number;
            readonly delta: Schema.Number;
        }>>;
    }>, readonly []>;
    readonly trophyBuckets: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly leagueTierId: Schema.Number;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly league_tier_id: Schema.Number;
        readonly items: Schema.$Array<Schema.Struct<{
            readonly bucket: Schema.Number;
            readonly players: Schema.Number;
            readonly trophies: Schema.Number;
        }>>;
        readonly count: Schema.Number;
    }>, readonly []>;
};
//# sourceMappingURL=public-player-extra.d.ts.map