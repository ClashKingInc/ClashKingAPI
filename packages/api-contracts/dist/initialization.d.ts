import { Schema } from "effect";
export declare const InitializationMiniMember: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly townhallLevel: Schema.Number;
    readonly mapPosition: Schema.Number;
    readonly opponentAttacks: Schema.Number;
}>;
export declare const InitializationAttack: Schema.Struct<{
    readonly attackerTag: Schema.String;
    readonly defenderTag: Schema.String;
    readonly stars: Schema.Number;
    readonly destructionPercentage: Schema.Number;
    readonly order: Schema.Number;
    readonly duration: Schema.Number;
    readonly attacker: Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly mapPosition: Schema.Number;
        readonly opponentAttacks: Schema.Number;
    }>;
    readonly defender: Schema.optionalKey<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly mapPosition: Schema.Number;
        readonly opponentAttacks: Schema.Number;
    }>>;
    readonly attack_order: Schema.Number;
    readonly fresh: Schema.Boolean;
    readonly war_type: Schema.String;
}>;
export declare const InitializationMember: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly townhallLevel: Schema.Number;
    readonly mapPosition: Schema.Number;
    readonly opponentAttacks: Schema.Number;
    readonly attacks: Schema.$Array<Schema.Struct<{
        readonly attackerTag: Schema.String;
        readonly defenderTag: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly order: Schema.Number;
        readonly duration: Schema.Number;
        readonly attacker: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
        }>;
        readonly defender: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
        }>>;
        readonly attack_order: Schema.Number;
        readonly fresh: Schema.Boolean;
        readonly war_type: Schema.String;
    }>>;
    readonly defenses: Schema.$Array<Schema.Struct<{
        readonly attackerTag: Schema.String;
        readonly defenderTag: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly order: Schema.Number;
        readonly duration: Schema.Number;
        readonly attacker: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
        }>;
        readonly defender: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
        }>>;
        readonly attack_order: Schema.Number;
        readonly fresh: Schema.Boolean;
        readonly war_type: Schema.String;
    }>>;
}>;
export declare const InitializationWarData: Schema.Struct<{
    readonly state: Schema.String;
    readonly teamSize: Schema.Number;
    readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
    readonly battleModifier: Schema.optionalKey<Schema.String>;
    readonly preparationStartTime: Schema.String;
    readonly startTime: Schema.optionalKey<Schema.String>;
    readonly endTime: Schema.String;
    readonly warStartTime: Schema.optionalKey<Schema.String>;
    readonly tag: Schema.optionalKey<Schema.String>;
    readonly clan: Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.String;
            readonly large: Schema.String;
            readonly medium: Schema.String;
        }>;
        readonly clanLevel: Schema.Number;
        readonly attacks: Schema.Number;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
    }>;
    readonly opponent: Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly badgeUrls: Schema.Struct<{
            readonly small: Schema.String;
            readonly large: Schema.String;
            readonly medium: Schema.String;
        }>;
        readonly clanLevel: Schema.Number;
        readonly attacks: Schema.Number;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
    }>;
    readonly type: Schema.String;
    readonly war_id: Schema.String;
}>;
export declare const InitializationPlayerWar: Schema.Struct<{
    readonly war_data: Schema.Struct<{
        readonly state: Schema.String;
        readonly teamSize: Schema.Number;
        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
        readonly battleModifier: Schema.optionalKey<Schema.String>;
        readonly preparationStartTime: Schema.String;
        readonly startTime: Schema.optionalKey<Schema.String>;
        readonly endTime: Schema.String;
        readonly warStartTime: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.optionalKey<Schema.String>;
        readonly clan: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly opponent: Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.String;
                readonly large: Schema.String;
                readonly medium: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly attacks: Schema.Number;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
        }>;
        readonly type: Schema.String;
        readonly war_id: Schema.String;
    }>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly mapPosition: Schema.Number;
        readonly opponentAttacks: Schema.Number;
        readonly attacks: Schema.$Array<Schema.Struct<{
            readonly attackerTag: Schema.String;
            readonly defenderTag: Schema.String;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly attacker: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
            }>;
            readonly defender: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
            }>>;
            readonly attack_order: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly war_type: Schema.String;
        }>>;
        readonly defenses: Schema.$Array<Schema.Struct<{
            readonly attackerTag: Schema.String;
            readonly defenderTag: Schema.String;
            readonly stars: Schema.Number;
            readonly destructionPercentage: Schema.Number;
            readonly order: Schema.Number;
            readonly duration: Schema.Number;
            readonly attacker: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
            }>;
            readonly defender: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
            }>>;
            readonly attack_order: Schema.Number;
            readonly fresh: Schema.Boolean;
            readonly war_type: Schema.String;
        }>>;
    }>>;
    readonly missedAttacks: Schema.Number;
    readonly missedDefenses: Schema.Number;
}>;
export declare const InitializationPlayerWarStats: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly townhallLevel: Schema.Number;
    readonly stats: Schema.Struct<{
        readonly all: Schema.Struct<{
            readonly warsCounts: Schema.Number;
            readonly totalAttacks: Schema.Number;
            readonly totalDefenses: Schema.Number;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
            readonly starsCount: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly starsCountDef: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
            readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
        }>;
        readonly random: Schema.Struct<{
            readonly warsCounts: Schema.Number;
            readonly totalAttacks: Schema.Number;
            readonly totalDefenses: Schema.Number;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
            readonly starsCount: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly starsCountDef: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
            readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
        }>;
        readonly cwl: Schema.Struct<{
            readonly warsCounts: Schema.Number;
            readonly totalAttacks: Schema.Number;
            readonly totalDefenses: Schema.Number;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
            readonly starsCount: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly starsCountDef: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
            readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
        }>;
        readonly friendly: Schema.Struct<{
            readonly warsCounts: Schema.Number;
            readonly totalAttacks: Schema.Number;
            readonly totalDefenses: Schema.Number;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
            readonly starsCount: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly starsCountDef: Schema.Struct<{
                readonly "0": Schema.Number;
                readonly "1": Schema.Number;
                readonly "2": Schema.Number;
                readonly "3": Schema.Number;
            }>;
            readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
            readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                readonly averageStars: Schema.Number;
                readonly averageDestruction: Schema.Number;
                readonly count: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
            }>>;
        }>;
    }>;
    readonly timeRange: Schema.Struct<{
        readonly start: Schema.Number;
        readonly end: Schema.Number;
    }>;
    readonly wars: Schema.$Array<Schema.Struct<{
        readonly war_data: Schema.Struct<{
            readonly state: Schema.String;
            readonly teamSize: Schema.Number;
            readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
            readonly battleModifier: Schema.optionalKey<Schema.String>;
            readonly preparationStartTime: Schema.String;
            readonly startTime: Schema.optionalKey<Schema.String>;
            readonly endTime: Schema.String;
            readonly warStartTime: Schema.optionalKey<Schema.String>;
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly clan: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.String;
                    readonly large: Schema.String;
                    readonly medium: Schema.String;
                }>;
                readonly clanLevel: Schema.Number;
                readonly attacks: Schema.Number;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
            }>;
            readonly opponent: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.String;
                    readonly large: Schema.String;
                    readonly medium: Schema.String;
                }>;
                readonly clanLevel: Schema.Number;
                readonly attacks: Schema.Number;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
            }>;
            readonly type: Schema.String;
            readonly war_id: Schema.String;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
            readonly attacks: Schema.$Array<Schema.Struct<{
                readonly attackerTag: Schema.String;
                readonly defenderTag: Schema.String;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
                readonly order: Schema.Number;
                readonly duration: Schema.Number;
                readonly attacker: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>;
                readonly defender: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>>;
                readonly attack_order: Schema.Number;
                readonly fresh: Schema.Boolean;
                readonly war_type: Schema.String;
            }>>;
            readonly defenses: Schema.$Array<Schema.Struct<{
                readonly attackerTag: Schema.String;
                readonly defenderTag: Schema.String;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
                readonly order: Schema.Number;
                readonly duration: Schema.Number;
                readonly attacker: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>;
                readonly defender: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>>;
                readonly attack_order: Schema.Number;
                readonly fresh: Schema.Boolean;
                readonly war_type: Schema.String;
            }>>;
        }>>;
        readonly missedAttacks: Schema.Number;
        readonly missedDefenses: Schema.Number;
    }>>;
}>;
export declare const InitializationClanWarStats: Schema.Struct<{
    readonly clan_tag: Schema.String;
    readonly players: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly stats: Schema.Struct<{
            readonly all: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly random: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly cwl: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly friendly: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
        }>;
        readonly timeRange: Schema.Struct<{
            readonly start: Schema.Number;
            readonly end: Schema.Number;
        }>;
        readonly wars: Schema.$Array<Schema.Struct<{
            readonly war_data: Schema.Struct<{
                readonly state: Schema.String;
                readonly teamSize: Schema.Number;
                readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                readonly battleModifier: Schema.optionalKey<Schema.String>;
                readonly preparationStartTime: Schema.String;
                readonly startTime: Schema.optionalKey<Schema.String>;
                readonly endTime: Schema.String;
                readonly warStartTime: Schema.optionalKey<Schema.String>;
                readonly tag: Schema.optionalKey<Schema.String>;
                readonly clan: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly opponent: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly type: Schema.String;
                readonly war_id: Schema.String;
            }>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
                readonly attacks: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
                readonly defenses: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
            }>>;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
        }>>;
    }>>;
    readonly wars: Schema.$Array<Schema.Struct<{
        readonly war_data: Schema.Struct<{
            readonly state: Schema.String;
            readonly teamSize: Schema.Number;
            readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
            readonly battleModifier: Schema.optionalKey<Schema.String>;
            readonly preparationStartTime: Schema.String;
            readonly startTime: Schema.optionalKey<Schema.String>;
            readonly endTime: Schema.String;
            readonly warStartTime: Schema.optionalKey<Schema.String>;
            readonly tag: Schema.optionalKey<Schema.String>;
            readonly clan: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.String;
                    readonly large: Schema.String;
                    readonly medium: Schema.String;
                }>;
                readonly clanLevel: Schema.Number;
                readonly attacks: Schema.Number;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
            }>;
            readonly opponent: Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly badgeUrls: Schema.Struct<{
                    readonly small: Schema.String;
                    readonly large: Schema.String;
                    readonly medium: Schema.String;
                }>;
                readonly clanLevel: Schema.Number;
                readonly attacks: Schema.Number;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
            }>;
            readonly type: Schema.String;
            readonly war_id: Schema.String;
        }>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhallLevel: Schema.Number;
            readonly mapPosition: Schema.Number;
            readonly opponentAttacks: Schema.Number;
            readonly attacks: Schema.$Array<Schema.Struct<{
                readonly attackerTag: Schema.String;
                readonly defenderTag: Schema.String;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
                readonly order: Schema.Number;
                readonly duration: Schema.Number;
                readonly attacker: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>;
                readonly defender: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>>;
                readonly attack_order: Schema.Number;
                readonly fresh: Schema.Boolean;
                readonly war_type: Schema.String;
            }>>;
            readonly defenses: Schema.$Array<Schema.Struct<{
                readonly attackerTag: Schema.String;
                readonly defenderTag: Schema.String;
                readonly stars: Schema.Number;
                readonly destructionPercentage: Schema.Number;
                readonly order: Schema.Number;
                readonly duration: Schema.Number;
                readonly attacker: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>;
                readonly defender: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                }>>;
                readonly attack_order: Schema.Number;
                readonly fresh: Schema.Boolean;
                readonly war_type: Schema.String;
            }>>;
        }>>;
    }>>;
}>;
export declare const InitializationRequest: Schema.Struct<{
    readonly player_tags: Schema.$Array<Schema.String>;
    readonly clan_tags: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
export declare const InitializationRankings: Schema.Struct<{
    readonly tag: Schema.String;
    readonly homeVillage: Schema.Struct<{
        readonly points: Schema.NullOr<Schema.Number>;
        readonly globalRank: Schema.NullOr<Schema.Number>;
        readonly localRank: Schema.NullOr<Schema.Number>;
        readonly locationId: Schema.NullOr<Schema.String>;
        readonly locationName: Schema.NullOr<Schema.String>;
        readonly countryCode: Schema.NullOr<Schema.String>;
    }>;
    readonly builderBase: Schema.Struct<{
        readonly points: Schema.NullOr<Schema.Number>;
        readonly globalRank: Schema.NullOr<Schema.Number>;
        readonly localRank: Schema.NullOr<Schema.Number>;
        readonly locationId: Schema.NullOr<Schema.String>;
        readonly locationName: Schema.NullOr<Schema.String>;
        readonly countryCode: Schema.NullOr<Schema.String>;
    }>;
}>;
export declare const InitializationPlayer: Schema.Struct<{
    readonly tag: Schema.String;
    readonly legends_by_season: Schema.$Record<Schema.String, Schema.Never>;
    readonly legend_eos_ranking: Schema.$Array<Schema.Struct<{
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
    readonly rankings: Schema.Struct<{
        readonly tag: Schema.String;
        readonly homeVillage: Schema.Struct<{
            readonly points: Schema.NullOr<Schema.Number>;
            readonly globalRank: Schema.NullOr<Schema.Number>;
            readonly localRank: Schema.NullOr<Schema.Number>;
            readonly locationId: Schema.NullOr<Schema.String>;
            readonly locationName: Schema.NullOr<Schema.String>;
            readonly countryCode: Schema.NullOr<Schema.String>;
        }>;
        readonly builderBase: Schema.Struct<{
            readonly points: Schema.NullOr<Schema.Number>;
            readonly globalRank: Schema.NullOr<Schema.Number>;
            readonly localRank: Schema.NullOr<Schema.Number>;
            readonly locationId: Schema.NullOr<Schema.String>;
            readonly locationName: Schema.NullOr<Schema.String>;
            readonly countryCode: Schema.NullOr<Schema.String>;
        }>;
    }>;
    readonly war_data: Schema.Union<readonly [Schema.$Record<Schema.String, Schema.Never>, Schema.Struct<{
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
    }>]>;
}>;
export declare const InitializationResponse: Schema.Struct<{
    readonly players: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly legends_by_season: Schema.$Record<Schema.String, Schema.Never>;
        readonly legend_eos_ranking: Schema.$Array<Schema.Struct<{
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
        readonly rankings: Schema.Struct<{
            readonly tag: Schema.String;
            readonly homeVillage: Schema.Struct<{
                readonly points: Schema.NullOr<Schema.Number>;
                readonly globalRank: Schema.NullOr<Schema.Number>;
                readonly localRank: Schema.NullOr<Schema.Number>;
                readonly locationId: Schema.NullOr<Schema.String>;
                readonly locationName: Schema.NullOr<Schema.String>;
                readonly countryCode: Schema.NullOr<Schema.String>;
            }>;
            readonly builderBase: Schema.Struct<{
                readonly points: Schema.NullOr<Schema.Number>;
                readonly globalRank: Schema.NullOr<Schema.Number>;
                readonly localRank: Schema.NullOr<Schema.Number>;
                readonly locationId: Schema.NullOr<Schema.String>;
                readonly locationName: Schema.NullOr<Schema.String>;
                readonly countryCode: Schema.NullOr<Schema.String>;
            }>;
        }>;
        readonly war_data: Schema.Union<readonly [Schema.$Record<Schema.String, Schema.Never>, Schema.Struct<{
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
        }>]>;
    }>>;
    readonly players_basic: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly townHallWeaponLevel: Schema.optionalKey<Schema.Number>;
        readonly expLevel: Schema.Number;
        readonly trophies: Schema.Number;
        readonly bestTrophies: Schema.Number;
        readonly warStars: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly builderHallLevel: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly bestBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly clanLevel: Schema.Number;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
        }>>;
        readonly role: Schema.optionalKey<Schema.String>;
        readonly warPreference: Schema.optionalKey<Schema.String>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly donationsReceived: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalContributions: Schema.optionalKey<Schema.Number>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly achievements: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly stars: Schema.Number;
            readonly value: Schema.Number;
            readonly target: Schema.Number;
            readonly info: Schema.String;
            readonly completionInfo: Schema.optionalKey<Schema.String>;
            readonly village: Schema.String;
        }>>;
        readonly heroes: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly troops: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly spells: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly heroEquipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>>;
        readonly currentLeagueGroupTag: Schema.optionalKey<Schema.String>;
        readonly currentLeagueSeasonId: Schema.optionalKey<Schema.Number>;
        readonly previousLeagueGroupTag: Schema.optionalKey<Schema.String>;
        readonly previousLeagueSeasonId: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly clans: Schema.Struct<{
        readonly clan_details: Schema.$Record<Schema.String, Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly type: Schema.String;
            readonly description: Schema.String;
            readonly location: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly isCountry: Schema.Boolean;
                readonly countryCode: Schema.optionalKey<Schema.String>;
            }>>;
            readonly isFamilyFriendly: Schema.Boolean;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly clanPoints: Schema.Number;
            readonly clanBuilderBasePoints: Schema.Number;
            readonly clanCapitalPoints: Schema.Number;
            readonly capitalLeague: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly requiredTrophies: Schema.Number;
            readonly warFrequency: Schema.String;
            readonly warWinStreak: Schema.Number;
            readonly warWins: Schema.Number;
            readonly warTies: Schema.optionalKey<Schema.Number>;
            readonly warLosses: Schema.optionalKey<Schema.Number>;
            readonly isWarLogPublic: Schema.Boolean;
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
            readonly members: Schema.Number;
            readonly memberList: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly role: Schema.String;
                readonly townHallLevel: Schema.Number;
                readonly expLevel: Schema.Number;
                readonly trophies: Schema.Number;
                readonly donations: Schema.Number;
                readonly donationsReceived: Schema.Number;
                readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
                readonly league: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly leagueTier: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
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
            readonly labels: Schema.$Array<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly requiredBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
            readonly requiredTownhallLevel: Schema.optionalKey<Schema.Number>;
            readonly clanCapital: Schema.optionalKey<Schema.Struct<{
                readonly capitalHallLevel: Schema.Number;
                readonly districts: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly districtHallLevel: Schema.Number;
                }>>;
            }>>;
            readonly chatLanguage: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly languageCode: Schema.String;
            }>>;
        }>>;
        readonly clan_stats: Schema.$Record<Schema.String, Schema.Never>;
        readonly war_data: Schema.$Array<Schema.Struct<{
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
        }>>;
        readonly capital_data: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly history: Schema.$Array<Schema.Struct<{
                readonly state: Schema.String;
                readonly startTime: Schema.String;
                readonly endTime: Schema.String;
                readonly capitalTotalLoot: Schema.Number;
                readonly raidsCompleted: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly enemyDistrictsDestroyed: Schema.Number;
                readonly offensiveReward: Schema.Number;
                readonly defensiveReward: Schema.Number;
                readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly tag: Schema.String;
                    readonly name: Schema.String;
                    readonly attacks: Schema.Number;
                    readonly attackLimit: Schema.Number;
                    readonly bonusAttackLimit: Schema.Number;
                    readonly capitalResourcesLooted: Schema.Number;
                }>>>;
                readonly attackLog: Schema.$Array<Schema.Struct<{
                    readonly defender: Schema.Struct<{
                        readonly tag: Schema.String;
                        readonly name: Schema.String;
                        readonly level: Schema.Number;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.optionalKey<Schema.String>;
                            readonly medium: Schema.optionalKey<Schema.String>;
                            readonly large: Schema.String;
                        }>;
                    }>;
                    readonly attackCount: Schema.Number;
                    readonly districtCount: Schema.Number;
                    readonly districtsDestroyed: Schema.Number;
                    readonly districts: Schema.$Array<Schema.Struct<{
                        readonly id: Schema.Number;
                        readonly name: Schema.String;
                        readonly districtHallLevel: Schema.Number;
                        readonly destructionPercent: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly attackCount: Schema.Number;
                        readonly totalLooted: Schema.Number;
                        readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly attacker: Schema.Struct<{
                                readonly tag: Schema.String;
                                readonly name: Schema.String;
                            }>;
                            readonly destructionPercent: Schema.Number;
                            readonly stars: Schema.Number;
                        }>>>;
                    }>>;
                }>>;
                readonly defenseLog: Schema.$Array<Schema.Struct<{
                    readonly attackCount: Schema.Number;
                    readonly districtCount: Schema.Number;
                    readonly districtsDestroyed: Schema.Number;
                    readonly districts: Schema.$Array<Schema.Struct<{
                        readonly id: Schema.Number;
                        readonly name: Schema.String;
                        readonly districtHallLevel: Schema.Number;
                        readonly destructionPercent: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly attackCount: Schema.Number;
                        readonly totalLooted: Schema.Number;
                        readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly attacker: Schema.Struct<{
                                readonly tag: Schema.String;
                                readonly name: Schema.String;
                            }>;
                            readonly destructionPercent: Schema.Number;
                            readonly stars: Schema.Number;
                        }>>>;
                    }>>;
                    readonly attacker: Schema.Struct<{
                        readonly tag: Schema.String;
                        readonly name: Schema.String;
                        readonly level: Schema.Number;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.optionalKey<Schema.String>;
                            readonly medium: Schema.optionalKey<Schema.String>;
                            readonly large: Schema.String;
                        }>;
                    }>;
                }>>;
            }>>;
        }>>;
        readonly war_log_data: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly items: Schema.$Array<Schema.Struct<{
                readonly result: Schema.String;
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
        }>>;
        readonly clan_war_stats: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly players: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly stats: Schema.Struct<{
                    readonly all: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly random: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly cwl: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly friendly: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                }>;
                readonly timeRange: Schema.Struct<{
                    readonly start: Schema.Number;
                    readonly end: Schema.Number;
                }>;
                readonly wars: Schema.$Array<Schema.Struct<{
                    readonly war_data: Schema.Struct<{
                        readonly state: Schema.String;
                        readonly teamSize: Schema.Number;
                        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                        readonly battleModifier: Schema.optionalKey<Schema.String>;
                        readonly preparationStartTime: Schema.String;
                        readonly startTime: Schema.optionalKey<Schema.String>;
                        readonly endTime: Schema.String;
                        readonly warStartTime: Schema.optionalKey<Schema.String>;
                        readonly tag: Schema.optionalKey<Schema.String>;
                        readonly clan: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly badgeUrls: Schema.Struct<{
                                readonly small: Schema.String;
                                readonly large: Schema.String;
                                readonly medium: Schema.String;
                            }>;
                            readonly clanLevel: Schema.Number;
                            readonly attacks: Schema.Number;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                        }>;
                        readonly opponent: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly badgeUrls: Schema.Struct<{
                                readonly small: Schema.String;
                                readonly large: Schema.String;
                                readonly medium: Schema.String;
                            }>;
                            readonly clanLevel: Schema.Number;
                            readonly attacks: Schema.Number;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                        }>;
                        readonly type: Schema.String;
                        readonly war_id: Schema.String;
                    }>;
                    readonly members: Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                        readonly attacks: Schema.$Array<Schema.Struct<{
                            readonly attackerTag: Schema.String;
                            readonly defenderTag: Schema.String;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                            readonly order: Schema.Number;
                            readonly duration: Schema.Number;
                            readonly attacker: Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>;
                            readonly defender: Schema.optionalKey<Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>>;
                            readonly attack_order: Schema.Number;
                            readonly fresh: Schema.Boolean;
                            readonly war_type: Schema.String;
                        }>>;
                        readonly defenses: Schema.$Array<Schema.Struct<{
                            readonly attackerTag: Schema.String;
                            readonly defenderTag: Schema.String;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                            readonly order: Schema.Number;
                            readonly duration: Schema.Number;
                            readonly attacker: Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>;
                            readonly defender: Schema.optionalKey<Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>>;
                            readonly attack_order: Schema.Number;
                            readonly fresh: Schema.Boolean;
                            readonly war_type: Schema.String;
                        }>>;
                    }>>;
                    readonly missedAttacks: Schema.Number;
                    readonly missedDefenses: Schema.Number;
                }>>;
            }>>;
            readonly wars: Schema.$Array<Schema.Struct<{
                readonly war_data: Schema.Struct<{
                    readonly state: Schema.String;
                    readonly teamSize: Schema.Number;
                    readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                    readonly battleModifier: Schema.optionalKey<Schema.String>;
                    readonly preparationStartTime: Schema.String;
                    readonly startTime: Schema.optionalKey<Schema.String>;
                    readonly endTime: Schema.String;
                    readonly warStartTime: Schema.optionalKey<Schema.String>;
                    readonly tag: Schema.optionalKey<Schema.String>;
                    readonly clan: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.String;
                            readonly large: Schema.String;
                            readonly medium: Schema.String;
                        }>;
                        readonly clanLevel: Schema.Number;
                        readonly attacks: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                    }>;
                    readonly opponent: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.String;
                            readonly large: Schema.String;
                            readonly medium: Schema.String;
                        }>;
                        readonly clanLevel: Schema.Number;
                        readonly attacks: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                    }>;
                    readonly type: Schema.String;
                    readonly war_id: Schema.String;
                }>;
                readonly members: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                    readonly attacks: Schema.$Array<Schema.Struct<{
                        readonly attackerTag: Schema.String;
                        readonly defenderTag: Schema.String;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                        readonly order: Schema.Number;
                        readonly duration: Schema.Number;
                        readonly attacker: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>;
                        readonly defender: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>>;
                        readonly attack_order: Schema.Number;
                        readonly fresh: Schema.Boolean;
                        readonly war_type: Schema.String;
                    }>>;
                    readonly defenses: Schema.$Array<Schema.Struct<{
                        readonly attackerTag: Schema.String;
                        readonly defenderTag: Schema.String;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                        readonly order: Schema.Number;
                        readonly duration: Schema.Number;
                        readonly attacker: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>;
                        readonly defender: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>>;
                        readonly attack_order: Schema.Number;
                        readonly fresh: Schema.Boolean;
                        readonly war_type: Schema.String;
                    }>>;
                }>>;
            }>>;
        }>>;
        readonly cwl_data: Schema.$Array<Schema.Never>;
    }>;
    readonly war_stats: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly stats: Schema.Struct<{
            readonly all: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly random: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly cwl: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly friendly: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
        }>;
        readonly timeRange: Schema.Struct<{
            readonly start: Schema.Number;
            readonly end: Schema.Number;
        }>;
        readonly wars: Schema.$Array<Schema.Struct<{
            readonly war_data: Schema.Struct<{
                readonly state: Schema.String;
                readonly teamSize: Schema.Number;
                readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                readonly battleModifier: Schema.optionalKey<Schema.String>;
                readonly preparationStartTime: Schema.String;
                readonly startTime: Schema.optionalKey<Schema.String>;
                readonly endTime: Schema.String;
                readonly warStartTime: Schema.optionalKey<Schema.String>;
                readonly tag: Schema.optionalKey<Schema.String>;
                readonly clan: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly opponent: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly type: Schema.String;
                readonly war_id: Schema.String;
            }>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
                readonly attacks: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
                readonly defenses: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
            }>>;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
        }>>;
    }>>;
    readonly clan_tags: Schema.$Array<Schema.String>;
    readonly metadata: Schema.Struct<{
        readonly total_players: Schema.Number;
        readonly total_clans: Schema.Number;
        readonly fetch_time: Schema.String;
        readonly user_id: Schema.String;
    }>;
}>;
export declare const InitializationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tags: Schema.$Array<Schema.String>;
    readonly clan_tags: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>, Schema.Struct<{
    readonly players: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly legends_by_season: Schema.$Record<Schema.String, Schema.Never>;
        readonly legend_eos_ranking: Schema.$Array<Schema.Struct<{
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
        readonly rankings: Schema.Struct<{
            readonly tag: Schema.String;
            readonly homeVillage: Schema.Struct<{
                readonly points: Schema.NullOr<Schema.Number>;
                readonly globalRank: Schema.NullOr<Schema.Number>;
                readonly localRank: Schema.NullOr<Schema.Number>;
                readonly locationId: Schema.NullOr<Schema.String>;
                readonly locationName: Schema.NullOr<Schema.String>;
                readonly countryCode: Schema.NullOr<Schema.String>;
            }>;
            readonly builderBase: Schema.Struct<{
                readonly points: Schema.NullOr<Schema.Number>;
                readonly globalRank: Schema.NullOr<Schema.Number>;
                readonly localRank: Schema.NullOr<Schema.Number>;
                readonly locationId: Schema.NullOr<Schema.String>;
                readonly locationName: Schema.NullOr<Schema.String>;
                readonly countryCode: Schema.NullOr<Schema.String>;
            }>;
        }>;
        readonly war_data: Schema.Union<readonly [Schema.$Record<Schema.String, Schema.Never>, Schema.Struct<{
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
        }>]>;
    }>>;
    readonly players_basic: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly townHallWeaponLevel: Schema.optionalKey<Schema.Number>;
        readonly expLevel: Schema.Number;
        readonly trophies: Schema.Number;
        readonly bestTrophies: Schema.Number;
        readonly warStars: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly builderHallLevel: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly bestBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly clan: Schema.optionalKey<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly clanLevel: Schema.Number;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
        }>>;
        readonly role: Schema.optionalKey<Schema.String>;
        readonly warPreference: Schema.optionalKey<Schema.String>;
        readonly donations: Schema.optionalKey<Schema.Number>;
        readonly donationsReceived: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalContributions: Schema.optionalKey<Schema.Number>;
        readonly league: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly leagueTier: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly achievements: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly stars: Schema.Number;
            readonly value: Schema.Number;
            readonly target: Schema.Number;
            readonly info: Schema.String;
            readonly completionInfo: Schema.optionalKey<Schema.String>;
            readonly village: Schema.String;
        }>>;
        readonly heroes: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly troops: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly spells: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>;
        readonly heroEquipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly level: Schema.Number;
            readonly maxLevel: Schema.Number;
            readonly village: Schema.String;
            readonly superTroopIsActive: Schema.optionalKey<Schema.Boolean>;
            readonly equipment: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly level: Schema.Number;
                readonly maxLevel: Schema.Number;
                readonly village: Schema.String;
            }>>>;
        }>>>;
        readonly currentLeagueGroupTag: Schema.optionalKey<Schema.String>;
        readonly currentLeagueSeasonId: Schema.optionalKey<Schema.Number>;
        readonly previousLeagueGroupTag: Schema.optionalKey<Schema.String>;
        readonly previousLeagueSeasonId: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly clans: Schema.Struct<{
        readonly clan_details: Schema.$Record<Schema.String, Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly type: Schema.String;
            readonly description: Schema.String;
            readonly location: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly isCountry: Schema.Boolean;
                readonly countryCode: Schema.optionalKey<Schema.String>;
            }>>;
            readonly isFamilyFriendly: Schema.Boolean;
            readonly badgeUrls: Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly large: Schema.String;
            }>;
            readonly clanLevel: Schema.Number;
            readonly clanPoints: Schema.Number;
            readonly clanBuilderBasePoints: Schema.Number;
            readonly clanCapitalPoints: Schema.Number;
            readonly capitalLeague: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly requiredTrophies: Schema.Number;
            readonly warFrequency: Schema.String;
            readonly warWinStreak: Schema.Number;
            readonly warWins: Schema.Number;
            readonly warTies: Schema.optionalKey<Schema.Number>;
            readonly warLosses: Schema.optionalKey<Schema.Number>;
            readonly isWarLogPublic: Schema.Boolean;
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
            readonly members: Schema.Number;
            readonly memberList: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly name: Schema.String;
                readonly role: Schema.String;
                readonly townHallLevel: Schema.Number;
                readonly expLevel: Schema.Number;
                readonly trophies: Schema.Number;
                readonly donations: Schema.Number;
                readonly donationsReceived: Schema.Number;
                readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
                readonly league: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly leagueTier: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                        readonly small: Schema.optionalKey<Schema.String>;
                        readonly medium: Schema.optionalKey<Schema.String>;
                        readonly tiny: Schema.optionalKey<Schema.String>;
                        readonly large: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly builderBaseLeague: Schema.optionalKey<Schema.Struct<{
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
            readonly labels: Schema.$Array<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                    readonly small: Schema.optionalKey<Schema.String>;
                    readonly medium: Schema.optionalKey<Schema.String>;
                    readonly tiny: Schema.optionalKey<Schema.String>;
                    readonly large: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly requiredBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
            readonly requiredTownhallLevel: Schema.optionalKey<Schema.Number>;
            readonly clanCapital: Schema.optionalKey<Schema.Struct<{
                readonly capitalHallLevel: Schema.Number;
                readonly districts: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.Number;
                    readonly name: Schema.String;
                    readonly districtHallLevel: Schema.Number;
                }>>;
            }>>;
            readonly chatLanguage: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.Number;
                readonly name: Schema.String;
                readonly languageCode: Schema.String;
            }>>;
        }>>;
        readonly clan_stats: Schema.$Record<Schema.String, Schema.Never>;
        readonly war_data: Schema.$Array<Schema.Struct<{
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
        }>>;
        readonly capital_data: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly history: Schema.$Array<Schema.Struct<{
                readonly state: Schema.String;
                readonly startTime: Schema.String;
                readonly endTime: Schema.String;
                readonly capitalTotalLoot: Schema.Number;
                readonly raidsCompleted: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly enemyDistrictsDestroyed: Schema.Number;
                readonly offensiveReward: Schema.Number;
                readonly defensiveReward: Schema.Number;
                readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly tag: Schema.String;
                    readonly name: Schema.String;
                    readonly attacks: Schema.Number;
                    readonly attackLimit: Schema.Number;
                    readonly bonusAttackLimit: Schema.Number;
                    readonly capitalResourcesLooted: Schema.Number;
                }>>>;
                readonly attackLog: Schema.$Array<Schema.Struct<{
                    readonly defender: Schema.Struct<{
                        readonly tag: Schema.String;
                        readonly name: Schema.String;
                        readonly level: Schema.Number;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.optionalKey<Schema.String>;
                            readonly medium: Schema.optionalKey<Schema.String>;
                            readonly large: Schema.String;
                        }>;
                    }>;
                    readonly attackCount: Schema.Number;
                    readonly districtCount: Schema.Number;
                    readonly districtsDestroyed: Schema.Number;
                    readonly districts: Schema.$Array<Schema.Struct<{
                        readonly id: Schema.Number;
                        readonly name: Schema.String;
                        readonly districtHallLevel: Schema.Number;
                        readonly destructionPercent: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly attackCount: Schema.Number;
                        readonly totalLooted: Schema.Number;
                        readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly attacker: Schema.Struct<{
                                readonly tag: Schema.String;
                                readonly name: Schema.String;
                            }>;
                            readonly destructionPercent: Schema.Number;
                            readonly stars: Schema.Number;
                        }>>>;
                    }>>;
                }>>;
                readonly defenseLog: Schema.$Array<Schema.Struct<{
                    readonly attackCount: Schema.Number;
                    readonly districtCount: Schema.Number;
                    readonly districtsDestroyed: Schema.Number;
                    readonly districts: Schema.$Array<Schema.Struct<{
                        readonly id: Schema.Number;
                        readonly name: Schema.String;
                        readonly districtHallLevel: Schema.Number;
                        readonly destructionPercent: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly attackCount: Schema.Number;
                        readonly totalLooted: Schema.Number;
                        readonly attacks: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly attacker: Schema.Struct<{
                                readonly tag: Schema.String;
                                readonly name: Schema.String;
                            }>;
                            readonly destructionPercent: Schema.Number;
                            readonly stars: Schema.Number;
                        }>>>;
                    }>>;
                    readonly attacker: Schema.Struct<{
                        readonly tag: Schema.String;
                        readonly name: Schema.String;
                        readonly level: Schema.Number;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.optionalKey<Schema.String>;
                            readonly medium: Schema.optionalKey<Schema.String>;
                            readonly large: Schema.String;
                        }>;
                    }>;
                }>>;
            }>>;
        }>>;
        readonly war_log_data: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly items: Schema.$Array<Schema.Struct<{
                readonly result: Schema.String;
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
        }>>;
        readonly clan_war_stats: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly players: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly stats: Schema.Struct<{
                    readonly all: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly random: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly cwl: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                    readonly friendly: Schema.Struct<{
                        readonly warsCounts: Schema.Number;
                        readonly totalAttacks: Schema.Number;
                        readonly totalDefenses: Schema.Number;
                        readonly missedAttacks: Schema.Number;
                        readonly missedDefenses: Schema.Number;
                        readonly starsCount: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly starsCountDef: Schema.Struct<{
                            readonly "0": Schema.Number;
                            readonly "1": Schema.Number;
                            readonly "2": Schema.Number;
                            readonly "3": Schema.Number;
                        }>;
                        readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                        readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                            readonly averageStars: Schema.Number;
                            readonly averageDestruction: Schema.Number;
                            readonly count: Schema.Number;
                            readonly starsCount: Schema.Struct<{
                                readonly "0": Schema.Number;
                                readonly "1": Schema.Number;
                                readonly "2": Schema.Number;
                                readonly "3": Schema.Number;
                            }>;
                        }>>;
                    }>;
                }>;
                readonly timeRange: Schema.Struct<{
                    readonly start: Schema.Number;
                    readonly end: Schema.Number;
                }>;
                readonly wars: Schema.$Array<Schema.Struct<{
                    readonly war_data: Schema.Struct<{
                        readonly state: Schema.String;
                        readonly teamSize: Schema.Number;
                        readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                        readonly battleModifier: Schema.optionalKey<Schema.String>;
                        readonly preparationStartTime: Schema.String;
                        readonly startTime: Schema.optionalKey<Schema.String>;
                        readonly endTime: Schema.String;
                        readonly warStartTime: Schema.optionalKey<Schema.String>;
                        readonly tag: Schema.optionalKey<Schema.String>;
                        readonly clan: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly badgeUrls: Schema.Struct<{
                                readonly small: Schema.String;
                                readonly large: Schema.String;
                                readonly medium: Schema.String;
                            }>;
                            readonly clanLevel: Schema.Number;
                            readonly attacks: Schema.Number;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                        }>;
                        readonly opponent: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly badgeUrls: Schema.Struct<{
                                readonly small: Schema.String;
                                readonly large: Schema.String;
                                readonly medium: Schema.String;
                            }>;
                            readonly clanLevel: Schema.Number;
                            readonly attacks: Schema.Number;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                        }>;
                        readonly type: Schema.String;
                        readonly war_id: Schema.String;
                    }>;
                    readonly members: Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                        readonly attacks: Schema.$Array<Schema.Struct<{
                            readonly attackerTag: Schema.String;
                            readonly defenderTag: Schema.String;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                            readonly order: Schema.Number;
                            readonly duration: Schema.Number;
                            readonly attacker: Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>;
                            readonly defender: Schema.optionalKey<Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>>;
                            readonly attack_order: Schema.Number;
                            readonly fresh: Schema.Boolean;
                            readonly war_type: Schema.String;
                        }>>;
                        readonly defenses: Schema.$Array<Schema.Struct<{
                            readonly attackerTag: Schema.String;
                            readonly defenderTag: Schema.String;
                            readonly stars: Schema.Number;
                            readonly destructionPercentage: Schema.Number;
                            readonly order: Schema.Number;
                            readonly duration: Schema.Number;
                            readonly attacker: Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>;
                            readonly defender: Schema.optionalKey<Schema.Struct<{
                                readonly name: Schema.String;
                                readonly tag: Schema.String;
                                readonly townhallLevel: Schema.Number;
                                readonly mapPosition: Schema.Number;
                                readonly opponentAttacks: Schema.Number;
                            }>>;
                            readonly attack_order: Schema.Number;
                            readonly fresh: Schema.Boolean;
                            readonly war_type: Schema.String;
                        }>>;
                    }>>;
                    readonly missedAttacks: Schema.Number;
                    readonly missedDefenses: Schema.Number;
                }>>;
            }>>;
            readonly wars: Schema.$Array<Schema.Struct<{
                readonly war_data: Schema.Struct<{
                    readonly state: Schema.String;
                    readonly teamSize: Schema.Number;
                    readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                    readonly battleModifier: Schema.optionalKey<Schema.String>;
                    readonly preparationStartTime: Schema.String;
                    readonly startTime: Schema.optionalKey<Schema.String>;
                    readonly endTime: Schema.String;
                    readonly warStartTime: Schema.optionalKey<Schema.String>;
                    readonly tag: Schema.optionalKey<Schema.String>;
                    readonly clan: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.String;
                            readonly large: Schema.String;
                            readonly medium: Schema.String;
                        }>;
                        readonly clanLevel: Schema.Number;
                        readonly attacks: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                    }>;
                    readonly opponent: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly badgeUrls: Schema.Struct<{
                            readonly small: Schema.String;
                            readonly large: Schema.String;
                            readonly medium: Schema.String;
                        }>;
                        readonly clanLevel: Schema.Number;
                        readonly attacks: Schema.Number;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                    }>;
                    readonly type: Schema.String;
                    readonly war_id: Schema.String;
                }>;
                readonly members: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly townhallLevel: Schema.Number;
                    readonly mapPosition: Schema.Number;
                    readonly opponentAttacks: Schema.Number;
                    readonly attacks: Schema.$Array<Schema.Struct<{
                        readonly attackerTag: Schema.String;
                        readonly defenderTag: Schema.String;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                        readonly order: Schema.Number;
                        readonly duration: Schema.Number;
                        readonly attacker: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>;
                        readonly defender: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>>;
                        readonly attack_order: Schema.Number;
                        readonly fresh: Schema.Boolean;
                        readonly war_type: Schema.String;
                    }>>;
                    readonly defenses: Schema.$Array<Schema.Struct<{
                        readonly attackerTag: Schema.String;
                        readonly defenderTag: Schema.String;
                        readonly stars: Schema.Number;
                        readonly destructionPercentage: Schema.Number;
                        readonly order: Schema.Number;
                        readonly duration: Schema.Number;
                        readonly attacker: Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>;
                        readonly defender: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly tag: Schema.String;
                            readonly townhallLevel: Schema.Number;
                            readonly mapPosition: Schema.Number;
                            readonly opponentAttacks: Schema.Number;
                        }>>;
                        readonly attack_order: Schema.Number;
                        readonly fresh: Schema.Boolean;
                        readonly war_type: Schema.String;
                    }>>;
                }>>;
            }>>;
        }>>;
        readonly cwl_data: Schema.$Array<Schema.Never>;
    }>;
    readonly war_stats: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhallLevel: Schema.Number;
        readonly stats: Schema.Struct<{
            readonly all: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly random: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly cwl: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
            readonly friendly: Schema.Struct<{
                readonly warsCounts: Schema.Number;
                readonly totalAttacks: Schema.Number;
                readonly totalDefenses: Schema.Number;
                readonly missedAttacks: Schema.Number;
                readonly missedDefenses: Schema.Number;
                readonly starsCount: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly starsCountDef: Schema.Struct<{
                    readonly "0": Schema.Number;
                    readonly "1": Schema.Number;
                    readonly "2": Schema.Number;
                    readonly "3": Schema.Number;
                }>;
                readonly byEnemyTownhall: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
                readonly byEnemyTownhallDef: Schema.$Record<Schema.String, Schema.Struct<{
                    readonly averageStars: Schema.Number;
                    readonly averageDestruction: Schema.Number;
                    readonly count: Schema.Number;
                    readonly starsCount: Schema.Struct<{
                        readonly "0": Schema.Number;
                        readonly "1": Schema.Number;
                        readonly "2": Schema.Number;
                        readonly "3": Schema.Number;
                    }>;
                }>>;
            }>;
        }>;
        readonly timeRange: Schema.Struct<{
            readonly start: Schema.Number;
            readonly end: Schema.Number;
        }>;
        readonly wars: Schema.$Array<Schema.Struct<{
            readonly war_data: Schema.Struct<{
                readonly state: Schema.String;
                readonly teamSize: Schema.Number;
                readonly attacksPerMember: Schema.optionalKey<Schema.Number>;
                readonly battleModifier: Schema.optionalKey<Schema.String>;
                readonly preparationStartTime: Schema.String;
                readonly startTime: Schema.optionalKey<Schema.String>;
                readonly endTime: Schema.String;
                readonly warStartTime: Schema.optionalKey<Schema.String>;
                readonly tag: Schema.optionalKey<Schema.String>;
                readonly clan: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly opponent: Schema.Struct<{
                    readonly name: Schema.String;
                    readonly tag: Schema.String;
                    readonly badgeUrls: Schema.Struct<{
                        readonly small: Schema.String;
                        readonly large: Schema.String;
                        readonly medium: Schema.String;
                    }>;
                    readonly clanLevel: Schema.Number;
                    readonly attacks: Schema.Number;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                }>;
                readonly type: Schema.String;
                readonly war_id: Schema.String;
            }>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhallLevel: Schema.Number;
                readonly mapPosition: Schema.Number;
                readonly opponentAttacks: Schema.Number;
                readonly attacks: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
                readonly defenses: Schema.$Array<Schema.Struct<{
                    readonly attackerTag: Schema.String;
                    readonly defenderTag: Schema.String;
                    readonly stars: Schema.Number;
                    readonly destructionPercentage: Schema.Number;
                    readonly order: Schema.Number;
                    readonly duration: Schema.Number;
                    readonly attacker: Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>;
                    readonly defender: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly tag: Schema.String;
                        readonly townhallLevel: Schema.Number;
                        readonly mapPosition: Schema.Number;
                        readonly opponentAttacks: Schema.Number;
                    }>>;
                    readonly attack_order: Schema.Number;
                    readonly fresh: Schema.Boolean;
                    readonly war_type: Schema.String;
                }>>;
            }>>;
            readonly missedAttacks: Schema.Number;
            readonly missedDefenses: Schema.Number;
        }>>;
    }>>;
    readonly clan_tags: Schema.$Array<Schema.String>;
    readonly metadata: Schema.Struct<{
        readonly total_players: Schema.Number;
        readonly total_clans: Schema.Number;
        readonly fetch_time: Schema.String;
        readonly user_id: Schema.String;
    }>;
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
}, {
    readonly status: 401;
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
    readonly status: 413;
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
    readonly status: 503;
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
//# sourceMappingURL=initialization.d.ts.map