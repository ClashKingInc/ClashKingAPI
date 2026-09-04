import { Schema } from "effect";
export declare const BotAccountsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly order_index: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
        readonly added_at: Schema.String;
        readonly verified_at: Schema.optionalKey<Schema.String>;
        readonly last_login: Schema.NullOr<Schema.String>;
    }>>;
}>, readonly []>;
export declare const BotLinkAccountEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly api_token: Schema.String;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>, readonly []>;
export declare const BotUnlinkAccountEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const BotServerLinksEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly offset: Schema.optionalKey<Schema.Number>;
    readonly query: Schema.optionalKey<Schema.String>;
    readonly account_filter: Schema.optionalKey<Schema.Literal<"none">>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly members: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly display_name: Schema.String;
        readonly avatar_url: Schema.String;
        readonly linked_accounts: Schema.$Array<Schema.Struct<{
            readonly player_tag: Schema.String;
            readonly player_name: Schema.optionalKey<Schema.String>;
            readonly town_hall: Schema.optionalKey<Schema.Number>;
            readonly is_verified: Schema.Boolean;
            readonly added_at: Schema.String;
        }>>;
        readonly account_count: Schema.Number;
    }>>;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
    }>>;
    readonly total_members: Schema.Number;
    readonly filtered_members: Schema.Number;
    readonly members_with_links: Schema.Number;
    readonly total_linked_accounts: Schema.Number;
    readonly verified_accounts: Schema.Number;
}>, readonly []>;
export declare const BotServerClansEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
}>>, readonly []>;
export declare const BotDashboardCapabilitiesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly full_access: Schema.Boolean;
    readonly sections: Schema.$Record<Schema.String, Schema.String>;
}>, readonly []>;
export declare const BotServerWarLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly total_attacks: Schema.Number;
        readonly total_stars: Schema.Number;
        readonly average_stars: Schema.Number;
        readonly average_destruction: Schema.Number;
        readonly three_star_attacks: Schema.optionalKey<Schema.Number>;
        readonly three_star_rate: Schema.optionalKey<Schema.Number>;
        readonly destruction_percentage: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotServerDonationsLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly season: Schema.String;
    readonly type: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly donated: Schema.Number;
        readonly received: Schema.Number;
        readonly score: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotServerLegendsLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly trophies: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotServerClanGamesLeaderboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly season: Schema.String;
    readonly type: Schema.String;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly rank: Schema.Number;
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly townhall_level: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly clan_games: Schema.Number;
        readonly score: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotBansEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly VillageTag: Schema.String;
        readonly VillageName: Schema.String;
        readonly DateCreated: Schema.String;
        readonly Notes: Schema.String;
        readonly server: Schema.String;
        readonly added_by: Schema.String;
        readonly added_by_username: Schema.optionalKey<Schema.String>;
        readonly added_by_avatar_url: Schema.optionalKey<Schema.String>;
        readonly edited_by: Schema.$Array<Schema.Struct<{
            readonly user: Schema.String;
            readonly previous: Schema.Struct<{
                readonly reason: Schema.String;
            }>;
        }>>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly town_hall: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly current_role: Schema.optionalKey<Schema.String>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotSaveBanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly reason: Schema.String;
    readonly added_by: Schema.String;
    readonly image: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const BotDeleteBanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const BotStrikesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly player_tag: Schema.optionalKey<Schema.String>;
    readonly view_expired: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly strike_id: Schema.String;
        readonly tag: Schema.String;
        readonly server: Schema.String;
        readonly reason: Schema.String;
        readonly added_by: Schema.String;
        readonly added_by_username: Schema.optionalKey<Schema.String>;
        readonly added_by_avatar_url: Schema.optionalKey<Schema.String>;
        readonly strike_weight: Schema.Number;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly date_created: Schema.String;
        readonly rollover_date: Schema.optionalKey<Schema.Number>;
        readonly player_name: Schema.optionalKey<Schema.String>;
        readonly town_hall: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly current_role: Schema.optionalKey<Schema.String>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const BotStrikeSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly server_id: Schema.String;
    readonly total_strikes: Schema.Number;
    readonly total_weight: Schema.Number;
    readonly strikes: Schema.$Array<Schema.Struct<{
        readonly strike_id: Schema.String;
        readonly tag: Schema.String;
        readonly server: Schema.String;
        readonly reason: Schema.String;
        readonly added_by: Schema.String;
        readonly added_by_username: Schema.optionalKey<Schema.String>;
        readonly added_by_avatar_url: Schema.optionalKey<Schema.String>;
        readonly strike_weight: Schema.Number;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly date_created: Schema.String;
        readonly rollover_date: Schema.optionalKey<Schema.Number>;
        readonly player_name: Schema.optionalKey<Schema.String>;
        readonly town_hall: Schema.optionalKey<Schema.Number>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.String>;
        readonly current_role: Schema.optionalKey<Schema.String>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
    }>>;
}>, readonly []>;
export declare const BotAddStrikeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly tag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly reason: Schema.String;
    readonly added_by: Schema.String;
    readonly rollover_days: Schema.Number;
    readonly strike_weight: Schema.Number;
    readonly image: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly strike_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
    readonly total_strikes: Schema.optionalKey<Schema.Number>;
    readonly total_weight: Schema.optionalKey<Schema.Number>;
}>, readonly []>;
export declare const BotDeleteStrikeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly strikeId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly strike_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
    readonly total_strikes: Schema.optionalKey<Schema.Number>;
    readonly total_weight: Schema.optionalKey<Schema.Number>;
}>, readonly []>;
export declare const BotRostersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly minTownhall: Schema.NullOr<Schema.Number>;
        readonly maxTownhall: Schema.NullOr<Schema.Number>;
        readonly rosterRoleId: Schema.NullOr<Schema.String>;
        readonly memberGroups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signupEnabled: Schema.Boolean;
            readonly roleId: Schema.NullOr<Schema.String>;
        }>>;
        readonly databaseId: Schema.optionalKey<Schema.String>;
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.NullOr<Schema.String>;
        readonly clanTag: Schema.NullOr<Schema.String>;
        readonly publicShareId: Schema.NullOr<Schema.String>;
        readonly displayColumnIds: Schema.$Array<Schema.String>;
        readonly sortConfiguration: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhookId: Schema.NullOr<Schema.String>;
        readonly messageId: Schema.NullOr<Schema.String>;
        readonly questionnaire: Schema.Struct<{
            readonly accountSelector: Schema.Struct<{
                readonly id: Schema.String;
                readonly type: Schema.String;
                readonly required: Schema.Boolean;
            }>;
            readonly questions: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.String;
                readonly required: Schema.Boolean;
                readonly options: Schema.$Array<Schema.String>;
                readonly order: Schema.Number;
            }>>;
        }>;
        readonly memberCount: Schema.Number;
        readonly refreshedAt: Schema.NullOr<Schema.String>;
        readonly revision: Schema.Number;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>>;
}>, readonly []>;
export declare const BotRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly minTownhall: Schema.NullOr<Schema.Number>;
        readonly maxTownhall: Schema.NullOr<Schema.Number>;
        readonly rosterRoleId: Schema.NullOr<Schema.String>;
        readonly memberGroups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signupEnabled: Schema.Boolean;
            readonly roleId: Schema.NullOr<Schema.String>;
        }>>;
        readonly databaseId: Schema.optionalKey<Schema.String>;
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.NullOr<Schema.String>;
        readonly clanTag: Schema.NullOr<Schema.String>;
        readonly publicShareId: Schema.NullOr<Schema.String>;
        readonly displayColumnIds: Schema.$Array<Schema.String>;
        readonly sortConfiguration: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhookId: Schema.NullOr<Schema.String>;
        readonly messageId: Schema.NullOr<Schema.String>;
        readonly questionnaire: Schema.Struct<{
            readonly accountSelector: Schema.Struct<{
                readonly id: Schema.String;
                readonly type: Schema.String;
                readonly required: Schema.Boolean;
            }>;
            readonly questions: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.String;
                readonly required: Schema.Boolean;
                readonly options: Schema.$Array<Schema.String>;
                readonly order: Schema.Number;
            }>>;
        }>;
        readonly memberCount: Schema.Number;
        readonly refreshedAt: Schema.NullOr<Schema.String>;
        readonly revision: Schema.Number;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly memberGroupId: Schema.NullOr<Schema.String>;
            readonly isSubstitute: Schema.Boolean;
            readonly playerTag: Schema.String;
            readonly playerName: Schema.String;
            readonly clanTag: Schema.NullOr<Schema.String>;
            readonly clanName: Schema.NullOr<Schema.String>;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.NullOr<Schema.Number>;
            readonly leagueId: Schema.NullOr<Schema.Number>;
            readonly leagueName: Schema.NullOr<Schema.String>;
            readonly heroLevelSum: Schema.Number;
            readonly maxPercent: Schema.NullOr<Schema.Number>;
            readonly warPreference: Schema.NullOr<Schema.Boolean>;
            readonly discordUserId: Schema.NullOr<Schema.String>;
            readonly discordUsername: Schema.NullOr<Schema.String>;
            readonly discordAvatarUrl: Schema.NullOr<Schema.String>;
            readonly lastOnline: Schema.NullOr<Schema.String>;
            readonly refreshedAt: Schema.NullOr<Schema.String>;
            readonly answers: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>;
    }>;
}>, readonly []>;
export declare const BotRefreshRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly scope: Schema.Literals<readonly ["data", "role"]>;
}>, Schema.Struct<{
    readonly refreshId: Schema.String;
    readonly scope: Schema.String;
    readonly status: Schema.String;
    readonly refreshedPlayers: Schema.Number;
    readonly failedPlayers: Schema.Number;
    readonly refreshedAt: Schema.String;
    readonly reused: Schema.Boolean;
    readonly roleId: Schema.optionalKey<Schema.String>;
    readonly roleMemberUserIds: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, readonly []>;
export declare const BotGiveawaysEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ongoing: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly prize: Schema.String;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly status: Schema.String;
        readonly start: Schema.String;
        readonly end: Schema.String;
        readonly winners: Schema.Number;
        readonly mentions: Schema.$Array<Schema.String>;
        readonly textAboveEmbed: Schema.String;
        readonly textInEmbed: Schema.String;
        readonly textOnEnd: Schema.String;
        readonly imageUrl: Schema.optionalKey<Schema.String>;
        readonly profilePictureRequired: Schema.Boolean;
        readonly cocAccountRequired: Schema.Boolean;
        readonly rolesMode: Schema.String;
        readonly roles: Schema.$Array<Schema.String>;
        readonly boosters: Schema.$Array<Schema.Struct<{
            readonly value: Schema.Number;
            readonly roles: Schema.$Array<Schema.String>;
        }>>;
        readonly entries: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly winnersList: Schema.$Array<Schema.Struct<{
            readonly userId: Schema.String;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatarUrl: Schema.optionalKey<Schema.String>;
            readonly inServer: Schema.Boolean;
            readonly status: Schema.String;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
        readonly updated: Schema.Boolean;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly eventPending: Schema.optionalKey<Schema.String>;
        readonly eventPendingAt: Schema.optionalKey<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>>;
    readonly upcoming: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly prize: Schema.String;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly status: Schema.String;
        readonly start: Schema.String;
        readonly end: Schema.String;
        readonly winners: Schema.Number;
        readonly mentions: Schema.$Array<Schema.String>;
        readonly textAboveEmbed: Schema.String;
        readonly textInEmbed: Schema.String;
        readonly textOnEnd: Schema.String;
        readonly imageUrl: Schema.optionalKey<Schema.String>;
        readonly profilePictureRequired: Schema.Boolean;
        readonly cocAccountRequired: Schema.Boolean;
        readonly rolesMode: Schema.String;
        readonly roles: Schema.$Array<Schema.String>;
        readonly boosters: Schema.$Array<Schema.Struct<{
            readonly value: Schema.Number;
            readonly roles: Schema.$Array<Schema.String>;
        }>>;
        readonly entries: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly winnersList: Schema.$Array<Schema.Struct<{
            readonly userId: Schema.String;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatarUrl: Schema.optionalKey<Schema.String>;
            readonly inServer: Schema.Boolean;
            readonly status: Schema.String;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
        readonly updated: Schema.Boolean;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly eventPending: Schema.optionalKey<Schema.String>;
        readonly eventPendingAt: Schema.optionalKey<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>>;
    readonly ended: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly prize: Schema.String;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly status: Schema.String;
        readonly start: Schema.String;
        readonly end: Schema.String;
        readonly winners: Schema.Number;
        readonly mentions: Schema.$Array<Schema.String>;
        readonly textAboveEmbed: Schema.String;
        readonly textInEmbed: Schema.String;
        readonly textOnEnd: Schema.String;
        readonly imageUrl: Schema.optionalKey<Schema.String>;
        readonly profilePictureRequired: Schema.Boolean;
        readonly cocAccountRequired: Schema.Boolean;
        readonly rolesMode: Schema.String;
        readonly roles: Schema.$Array<Schema.String>;
        readonly boosters: Schema.$Array<Schema.Struct<{
            readonly value: Schema.Number;
            readonly roles: Schema.$Array<Schema.String>;
        }>>;
        readonly entries: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly winnersList: Schema.$Array<Schema.Struct<{
            readonly userId: Schema.String;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatarUrl: Schema.optionalKey<Schema.String>;
            readonly inServer: Schema.Boolean;
            readonly status: Schema.String;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
        readonly updated: Schema.Boolean;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly eventPending: Schema.optionalKey<Schema.String>;
        readonly eventPendingAt: Schema.optionalKey<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly serverId: Schema.String;
    readonly prize: Schema.String;
    readonly channelId: Schema.optionalKey<Schema.String>;
    readonly status: Schema.String;
    readonly start: Schema.String;
    readonly end: Schema.String;
    readonly winners: Schema.Number;
    readonly mentions: Schema.$Array<Schema.String>;
    readonly textAboveEmbed: Schema.String;
    readonly textInEmbed: Schema.String;
    readonly textOnEnd: Schema.String;
    readonly imageUrl: Schema.optionalKey<Schema.String>;
    readonly profilePictureRequired: Schema.Boolean;
    readonly cocAccountRequired: Schema.Boolean;
    readonly rolesMode: Schema.String;
    readonly roles: Schema.$Array<Schema.String>;
    readonly boosters: Schema.$Array<Schema.Struct<{
        readonly value: Schema.Number;
        readonly roles: Schema.$Array<Schema.String>;
    }>>;
    readonly entries: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly winnersList: Schema.$Array<Schema.Struct<{
        readonly userId: Schema.String;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatarUrl: Schema.optionalKey<Schema.String>;
        readonly inServer: Schema.Boolean;
        readonly status: Schema.String;
        readonly timestamp: Schema.optionalKey<Schema.String>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
    readonly updated: Schema.Boolean;
    readonly messageId: Schema.optionalKey<Schema.String>;
    readonly eventPending: Schema.optionalKey<Schema.String>;
    readonly eventPendingAt: Schema.optionalKey<Schema.String>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const BotRerollGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly user_ids_to_replace: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
    readonly newWinners: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const BotRemindersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly war_reminders: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly type: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly time: Schema.String;
        readonly custom_text: Schema.optionalKey<Schema.String>;
        readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
        readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly point_threshold: Schema.optionalKey<Schema.Number>;
        readonly attack_threshold: Schema.optionalKey<Schema.Number>;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly ping_type: Schema.optionalKey<Schema.String>;
    }>>;
    readonly capital_reminders: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly type: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly time: Schema.String;
        readonly custom_text: Schema.optionalKey<Schema.String>;
        readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
        readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly point_threshold: Schema.optionalKey<Schema.Number>;
        readonly attack_threshold: Schema.optionalKey<Schema.Number>;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly ping_type: Schema.optionalKey<Schema.String>;
    }>>;
    readonly clan_games_reminders: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly type: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly time: Schema.String;
        readonly custom_text: Schema.optionalKey<Schema.String>;
        readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
        readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly point_threshold: Schema.optionalKey<Schema.Number>;
        readonly attack_threshold: Schema.optionalKey<Schema.Number>;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly ping_type: Schema.optionalKey<Schema.String>;
    }>>;
    readonly inactivity_reminders: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly type: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly time: Schema.String;
        readonly custom_text: Schema.optionalKey<Schema.String>;
        readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
        readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly point_threshold: Schema.optionalKey<Schema.Number>;
        readonly attack_threshold: Schema.optionalKey<Schema.Number>;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly ping_type: Schema.optionalKey<Schema.String>;
    }>>;
    readonly roster_reminders: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly type: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly time: Schema.String;
        readonly custom_text: Schema.optionalKey<Schema.String>;
        readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
        readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly point_threshold: Schema.optionalKey<Schema.Number>;
        readonly attack_threshold: Schema.optionalKey<Schema.Number>;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly ping_type: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const BotTicketsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly server_id: Schema.String;
        readonly embed_name: Schema.optionalKey<Schema.String>;
        readonly components: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly custom_id: Schema.String;
            readonly label: Schema.String;
            readonly style: Schema.Number;
            readonly emoji: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.optionalKey<Schema.String>;
                readonly name: Schema.optionalKey<Schema.String>;
                readonly animated: Schema.optionalKey<Schema.Boolean>;
            }>>;
            readonly type: Schema.Number;
        }>>;
        readonly button_settings: Schema.$Record<Schema.String, Schema.Struct<{
            readonly questions: Schema.$Array<Schema.String>;
            readonly mod_role: Schema.$Array<Schema.String>;
            readonly no_ping_mod_role: Schema.$Array<Schema.String>;
            readonly private_thread: Schema.Boolean;
            readonly th_min: Schema.Number;
            readonly num_apply: Schema.Number;
            readonly naming: Schema.String;
            readonly account_apply: Schema.Boolean;
            readonly player_info: Schema.Boolean;
            readonly apply_clans: Schema.$Array<Schema.String>;
            readonly roles_to_add: Schema.$Array<Schema.String>;
            readonly roles_to_remove: Schema.$Array<Schema.String>;
            readonly townhall_requirements: Schema.$Record<Schema.String, Schema.Number>;
            readonly new_message: Schema.optionalKey<Schema.String>;
        }>>;
        readonly open_category: Schema.optionalKey<Schema.String>;
        readonly sleep_category: Schema.optionalKey<Schema.String>;
        readonly closed_category: Schema.optionalKey<Schema.String>;
        readonly status_change_log: Schema.optionalKey<Schema.String>;
        readonly ticket_button_click_log: Schema.optionalKey<Schema.String>;
        readonly ticket_close_log: Schema.optionalKey<Schema.String>;
        readonly approve_messages: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly message: Schema.String;
        }>>;
    }>>;
    readonly total: Schema.Number;
    readonly available_embeds: Schema.$Array<Schema.String>;
    readonly townhall_requirement_fields: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const BotEmbedsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly data: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const BotBasesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly offset: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly channelId: Schema.String;
        readonly messageId: Schema.String;
        readonly baseLink: Schema.String;
        readonly images: Schema.$Array<Schema.String>;
        readonly description: Schema.String;
        readonly downloadCount: Schema.Number;
        readonly upvotes: Schema.Number;
        readonly downvotes: Schema.Number;
        readonly downloaders: Schema.$Array<Schema.String>;
        readonly createdAt: Schema.String;
        readonly discordMessageUrl: Schema.String;
    }>>;
    readonly total: Schema.Number;
    readonly limit: Schema.Number;
    readonly offset: Schema.Number;
}>, readonly []>;
export declare const BotBaseEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly baseId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly serverId: Schema.String;
    readonly channelId: Schema.String;
    readonly messageId: Schema.String;
    readonly baseLink: Schema.String;
    readonly images: Schema.$Array<Schema.String>;
    readonly description: Schema.String;
    readonly downloadCount: Schema.Number;
    readonly upvotes: Schema.Number;
    readonly downvotes: Schema.Number;
    readonly downloaders: Schema.$Array<Schema.String>;
    readonly createdAt: Schema.String;
    readonly discordMessageUrl: Schema.String;
}>, readonly []>;
//# sourceMappingURL=bot-server.d.ts.map