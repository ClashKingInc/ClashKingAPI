import { Schema } from "effect";
export declare const CwlMemberEnrichment: Schema.Struct<{
    readonly avgMapPosition: Schema.NullOr<Schema.Number>;
    readonly avgOpponentPosition: Schema.NullOr<Schema.Number>;
    readonly avgAttackOrder: Schema.NullOr<Schema.Number>;
    readonly avgTownHallLevel: Schema.NullOr<Schema.Number>;
    readonly avgOpponentTownHallLevel: Schema.NullOr<Schema.Number>;
    readonly avgAttackerPosition: Schema.NullOr<Schema.Number>;
    readonly avgDefenseOrder: Schema.NullOr<Schema.Number>;
    readonly avgAttackerTownHallLevel: Schema.NullOr<Schema.Number>;
    readonly attackLowerTHLevel: Schema.Int;
    readonly attackUpperTHLevel: Schema.Int;
    readonly defenseLowerTHLevel: Schema.Int;
    readonly defenseUpperTHLevel: Schema.Int;
    readonly attacks: Schema.Struct<{
        readonly stars: Schema.Int;
        readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
        readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
        readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
        readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
        readonly total_destruction: Schema.Number;
        readonly attack_count: Schema.Int;
        readonly missed_attacks: Schema.Int;
    }>;
    readonly defense: Schema.Struct<{
        readonly stars: Schema.Int;
        readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
        readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
        readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
        readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
        readonly total_destruction: Schema.Number;
        readonly defense_count: Schema.Int;
        readonly missed_defenses: Schema.Int;
    }>;
}>;
export declare const CurrentCwlGroup: Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.String>;
    }>>;
    readonly war_league: Schema.optionalKey<Schema.String>;
    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
        readonly small: Schema.optionalKey<Schema.String>;
        readonly medium: Schema.optionalKey<Schema.String>;
        readonly tiny: Schema.optionalKey<Schema.String>;
        readonly large: Schema.optionalKey<Schema.String>;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clanLevel: Schema.Number;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
        }>>;
        readonly warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
    }>>;
}>;
export declare const EnrichedCwlGroup: Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.String>;
    }>>;
    readonly war_league: Schema.optionalKey<Schema.String>;
    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
        readonly small: Schema.optionalKey<Schema.String>;
        readonly medium: Schema.optionalKey<Schema.String>;
        readonly tiny: Schema.optionalKey<Schema.String>;
        readonly large: Schema.optionalKey<Schema.String>;
    }>>;
    readonly total_stars: Schema.Int;
    readonly total_destruction: Schema.Number;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clanLevel: Schema.Number;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        readonly warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly total_stars: Schema.Int;
        readonly attack_count: Schema.Int;
        readonly missed_attacks: Schema.Int;
        readonly total_destruction: Schema.Number;
        readonly total_destruction_inflicted: Schema.Number;
        readonly wars_played: Schema.Int;
        readonly rank: Schema.Int;
        readonly town_hall_levels: Schema.$Record<Schema.String, Schema.Int>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
            readonly avgMapPosition: Schema.NullOr<Schema.Number>;
            readonly avgOpponentPosition: Schema.NullOr<Schema.Number>;
            readonly avgAttackOrder: Schema.NullOr<Schema.Number>;
            readonly avgTownHallLevel: Schema.NullOr<Schema.Number>;
            readonly avgOpponentTownHallLevel: Schema.NullOr<Schema.Number>;
            readonly avgAttackerPosition: Schema.NullOr<Schema.Number>;
            readonly avgDefenseOrder: Schema.NullOr<Schema.Number>;
            readonly avgAttackerTownHallLevel: Schema.NullOr<Schema.Number>;
            readonly attackLowerTHLevel: Schema.Int;
            readonly attackUpperTHLevel: Schema.Int;
            readonly defenseLowerTHLevel: Schema.Int;
            readonly defenseUpperTHLevel: Schema.Int;
            readonly attacks: Schema.Struct<{
                readonly stars: Schema.Int;
                readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
                readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
                readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
                readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
                readonly total_destruction: Schema.Number;
                readonly attack_count: Schema.Int;
                readonly missed_attacks: Schema.Int;
            }>;
            readonly defense: Schema.Struct<{
                readonly stars: Schema.Int;
                readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
                readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
                readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
                readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
                readonly total_destruction: Schema.Number;
                readonly defense_count: Schema.Int;
                readonly missed_defenses: Schema.Int;
            }>;
        }>>;
    }>>;
}>;
export declare const CurrentLeagueWar: Schema.Struct<{
    readonly state: Schema.String;
    readonly teamSize: Schema.optionalKey<Schema.Number>;
    readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
    readonly battleModifier: Schema.optionalKey<Schema.String>;
    readonly preparationStartTime: Schema.optionalKey<Schema.String>;
    readonly startTime: Schema.optionalKey<Schema.String>;
    readonly endTime: Schema.optionalKey<Schema.String>;
    readonly clan: Schema.optionalKey<Schema.Struct<{
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
    }>>;
    readonly opponent: Schema.optionalKey<Schema.Struct<{
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
    }>>;
    readonly warStartTime: Schema.optionalKey<Schema.String>;
    readonly tag: Schema.optionalKey<Schema.String>;
    readonly war_tag: Schema.String;
}>;
export declare const CurrentWarSummary: Schema.Struct<{
    readonly clan_tag: Schema.String;
    readonly isInWar: Schema.Boolean;
    readonly isInCwl: Schema.Boolean;
    readonly war_info: Schema.Struct<{
        readonly state: Schema.String;
        readonly currentWarInfo: Schema.optionalKey<Schema.Struct<{
            readonly state: Schema.String;
            readonly teamSize: Schema.optionalKey<Schema.Number>;
            readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
            readonly battleModifier: Schema.optionalKey<Schema.String>;
            readonly preparationStartTime: Schema.optionalKey<Schema.String>;
            readonly startTime: Schema.optionalKey<Schema.String>;
            readonly endTime: Schema.optionalKey<Schema.String>;
            readonly clan: Schema.optionalKey<Schema.Struct<{
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
            }>>;
            readonly opponent: Schema.optionalKey<Schema.Struct<{
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
            }>>;
            readonly warStartTime: Schema.optionalKey<Schema.String>;
            readonly tag: Schema.optionalKey<Schema.String>;
        }>>;
        readonly bypass: Schema.optionalKey<Schema.Boolean>;
    }>;
    readonly league_info: Schema.NullOr<Schema.Struct<{
        readonly state: Schema.String;
        readonly season: Schema.String;
        readonly rounds: Schema.$Array<Schema.Struct<{
            readonly warTags: Schema.$Array<Schema.String>;
        }>>;
        readonly war_league: Schema.optionalKey<Schema.String>;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
        readonly total_stars: Schema.Int;
        readonly total_destruction: Schema.Number;
        readonly clans: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly clanLevel: Schema.Number;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
            readonly warLeague: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly total_stars: Schema.Int;
            readonly attack_count: Schema.Int;
            readonly missed_attacks: Schema.Int;
            readonly total_destruction: Schema.Number;
            readonly total_destruction_inflicted: Schema.Number;
            readonly wars_played: Schema.Int;
            readonly rank: Schema.Int;
            readonly town_hall_levels: Schema.$Record<Schema.String, Schema.Int>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly townHallLevel: Schema.Number;
                readonly avgMapPosition: Schema.NullOr<Schema.Number>;
                readonly avgOpponentPosition: Schema.NullOr<Schema.Number>;
                readonly avgAttackOrder: Schema.NullOr<Schema.Number>;
                readonly avgTownHallLevel: Schema.NullOr<Schema.Number>;
                readonly avgOpponentTownHallLevel: Schema.NullOr<Schema.Number>;
                readonly avgAttackerPosition: Schema.NullOr<Schema.Number>;
                readonly avgDefenseOrder: Schema.NullOr<Schema.Number>;
                readonly avgAttackerTownHallLevel: Schema.NullOr<Schema.Number>;
                readonly attackLowerTHLevel: Schema.Int;
                readonly attackUpperTHLevel: Schema.Int;
                readonly defenseLowerTHLevel: Schema.Int;
                readonly defenseUpperTHLevel: Schema.Int;
                readonly attacks: Schema.Struct<{
                    readonly stars: Schema.Int;
                    readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
                    readonly total_destruction: Schema.Number;
                    readonly attack_count: Schema.Int;
                    readonly missed_attacks: Schema.Int;
                }>;
                readonly defense: Schema.Struct<{
                    readonly stars: Schema.Int;
                    readonly "3_stars": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "2_stars": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "1_star": Schema.$Record<Schema.String, Schema.Int>;
                    readonly "0_star": Schema.$Record<Schema.String, Schema.Int>;
                    readonly total_destruction: Schema.Number;
                    readonly defense_count: Schema.Int;
                    readonly missed_defenses: Schema.Int;
                }>;
            }>>;
        }>>;
    }>>;
    readonly war_league_infos: Schema.$Array<Schema.Struct<{
        readonly state: Schema.String;
        readonly teamSize: Schema.optionalKey<Schema.Number>;
        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
        readonly battleModifier: Schema.optionalKey<Schema.String>;
        readonly preparationStartTime: Schema.optionalKey<Schema.String>;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.optionalKey<Schema.String>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
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
        }>>;
        readonly opponent: Schema.optionalKey<Schema.Struct<{
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
        }>>;
        readonly warStartTime: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.optionalKey<Schema.String>;
        readonly war_tag: Schema.String;
    }>>;
}>;
//# sourceMappingURL=current-war-summary.d.ts.map