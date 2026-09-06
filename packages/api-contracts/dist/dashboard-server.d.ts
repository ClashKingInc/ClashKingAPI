import { Schema } from "effect";
import { JsonValue } from "./expo-common.js";
export declare const DashboardServerPath: Schema.Struct<{
    readonly serverId: Schema.String;
}>;
export declare const DashboardGuildPath: Schema.Struct<{
    readonly guildId: Schema.String;
}>;
export declare const DashboardServerClanPath: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>;
export declare const DashboardAccessLevel: Schema.Literals<readonly ["view", "manage"]>;
export declare const DashboardAccessGrant: Schema.Struct<{
    readonly role_id: Schema.String;
    readonly section: Schema.String;
    readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
}>;
export declare const DashboardAccessRole: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly color: Schema.Number;
    readonly position: Schema.Number;
}>;
export declare const DashboardAccessConfig: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
    }>>;
    readonly grants: Schema.$Array<Schema.Struct<{
        readonly role_id: Schema.String;
        readonly section: Schema.String;
        readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
    }>>;
    readonly sections: Schema.$Array<Schema.String>;
}>;
export declare const DashboardAccessUpdate: Schema.Struct<{
    readonly grants: Schema.$Array<Schema.Struct<{
        readonly role_id: Schema.String;
        readonly section: Schema.String;
        readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
    }>>;
}>;
export declare const DashboardCapabilities: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly full_access: Schema.Boolean;
    readonly sections: Schema.$Record<Schema.String, Schema.Literals<readonly ["view", "manage"]>>;
}>;
export declare const BotGuildProfile: Schema.Struct<{
    readonly name: Schema.String;
    readonly avatar_url: Schema.NullOr<Schema.String>;
    readonly banner_url: Schema.NullOr<Schema.String>;
    readonly bio: Schema.String;
    readonly name_inherited: Schema.Boolean;
    readonly avatar_inherited: Schema.Boolean;
    readonly banner_inherited: Schema.Boolean;
    readonly bio_inherited: Schema.Boolean;
}>;
export declare const BotGuildProfileUpdate: Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly avatar: Schema.optionalKey<Schema.String>;
    readonly banner: Schema.optionalKey<Schema.String>;
    readonly bio: Schema.optionalKey<Schema.String>;
    readonly clear_name: Schema.optionalKey<Schema.Boolean>;
    readonly clear_avatar: Schema.optionalKey<Schema.Boolean>;
    readonly clear_banner: Schema.optionalKey<Schema.Boolean>;
    readonly clear_bio: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const GuildInfo: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly icon: Schema.NullOr<Schema.String>;
    readonly owner: Schema.Boolean;
    readonly permissions: Schema.String;
    readonly role: Schema.String;
    readonly features: Schema.$Array<Schema.String>;
    readonly has_bot: Schema.Boolean;
    readonly member_count: Schema.optionalKey<Schema.Number>;
    readonly delegated: Schema.Boolean;
    readonly last_command_at: Schema.optionalKey<Schema.String>;
    readonly inactive: Schema.Boolean;
}>;
export declare const GuildDetails: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly icon: Schema.NullOr<Schema.String>;
    readonly owner_id: Schema.NullOr<Schema.String>;
    readonly features: Schema.$Array<Schema.String>;
    readonly member_count: Schema.NullOr<Schema.Number>;
    readonly description: Schema.NullOr<Schema.String>;
    readonly banner: Schema.NullOr<Schema.String>;
    readonly premium_tier: Schema.Number;
    readonly boost_count: Schema.Number;
}>;
export declare const MessageResponse: Schema.Struct<{
    readonly message: Schema.String;
}>;
export declare const LinkParseSettings: Schema.Struct<{
    readonly clan: Schema.optionalKey<Schema.Boolean>;
    readonly army: Schema.optionalKey<Schema.Boolean>;
    readonly player: Schema.optionalKey<Schema.Boolean>;
    readonly base: Schema.optionalKey<Schema.Boolean>;
    readonly show: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const ServerSettingsUpdate: Schema.Struct<{
    readonly require_api_token_when_linking: Schema.optionalKey<Schema.Boolean>;
    readonly embed_color: Schema.optionalKey<Schema.Number>;
    readonly nickname_rule: Schema.optionalKey<Schema.String>;
    readonly non_family_nickname_rule: Schema.optionalKey<Schema.String>;
    readonly change_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly flair_non_family: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
    readonly autoeval: Schema.optionalKey<Schema.Boolean>;
    readonly full_whitelist_role: Schema.optionalKey<Schema.String>;
    readonly autoboard_limit: Schema.optionalKey<Schema.Number>;
    readonly tied: Schema.optionalKey<Schema.Boolean>;
    readonly family_label: Schema.optionalKey<Schema.String>;
    readonly link_parse: Schema.optionalKey<Schema.Struct<{
        readonly clan: Schema.optionalKey<Schema.Boolean>;
        readonly army: Schema.optionalKey<Schema.Boolean>;
        readonly player: Schema.optionalKey<Schema.Boolean>;
        readonly base: Schema.optionalKey<Schema.Boolean>;
        readonly show: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>;
export declare const ServerSettingsResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly updated_fields: Schema.Number;
}>;
export declare const EmbedColorResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly embed_color: Schema.Number;
}>;
export declare const ClanCategory: Schema.Struct<{
    readonly id: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly position: Schema.Number;
    readonly clanCount: Schema.Number;
}>;
export declare const ClanCategoriesResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>;
export declare const ClanCategoryMutationResponse: Schema.Struct<{
    readonly category: Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>;
}>;
export declare const ClanCategoryDeletePreview: Schema.Struct<{
    readonly category: Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>;
    readonly affectedClanCount: Schema.Number;
}>;
export declare const ClanCategoryDeleteResponse: Schema.Struct<{
    readonly categoryId: Schema.String;
    readonly name: Schema.String;
    readonly deleted: Schema.Boolean;
    readonly uncategorizedClanCount: Schema.Number;
}>;
export declare const ClanSettingsUpdate: Schema.Struct<{
    readonly category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly abbreviation: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanSettings: Schema.Struct<{
    readonly category: Schema.optionalKey<Schema.String>;
    readonly abbreviation: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanSettingsDetail: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly server_id: Schema.String;
    readonly category: Schema.optionalKey<Schema.String>;
    readonly abbreviation: Schema.optionalKey<Schema.String>;
}>;
export declare const ClanSettingsResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly updated_fields: Schema.Number;
    readonly category: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>>;
}>;
export declare const ClanReference: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
}>;
export declare const ServerClanListItem: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly badge_url: Schema.optionalKey<Schema.String>;
    readonly level: Schema.optionalKey<Schema.Number>;
    readonly member_count: Schema.optionalKey<Schema.Number>;
    readonly added_at: Schema.String;
    readonly settings: Schema.Struct<{
        readonly category: Schema.optionalKey<Schema.String>;
        readonly abbreviation: Schema.optionalKey<Schema.String>;
    }>;
}>;
export declare const AddClanRequest: Schema.Struct<{
    readonly tag: Schema.String;
}>;
export declare const AddClanResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
}>;
export declare const RemoveClanResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly deleted_count: Schema.Number;
}>;
export declare const ServerRoleType: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
export declare const ServerRoleMode: Schema.Literals<readonly ["both", "add", "remove"]>;
export declare const DiscordRole: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly color: Schema.Number;
    readonly position: Schema.Number;
    readonly managed: Schema.Boolean;
    readonly mentionable: Schema.Boolean;
}>;
export declare const DiscordRolesResponse: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
        readonly managed: Schema.Boolean;
        readonly mentionable: Schema.Boolean;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const ServerRole: Schema.Struct<{
    readonly id: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
    readonly option: Schema.String;
    readonly role_id: Schema.String;
    readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const ServerRoleCreate: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
    readonly option: Schema.String;
    readonly role_id: Schema.String;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["both", "add", "remove"]>>;
}>;
export declare const ServerRoleUpdate: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>>;
    readonly option: Schema.optionalKey<Schema.String>;
    readonly role_id: Schema.optionalKey<Schema.String>;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["both", "add", "remove"]>>;
}>;
export declare const ServerRolesResponse: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const ServerRoleResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly role: Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const RoleSettings: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly auto_eval_status: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
}>;
export declare const RoleSettingsUpdate: Schema.Struct<{
    readonly auto_eval_status: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
}>;
export declare const RoleSettingsMutationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
}>;
export declare const ServerLog: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.String;
    readonly webhook_id: Schema.String;
    readonly channel_id: Schema.optionalKey<Schema.String>;
    readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly disabled: Schema.Boolean;
}>;
export declare const ServerLogsResponse: Schema.Struct<{
    readonly logs: Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const UpdateServerLogsRequest: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly channel_id: Schema.String;
    readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly log_types: Schema.$Array<Schema.String>;
}>;
export declare const UpdateServerLogsDisabledRequest: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly log_types: Schema.$Array<Schema.String>;
    readonly disabled: Schema.Boolean;
}>;
export declare const ServerLogsDeleteQuery: Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly log_types: Schema.String;
}>;
export declare const ServerLogsOperationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly updated_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly deleted_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly logs: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>>;
}>;
export declare const CountdownType: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
export declare const CountdownStatus: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly name: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly channel_id: Schema.optionalKey<Schema.String>;
}>;
export declare const ServerCountdownsResponse: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly countdowns: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly name: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly channel_id: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const ClanCountdownsResponse: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly countdowns: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly name: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly channel_id: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const CountdownMutationRequest: Schema.Struct<{
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
}>;
export declare const EnableCountdownResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly channel_id: Schema.String;
    readonly channel_name: Schema.String;
}>;
export declare const DisableCountdownResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
}>;
export declare const DiscordChannel: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly type: Schema.Literals<readonly ["category", "text", "news", "forum"]>;
    readonly parent_id: Schema.optionalKey<Schema.String>;
    readonly parent_name: Schema.optionalKey<Schema.String>;
}>;
export declare const DiscordThread: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly parent_channel_id: Schema.String;
    readonly parent_channel_name: Schema.String;
    readonly archived: Schema.Boolean;
}>;
export declare const Reminder: Schema.Struct<{
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
}>;
export declare const RemindersResponse: Schema.Struct<{
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
}>;
export declare const CreateReminderRequest: Schema.Struct<{
    readonly type: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly channel_id: Schema.String;
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
}>;
export declare const UpdateReminderRequest: Schema.Struct<{
    readonly channel_id: Schema.optionalKey<Schema.String>;
    readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly time: Schema.optionalKey<Schema.String>;
    readonly custom_text: Schema.optionalKey<Schema.String>;
    readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
    readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly point_threshold: Schema.optionalKey<Schema.Number>;
    readonly attack_threshold: Schema.optionalKey<Schema.Number>;
    readonly ping_type: Schema.optionalKey<Schema.String>;
}>;
export declare const ReminderOperationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly reminder_id: Schema.String;
    readonly server_id: Schema.String;
}>;
export declare const BanRequest: Schema.Struct<{
    readonly reason: Schema.NullOr<Schema.String>;
    readonly added_by: Schema.String;
    readonly image: Schema.NullOr<Schema.String>;
}>;
export declare const BanEdit: Schema.Struct<{
    readonly user: Schema.String;
    readonly previous: Schema.Struct<{
        readonly reason: Schema.String;
    }>;
}>;
export declare const BannedPlayer: Schema.Struct<{
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
}>;
export declare const BansResponse: Schema.Struct<{
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
}>;
export declare const BanMutationResponse: Schema.Struct<{
    readonly status: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
}>;
export declare const SearchPlayerReference: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
}>;
export declare const SearchBannedPlayersResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
    }>>;
}>;
export declare const StrikeRequest: Schema.Struct<{
    readonly reason: Schema.optionalKey<Schema.String>;
    readonly added_by: Schema.optionalKey<Schema.String>;
    readonly rollover_days: Schema.optionalKey<Schema.Number>;
    readonly strike_weight: Schema.optionalKey<Schema.Number>;
    readonly image: Schema.optionalKey<Schema.String>;
}>;
export declare const Strike: Schema.Struct<{
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
}>;
export declare const StrikesResponse: Schema.Struct<{
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
}>;
export declare const StrikeMutationResponse: Schema.Struct<{
    readonly status: Schema.String;
    readonly strike_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
    readonly total_strikes: Schema.optionalKey<Schema.Number>;
    readonly total_weight: Schema.optionalKey<Schema.Number>;
}>;
export declare const StrikeSummary: Schema.Struct<{
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
}>;
export declare const GiveawayBooster: Schema.Struct<{
    readonly value: Schema.Number;
    readonly roles: Schema.$Array<Schema.String>;
}>;
export declare const GiveawayWinner: Schema.Struct<{
    readonly userId: Schema.String;
    readonly username: Schema.optionalKey<Schema.String>;
    readonly avatarUrl: Schema.optionalKey<Schema.String>;
    readonly inServer: Schema.Boolean;
    readonly status: Schema.Literals<readonly ["winner", "rerolled"]>;
    readonly timestamp: Schema.optionalKey<Schema.String>;
    readonly reason: Schema.optionalKey<Schema.String>;
}>;
export declare const GiveawayEntry: Schema.Union<readonly [Schema.String, Schema.Struct<{
    readonly user_id: Schema.String;
}>]>;
export declare const Giveaway: Schema.Struct<{
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
}>;
export declare const GiveawaysResponse: Schema.Struct<{
    readonly ongoing: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly upcoming: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly ended: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly total: Schema.Number;
}>;
export declare const GiveawayMutationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
}>;
export declare const GiveawayEntrant: Schema.Struct<{
    readonly userId: Schema.String;
    readonly entries: Schema.Number;
    readonly winChance: Schema.Number;
}>;
export declare const GiveawayEntriesResponse: Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
    readonly totalEntries: Schema.Number;
    readonly uniqueUsers: Schema.Number;
    readonly entrants: Schema.$Array<Schema.Struct<{
        readonly userId: Schema.String;
        readonly entries: Schema.Number;
        readonly winChance: Schema.Number;
    }>>;
}>;
export declare const GiveawayRerollRequest: Schema.Struct<{
    readonly user_ids_to_replace: Schema.$Array<Schema.String>;
}>;
export declare const GiveawayRerollResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
    readonly newWinners: Schema.$Array<Schema.String>;
}>;
export declare const DiscordEmoji: Schema.Struct<{
    readonly id: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly animated: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const TicketButton: Schema.Struct<{
    readonly custom_id: Schema.String;
    readonly label: Schema.String;
    readonly style: Schema.Number;
    readonly emoji: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly animated: Schema.optionalKey<Schema.Boolean>;
    }>>;
    readonly type: Schema.Number;
}>;
export declare const TicketButtonSettings: Schema.Struct<{
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
    readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
    readonly new_message: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const ApproveMessage: Schema.Struct<{
    readonly name: Schema.String;
    readonly message: Schema.String;
}>;
export declare const ApproveMessages: Schema.$Array<Schema.Struct<{
    readonly name: Schema.String;
    readonly message: Schema.String;
}>>;
export declare const TicketPanel: Schema.Struct<{
    readonly name: Schema.String;
    readonly server_id: Schema.String;
    readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly components: Schema.$Array<Schema.Struct<{
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
        readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
        readonly new_message: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>;
    readonly open_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly sleep_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly closed_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly status_change_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_button_click_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_close_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly approve_messages: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly message: Schema.String;
    }>>;
}>;
export declare const TicketPanelsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly server_id: Schema.String;
        readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly components: Schema.$Array<Schema.Struct<{
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
            readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
            readonly new_message: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        }>>;
        readonly open_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly sleep_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly closed_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly status_change_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ticket_button_click_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ticket_close_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly approve_messages: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly message: Schema.String;
        }>>;
    }>>;
    readonly total: Schema.Number;
    readonly available_embeds: Schema.$Array<Schema.String>;
    readonly townhall_requirement_fields: Schema.$Array<Schema.String>;
}>;
export declare const CreateTicketPanelRequest: Schema.Struct<{
    readonly name: Schema.String;
}>;
export declare const UpdateTicketPanelRequest: Schema.Struct<{
    readonly open_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly sleep_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly closed_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly status_change_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_button_click_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_close_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const CreateTicketButtonRequest: Schema.Struct<{
    readonly label: Schema.String;
    readonly style: Schema.Number;
    readonly emoji: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly animated: Schema.optionalKey<Schema.Boolean>;
    }>>>;
}>;
export declare const UpdateTicketButtonAppearanceRequest: Schema.Struct<{
    readonly label: Schema.String;
    readonly style: Schema.Number;
    readonly emoji: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly animated: Schema.optionalKey<Schema.Boolean>;
    }>>>;
}>;
export declare const UpdateTicketButtonSettingsRequest: Schema.Struct<{
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
    readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
    readonly new_message: Schema.NullOr<Schema.String>;
}>;
export declare const UpdateApproveMessagesRequest: Schema.Struct<{
    readonly messages: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly message: Schema.String;
    }>>;
}>;
export declare const DiscordEmbedFooter: Schema.Struct<{
    readonly text: Schema.String;
    readonly icon_url: Schema.optionalKey<Schema.String>;
}>;
export declare const DiscordEmbedMedia: Schema.Struct<{
    readonly url: Schema.String;
}>;
export declare const DiscordEmbedAuthor: Schema.Struct<{
    readonly name: Schema.String;
    readonly url: Schema.optionalKey<Schema.String>;
    readonly icon_url: Schema.optionalKey<Schema.String>;
}>;
export declare const DiscordEmbedField: Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly inline: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const DiscordEmbed: Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly url: Schema.optionalKey<Schema.String>;
    readonly timestamp: Schema.optionalKey<Schema.String>;
    readonly color: Schema.optionalKey<Schema.Number>;
    readonly footer: Schema.optionalKey<Schema.Struct<{
        readonly text: Schema.String;
        readonly icon_url: Schema.optionalKey<Schema.String>;
    }>>;
    readonly image: Schema.optionalKey<Schema.Struct<{
        readonly url: Schema.String;
    }>>;
    readonly thumbnail: Schema.optionalKey<Schema.Struct<{
        readonly url: Schema.String;
    }>>;
    readonly author: Schema.optionalKey<Schema.Struct<{
        readonly name: Schema.String;
        readonly url: Schema.optionalKey<Schema.String>;
        readonly icon_url: Schema.optionalKey<Schema.String>;
    }>>;
    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly inline: Schema.optionalKey<Schema.Boolean>;
    }>>>;
}>;
export declare const DiscordWebhookPayload: Schema.StructWithRest<Schema.Struct<{
    readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly username: Schema.optionalKey<Schema.String>;
    readonly avatar_url: Schema.optionalKey<Schema.String>;
    readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly title: Schema.optionalKey<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly url: Schema.optionalKey<Schema.String>;
        readonly timestamp: Schema.optionalKey<Schema.String>;
        readonly color: Schema.optionalKey<Schema.Number>;
        readonly footer: Schema.optionalKey<Schema.Struct<{
            readonly text: Schema.String;
            readonly icon_url: Schema.optionalKey<Schema.String>;
        }>>;
        readonly image: Schema.optionalKey<Schema.Struct<{
            readonly url: Schema.String;
        }>>;
        readonly thumbnail: Schema.optionalKey<Schema.Struct<{
            readonly url: Schema.String;
        }>>;
        readonly author: Schema.optionalKey<Schema.Struct<{
            readonly name: Schema.String;
            readonly url: Schema.optionalKey<Schema.String>;
            readonly icon_url: Schema.optionalKey<Schema.String>;
        }>>;
        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly value: Schema.String;
            readonly inline: Schema.optionalKey<Schema.Boolean>;
        }>>>;
    }>>>;
    readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
    readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
        readonly data: Schema.StructWithRest<Schema.Struct<{
            readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatar_url: Schema.optionalKey<Schema.String>;
            readonly tts: Schema.optionalKey<Schema.Boolean>;
            readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly title: Schema.optionalKey<Schema.String>;
                readonly description: Schema.optionalKey<Schema.String>;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly timestamp: Schema.optionalKey<Schema.String>;
                readonly color: Schema.optionalKey<Schema.Number>;
                readonly footer: Schema.optionalKey<Schema.Struct<{
                    readonly text: Schema.String;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly image: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly author: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly value: Schema.String;
                    readonly inline: Schema.optionalKey<Schema.Boolean>;
                }>>>;
            }>>>;
            readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
            readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
            readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
            readonly flags: Schema.optionalKey<Schema.Number>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
    }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
    readonly application_id: Schema.optionalKey<Schema.String>;
}>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
export declare const ServerEmbed: Schema.Struct<{
    readonly name: Schema.String;
    readonly data: Schema.StructWithRest<Schema.Struct<{
        readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatar_url: Schema.optionalKey<Schema.String>;
        readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly title: Schema.optionalKey<Schema.String>;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly url: Schema.optionalKey<Schema.String>;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly color: Schema.optionalKey<Schema.Number>;
            readonly footer: Schema.optionalKey<Schema.Struct<{
                readonly text: Schema.String;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly image: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly author: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly value: Schema.String;
                readonly inline: Schema.optionalKey<Schema.Boolean>;
            }>>>;
        }>>>;
        readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
        readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
            readonly data: Schema.StructWithRest<Schema.Struct<{
                readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly username: Schema.optionalKey<Schema.String>;
                readonly avatar_url: Schema.optionalKey<Schema.String>;
                readonly tts: Schema.optionalKey<Schema.Boolean>;
                readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly title: Schema.optionalKey<Schema.String>;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly timestamp: Schema.optionalKey<Schema.String>;
                    readonly color: Schema.optionalKey<Schema.Number>;
                    readonly footer: Schema.optionalKey<Schema.Struct<{
                        readonly text: Schema.String;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly image: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly author: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly value: Schema.String;
                        readonly inline: Schema.optionalKey<Schema.Boolean>;
                    }>>>;
                }>>>;
                readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                readonly flags: Schema.optionalKey<Schema.Number>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
        readonly application_id: Schema.optionalKey<Schema.String>;
    }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
}>;
export declare const ServerEmbedsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly data: Schema.StructWithRest<Schema.Struct<{
            readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatar_url: Schema.optionalKey<Schema.String>;
            readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly title: Schema.optionalKey<Schema.String>;
                readonly description: Schema.optionalKey<Schema.String>;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly timestamp: Schema.optionalKey<Schema.String>;
                readonly color: Schema.optionalKey<Schema.Number>;
                readonly footer: Schema.optionalKey<Schema.Struct<{
                    readonly text: Schema.String;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly image: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly author: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly value: Schema.String;
                    readonly inline: Schema.optionalKey<Schema.Boolean>;
                }>>>;
            }>>>;
            readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
            readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
                readonly data: Schema.StructWithRest<Schema.Struct<{
                    readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                    readonly username: Schema.optionalKey<Schema.String>;
                    readonly avatar_url: Schema.optionalKey<Schema.String>;
                    readonly tts: Schema.optionalKey<Schema.Boolean>;
                    readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly title: Schema.optionalKey<Schema.String>;
                        readonly description: Schema.optionalKey<Schema.String>;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly timestamp: Schema.optionalKey<Schema.String>;
                        readonly color: Schema.optionalKey<Schema.Number>;
                        readonly footer: Schema.optionalKey<Schema.Struct<{
                            readonly text: Schema.String;
                            readonly icon_url: Schema.optionalKey<Schema.String>;
                        }>>;
                        readonly image: Schema.optionalKey<Schema.Struct<{
                            readonly url: Schema.String;
                        }>>;
                        readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                            readonly url: Schema.String;
                        }>>;
                        readonly author: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly url: Schema.optionalKey<Schema.String>;
                            readonly icon_url: Schema.optionalKey<Schema.String>;
                        }>>;
                        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly value: Schema.String;
                            readonly inline: Schema.optionalKey<Schema.Boolean>;
                        }>>>;
                    }>>>;
                    readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                    readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                    readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                    readonly flags: Schema.optionalKey<Schema.Number>;
                }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
            readonly application_id: Schema.optionalKey<Schema.String>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
    }>>;
    readonly total: Schema.Number;
}>;
export declare const UpsertEmbedRequest: Schema.Struct<{
    readonly name: Schema.String;
    readonly data: Schema.StructWithRest<Schema.Struct<{
        readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatar_url: Schema.optionalKey<Schema.String>;
        readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly title: Schema.optionalKey<Schema.String>;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly url: Schema.optionalKey<Schema.String>;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly color: Schema.optionalKey<Schema.Number>;
            readonly footer: Schema.optionalKey<Schema.Struct<{
                readonly text: Schema.String;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly image: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly author: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly value: Schema.String;
                readonly inline: Schema.optionalKey<Schema.Boolean>;
            }>>>;
        }>>>;
        readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
        readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
            readonly data: Schema.StructWithRest<Schema.Struct<{
                readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly username: Schema.optionalKey<Schema.String>;
                readonly avatar_url: Schema.optionalKey<Schema.String>;
                readonly tts: Schema.optionalKey<Schema.Boolean>;
                readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly title: Schema.optionalKey<Schema.String>;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly timestamp: Schema.optionalKey<Schema.String>;
                    readonly color: Schema.optionalKey<Schema.Number>;
                    readonly footer: Schema.optionalKey<Schema.Struct<{
                        readonly text: Schema.String;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly image: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly author: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly value: Schema.String;
                        readonly inline: Schema.optionalKey<Schema.Boolean>;
                    }>>>;
                }>>>;
                readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                readonly flags: Schema.optionalKey<Schema.Number>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
        readonly application_id: Schema.optionalKey<Schema.String>;
    }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
}>;
export declare const ServerPanel: Schema.Struct<{
    readonly embed_name: Schema.optionalKey<Schema.String>;
    readonly buttons: Schema.$Array<Schema.String>;
    readonly button_color: Schema.String;
    readonly welcome_channel: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const UpdateServerPanelRequest: Schema.Struct<{
    readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly buttons: Schema.$Array<Schema.String>;
    readonly button_color: Schema.String;
    readonly welcome_channel: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const Base: Schema.Struct<{
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
}>;
export declare const BasesResponse: Schema.Struct<{
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
}>;
export declare const CreateBaseRequest: Schema.Struct<{
    readonly channelId: Schema.String;
    readonly baseLink: Schema.String;
    readonly images: Schema.$Array<Schema.String>;
    readonly description: Schema.String;
}>;
export declare const BaseDownloader: Schema.Struct<{
    readonly userId: Schema.String;
    readonly displayName: Schema.NullOr<Schema.String>;
    readonly avatarUrl: Schema.NullOr<Schema.String>;
}>;
export declare const BaseDeleteResponse: Schema.Struct<{
    readonly baseId: Schema.String;
    readonly databaseDeleted: Schema.Literal<true>;
    readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing"]>;
}>;
export declare const BaseCreateFailure: Schema.Struct<{
    readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
    readonly message: Schema.String;
    readonly requestId: Schema.optionalKey<Schema.String>;
    readonly databaseInserted: Schema.Literal<false>;
    readonly discordMessageCreated: Schema.Boolean;
    readonly discordMessageId: Schema.optionalKey<Schema.String>;
    readonly discordMessageCleanup: Schema.Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
    readonly retryable: Schema.Boolean;
}>;
export declare const BaseDeleteFailure: Schema.Struct<{
    readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
    readonly message: Schema.String;
    readonly requestId: Schema.optionalKey<Schema.String>;
    readonly baseId: Schema.String;
    readonly databaseDeleted: Schema.Literal<false>;
    readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
    readonly retryable: Schema.Boolean;
}>;
export declare const BaseImageUploadResponse: Schema.Struct<{
    readonly url: Schema.String;
    readonly filename: Schema.String;
}>;
export declare const ServerLinkedAccount: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly town_hall: Schema.optionalKey<Schema.Number>;
    readonly is_verified: Schema.Boolean;
    readonly added_at: Schema.String;
}>;
export declare const ServerLinkRole: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly color: Schema.Number;
    readonly position: Schema.Number;
}>;
export declare const ServerLinkedMember: Schema.Struct<{
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
}>;
export declare const ServerLinksResponse: Schema.Struct<{
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
}>;
export declare const ServerSettings: Schema.Struct<{
    readonly server_id: Schema.String;
    readonly server: Schema.String;
    readonly name: Schema.String;
    readonly require_api_token_when_linking: Schema.Boolean;
    readonly embed_color: Schema.optionalKey<Schema.String>;
    readonly nickname_rule: Schema.optionalKey<Schema.String>;
    readonly non_family_nickname_rule: Schema.optionalKey<Schema.String>;
    readonly change_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly flair_non_family: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
    readonly autoeval: Schema.optionalKey<Schema.Boolean>;
    readonly full_whitelist_role: Schema.optionalKey<Schema.String>;
    readonly autoboard_limit: Schema.optionalKey<Schema.Number>;
    readonly tied: Schema.optionalKey<Schema.Boolean>;
    readonly family_label: Schema.optionalKey<Schema.String>;
    readonly link_parse: Schema.optionalKey<Schema.Struct<{
        readonly clan: Schema.optionalKey<Schema.Boolean>;
        readonly army: Schema.optionalKey<Schema.Boolean>;
        readonly player: Schema.optionalKey<Schema.Boolean>;
        readonly base: Schema.optionalKey<Schema.Boolean>;
        readonly show: Schema.optionalKey<Schema.Boolean>;
    }>>;
    readonly countdowns: Schema.$Record<Schema.String, Schema.String>;
    readonly server_roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly clans: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly server_id: Schema.String;
        readonly category: Schema.optionalKey<Schema.String>;
        readonly abbreviation: Schema.optionalKey<Schema.String>;
    }>>>;
}>;
export declare const DashboardCapabilitiesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly full_access: Schema.Boolean;
    readonly sections: Schema.$Record<Schema.String, Schema.Literals<readonly ["view", "manage"]>>;
}>, readonly []>;
export declare const DashboardAccessEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
    }>>;
    readonly grants: Schema.$Array<Schema.Struct<{
        readonly role_id: Schema.String;
        readonly section: Schema.String;
        readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
    }>>;
    readonly sections: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const UpdateDashboardAccessEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly grants: Schema.$Array<Schema.Struct<{
        readonly role_id: Schema.String;
        readonly section: Schema.String;
        readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
    }>>;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
    }>>;
    readonly grants: Schema.$Array<Schema.Struct<{
        readonly role_id: Schema.String;
        readonly section: Schema.String;
        readonly access_level: Schema.Literals<readonly ["view", "manage"]>;
    }>>;
    readonly sections: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const BotGuildProfileEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly avatar_url: Schema.NullOr<Schema.String>;
    readonly banner_url: Schema.NullOr<Schema.String>;
    readonly bio: Schema.String;
    readonly name_inherited: Schema.Boolean;
    readonly avatar_inherited: Schema.Boolean;
    readonly banner_inherited: Schema.Boolean;
    readonly bio_inherited: Schema.Boolean;
}>, readonly []>;
export declare const UpdateBotGuildProfileEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly avatar: Schema.optionalKey<Schema.String>;
    readonly banner: Schema.optionalKey<Schema.String>;
    readonly bio: Schema.optionalKey<Schema.String>;
    readonly clear_name: Schema.optionalKey<Schema.Boolean>;
    readonly clear_avatar: Schema.optionalKey<Schema.Boolean>;
    readonly clear_banner: Schema.optionalKey<Schema.Boolean>;
    readonly clear_bio: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly avatar_url: Schema.NullOr<Schema.String>;
    readonly banner_url: Schema.NullOr<Schema.String>;
    readonly bio: Schema.String;
    readonly name_inherited: Schema.Boolean;
    readonly avatar_inherited: Schema.Boolean;
    readonly banner_inherited: Schema.Boolean;
    readonly bio_inherited: Schema.Boolean;
}>, readonly []>;
export declare const GuildsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly icon: Schema.NullOr<Schema.String>;
    readonly owner: Schema.Boolean;
    readonly permissions: Schema.String;
    readonly role: Schema.String;
    readonly features: Schema.$Array<Schema.String>;
    readonly has_bot: Schema.Boolean;
    readonly member_count: Schema.optionalKey<Schema.Number>;
    readonly delegated: Schema.Boolean;
    readonly last_command_at: Schema.optionalKey<Schema.String>;
    readonly inactive: Schema.Boolean;
}>>, readonly []>;
export declare const GuildEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly guildId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly icon: Schema.NullOr<Schema.String>;
    readonly owner_id: Schema.NullOr<Schema.String>;
    readonly features: Schema.$Array<Schema.String>;
    readonly member_count: Schema.NullOr<Schema.Number>;
    readonly description: Schema.NullOr<Schema.String>;
    readonly banner: Schema.NullOr<Schema.String>;
    readonly premium_tier: Schema.Number;
    readonly boost_count: Schema.Number;
}>, readonly []>;
export declare const ReactivateServerEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const ServerSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly clan_settings: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly server: Schema.String;
    readonly name: Schema.String;
    readonly require_api_token_when_linking: Schema.Boolean;
    readonly embed_color: Schema.optionalKey<Schema.String>;
    readonly nickname_rule: Schema.optionalKey<Schema.String>;
    readonly non_family_nickname_rule: Schema.optionalKey<Schema.String>;
    readonly change_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly flair_non_family: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
    readonly autoeval: Schema.optionalKey<Schema.Boolean>;
    readonly full_whitelist_role: Schema.optionalKey<Schema.String>;
    readonly autoboard_limit: Schema.optionalKey<Schema.Number>;
    readonly tied: Schema.optionalKey<Schema.Boolean>;
    readonly family_label: Schema.optionalKey<Schema.String>;
    readonly link_parse: Schema.optionalKey<Schema.Struct<{
        readonly clan: Schema.optionalKey<Schema.Boolean>;
        readonly army: Schema.optionalKey<Schema.Boolean>;
        readonly player: Schema.optionalKey<Schema.Boolean>;
        readonly base: Schema.optionalKey<Schema.Boolean>;
        readonly show: Schema.optionalKey<Schema.Boolean>;
    }>>;
    readonly countdowns: Schema.$Record<Schema.String, Schema.String>;
    readonly server_roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly clans: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly server_id: Schema.String;
        readonly category: Schema.optionalKey<Schema.String>;
        readonly abbreviation: Schema.optionalKey<Schema.String>;
    }>>>;
}>, readonly []>;
export declare const UpdateServerSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly require_api_token_when_linking: Schema.optionalKey<Schema.Boolean>;
    readonly embed_color: Schema.optionalKey<Schema.Number>;
    readonly nickname_rule: Schema.optionalKey<Schema.String>;
    readonly non_family_nickname_rule: Schema.optionalKey<Schema.String>;
    readonly change_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly flair_non_family: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
    readonly autoeval: Schema.optionalKey<Schema.Boolean>;
    readonly full_whitelist_role: Schema.optionalKey<Schema.String>;
    readonly autoboard_limit: Schema.optionalKey<Schema.Number>;
    readonly tied: Schema.optionalKey<Schema.Boolean>;
    readonly family_label: Schema.optionalKey<Schema.String>;
    readonly link_parse: Schema.optionalKey<Schema.Struct<{
        readonly clan: Schema.optionalKey<Schema.Boolean>;
        readonly army: Schema.optionalKey<Schema.Boolean>;
        readonly player: Schema.optionalKey<Schema.Boolean>;
        readonly base: Schema.optionalKey<Schema.Boolean>;
        readonly show: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly updated_fields: Schema.Number;
}>, readonly []>;
export declare const ClanSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly server_id: Schema.String;
    readonly category: Schema.optionalKey<Schema.String>;
    readonly abbreviation: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const UpdateClanSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly abbreviation: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly updated_fields: Schema.Number;
    readonly category: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>>;
}>, readonly []>;
export declare const ServerClansEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly badge_url: Schema.optionalKey<Schema.String>;
    readonly level: Schema.optionalKey<Schema.Number>;
    readonly member_count: Schema.optionalKey<Schema.Number>;
    readonly added_at: Schema.String;
    readonly settings: Schema.Struct<{
        readonly category: Schema.optionalKey<Schema.String>;
        readonly abbreviation: Schema.optionalKey<Schema.String>;
    }>;
}>>, readonly []>;
export declare const ServerClansBasicEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
}>>, readonly []>;
export declare const AddServerClanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly tag: Schema.String;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
}>, readonly []>;
export declare const RemoveServerClanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly deleted_count: Schema.Number;
}>, readonly []>;
export declare const UpdateEmbedColorEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly hexCode: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly embed_color: Schema.Number;
}>, readonly []>;
export declare const ServerBansEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly user_id: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
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
export declare const AddServerBanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly user_id: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly reason: Schema.NullOr<Schema.String>;
    readonly added_by: Schema.String;
    readonly image: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const RemoveServerBanEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly user_id: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const SearchBannedPlayersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly guildId: Schema.String;
}>, Schema.Struct<{
    readonly query: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
    }>>;
}>, readonly []>;
export declare const ServerStrikesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const AddServerStrikeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly reason: Schema.optionalKey<Schema.String>;
    readonly added_by: Schema.optionalKey<Schema.String>;
    readonly rollover_days: Schema.optionalKey<Schema.Number>;
    readonly strike_weight: Schema.optionalKey<Schema.Number>;
    readonly image: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly status: Schema.String;
    readonly strike_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly player_name: Schema.optionalKey<Schema.String>;
    readonly server_id: Schema.String;
    readonly total_strikes: Schema.optionalKey<Schema.Number>;
    readonly total_weight: Schema.optionalKey<Schema.Number>;
}>, readonly []>;
export declare const RemoveServerStrikeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const PlayerStrikeSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly playerTag: Schema.String;
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
export declare const DiscordRolesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly color: Schema.Number;
        readonly position: Schema.Number;
        readonly managed: Schema.Boolean;
        readonly mentionable: Schema.Boolean;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const RoleSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly auto_eval_status: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const UpdateRoleSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly auto_eval_status: Schema.optionalKey<Schema.Boolean>;
    readonly auto_eval_nickname: Schema.optionalKey<Schema.Boolean>;
    readonly autoeval_triggers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly autoeval_log: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const ServerRolesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roles: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const CreateServerRoleEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
    readonly option: Schema.String;
    readonly role_id: Schema.String;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["both", "add", "remove"]>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly role: Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const UpdateServerRoleEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly roleId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>>;
    readonly option: Schema.optionalKey<Schema.String>;
    readonly role_id: Schema.optionalKey<Schema.String>;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["both", "add", "remove"]>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly role: Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DeleteServerRoleEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly roleId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly role: Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: Schema.String;
        readonly role_id: Schema.String;
        readonly mode: Schema.Literals<readonly ["both", "add", "remove"]>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const ServerLogsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly logs: Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const SaveServerLogsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly channel_id: Schema.String;
    readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly log_types: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly updated_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly deleted_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly logs: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>>;
}>, readonly []>;
export declare const UpdateServerLogsStateEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly log_types: Schema.$Array<Schema.String>;
    readonly disabled: Schema.Boolean;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly updated_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly deleted_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly logs: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>>;
}>, readonly []>;
export declare const DeleteServerLogsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly log_types: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly updated_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly deleted_log_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly logs: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly type: Schema.String;
        readonly webhook_id: Schema.String;
        readonly channel_id: Schema.optionalKey<Schema.String>;
        readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly disabled: Schema.Boolean;
    }>>>;
}>, readonly []>;
export declare const ServerCountdownsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly countdowns: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly name: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly channel_id: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const ClanCountdownsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly clan_tag: Schema.String;
    readonly countdowns: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly name: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly channel_id: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const EnableCountdownEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly channel_id: Schema.String;
    readonly channel_name: Schema.String;
}>, readonly []>;
export declare const DisableCountdownEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly countdown_type: Schema.Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
}>, readonly []>;
export declare const ServerChannelsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly type: Schema.Literals<readonly ["category", "text", "news", "forum"]>;
    readonly parent_id: Schema.optionalKey<Schema.String>;
    readonly parent_name: Schema.optionalKey<Schema.String>;
}>>, readonly []>;
export declare const ServerThreadsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly parent_channel_id: Schema.String;
    readonly parent_channel_name: Schema.String;
    readonly archived: Schema.Boolean;
}>>, readonly []>;
export declare const ServerRemindersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const CreateServerReminderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly type: Schema.String;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly channel_id: Schema.String;
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
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly reminder_id: Schema.String;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const UpdateServerReminderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly reminderId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly channel_id: Schema.optionalKey<Schema.String>;
    readonly thread_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly time: Schema.optionalKey<Schema.String>;
    readonly custom_text: Schema.optionalKey<Schema.String>;
    readonly townhall_filter: Schema.optionalKey<Schema.$Array<Schema.Number>>;
    readonly roles: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly war_types: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly point_threshold: Schema.optionalKey<Schema.Number>;
    readonly attack_threshold: Schema.optionalKey<Schema.Number>;
    readonly ping_type: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly reminder_id: Schema.String;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const DeleteServerReminderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly reminderId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly reminder_id: Schema.String;
    readonly server_id: Schema.String;
}>, readonly []>;
export declare const ServerGiveawaysEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ongoing: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly upcoming: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly ended: Schema.$Array<Schema.Struct<{
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
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const CreateServerGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
}>, readonly []>;
export declare const UpdateServerGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
}>, readonly []>;
export declare const DeleteServerGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
}>, readonly []>;
export declare const GiveawayEntriesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly serverId: Schema.String;
    readonly totalEntries: Schema.Number;
    readonly uniqueUsers: Schema.Number;
    readonly entrants: Schema.$Array<Schema.Struct<{
        readonly userId: Schema.String;
        readonly entries: Schema.Number;
        readonly winChance: Schema.Number;
    }>>;
}>, readonly []>;
export declare const RerollGiveawayEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const TicketPanelsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly server_id: Schema.String;
        readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly components: Schema.$Array<Schema.Struct<{
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
            readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
            readonly new_message: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        }>>;
        readonly open_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly sleep_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly closed_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly status_change_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ticket_button_click_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ticket_close_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly approve_messages: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly message: Schema.String;
        }>>;
    }>>;
    readonly total: Schema.Number;
    readonly available_embeds: Schema.$Array<Schema.String>;
    readonly townhall_requirement_fields: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const CreateTicketPanelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DeleteTicketPanelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const CreateTicketButtonEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly label: Schema.String;
    readonly style: Schema.Number;
    readonly emoji: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly animated: Schema.optionalKey<Schema.Boolean>;
    }>>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DeleteTicketButtonEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
    readonly customId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const UpdateTicketButtonAppearanceEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
    readonly customId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly label: Schema.String;
    readonly style: Schema.Number;
    readonly emoji: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly animated: Schema.optionalKey<Schema.Boolean>;
    }>>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const UpdateTicketPanelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly open_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly sleep_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly closed_category: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly status_change_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_button_click_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ticket_close_log: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const UpdateTicketButtonSettingsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
    readonly customId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
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
    readonly townhall_requirements: Schema.$Record<Schema.String, Schema.$Record<Schema.String, Schema.Number>>;
    readonly new_message: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const UpdateTicketApproveMessagesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly panelName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly messages: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly message: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const ServerEmbedsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly data: Schema.StructWithRest<Schema.Struct<{
            readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly username: Schema.optionalKey<Schema.String>;
            readonly avatar_url: Schema.optionalKey<Schema.String>;
            readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly title: Schema.optionalKey<Schema.String>;
                readonly description: Schema.optionalKey<Schema.String>;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly timestamp: Schema.optionalKey<Schema.String>;
                readonly color: Schema.optionalKey<Schema.Number>;
                readonly footer: Schema.optionalKey<Schema.Struct<{
                    readonly text: Schema.String;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly image: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                    readonly url: Schema.String;
                }>>;
                readonly author: Schema.optionalKey<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly icon_url: Schema.optionalKey<Schema.String>;
                }>>;
                readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly value: Schema.String;
                    readonly inline: Schema.optionalKey<Schema.Boolean>;
                }>>>;
            }>>>;
            readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
            readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
                readonly data: Schema.StructWithRest<Schema.Struct<{
                    readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                    readonly username: Schema.optionalKey<Schema.String>;
                    readonly avatar_url: Schema.optionalKey<Schema.String>;
                    readonly tts: Schema.optionalKey<Schema.Boolean>;
                    readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly title: Schema.optionalKey<Schema.String>;
                        readonly description: Schema.optionalKey<Schema.String>;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly timestamp: Schema.optionalKey<Schema.String>;
                        readonly color: Schema.optionalKey<Schema.Number>;
                        readonly footer: Schema.optionalKey<Schema.Struct<{
                            readonly text: Schema.String;
                            readonly icon_url: Schema.optionalKey<Schema.String>;
                        }>>;
                        readonly image: Schema.optionalKey<Schema.Struct<{
                            readonly url: Schema.String;
                        }>>;
                        readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                            readonly url: Schema.String;
                        }>>;
                        readonly author: Schema.optionalKey<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly url: Schema.optionalKey<Schema.String>;
                            readonly icon_url: Schema.optionalKey<Schema.String>;
                        }>>;
                        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                            readonly name: Schema.String;
                            readonly value: Schema.String;
                            readonly inline: Schema.optionalKey<Schema.Boolean>;
                        }>>>;
                    }>>>;
                    readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                    readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                    readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                    readonly flags: Schema.optionalKey<Schema.Number>;
                }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
            readonly application_id: Schema.optionalKey<Schema.String>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const CreateServerEmbedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly data: Schema.StructWithRest<Schema.Struct<{
        readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatar_url: Schema.optionalKey<Schema.String>;
        readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly title: Schema.optionalKey<Schema.String>;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly url: Schema.optionalKey<Schema.String>;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly color: Schema.optionalKey<Schema.Number>;
            readonly footer: Schema.optionalKey<Schema.Struct<{
                readonly text: Schema.String;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly image: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly author: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly value: Schema.String;
                readonly inline: Schema.optionalKey<Schema.Boolean>;
            }>>>;
        }>>>;
        readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
        readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
            readonly data: Schema.StructWithRest<Schema.Struct<{
                readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly username: Schema.optionalKey<Schema.String>;
                readonly avatar_url: Schema.optionalKey<Schema.String>;
                readonly tts: Schema.optionalKey<Schema.Boolean>;
                readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly title: Schema.optionalKey<Schema.String>;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly timestamp: Schema.optionalKey<Schema.String>;
                    readonly color: Schema.optionalKey<Schema.Number>;
                    readonly footer: Schema.optionalKey<Schema.Struct<{
                        readonly text: Schema.String;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly image: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly author: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly value: Schema.String;
                        readonly inline: Schema.optionalKey<Schema.Boolean>;
                    }>>>;
                }>>>;
                readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                readonly flags: Schema.optionalKey<Schema.Number>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
        readonly application_id: Schema.optionalKey<Schema.String>;
    }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const UpdateServerEmbedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly embedName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly data: Schema.StructWithRest<Schema.Struct<{
        readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly username: Schema.optionalKey<Schema.String>;
        readonly avatar_url: Schema.optionalKey<Schema.String>;
        readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly title: Schema.optionalKey<Schema.String>;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly url: Schema.optionalKey<Schema.String>;
            readonly timestamp: Schema.optionalKey<Schema.String>;
            readonly color: Schema.optionalKey<Schema.Number>;
            readonly footer: Schema.optionalKey<Schema.Struct<{
                readonly text: Schema.String;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly image: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                readonly url: Schema.String;
            }>>;
            readonly author: Schema.optionalKey<Schema.Struct<{
                readonly name: Schema.String;
                readonly url: Schema.optionalKey<Schema.String>;
                readonly icon_url: Schema.optionalKey<Schema.String>;
            }>>;
            readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly value: Schema.String;
                readonly inline: Schema.optionalKey<Schema.Boolean>;
            }>>>;
        }>>>;
        readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
        readonly messages: Schema.optionalKey<Schema.$Array<Schema.StructWithRest<Schema.Struct<{
            readonly data: Schema.StructWithRest<Schema.Struct<{
                readonly content: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly username: Schema.optionalKey<Schema.String>;
                readonly avatar_url: Schema.optionalKey<Schema.String>;
                readonly tts: Schema.optionalKey<Schema.Boolean>;
                readonly embeds: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly title: Schema.optionalKey<Schema.String>;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly url: Schema.optionalKey<Schema.String>;
                    readonly timestamp: Schema.optionalKey<Schema.String>;
                    readonly color: Schema.optionalKey<Schema.Number>;
                    readonly footer: Schema.optionalKey<Schema.Struct<{
                        readonly text: Schema.String;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly image: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly thumbnail: Schema.optionalKey<Schema.Struct<{
                        readonly url: Schema.String;
                    }>>;
                    readonly author: Schema.optionalKey<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly url: Schema.optionalKey<Schema.String>;
                        readonly icon_url: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly name: Schema.String;
                        readonly value: Schema.String;
                        readonly inline: Schema.optionalKey<Schema.Boolean>;
                    }>>>;
                }>>>;
                readonly components: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly attachments: Schema.optionalKey<Schema.$Array<Schema.Codec<JsonValue, JsonValue, never, never>>>;
                readonly allowed_mentions: Schema.optionalKey<Schema.Codec<JsonValue, JsonValue, never, never>>;
                readonly flags: Schema.optionalKey<Schema.Number>;
            }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
        }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>>>;
        readonly application_id: Schema.optionalKey<Schema.String>;
    }>, readonly [Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>]>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DeleteServerEmbedEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly embedName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const ServerPanelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly embed_name: Schema.optionalKey<Schema.String>;
    readonly buttons: Schema.$Array<Schema.String>;
    readonly button_color: Schema.String;
    readonly welcome_channel: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, readonly []>;
