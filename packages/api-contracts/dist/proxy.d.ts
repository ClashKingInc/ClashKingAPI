import { Schema } from "effect";
export declare const ProxyPlayerResponse: Schema.Struct<{
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
}>;
export declare const ProxyBattlelogResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly battleType: Schema.String;
        readonly attack: Schema.Boolean;
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly opponentTownHallLevel: Schema.Number;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly lootedResources: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly amount: Schema.Number;
        }>>;
        readonly armyShareCode: Schema.String;
        readonly battleTimestamp: Schema.String;
        readonly battleTime: Schema.Number;
    }>>;
}>;
export declare const ProxyLeagueHistoryResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly leagueSeasonId: Schema.Number;
        readonly leagueTrophies: Schema.Number;
        readonly leagueTierId: Schema.Number;
        readonly placement: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly attackLosses: Schema.Number;
        readonly attackStars: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly defenseLosses: Schema.Number;
        readonly defenseStars: Schema.Number;
        readonly maxBattles: Schema.Number;
    }>>;
}>;
export declare const ProxyLeagueGroupResponse: Schema.Struct<{
    readonly members: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly playerName: Schema.String;
        readonly clanTag: Schema.String;
        readonly clanName: Schema.String;
        readonly leagueTrophies: Schema.Number;
        readonly attackWinCount: Schema.Number;
        readonly attackLoseCount: Schema.Number;
        readonly defenseWinCount: Schema.Number;
        readonly defenseLoseCount: Schema.Number;
    }>>;
    readonly attackLogs: Schema.$Array<Schema.Struct<{
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly trophies: Schema.Number;
        readonly creationTime: Schema.String;
    }>>;
    readonly defenseLogs: Schema.$Array<Schema.Struct<{
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly trophies: Schema.Number;
        readonly creationTime: Schema.String;
    }>>;
}>;
export declare const ProxyLeagueTiersResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyClanResponse: Schema.Struct<{
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
}>;
export declare const ProxyClanSearchResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        tag: Schema.String;
        name: Schema.String;
        type: Schema.String;
        location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        isFamilyFriendly: Schema.Boolean;
        badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        clanLevel: Schema.Number;
        clanPoints: Schema.Number;
        clanBuilderBasePoints: Schema.Number;
        clanCapitalPoints: Schema.Number;
        capitalLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        requiredTrophies: Schema.Number;
        warFrequency: Schema.String;
        warWinStreak: Schema.Number;
        warWins: Schema.Number;
        warTies: Schema.optionalKey<Schema.Number>;
        warLosses: Schema.optionalKey<Schema.Number>;
        isWarLogPublic: Schema.Boolean;
        warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        members: Schema.Number;
        labels: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        requiredBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
        requiredTownhallLevel: Schema.optionalKey<Schema.Number>;
        chatLanguage: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly languageCode: Schema.String;
        }>>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyCapitalRaidSeasonsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
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
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyWarResponse: Schema.Struct<{
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
}>;
export declare const ProxyWarlogResponse: Schema.Struct<{
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
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyCwlGroupResponse: Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
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
    }>>;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.String>;
    }>>;
}>;
export declare const ProxyLocationsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyRankingsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const ProxyPlayerEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyPlayerBattlelogEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly battleType: Schema.String;
        readonly attack: Schema.Boolean;
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly opponentTownHallLevel: Schema.Number;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly lootedResources: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly amount: Schema.Number;
        }>>;
        readonly armyShareCode: Schema.String;
        readonly battleTimestamp: Schema.String;
        readonly battleTime: Schema.Number;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyPlayerLeagueHistoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly leagueSeasonId: Schema.Number;
        readonly leagueTrophies: Schema.Number;
        readonly leagueTierId: Schema.Number;
        readonly placement: Schema.Number;
        readonly attackWins: Schema.Number;
        readonly attackLosses: Schema.Number;
        readonly attackStars: Schema.Number;
        readonly defenseWins: Schema.Number;
        readonly defenseLosses: Schema.Number;
        readonly defenseStars: Schema.Number;
        readonly maxBattles: Schema.Number;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyLeagueGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly leagueGroupTag: Schema.String;
    readonly seasonId: Schema.Number;
}>, Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly members: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly playerName: Schema.String;
        readonly clanTag: Schema.String;
        readonly clanName: Schema.String;
        readonly leagueTrophies: Schema.Number;
        readonly attackWinCount: Schema.Number;
        readonly attackLoseCount: Schema.Number;
        readonly defenseWinCount: Schema.Number;
        readonly defenseLoseCount: Schema.Number;
    }>>;
    readonly attackLogs: Schema.$Array<Schema.Struct<{
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly trophies: Schema.Number;
        readonly creationTime: Schema.String;
    }>>;
    readonly defenseLogs: Schema.$Array<Schema.Struct<{
        readonly opponentPlayerTag: Schema.String;
        readonly opponentName: Schema.String;
        readonly stars: Schema.Number;
        readonly destructionPercentage: Schema.Number;
        readonly trophies: Schema.Number;
        readonly creationTime: Schema.String;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyLeagueTiersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly iconUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly tiny: Schema.optionalKey<Schema.String>;
            readonly large: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyClanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyClanSearchEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly warFrequency: Schema.optionalKey<Schema.String>;
    readonly locationId: Schema.optionalKey<Schema.Number>;
    readonly minMembers: Schema.optionalKey<Schema.Number>;
    readonly maxMembers: Schema.optionalKey<Schema.Number>;
    readonly minClanLevel: Schema.optionalKey<Schema.Number>;
    readonly limit: Schema.Number;
    readonly memberList: Schema.Boolean;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        tag: Schema.String;
        name: Schema.String;
        type: Schema.String;
        location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        isFamilyFriendly: Schema.Boolean;
        badgeUrls: Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
        }>;
        clanLevel: Schema.Number;
        clanPoints: Schema.Number;
        clanBuilderBasePoints: Schema.Number;
        clanCapitalPoints: Schema.Number;
        capitalLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        requiredTrophies: Schema.Number;
        warFrequency: Schema.String;
        warWinStreak: Schema.Number;
        warWins: Schema.Number;
        warTies: Schema.optionalKey<Schema.Number>;
        warLosses: Schema.optionalKey<Schema.Number>;
        isWarLogPublic: Schema.Boolean;
        warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        members: Schema.Number;
        labels: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly iconUrls: Schema.optionalKey<Schema.Struct<{
                readonly small: Schema.optionalKey<Schema.String>;
                readonly medium: Schema.optionalKey<Schema.String>;
                readonly tiny: Schema.optionalKey<Schema.String>;
                readonly large: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        requiredBuilderBaseTrophies: Schema.optionalKey<Schema.Number>;
        requiredTownhallLevel: Schema.optionalKey<Schema.Number>;
        chatLanguage: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly languageCode: Schema.String;
        }>>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyCapitalRaidSeasonsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
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
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyClanWarlogEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
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
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyCurrentWarEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyCurrentLeagueGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly state: Schema.String;
    readonly season: Schema.String;
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
    }>>;
    readonly rounds: Schema.$Array<Schema.Struct<{
        readonly warTags: Schema.$Array<Schema.String>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyCwlWarEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly warTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
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
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyLocationsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyPlayerRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyBuilderPlayerRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyClanRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyBuilderClanRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
export declare const ProxyCapitalRankingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly locationId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly rank: Schema.Number;
        readonly previousRank: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly builderBaseTrophies: Schema.optionalKey<Schema.Number>;
        readonly clanPoints: Schema.optionalKey<Schema.Number>;
        readonly clanBuilderBasePoints: Schema.optionalKey<Schema.Number>;
        readonly clanCapitalPoints: Schema.optionalKey<Schema.Number>;
        readonly members: Schema.optionalKey<Schema.Number>;
        readonly clanLevel: Schema.optionalKey<Schema.Number>;
        readonly badgeUrls: Schema.optionalKey<Schema.Struct<{
            readonly small: Schema.optionalKey<Schema.String>;
            readonly medium: Schema.optionalKey<Schema.String>;
            readonly large: Schema.String;
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
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expLevel: Schema.optionalKey<Schema.Number>;
        readonly attackWins: Schema.optionalKey<Schema.Number>;
        readonly defenseWins: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly paging: Schema.optionalKey<Schema.Struct<{
        readonly cursors: Schema.optionalKey<Schema.Struct<{
            readonly after: Schema.optionalKey<Schema.String>;
            readonly before: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly [{
    readonly status: 400;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 403;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}, {
    readonly status: 429;
    readonly body: Schema.Struct<{
        readonly reason: Schema.String;
        readonly message: Schema.String;
    }>;
}]>;
//# sourceMappingURL=proxy.d.ts.map