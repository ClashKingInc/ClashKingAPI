import { Schema } from "effect";
export declare const PublicConfigResponse: Schema.Struct<{
    readonly sentry_dsn_mobile: Schema.String;
}>;
export declare const MobilePublicConfigResponse: Schema.Struct<{
    readonly sentry_dsn: Schema.String;
}>;
export declare const EnumValue: Schema.Struct<{
    readonly id: Schema.Int;
    readonly value: Schema.String;
    readonly description: Schema.String;
    readonly scope: Schema.String;
}>;
export declare const EnumValuesResponse: Schema.Struct<{
    readonly values: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Int;
        readonly value: Schema.String;
        readonly description: Schema.String;
        readonly scope: Schema.String;
    }>>;
    readonly count: Schema.Int;
}>;
export declare const EnumCatalogResponse: Schema.Struct<{
    readonly role_types: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Int;
        readonly value: Schema.String;
        readonly description: Schema.String;
        readonly scope: Schema.String;
    }>>;
    readonly role_modes: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Int;
        readonly value: Schema.String;
        readonly description: Schema.String;
        readonly scope: Schema.String;
    }>>;
    readonly log_types: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Int;
        readonly value: Schema.String;
        readonly description: Schema.String;
        readonly scope: Schema.String;
    }>>;
    readonly countdown_types: Schema.$Array<Schema.Struct<{
        readonly id: Schema.Int;
        readonly value: Schema.String;
        readonly description: Schema.String;
        readonly scope: Schema.String;
    }>>;
}>;
export declare const publicEnumCatalog: {
    readonly role_types: readonly [{
        readonly id: 1;
        readonly value: "townhall";
        readonly description: "Match a Town Hall level.";
        readonly scope: "server";
    }, {
        readonly id: 2;
        readonly value: "builderhall";
        readonly description: "Match a Builder Hall level.";
        readonly scope: "server";
    }, {
        readonly id: 3;
        readonly value: "league";
        readonly description: "Match a Home Village league.";
        readonly scope: "server";
    }, {
        readonly id: 4;
        readonly value: "builder_league";
        readonly description: "Match a Builder Base league.";
        readonly scope: "server";
    }, {
        readonly id: 5;
        readonly value: "clan_role";
        readonly description: "Match a clan member position.";
        readonly scope: "server_or_clan";
    }, {
        readonly id: 6;
        readonly value: "clan_category";
        readonly description: "Match a configured clan category.";
        readonly scope: "server";
    }, {
        readonly id: 7;
        readonly value: "family";
        readonly description: "Match family membership.";
        readonly scope: "server";
    }, {
        readonly id: 8;
        readonly value: "achievement";
        readonly description: "Match an achievement value.";
        readonly scope: "server";
    }, {
        readonly id: 9;
        readonly value: "status";
        readonly description: "Match a Discord or account status.";
        readonly scope: "server";
    }];
    readonly role_modes: readonly [{
        readonly id: 1;
        readonly value: "both";
        readonly description: "Add the role on a match and remove it when the match ends.";
        readonly scope: "role";
    }, {
        readonly id: 2;
        readonly value: "add";
        readonly description: "Add the role on a match and do not remove it.";
        readonly scope: "role";
    }, {
        readonly id: 3;
        readonly value: "remove";
        readonly description: "Do not add the role. Remove it when the match ends.";
        readonly scope: "role";
    }];
    readonly log_types: readonly [{
        readonly id: 1;
        readonly value: "join_log";
        readonly description: "Record members who join a clan.";
        readonly scope: "clan";
    }, {
        readonly id: 2;
        readonly value: "leave_log";
        readonly description: "Record members who leave a clan.";
        readonly scope: "clan";
    }, {
        readonly id: 3;
        readonly value: "donation_log";
        readonly description: "Record troop donations.";
        readonly scope: "clan";
    }, {
        readonly id: 4;
        readonly value: "clan_achievement_log";
        readonly description: "Record clan achievement changes.";
        readonly scope: "clan";
    }, {
        readonly id: 5;
        readonly value: "clan_requirements_log";
        readonly description: "Record clan requirement changes.";
        readonly scope: "clan";
    }, {
        readonly id: 6;
        readonly value: "clan_description_log";
        readonly description: "Record clan description changes.";
        readonly scope: "clan";
    }, {
        readonly id: 7;
        readonly value: "war_log";
        readonly description: "Record clan war events.";
        readonly scope: "clan";
    }, {
        readonly id: 8;
        readonly value: "war_panel";
        readonly description: "Publish the clan war panel.";
        readonly scope: "clan";
    }, {
        readonly id: 9;
        readonly value: "cwl_lineup_change_log";
        readonly description: "Record CWL lineup changes.";
        readonly scope: "clan";
    }, {
        readonly id: 10;
        readonly value: "capital_donations";
        readonly description: "Record Clan Capital donations.";
        readonly scope: "clan";
    }, {
        readonly id: 11;
        readonly value: "capital_attacks";
        readonly description: "Record Clan Capital attacks.";
        readonly scope: "clan";
    }, {
        readonly id: 12;
        readonly value: "raid_panel";
        readonly description: "Publish the Raid Weekend panel.";
        readonly scope: "clan";
    }, {
        readonly id: 13;
        readonly value: "capital_weekly_summary";
        readonly description: "Publish the weekly capital summary.";
        readonly scope: "clan";
    }, {
        readonly id: 14;
        readonly value: "role_change";
        readonly description: "Record clan role changes.";
        readonly scope: "clan";
    }, {
        readonly id: 15;
        readonly value: "troop_upgrade";
        readonly description: "Record troop upgrades.";
        readonly scope: "clan";
    }, {
        readonly id: 16;
        readonly value: "super_troop_boost";
        readonly description: "Record Super Troop boosts.";
        readonly scope: "clan";
    }, {
        readonly id: 17;
        readonly value: "th_upgrade";
        readonly description: "Record Town Hall upgrades.";
        readonly scope: "clan";
    }, {
        readonly id: 18;
        readonly value: "league_change";
        readonly description: "Record league changes.";
        readonly scope: "clan";
    }, {
        readonly id: 19;
        readonly value: "spell_upgrade";
        readonly description: "Record spell upgrades.";
        readonly scope: "clan";
    }, {
        readonly id: 20;
        readonly value: "hero_upgrade";
        readonly description: "Record hero upgrades.";
        readonly scope: "clan";
    }, {
        readonly id: 21;
        readonly value: "hero_equipment_upgrade";
        readonly description: "Record hero equipment upgrades.";
        readonly scope: "clan";
    }, {
        readonly id: 22;
        readonly value: "name_change";
        readonly description: "Record player name changes.";
        readonly scope: "clan";
    }, {
        readonly id: 23;
        readonly value: "legend_log_attacks";
        readonly description: "Record Legend League attacks.";
        readonly scope: "clan";
    }, {
        readonly id: 24;
        readonly value: "legend_log_defenses";
        readonly description: "Record Legend League defenses.";
        readonly scope: "clan";
    }, {
        readonly id: 25;
        readonly value: "ban_alert";
        readonly description: "Publish clan-scoped player ban alerts.";
        readonly scope: "clan";
    }, {
        readonly id: 26;
        readonly value: "reddit_feed";
        readonly description: "Publish the server Reddit feed.";
        readonly scope: "server";
    }];
    readonly countdown_types: readonly [{
        readonly id: 1;
        readonly value: "clan_games_timer";
        readonly description: "Show the Clan Games time.";
        readonly scope: "server";
    }, {
        readonly id: 2;
        readonly value: "cwl_timer";
        readonly description: "Show the Clan War League time.";
        readonly scope: "server";
    }, {
        readonly id: 3;
        readonly value: "raid_weekend_timer";
        readonly description: "Show the Raid Weekend time.";
        readonly scope: "server";
    }, {
        readonly id: 4;
        readonly value: "season_end_timer";
        readonly description: "Show the season end time.";
        readonly scope: "server";
    }, {
        readonly id: 5;
        readonly value: "season_day_timer";
        readonly description: "Show the current season day.";
        readonly scope: "server";
    }, {
        readonly id: 6;
        readonly value: "war_score";
        readonly description: "Show the current clan war score.";
        readonly scope: "clan";
    }, {
        readonly id: 7;
        readonly value: "war_timer";
        readonly description: "Show the current clan war time.";
        readonly scope: "clan";
    }];
};
export declare const GuildSummaryClanRow: Schema.Struct<{
    readonly clan_tag: Schema.String;
    readonly clan_name: Schema.String;
    readonly total_members: Schema.Int;
    readonly active_members: Schema.Int;
    readonly inactive_members: Schema.Int;
    readonly activity_rate: Schema.Number;
    readonly average_donations_sent: Schema.Number;
    readonly average_donations_received: Schema.Number;
    readonly total_donations_sent: Schema.Int;
    readonly total_donations_received: Schema.Int;
    readonly average_trophies: Schema.Number;
}>;
export declare const GuildSummaryResponse: Schema.Struct<{
    readonly guild_id: Schema.String;
    readonly total_clans: Schema.Int;
    readonly total_members: Schema.Int;
    readonly total_active_members: Schema.Int;
    readonly total_inactive_members: Schema.Int;
    readonly overall_activity_rate: Schema.Number;
    readonly total_donations_sent: Schema.Int;
    readonly total_donations_received: Schema.Int;
    readonly clans: Schema.$Array<Schema.Struct<{
        readonly clan_tag: Schema.String;
        readonly clan_name: Schema.String;
        readonly total_members: Schema.Int;
        readonly active_members: Schema.Int;
        readonly inactive_members: Schema.Int;
        readonly activity_rate: Schema.Number;
        readonly average_donations_sent: Schema.Number;
        readonly average_donations_received: Schema.Number;
        readonly total_donations_sent: Schema.Int;
        readonly total_donations_received: Schema.Int;
        readonly average_trophies: Schema.Number;
    }>>;
}>;
export declare const GuildSummaryQuery: Schema.Struct<{
    readonly guild_id: Schema.String;
    readonly inactive_threshold_days: Schema.optionalKey<Schema.Int>;
}>;
export declare const publicMetadataEndpoints: {
    readonly publicConfig: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly sentry_dsn_mobile: Schema.String;
    }>, readonly []>;
    readonly mobilePublicConfig: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly sentry_dsn: Schema.String;
    }>, readonly []>;
    readonly enumCatalog: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly role_types: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly role_modes: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly log_types: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly countdown_types: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
    }>, readonly []>;
    readonly enumRoleTypes: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly values: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly count: Schema.Int;
    }>, readonly []>;
    readonly enumRoleModes: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly values: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly count: Schema.Int;
    }>, readonly []>;
    readonly enumLogTypes: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly values: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly count: Schema.Int;
    }>, readonly []>;
    readonly enumCountdownTypes: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly values: Schema.$Array<Schema.Struct<{
            readonly id: Schema.Int;
            readonly value: Schema.String;
            readonly description: Schema.String;
            readonly scope: Schema.String;
        }>>;
        readonly count: Schema.Int;
    }>, readonly []>;
    readonly guildSummary: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly guild_id: Schema.String;
        readonly inactive_threshold_days: Schema.optionalKey<Schema.Int>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly guild_id: Schema.String;
        readonly total_clans: Schema.Int;
        readonly total_members: Schema.Int;
        readonly total_active_members: Schema.Int;
        readonly total_inactive_members: Schema.Int;
        readonly overall_activity_rate: Schema.Number;
        readonly total_donations_sent: Schema.Int;
        readonly total_donations_received: Schema.Int;
        readonly clans: Schema.$Array<Schema.Struct<{
            readonly clan_tag: Schema.String;
            readonly clan_name: Schema.String;
            readonly total_members: Schema.Int;
            readonly active_members: Schema.Int;
            readonly inactive_members: Schema.Int;
            readonly activity_rate: Schema.Number;
            readonly average_donations_sent: Schema.Number;
            readonly average_donations_received: Schema.Number;
            readonly total_donations_sent: Schema.Int;
            readonly total_donations_received: Schema.Int;
            readonly average_trophies: Schema.Number;
        }>>;
    }>, readonly []>;
};
//# sourceMappingURL=public-metadata.d.ts.map