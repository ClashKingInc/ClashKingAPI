import { Schema } from "effect";
export declare const ServerGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly serverId: Schema.String;
    readonly prize: Schema.String;
    readonly channelId: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["scheduled", "ongoing", "ended"]>;
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
    readonly rolesMode: Schema.Literals<readonly ["allow", "deny", "none"]>;
    readonly roles: Schema.$Array<Schema.String>;
    readonly boosters: Schema.$Array<Schema.Struct<{
        readonly value: Schema.Number;
        readonly roles: Schema.$Array<Schema.String>;
    }>>;
    readonly entries: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.Struct<{
        readonly user_id: Schema.String;
    }>]>>;
    readonly winnersList: Schema.$Array<Schema.Struct<{
        readonly userId: Schema.String;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatarUrl: Schema.optionalKey<Schema.String>;
        readonly inServer: Schema.Boolean;
        readonly status: Schema.Literals<readonly ["winner", "rerolled"]>;
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
export declare const AutoBoardSchedule: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
    readonly timeOfDay: Schema.String;
    readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
    readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>;
export declare const AutoBoardWrite: Schema.Struct<{
    readonly boardType: Schema.String;
    readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
    readonly targets: Schema.$Array<Schema.String>;
    readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
    readonly channelId: Schema.String;
    readonly threadId: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly enabled: Schema.Boolean;
    readonly intervalMinutes: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly schedule: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
        readonly timeOfDay: Schema.String;
        readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
        readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>>;
}>;
export declare const AutoBoardConfig: Schema.Struct<{
    readonly id: Schema.String;
    readonly boardType: Schema.String;
    readonly targetKind: Schema.String;
    readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
    readonly targets: Schema.$Array<Schema.String>;
    readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
    readonly channelId: Schema.NullOr<Schema.String>;
    readonly channelDeleted: Schema.Boolean;
    readonly threadId: Schema.NullOr<Schema.String>;
    readonly messageId: Schema.NullOr<Schema.String>;
    readonly enabled: Schema.Boolean;
    readonly intervalMinutes: Schema.NullOr<Schema.Number>;
    readonly schedule: Schema.NullOr<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
        readonly timeOfDay: Schema.String;
        readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
        readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly nextRunAt: Schema.NullOr<Schema.String>;
    readonly lastRunAt: Schema.NullOr<Schema.String>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>;
export declare const AutoBoardCapability: Schema.Struct<{
    readonly boardType: Schema.String;
    readonly label: Schema.String;
    readonly targetKind: Schema.String;
    readonly minTargets: Schema.Number;
    readonly maxTargets: Schema.Number;
    readonly allowedScopes: Schema.$Array<Schema.Literals<readonly ["family", "custom"]>>;
    readonly allowedModes: Schema.$Array<Schema.Literals<readonly ["refresh", "send"]>>;
    readonly refreshInterval: Schema.NullOr<Schema.Struct<{
        readonly minMinutes: Schema.Number;
        readonly maxMinutes: Schema.Number;
        readonly defaultMinutes: Schema.Number;
    }>>;
    readonly uiCapabilities: Schema.$Array<Schema.String>;
}>;
export declare const DiscordStatus: Schema.Struct<{
    readonly status: Schema.Literals<readonly ["success", "error"]>;
    readonly message: Schema.String;
    readonly bot_token_present: Schema.Boolean;
    readonly guild_name: Schema.optionalKey<Schema.String>;
    readonly status_code: Schema.optionalKey<Schema.String>;
}>;
export declare const ServerPlayerRanking: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly player_name: Schema.String;
    readonly townhall_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
    readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly global_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly local_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly country_code: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly country_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly legend_trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>;
export declare const ServerClanRanking: Schema.Struct<{
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
    readonly global_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly local_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly country_code: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly country_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly clan_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly clan_points: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly member_count: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly capital_points: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>;
export declare const ServerDiscordTestEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.Literals<readonly ["success", "error"]>;
    readonly message: Schema.String;
    readonly bot_token_present: Schema.Boolean;
    readonly guild_name: Schema.optionalKey<Schema.String>;
    readonly status_code: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const AutoboardCapabilitiesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly boardTypes: Schema.$Array<Schema.Struct<{
        readonly boardType: Schema.String;
        readonly label: Schema.String;
        readonly targetKind: Schema.String;
        readonly minTargets: Schema.Number;
        readonly maxTargets: Schema.Number;
        readonly allowedScopes: Schema.$Array<Schema.Literals<readonly ["family", "custom"]>>;
        readonly allowedModes: Schema.$Array<Schema.Literals<readonly ["refresh", "send"]>>;
        readonly refreshInterval: Schema.NullOr<Schema.Struct<{
            readonly minMinutes: Schema.Number;
            readonly maxMinutes: Schema.Number;
            readonly defaultMinutes: Schema.Number;
        }>>;
        readonly uiCapabilities: Schema.$Array<Schema.String>;
    }>>;
}>, readonly []>;
export declare const ServerAutoboardsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly boardType: Schema.String;
        readonly targetKind: Schema.String;
        readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
        readonly targets: Schema.$Array<Schema.String>;
        readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
        readonly channelId: Schema.NullOr<Schema.String>;
        readonly channelDeleted: Schema.Boolean;
        readonly threadId: Schema.NullOr<Schema.String>;
        readonly messageId: Schema.NullOr<Schema.String>;
        readonly enabled: Schema.Boolean;
        readonly intervalMinutes: Schema.NullOr<Schema.Number>;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
            readonly timeOfDay: Schema.String;
            readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
            readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        }>>;
        readonly nextRunAt: Schema.NullOr<Schema.String>;
        readonly lastRunAt: Schema.NullOr<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>>;
    readonly total: Schema.Number;
    readonly refreshCount: Schema.Number;
    readonly sendCount: Schema.Number;
    readonly limit: Schema.Number;
}>, readonly []>;
export declare const CreateAutoboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly boardType: Schema.String;
    readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
    readonly targets: Schema.$Array<Schema.String>;
    readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
    readonly channelId: Schema.String;
    readonly threadId: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly enabled: Schema.Boolean;
    readonly intervalMinutes: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly schedule: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
        readonly timeOfDay: Schema.String;
        readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
        readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>>;
}>, Schema.Struct<{
    readonly item: Schema.Struct<{
        readonly id: Schema.String;
        readonly boardType: Schema.String;
        readonly targetKind: Schema.String;
        readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
        readonly targets: Schema.$Array<Schema.String>;
        readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
        readonly channelId: Schema.NullOr<Schema.String>;
        readonly channelDeleted: Schema.Boolean;
        readonly threadId: Schema.NullOr<Schema.String>;
        readonly messageId: Schema.NullOr<Schema.String>;
        readonly enabled: Schema.Boolean;
        readonly intervalMinutes: Schema.NullOr<Schema.Number>;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
            readonly timeOfDay: Schema.String;
            readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
            readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        }>>;
        readonly nextRunAt: Schema.NullOr<Schema.String>;
        readonly lastRunAt: Schema.NullOr<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>;
}>, readonly []>;
export declare const ReplaceAutoboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly autoboardId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly boardType: Schema.String;
    readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
    readonly targets: Schema.$Array<Schema.String>;
    readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
    readonly channelId: Schema.String;
    readonly threadId: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly enabled: Schema.Boolean;
    readonly intervalMinutes: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly schedule: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
        readonly timeOfDay: Schema.String;
        readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
        readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>>;
}>, Schema.Struct<{
    readonly item: Schema.Struct<{
        readonly id: Schema.String;
        readonly boardType: Schema.String;
        readonly targetKind: Schema.String;
        readonly targetScope: Schema.Literals<readonly ["family", "custom"]>;
        readonly targets: Schema.$Array<Schema.String>;
        readonly deliveryMode: Schema.Literals<readonly ["refresh", "send"]>;
        readonly channelId: Schema.NullOr<Schema.String>;
        readonly channelDeleted: Schema.Boolean;
        readonly threadId: Schema.NullOr<Schema.String>;
        readonly messageId: Schema.NullOr<Schema.String>;
        readonly enabled: Schema.Boolean;
        readonly intervalMinutes: Schema.NullOr<Schema.Number>;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["daily", "weekdays", "day_of_month"]>;
            readonly timeOfDay: Schema.String;
            readonly weekdays: Schema.optionalKey<Schema.NullOr<Schema.$Array<Schema.Number>>>;
            readonly dayOfMonth: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        }>>;
        readonly nextRunAt: Schema.NullOr<Schema.String>;
        readonly lastRunAt: Schema.NullOr<Schema.String>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>;
}>, readonly []>;
export declare const DeleteAutoboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly autoboardId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly deleted: Schema.Literal<true>;
}>, readonly []>;
export declare const ServerLeaderboardsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly limit_players: Schema.optionalKey<Schema.Number>;
    readonly limit_clans: Schema.optionalKey<Schema.Number>;
    readonly sort_by: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly total_players: Schema.Number;
    readonly total_clans: Schema.Number;
    readonly players: Schema.$Array<Schema.Struct<{
        readonly player_tag: Schema.String;
        readonly player_name: Schema.String;
        readonly townhall_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly global_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly local_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly location_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly country_code: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly country_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly legend_trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly global_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly local_rank: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly country_code: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly country_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_level: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly clan_points: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly member_count: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly capital_points: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    }>>;
}>, readonly []>;
//# sourceMappingURL=dashboard-server-extra.d.ts.map