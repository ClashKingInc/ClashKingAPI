import { Schema } from "effect";
/** Preserved input for the deferred bot board reference, never an active API response. */
export declare const DeferredRosterBoardData: Schema.Struct<{
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
    readonly capacity: Schema.Number;
    readonly roster_role_id: Schema.NullOr<Schema.String>;
    readonly member_groups: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly signup_enabled: Schema.Boolean;
        readonly role_id: Schema.NullOr<Schema.String>;
    }>>;
    readonly members: Schema.$Array<Schema.Struct<{
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
        readonly member_group_id: Schema.NullOr<Schema.String>;
        readonly is_substitute: Schema.Boolean;
    }>>;
}>;
//# sourceMappingURL=deferred-roster-board.d.ts.map