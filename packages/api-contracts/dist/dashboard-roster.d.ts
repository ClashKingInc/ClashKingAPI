import { Schema } from "effect";
export declare const DashboardRosterType: Schema.Literals<readonly ["clan", "family"]>;
export declare const DashboardRosterSignupScope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
export declare const DashboardRosterSortDirection: Schema.Literals<readonly ["asc", "desc"]>;
export declare const DashboardRosterSort: Schema.Struct<{
    readonly columnId: Schema.String;
    readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
}>;
export declare const DashboardRosterSignupQuestion: Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
    readonly required: Schema.Boolean;
    readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly order: Schema.Number;
}>;
export declare const DashboardRosterMember: Schema.Struct<{
    readonly member_group_id: Schema.NullOr<Schema.String>;
    readonly is_substitute: Schema.Boolean;
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly townhall: Schema.Number;
    readonly trophies: Schema.optionalKey<Schema.Number>;
    readonly current_clan: Schema.optionalKey<Schema.String>;
    readonly current_clan_tag: Schema.optionalKey<Schema.String>;
    readonly league_id: Schema.optionalKey<Schema.Number>;
    readonly league_name: Schema.optionalKey<Schema.String>;
    readonly hero_level_sum: Schema.Number;
    readonly max_percent: Schema.optionalKey<Schema.Number>;
    readonly war_pref: Schema.optionalKey<Schema.Boolean>;
    readonly discord: Schema.optionalKey<Schema.String>;
    readonly discord_username: Schema.optionalKey<Schema.String>;
    readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
    readonly last_online: Schema.optionalKey<Schema.String>;
    readonly refreshed_at: Schema.optionalKey<Schema.String>;
    readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
    readonly member_status: Schema.optionalKey<Schema.String>;
    readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>;
export declare const DashboardRosterMemberInput: Schema.Struct<{
    readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly tag: Schema.String;
    readonly townhall: Schema.optionalKey<Schema.Number>;
    readonly trophies: Schema.optionalKey<Schema.Number>;
    readonly current_clan: Schema.optionalKey<Schema.String>;
    readonly current_clan_tag: Schema.optionalKey<Schema.String>;
    readonly league_id: Schema.optionalKey<Schema.Number>;
    readonly league_name: Schema.optionalKey<Schema.String>;
    readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
    readonly max_percent: Schema.optionalKey<Schema.Number>;
    readonly war_pref: Schema.optionalKey<Schema.Boolean>;
    readonly discord: Schema.optionalKey<Schema.String>;
    readonly discord_username: Schema.optionalKey<Schema.String>;
    readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
    readonly last_online: Schema.optionalKey<Schema.String>;
    readonly refreshed_at: Schema.optionalKey<Schema.String>;
    readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>;
export declare const DashboardRoster: Schema.Struct<{
    readonly capacity: Schema.Number;
    readonly roster_role_id: Schema.NullOr<Schema.String>;
    readonly member_groups: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly signup_enabled: Schema.Boolean;
        readonly role_id: Schema.NullOr<Schema.String>;
    }>>;
    readonly id: Schema.String;
    readonly server_id: Schema.String;
    readonly alias: Schema.String;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
    readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
    readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.String>;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.NullOr<Schema.String>;
        readonly is_substitute: Schema.Boolean;
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhall: Schema.Number;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.Number;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
        readonly member_status: Schema.optionalKey<Schema.String>;
        readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>;
    readonly min_th: Schema.optionalKey<Schema.Number>;
    readonly max_th: Schema.optionalKey<Schema.Number>;
    readonly min_signups: Schema.optionalKey<Schema.Number>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
    readonly columns: Schema.$Array<Schema.String>;
    readonly sort: Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>;
    readonly webhook_id: Schema.optionalKey<Schema.String>;
    readonly message_id: Schema.optionalKey<Schema.String>;
    readonly image: Schema.optionalKey<Schema.String>;
    readonly event_start_time: Schema.optionalKey<Schema.Number>;
    readonly recurrence_days: Schema.optionalKey<Schema.Number>;
    readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
    readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly order: Schema.Number;
    }>>>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revision: Schema.Number;
}>;
export declare const DashboardCreateRosterRequest: Schema.Struct<{
    readonly capacity: Schema.optionalKey<Schema.Number>;
    readonly roster_role_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly server_id: Schema.optionalKey<Schema.String>;
    readonly alias: Schema.String;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
    readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
    readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
}>;
export declare const DashboardUpdateRosterRequest: Schema.Struct<{
    readonly capacity: Schema.optionalKey<Schema.Number>;
    readonly roster_role_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly roster_type: Schema.optionalKey<Schema.Literals<readonly ["clan", "family"]>>;
    readonly signup_scope: Schema.optionalKey<Schema.Literals<readonly ["clan-only", "family-wide"]>>;
    readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly min_th: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly max_th: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly min_signups: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly columns: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>>;
    readonly webhook_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly message_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly image: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly event_start_time: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly recurrence_days: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly recurrence_day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly order: Schema.Number;
    }>>>;
}>;
export declare const DashboardRosterMessageResponse: Schema.Struct<{
    readonly message: Schema.String;
}>;
export declare const DashboardCreateRosterResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly roster_id: Schema.String;
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>;
export declare const DashboardUpdateRosterResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly roster: Schema.optionalKey<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
}>;
export declare const DashboardGetRosterResponse: Schema.Struct<{
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>;
export declare const DashboardRosterListResponse: Schema.Struct<{
    readonly rosters: Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const DashboardCloneRosterRequest: Schema.Struct<{
    readonly new_alias: Schema.String;
    readonly copy_members: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const DashboardCloneRosterResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly new_roster_id: Schema.String;
    readonly new_alias: Schema.String;
    readonly target_server_id: Schema.String;
    readonly source_server_id: Schema.String;
    readonly members_copied: Schema.Number;
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>;
export declare const DashboardRefreshRostersResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly refreshed_rosters: Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
}>;
export declare const DashboardManageRosterMembersRequest: Schema.Struct<{
    readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
    readonly add: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
    readonly operation: Schema.optionalKey<Schema.Literals<readonly ["add", "remove", "update"]>>;
    readonly player_tags: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>;
export declare const DashboardUpdateRosterMemberRequest: Schema.Struct<{
    readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
    readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>;
export declare const DashboardRefreshRosterMemberResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly member: Schema.Struct<{
        readonly member_group_id: Schema.NullOr<Schema.String>;
        readonly is_substitute: Schema.Boolean;
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhall: Schema.Number;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.Number;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
        readonly member_status: Schema.optionalKey<Schema.String>;
        readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>;
}>;
export declare const DashboardMissingRosterMember: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly townhall: Schema.Number;
    readonly role: Schema.String;
    readonly trophies: Schema.Number;
    readonly discord: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardMissingRosterInfo: Schema.Struct<{
    readonly roster_id: Schema.String;
    readonly alias: Schema.String;
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
    readonly registered_count: Schema.Number;
}>;
export declare const DashboardMissingRosterSummary: Schema.Struct<{
    readonly total_missing: Schema.Number;
    readonly total_clan_members: Schema.Number;
    readonly coverage_percentage: Schema.Number;
}>;
export declare const DashboardMissingRosterResult: Schema.Struct<{
    readonly state: Schema.Literals<readonly ["ok", "error"]>;
    readonly roster_info: Schema.optionalKey<Schema.Struct<{
        readonly roster_id: Schema.String;
        readonly alias: Schema.String;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly registered_count: Schema.Number;
    }>>;
    readonly missing_members: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townhall: Schema.Number;
        readonly role: Schema.String;
        readonly trophies: Schema.Number;
        readonly discord: Schema.optionalKey<Schema.String>;
    }>>;
    readonly summary: Schema.optionalKey<Schema.Struct<{
        readonly total_missing: Schema.Number;
        readonly total_clan_members: Schema.Number;
        readonly coverage_percentage: Schema.Number;
    }>>;
    readonly error_message: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardMissingRosterMembersResponse: Schema.Struct<{
    readonly query_type: Schema.Literals<readonly ["roster", "group"]>;
    readonly query_value: Schema.String;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly state: Schema.Literals<readonly ["ok", "error"]>;
        readonly roster_info: Schema.optionalKey<Schema.Struct<{
            readonly roster_id: Schema.String;
            readonly alias: Schema.String;
            readonly clan_tag: Schema.String;
            readonly clan_name: Schema.String;
            readonly registered_count: Schema.Number;
        }>>;
        readonly missing_members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townhall: Schema.Number;
            readonly role: Schema.String;
            readonly trophies: Schema.Number;
            readonly discord: Schema.optionalKey<Schema.String>;
        }>>;
        readonly summary: Schema.optionalKey<Schema.Struct<{
            readonly total_missing: Schema.Number;
            readonly total_clan_members: Schema.Number;
            readonly coverage_percentage: Schema.Number;
        }>>;
        readonly error_message: Schema.optionalKey<Schema.String>;
    }>>;
    readonly total_rosters_checked: Schema.Number;
}>;
export declare const DashboardServerClanMember: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
    readonly townhall: Schema.Number;
    readonly role: Schema.String;
    readonly trophies: Schema.Number;
}>;
export declare const DashboardServerClanMembersResponse: Schema.Struct<{
    readonly members: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly townhall: Schema.Number;
        readonly role: Schema.String;
        readonly trophies: Schema.Number;
    }>>;
    readonly count: Schema.optionalKey<Schema.Number>;
}>;
export declare const DashboardRosterGroup: Schema.Struct<{
    readonly group_id: Schema.String;
    readonly server_id: Schema.String;
    readonly name: Schema.String;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.String;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
    readonly min_signups: Schema.optionalKey<Schema.Number>;
    readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const DashboardRosterGroupRequest: Schema.Struct<{
    readonly server_id: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly min_signups: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>;
export declare const DashboardCreateRosterGroupResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly group_id: Schema.String;
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const DashboardGetRosterGroupResponse: Schema.Struct<{
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const DashboardUpdateRosterGroupResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const DashboardRosterGroupListResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
}>;
export declare const DashboardDeleteRosterGroupResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly affected_rosters: Schema.Number;
}>;
export declare const DashboardRosterAutomationOptions: Schema.Struct<{
    readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
}>;
export declare const DashboardRosterAutomation: Schema.Struct<{
    readonly automation_id: Schema.String;
    readonly server_id: Schema.String;
    readonly roster_id: Schema.optionalKey<Schema.String>;
    readonly group_id: Schema.optionalKey<Schema.String>;
    readonly action_type: Schema.String;
    readonly trigger_type: Schema.String;
    readonly scheduled_at: Schema.String;
    readonly discord_channel_id: Schema.optionalKey<Schema.String>;
    readonly options: Schema.optionalKey<Schema.Struct<{
        readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
    }>>;
    readonly active: Schema.Boolean;
    readonly executed: Schema.Boolean;
    readonly executed_at: Schema.optionalKey<Schema.Number>;
    readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
    readonly execution_status: Schema.optionalKey<Schema.String>;
    readonly last_missed_at: Schema.optionalKey<Schema.Number>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const DashboardCreateRosterAutomationRequest: Schema.Struct<{
    readonly roster_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly action_type: Schema.String;
    readonly trigger_type: Schema.optionalKey<Schema.String>;
    readonly scheduled_at: Schema.String;
    readonly discord_channel_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly options: Schema.optionalKey<Schema.Struct<{
        readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
    }>>;
    readonly active: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const DashboardUpdateRosterAutomationRequest: Schema.Struct<{
    readonly roster_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly action_type: Schema.optionalKey<Schema.String>;
    readonly trigger_type: Schema.optionalKey<Schema.String>;
    readonly scheduled_at: Schema.optionalKey<Schema.String>;
    readonly discord_channel_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly options: Schema.optionalKey<Schema.Struct<{
        readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
    }>>;
    readonly active: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const DashboardCreateRosterAutomationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly automation_id: Schema.String;
    readonly rule: Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const DashboardUpdateRosterAutomationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly rule: Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>;
export declare const DashboardRosterAutomationListResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly rules: Schema.$Array<Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
    readonly server_id: Schema.String;
    readonly roster_id: Schema.String;
    readonly group_id: Schema.String;
}>;
export declare const DashboardRosterMetric: Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
    readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
    readonly description: Schema.String;
    readonly cacheTtlSeconds: Schema.Number;
    readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>;
export declare const DashboardRosterMetricsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
        readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
        readonly description: Schema.String;
        readonly cacheTtlSeconds: Schema.Number;
        readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
    }>>;
}>;
export declare const DashboardRosterMetricQueryRequest: Schema.Struct<{
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly metricId: Schema.String;
    readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    readonly force: Schema.Boolean;
}>;
export declare const DashboardRosterMetricQueryRow: Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly playerTag: Schema.String;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>;
export declare const DashboardRosterMetricQueryResponse: Schema.Struct<{
    readonly metricId: Schema.String;
    readonly parameters: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly rows: Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly cached: Schema.Boolean;
    readonly evaluatedAt: Schema.String;
}>;
export declare const DashboardRosterViewColumn: Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly metricId: Schema.String;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    readonly format: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardRosterViewFilterOperator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
export declare const DashboardRosterViewFilter: Schema.Struct<{
    readonly columnId: Schema.String;
    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>;
export declare const DashboardRosterViewHighlightCondition: Schema.Struct<{
    readonly columnId: Schema.optionalKey<Schema.String>;
    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>;
export declare const DashboardRosterViewHighlight: Schema.Struct<{
    readonly id: Schema.String;
    readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
    readonly columnId: Schema.optionalKey<Schema.String>;
    readonly when: Schema.optionalKey<Schema.Struct<{
        readonly columnId: Schema.optionalKey<Schema.String>;
        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
}>;
export declare const DashboardRosterViewSpec: Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly columns: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly metricId: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        readonly format: Schema.optionalKey<Schema.String>;
    }>>;
    readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>>;
    readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>>;
    readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
        readonly columnId: Schema.optionalKey<Schema.String>;
        readonly when: Schema.optionalKey<Schema.Struct<{
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>;
        readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
    }>>>;
    readonly limit: Schema.optionalKey<Schema.Number>;
}>;
export declare const DashboardRosterViewWrite: Schema.Struct<{
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
}>;
export declare const DashboardRosterView: Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>;
export declare const DashboardRosterViewResultRow: Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly playerTag: Schema.String;
    readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const DashboardRosterViewResult: Schema.Struct<{
    readonly viewId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly schemaVersion: Schema.Literal<1>;
    readonly rows: Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>;
    readonly cachedMetricIds: Schema.$Array<Schema.String>;
    readonly evaluatedAt: Schema.String;
}>;
export declare const DashboardRosterViewPreviewRequest: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly viewId: Schema.optionalKey<Schema.String>;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly columns: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly metricId: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        readonly format: Schema.optionalKey<Schema.String>;
    }>>;
    readonly filters: Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly sort: Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>;
    readonly highlights: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
        readonly columnId: Schema.optionalKey<Schema.String>;
        readonly when: Schema.optionalKey<Schema.Struct<{
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>;
        readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
    }>>;
    readonly limit: Schema.NullOr<Schema.Number>;
    readonly rows: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>>;
}>;
export declare const DashboardRosterViewPreviewResponse: Schema.Struct<{
    readonly view: Schema.Struct<{
        readonly id: Schema.String;
        readonly shareId: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly sourceCode: Schema.String;
        readonly sourceVersion: Schema.Literal<1>;
        readonly createdBy: Schema.String;
        readonly spec: Schema.optionalKey<Schema.Struct<{
            readonly schemaVersion: Schema.Literal<1>;
            readonly columns: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly metricId: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
                readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                readonly format: Schema.optionalKey<Schema.String>;
            }>>;
            readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>>;
            readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly when: Schema.optionalKey<Schema.Struct<{
                    readonly columnId: Schema.optionalKey<Schema.String>;
                    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                }>>;
                readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: Schema.optionalKey<Schema.Number>;
        }>>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>;
    readonly result: Schema.Struct<{
        readonly viewId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly schemaVersion: Schema.Literal<1>;
        readonly rows: Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly playerTag: Schema.String;
            readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        }>>;
        readonly cachedMetricIds: Schema.$Array<Schema.String>;
        readonly evaluatedAt: Schema.String;
    }>;
}>;
export declare const DashboardRosterMembershipAction: Schema.Literals<readonly ["add", "remove", "move"]>;
export declare const DashboardRosterMembershipChange: Schema.Struct<{
    readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
    readonly playerTag: Schema.String;
    readonly fromRosterId: Schema.optionalKey<Schema.String>;
    readonly toRosterId: Schema.optionalKey<Schema.String>;
    readonly reason: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardApplyRosterMembershipChangesRequest: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
        readonly playerTag: Schema.String;
        readonly fromRosterId: Schema.optionalKey<Schema.String>;
        readonly toRosterId: Schema.optionalKey<Schema.String>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
    readonly expectedRevisions: Schema.$Record<Schema.String, Schema.Number>;
}>;
export declare const DashboardApplyRosterMembershipChangesResponse: Schema.Struct<{
    readonly applied: Schema.Boolean;
    readonly changeCount: Schema.Number;
    readonly revisions: Schema.$Record<Schema.String, Schema.Number>;
}>;
export declare const DashboardRosterDiscordIdentityRefreshRequest: Schema.Struct<{
    readonly playerTag: Schema.String;
}>;
export declare const DashboardRosterDiscordIdentityResponse: Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly discordUserId: Schema.String;
    readonly discordUsername: Schema.String;
    readonly discordAvatarUrl: Schema.String;
}>;
export declare const DashboardPublicRosterMember: Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly name: Schema.String;
    readonly townhall: Schema.Number;
    readonly refreshedAt: Schema.NullOr<Schema.String>;
    readonly currentClanName: Schema.optionalKey<Schema.String>;
    readonly currentClanTag: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardPublicRoster: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly minTownhall: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly maxTownhall: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly clanName: Schema.optionalKey<Schema.String>;
    readonly clanTag: Schema.optionalKey<Schema.String>;
    readonly clanBadgeUrl: Schema.optionalKey<Schema.String>;
    readonly updatedAt: Schema.String;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly name: Schema.String;
        readonly townhall: Schema.Number;
        readonly refreshedAt: Schema.NullOr<Schema.String>;
        readonly currentClanName: Schema.optionalKey<Schema.String>;
        readonly currentClanTag: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const DashboardCreateRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly capacity: Schema.optionalKey<Schema.Number>;
    readonly roster_role_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly server_id: Schema.optionalKey<Schema.String>;
    readonly alias: Schema.String;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
    readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
    readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly roster_id: Schema.String;
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>, readonly []>;
export declare const DashboardUpdateRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly capacity: Schema.optionalKey<Schema.Number>;
    readonly roster_role_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly roster_type: Schema.optionalKey<Schema.Literals<readonly ["clan", "family"]>>;
    readonly signup_scope: Schema.optionalKey<Schema.Literals<readonly ["clan-only", "family-wide"]>>;
    readonly clan_tag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly min_th: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly max_th: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly min_signups: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly columns: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>>;
    readonly webhook_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly message_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly image: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly event_start_time: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly recurrence_days: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly recurrence_day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly order: Schema.Number;
    }>>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly roster: Schema.optionalKey<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
}>, readonly []>;
export declare const DashboardGetRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>, readonly []>;
export declare const DashboardDeleteRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly members_only: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardListRostersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly group_id: Schema.optionalKey<Schema.String>;
    readonly clan_tag: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly rosters: Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const DashboardCloneRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly new_alias: Schema.String;
    readonly copy_members: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly new_roster_id: Schema.String;
    readonly new_alias: Schema.String;
    readonly target_server_id: Schema.String;
    readonly source_server_id: Schema.String;
    readonly members_copied: Schema.Number;
    readonly roster: Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>;
}>, readonly []>;
export declare const DashboardRefreshRostersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly group_id: Schema.optionalKey<Schema.String>;
    readonly roster_id: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly refreshed_rosters: Schema.$Array<Schema.Struct<{
        readonly capacity: Schema.Number;
        readonly roster_role_id: Schema.NullOr<Schema.String>;
        readonly member_groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly alias: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
        readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: Schema.optionalKey<Schema.String>;
        readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly members: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.NullOr<Schema.String>;
            readonly is_substitute: Schema.Boolean;
            readonly name: Schema.String;
            readonly tag: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.optionalKey<Schema.Number>;
            readonly current_clan: Schema.optionalKey<Schema.String>;
            readonly current_clan_tag: Schema.optionalKey<Schema.String>;
            readonly league_id: Schema.optionalKey<Schema.Number>;
            readonly league_name: Schema.optionalKey<Schema.String>;
            readonly hero_level_sum: Schema.Number;
            readonly max_percent: Schema.optionalKey<Schema.Number>;
            readonly war_pref: Schema.optionalKey<Schema.Boolean>;
            readonly discord: Schema.optionalKey<Schema.String>;
            readonly discord_username: Schema.optionalKey<Schema.String>;
            readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
            readonly last_online: Schema.optionalKey<Schema.String>;
            readonly refreshed_at: Schema.optionalKey<Schema.String>;
            readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
            readonly member_status: Schema.optionalKey<Schema.String>;
            readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>>;
        readonly min_th: Schema.optionalKey<Schema.Number>;
        readonly max_th: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly columns: Schema.$Array<Schema.String>;
        readonly sort: Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly webhook_id: Schema.optionalKey<Schema.String>;
        readonly message_id: Schema.optionalKey<Schema.String>;
        readonly image: Schema.optionalKey<Schema.String>;
        readonly event_start_time: Schema.optionalKey<Schema.Number>;
        readonly recurrence_days: Schema.optionalKey<Schema.Number>;
        readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
        readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
            readonly order: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revision: Schema.Number;
    }>>;
}>, readonly []>;
export declare const DashboardManageRosterMembersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly members: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
    readonly add: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly tag: Schema.String;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.optionalKey<Schema.Number>;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>>>;
    readonly operation: Schema.optionalKey<Schema.Literals<readonly ["add", "remove", "update"]>>;
    readonly player_tags: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardUpdateRosterMemberEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly memberTag: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly member_group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly is_substitute: Schema.optionalKey<Schema.Boolean>;
    readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardRemoveRosterMemberEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly memberTag: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardRefreshRosterMemberEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly memberTag: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly member: Schema.Struct<{
        readonly member_group_id: Schema.NullOr<Schema.String>;
        readonly is_substitute: Schema.Boolean;
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly townhall: Schema.Number;
        readonly trophies: Schema.optionalKey<Schema.Number>;
        readonly current_clan: Schema.optionalKey<Schema.String>;
        readonly current_clan_tag: Schema.optionalKey<Schema.String>;
        readonly league_id: Schema.optionalKey<Schema.Number>;
        readonly league_name: Schema.optionalKey<Schema.String>;
        readonly hero_level_sum: Schema.Number;
        readonly max_percent: Schema.optionalKey<Schema.Number>;
        readonly war_pref: Schema.optionalKey<Schema.Boolean>;
        readonly discord: Schema.optionalKey<Schema.String>;
        readonly discord_username: Schema.optionalKey<Schema.String>;
        readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
        readonly last_online: Schema.optionalKey<Schema.String>;
        readonly refreshed_at: Schema.optionalKey<Schema.String>;
        readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
        readonly member_status: Schema.optionalKey<Schema.String>;
        readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>;
}>, readonly []>;
export declare const DashboardMissingRosterMembersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roster_id: Schema.optionalKey<Schema.String>;
    readonly group_id: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly query_type: Schema.Literals<readonly ["roster", "group"]>;
    readonly query_value: Schema.String;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly state: Schema.Literals<readonly ["ok", "error"]>;
        readonly roster_info: Schema.optionalKey<Schema.Struct<{
            readonly roster_id: Schema.String;
            readonly alias: Schema.String;
            readonly clan_tag: Schema.String;
            readonly clan_name: Schema.String;
            readonly registered_count: Schema.Number;
        }>>;
        readonly missing_members: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townhall: Schema.Number;
            readonly role: Schema.String;
            readonly trophies: Schema.Number;
            readonly discord: Schema.optionalKey<Schema.String>;
        }>>;
        readonly summary: Schema.optionalKey<Schema.Struct<{
            readonly total_missing: Schema.Number;
            readonly total_clan_members: Schema.Number;
            readonly coverage_percentage: Schema.Number;
        }>>;
        readonly error_message: Schema.optionalKey<Schema.String>;
    }>>;
    readonly total_rosters_checked: Schema.Number;
}>, readonly []>;
export declare const DashboardServerClanMembersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly members: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly townhall: Schema.Number;
        readonly role: Schema.String;
        readonly trophies: Schema.Number;
    }>>;
    readonly count: Schema.optionalKey<Schema.Number>;
}>, readonly []>;
export declare const DashboardCreateRosterGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly min_signups: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly group_id: Schema.String;
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardListRosterGroupsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
}>, readonly []>;
export declare const DashboardGetRosterGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly groupId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardUpdateRosterGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly groupId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly alias: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly max_accounts_per_user: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly min_signups: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly group: Schema.Struct<{
        readonly group_id: Schema.String;
        readonly server_id: Schema.String;
        readonly name: Schema.String;
        readonly alias: Schema.optionalKey<Schema.String>;
        readonly description: Schema.String;
        readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
        readonly min_signups: Schema.optionalKey<Schema.Number>;
        readonly rosters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly capacity: Schema.Number;
            readonly roster_role_id: Schema.NullOr<Schema.String>;
            readonly member_groups: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly position: Schema.Number;
                readonly signup_enabled: Schema.Boolean;
                readonly role_id: Schema.NullOr<Schema.String>;
            }>>;
            readonly id: Schema.String;
            readonly server_id: Schema.String;
            readonly alias: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly roster_type: Schema.Literals<readonly ["clan", "family"]>;
            readonly signup_scope: Schema.Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: Schema.optionalKey<Schema.String>;
            readonly clan_name: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clan_badge: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly group_id: Schema.optionalKey<Schema.String>;
            readonly members: Schema.$Array<Schema.Struct<{
                readonly member_group_id: Schema.NullOr<Schema.String>;
                readonly is_substitute: Schema.Boolean;
                readonly name: Schema.String;
                readonly tag: Schema.String;
                readonly townhall: Schema.Number;
                readonly trophies: Schema.optionalKey<Schema.Number>;
                readonly current_clan: Schema.optionalKey<Schema.String>;
                readonly current_clan_tag: Schema.optionalKey<Schema.String>;
                readonly league_id: Schema.optionalKey<Schema.Number>;
                readonly league_name: Schema.optionalKey<Schema.String>;
                readonly hero_level_sum: Schema.Number;
                readonly max_percent: Schema.optionalKey<Schema.Number>;
                readonly war_pref: Schema.optionalKey<Schema.Boolean>;
                readonly discord: Schema.optionalKey<Schema.String>;
                readonly discord_username: Schema.optionalKey<Schema.String>;
                readonly discord_avatar_url: Schema.optionalKey<Schema.String>;
                readonly last_online: Schema.optionalKey<Schema.String>;
                readonly refreshed_at: Schema.optionalKey<Schema.String>;
                readonly hitrate: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
                readonly added_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly last_updated: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly is_in_family: Schema.optionalKey<Schema.Boolean>;
                readonly member_status: Schema.optionalKey<Schema.String>;
                readonly error_details: Schema.optionalKey<Schema.NullOr<Schema.String>>;
                readonly answers: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            }>>;
            readonly min_th: Schema.optionalKey<Schema.Number>;
            readonly max_th: Schema.optionalKey<Schema.Number>;
            readonly min_signups: Schema.optionalKey<Schema.Number>;
            readonly max_accounts_per_user: Schema.optionalKey<Schema.Number>;
            readonly columns: Schema.$Array<Schema.String>;
            readonly sort: Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: Schema.optionalKey<Schema.String>;
            readonly message_id: Schema.optionalKey<Schema.String>;
            readonly image: Schema.optionalKey<Schema.String>;
            readonly event_start_time: Schema.optionalKey<Schema.Number>;
            readonly recurrence_days: Schema.optionalKey<Schema.Number>;
            readonly recurrence_day_of_month: Schema.optionalKey<Schema.Number>;
            readonly signup_questions: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.optionalKey<Schema.$Array<Schema.String>>;
                readonly order: Schema.Number;
            }>>>;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
            readonly revision: Schema.Number;
        }>>>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardDeleteRosterGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly groupId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly affected_rosters: Schema.Number;
}>, readonly []>;
export declare const DashboardCreateRosterAutomationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly roster_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly action_type: Schema.String;
    readonly trigger_type: Schema.optionalKey<Schema.String>;
    readonly scheduled_at: Schema.String;
    readonly discord_channel_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly options: Schema.optionalKey<Schema.Struct<{
        readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
    }>>;
    readonly active: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly automation_id: Schema.String;
    readonly rule: Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardListRosterAutomationsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roster_id: Schema.optionalKey<Schema.String>;
    readonly group_id: Schema.optionalKey<Schema.String>;
    readonly active_only: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly rules: Schema.$Array<Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
    readonly count: Schema.Number;
    readonly server_id: Schema.String;
    readonly roster_id: Schema.String;
    readonly group_id: Schema.String;
}>, readonly []>;
export declare const DashboardUpdateRosterAutomationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly automationId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly roster_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly group_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly action_type: Schema.optionalKey<Schema.String>;
    readonly trigger_type: Schema.optionalKey<Schema.String>;
    readonly scheduled_at: Schema.optionalKey<Schema.String>;
    readonly discord_channel_id: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly options: Schema.optionalKey<Schema.Struct<{
        readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
    }>>;
    readonly active: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly rule: Schema.Struct<{
        readonly automation_id: Schema.String;
        readonly server_id: Schema.String;
        readonly roster_id: Schema.optionalKey<Schema.String>;
        readonly group_id: Schema.optionalKey<Schema.String>;
        readonly action_type: Schema.String;
        readonly trigger_type: Schema.String;
        readonly scheduled_at: Schema.String;
        readonly discord_channel_id: Schema.optionalKey<Schema.String>;
        readonly options: Schema.optionalKey<Schema.Struct<{
            readonly ping_type: Schema.optionalKey<Schema.Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: Schema.Boolean;
        readonly executed: Schema.Boolean;
        readonly executed_at: Schema.optionalKey<Schema.Number>;
        readonly last_triggered_at: Schema.optionalKey<Schema.Number>;
        readonly execution_status: Schema.optionalKey<Schema.String>;
        readonly last_missed_at: Schema.optionalKey<Schema.Number>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardDeleteRosterAutomationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly automationId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardListRosterMetricsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
        readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
        readonly description: Schema.String;
        readonly cacheTtlSeconds: Schema.Number;
        readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
    }>>;
}>, readonly []>;
export declare const DashboardQueryRosterMetricEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly metricId: Schema.String;
    readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    readonly force: Schema.Boolean;
}>, Schema.Struct<{
    readonly metricId: Schema.String;
    readonly parameters: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly rows: Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly cached: Schema.Boolean;
    readonly evaluatedAt: Schema.String;
}>, readonly []>;
export declare const DashboardListRosterViewsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>>, readonly []>;
export declare const DashboardGetRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly viewId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const DashboardResolveSharedRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly viewId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const DashboardCreateRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const DashboardUpdateRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly viewId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly shareId: Schema.String;
    readonly serverId: Schema.String;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly createdBy: Schema.String;
    readonly spec: Schema.optionalKey<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly columns: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly metricId: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
            readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly format: Schema.optionalKey<Schema.String>;
        }>>;
        readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly columnId: Schema.String;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>>;
        readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly when: Schema.optionalKey<Schema.Struct<{
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>>;
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const DashboardDeleteRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly viewId: Schema.String;
}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{}>, Schema.Void, readonly []>;
export declare const DashboardPreviewRosterViewEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly viewId: Schema.optionalKey<Schema.String>;
    readonly name: Schema.String;
    readonly sourceCode: Schema.String;
    readonly sourceVersion: Schema.Literal<1>;
    readonly columns: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly metricId: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        readonly format: Schema.optionalKey<Schema.String>;
    }>>;
    readonly filters: Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly sort: Schema.$Array<Schema.Struct<{
        readonly columnId: Schema.String;
        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
    }>>;
    readonly highlights: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
        readonly columnId: Schema.optionalKey<Schema.String>;
        readonly when: Schema.optionalKey<Schema.Struct<{
            readonly columnId: Schema.optionalKey<Schema.String>;
            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        }>>;
        readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
    }>>;
    readonly limit: Schema.NullOr<Schema.Number>;
    readonly rows: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>>;
}>, Schema.Struct<{
    readonly view: Schema.Struct<{
        readonly id: Schema.String;
        readonly shareId: Schema.String;
        readonly serverId: Schema.String;
        readonly name: Schema.String;
        readonly sourceCode: Schema.String;
        readonly sourceVersion: Schema.Literal<1>;
        readonly createdBy: Schema.String;
        readonly spec: Schema.optionalKey<Schema.Struct<{
            readonly schemaVersion: Schema.Literal<1>;
            readonly columns: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly metricId: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
                readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                readonly format: Schema.optionalKey<Schema.String>;
            }>>;
            readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly columnId: Schema.String;
                readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>>;
            readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: Schema.optionalKey<Schema.String>;
                readonly when: Schema.optionalKey<Schema.Struct<{
                    readonly columnId: Schema.optionalKey<Schema.String>;
                    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                }>>;
                readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: Schema.optionalKey<Schema.Number>;
        }>>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>;
    readonly result: Schema.Struct<{
        readonly viewId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly schemaVersion: Schema.Literal<1>;
        readonly rows: Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly playerTag: Schema.String;
            readonly values: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly highlight: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        }>>;
        readonly cachedMetricIds: Schema.$Array<Schema.String>;
        readonly evaluatedAt: Schema.String;
    }>;
}>, readonly []>;
export declare const DashboardApplyRosterMembershipChangesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
        readonly playerTag: Schema.String;
        readonly fromRosterId: Schema.optionalKey<Schema.String>;
        readonly toRosterId: Schema.optionalKey<Schema.String>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
    readonly expectedRevisions: Schema.$Record<Schema.String, Schema.Number>;
}>, Schema.Struct<{
    readonly applied: Schema.Boolean;
    readonly changeCount: Schema.Number;
    readonly revisions: Schema.$Record<Schema.String, Schema.Number>;
}>, readonly []>;
export declare const DashboardRefreshRosterDiscordIdentityEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly discordUserId: Schema.String;
    readonly discordUsername: Schema.String;
    readonly discordAvatarUrl: Schema.String;
}>, readonly []>;
export declare const DashboardPublicRosterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly publicShareId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly minTownhall: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly maxTownhall: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly clanName: Schema.optionalKey<Schema.String>;
    readonly clanTag: Schema.optionalKey<Schema.String>;
    readonly clanBadgeUrl: Schema.optionalKey<Schema.String>;
    readonly updatedAt: Schema.String;
    readonly members: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly name: Schema.String;
        readonly townhall: Schema.Number;
        readonly refreshedAt: Schema.NullOr<Schema.String>;
        readonly currentClanName: Schema.optionalKey<Schema.String>;
        readonly currentClanTag: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export type DashboardRoster = typeof DashboardRoster.Type;
export type DashboardRosterMember = typeof DashboardRosterMember.Type;
export type DashboardRosterGroup = typeof DashboardRosterGroup.Type;
export type DashboardRosterAutomation = typeof DashboardRosterAutomation.Type;
export type DashboardRosterMetric = typeof DashboardRosterMetric.Type;
export type DashboardRosterView = typeof DashboardRosterView.Type;
export type DashboardRosterViewSpec = typeof DashboardRosterViewSpec.Type;
export type DashboardRosterViewResult = typeof DashboardRosterViewResult.Type;
export type DashboardRosterMembershipChange = typeof DashboardRosterMembershipChange.Type;
export type DashboardPublicRoster = typeof DashboardPublicRoster.Type;
//# sourceMappingURL=dashboard-roster.d.ts.map