export declare const UpdateServerPanelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly embed_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly buttons: Schema.$Array<Schema.String>;
    readonly button_color: Schema.String;
    readonly welcome_channel: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly embed_name: Schema.optionalKey<Schema.String>;
    readonly buttons: Schema.$Array<Schema.String>;
    readonly button_color: Schema.String;
    readonly welcome_channel: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, readonly []>;
export declare const BasesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const BaseEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
export declare const CreateBaseEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly channelId: Schema.String;
    readonly baseLink: Schema.String;
    readonly images: Schema.$Array<Schema.String>;
    readonly description: Schema.String;
}>, Schema.Struct<{
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
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly databaseInserted: Schema.Literal<false>;
        readonly discordMessageCreated: Schema.Boolean;
        readonly discordMessageId: Schema.optionalKey<Schema.String>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>;
}, {
    readonly status: 500;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly databaseInserted: Schema.Literal<false>;
        readonly discordMessageCreated: Schema.Boolean;
        readonly discordMessageId: Schema.optionalKey<Schema.String>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, {
    readonly status: 502;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly databaseInserted: Schema.Literal<false>;
        readonly discordMessageCreated: Schema.Boolean;
        readonly discordMessageId: Schema.optionalKey<Schema.String>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, {
    readonly status: 503;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly databaseInserted: Schema.Literal<false>;
        readonly discordMessageCreated: Schema.Boolean;
        readonly discordMessageId: Schema.optionalKey<Schema.String>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}]>;
export declare const DeleteBaseEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly baseId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly baseId: Schema.String;
    readonly databaseDeleted: Schema.Literal<true>;
    readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing"]>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly baseId: Schema.String;
        readonly databaseDeleted: Schema.Literal<false>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>;
}, {
    readonly status: 500;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly baseId: Schema.String;
        readonly databaseDeleted: Schema.Literal<false>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, {
    readonly status: 502;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly baseId: Schema.String;
        readonly databaseDeleted: Schema.Literal<false>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, {
    readonly status: 503;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Union<readonly [Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, Schema.Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
        readonly message: Schema.String;
        readonly requestId: Schema.optionalKey<Schema.String>;
        readonly baseId: Schema.String;
        readonly databaseDeleted: Schema.Literal<false>;
        readonly discordMessageCleanup: Schema.Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
        readonly retryable: Schema.Boolean;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}]>;
export declare const UploadBaseImageEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly url: Schema.String;
    readonly filename: Schema.String;
}>, readonly []>;
export declare const BaseDownloaderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly baseId: Schema.String;
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly userId: Schema.String;
    readonly displayName: Schema.NullOr<Schema.String>;
    readonly avatarUrl: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const ClanCategoriesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const CreateClanCategoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
}>, Schema.Struct<{
    readonly category: Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>;
}>, readonly []>;
export declare const RenameClanCategoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly categoryId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
}>, Schema.Struct<{
    readonly category: Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>;
}>, readonly []>;
export declare const ReorderClanCategoriesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly categoryIds: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>>;
    readonly total: Schema.Number;
}>, readonly []>;
export declare const PreviewClanCategoryDeleteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly categoryId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly category: Schema.Struct<{
        readonly id: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly clanCount: Schema.Number;
    }>;
    readonly affectedClanCount: Schema.Number;
}>, readonly []>;
export declare const DeleteClanCategoryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly categoryId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly categoryId: Schema.String;
    readonly name: Schema.String;
    readonly deleted: Schema.Boolean;
    readonly uncategorizedClanCount: Schema.Number;
}>, readonly []>;
export declare const ServerLinksEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
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
//# sourceMappingURL=dashboard-server.d.ts.map