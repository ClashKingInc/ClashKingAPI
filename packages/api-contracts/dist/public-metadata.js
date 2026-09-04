import { Schema } from "effect";
import { DecimalSnowflake } from "./discord.js";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
export const PublicConfigResponse = Schema.Struct({ sentry_dsn_mobile: Schema.String });
export const MobilePublicConfigResponse = Schema.Struct({ sentry_dsn: Schema.String });
export const EnumValue = Schema.Struct({
    id: Schema.Int, value: Schema.String, description: Schema.String, scope: Schema.String,
});
export const EnumValuesResponse = Schema.Struct({ values: Schema.Array(EnumValue), count: Schema.Int });
export const EnumCatalogResponse = Schema.Struct({
    role_types: Schema.Array(EnumValue), role_modes: Schema.Array(EnumValue),
    log_types: Schema.Array(EnumValue), countdown_types: Schema.Array(EnumValue),
});
// Literal port of internal/models/v2/enums.go. Keep IDs, order, copy, and scopes stable.
export const publicEnumCatalog = {
    "role_types": [
        {
            "id": 1,
            "value": "townhall",
            "description": "Match a Town Hall level.",
            "scope": "server"
        },
        {
            "id": 2,
            "value": "builderhall",
            "description": "Match a Builder Hall level.",
            "scope": "server"
        },
        {
            "id": 3,
            "value": "league",
            "description": "Match a Home Village league.",
            "scope": "server"
        },
        {
            "id": 4,
            "value": "builder_league",
            "description": "Match a Builder Base league.",
            "scope": "server"
        },
        {
            "id": 5,
            "value": "clan_role",
            "description": "Match a clan member position.",
            "scope": "server_or_clan"
        },
        {
            "id": 6,
            "value": "clan_category",
            "description": "Match a configured clan category.",
            "scope": "server"
        },
        {
            "id": 7,
            "value": "family",
            "description": "Match family membership.",
            "scope": "server"
        },
        {
            "id": 8,
            "value": "achievement",
            "description": "Match an achievement value.",
            "scope": "server"
        },
        {
            "id": 9,
            "value": "status",
            "description": "Match a Discord or account status.",
            "scope": "server"
        }
    ],
    "role_modes": [
        {
            "id": 1,
            "value": "both",
            "description": "Add the role on a match and remove it when the match ends.",
            "scope": "role"
        },
        {
            "id": 2,
            "value": "add",
            "description": "Add the role on a match and do not remove it.",
            "scope": "role"
        },
        {
            "id": 3,
            "value": "remove",
            "description": "Do not add the role. Remove it when the match ends.",
            "scope": "role"
        }
    ],
    "log_types": [
        {
            "id": 1,
            "value": "join_log",
            "description": "Record members who join a clan.",
            "scope": "clan"
        },
        {
            "id": 2,
            "value": "leave_log",
            "description": "Record members who leave a clan.",
            "scope": "clan"
        },
        {
            "id": 3,
            "value": "donation_log",
            "description": "Record troop donations.",
            "scope": "clan"
        },
        {
            "id": 4,
            "value": "clan_achievement_log",
            "description": "Record clan achievement changes.",
            "scope": "clan"
        },
        {
            "id": 5,
            "value": "clan_requirements_log",
            "description": "Record clan requirement changes.",
            "scope": "clan"
        },
        {
            "id": 6,
            "value": "clan_description_log",
            "description": "Record clan description changes.",
            "scope": "clan"
        },
        {
            "id": 7,
            "value": "war_log",
            "description": "Record clan war events.",
            "scope": "clan"
        },
        {
            "id": 8,
            "value": "war_panel",
            "description": "Publish the clan war panel.",
            "scope": "clan"
        },
        {
            "id": 9,
            "value": "cwl_lineup_change_log",
            "description": "Record CWL lineup changes.",
            "scope": "clan"
        },
        {
            "id": 10,
            "value": "capital_donations",
            "description": "Record Clan Capital donations.",
            "scope": "clan"
        },
        {
            "id": 11,
            "value": "capital_attacks",
            "description": "Record Clan Capital attacks.",
            "scope": "clan"
        },
        {
            "id": 12,
            "value": "raid_panel",
            "description": "Publish the Raid Weekend panel.",
            "scope": "clan"
        },
        {
            "id": 13,
            "value": "capital_weekly_summary",
            "description": "Publish the weekly capital summary.",
            "scope": "clan"
        },
        {
            "id": 14,
            "value": "role_change",
            "description": "Record clan role changes.",
            "scope": "clan"
        },
        {
            "id": 15,
            "value": "troop_upgrade",
            "description": "Record troop upgrades.",
            "scope": "clan"
        },
        {
            "id": 16,
            "value": "super_troop_boost",
            "description": "Record Super Troop boosts.",
            "scope": "clan"
        },
        {
            "id": 17,
            "value": "th_upgrade",
            "description": "Record Town Hall upgrades.",
            "scope": "clan"
        },
        {
            "id": 18,
            "value": "league_change",
            "description": "Record league changes.",
            "scope": "clan"
        },
        {
            "id": 19,
            "value": "spell_upgrade",
            "description": "Record spell upgrades.",
            "scope": "clan"
        },
        {
            "id": 20,
            "value": "hero_upgrade",
            "description": "Record hero upgrades.",
            "scope": "clan"
        },
        {
            "id": 21,
            "value": "hero_equipment_upgrade",
            "description": "Record hero equipment upgrades.",
            "scope": "clan"
        },
        {
            "id": 22,
            "value": "name_change",
            "description": "Record player name changes.",
            "scope": "clan"
        },
        {
            "id": 23,
            "value": "legend_log_attacks",
            "description": "Record Legend League attacks.",
            "scope": "clan"
        },
        {
            "id": 24,
            "value": "legend_log_defenses",
            "description": "Record Legend League defenses.",
            "scope": "clan"
        },
        {
            "id": 25,
            "value": "ban_alert",
            "description": "Publish clan-scoped player ban alerts.",
            "scope": "clan"
        },
        {
            "id": 26,
            "value": "reddit_feed",
            "description": "Publish the server Reddit feed.",
            "scope": "server"
        }
    ],
    "countdown_types": [
        {
            "id": 1,
            "value": "clan_games_timer",
            "description": "Show the Clan Games time.",
            "scope": "server"
        },
        {
            "id": 2,
            "value": "cwl_timer",
            "description": "Show the Clan War League time.",
            "scope": "server"
        },
        {
            "id": 3,
            "value": "raid_weekend_timer",
            "description": "Show the Raid Weekend time.",
            "scope": "server"
        },
        {
            "id": 4,
            "value": "season_end_timer",
            "description": "Show the season end time.",
            "scope": "server"
        },
        {
            "id": 5,
            "value": "season_day_timer",
            "description": "Show the current season day.",
            "scope": "server"
        },
        {
            "id": 6,
            "value": "war_score",
            "description": "Show the current clan war score.",
            "scope": "clan"
        },
        {
            "id": 7,
            "value": "war_timer",
            "description": "Show the current clan war time.",
            "scope": "clan"
        }
    ]
};
export const GuildSummaryClanRow = Schema.Struct({
    clan_tag: Schema.String, clan_name: Schema.String,
    total_members: Schema.Int, active_members: Schema.Int, inactive_members: Schema.Int,
    activity_rate: Schema.Number, average_donations_sent: Schema.Number,
    average_donations_received: Schema.Number, total_donations_sent: Schema.Int,
    total_donations_received: Schema.Int, average_trophies: Schema.Number,
});
export const GuildSummaryResponse = Schema.Struct({
    guild_id: DecimalSnowflake, total_clans: Schema.Int, total_members: Schema.Int,
    total_active_members: Schema.Int, total_inactive_members: Schema.Int,
    overall_activity_rate: Schema.Number, total_donations_sent: Schema.Int,
    total_donations_received: Schema.Int, clans: Schema.Array(GuildSummaryClanRow),
});
export const GuildSummaryQuery = Schema.Struct({
    guild_id: DecimalSnowflake,
    inactive_threshold_days: Schema.optionalKey(Schema.Int),
});
const read = (operationId, path, response) => defineEndpoint({
    auth: "public", body: NoBody, bodyMode: "none", method: "GET", operationId,
    path, pathParams: NoPathParams, query: NoQuery, response, responseMode: "json",
    successStatus: 200, summary: operationId,
});
export const publicMetadataEndpoints = {
    publicConfig: read("publicConfig", "/v2/config/public", PublicConfigResponse),
    mobilePublicConfig: read("mobilePublicConfig", "/v2/public-config", MobilePublicConfigResponse),
    enumCatalog: read("enumCatalog", "/v2/enums", EnumCatalogResponse),
    enumRoleTypes: read("enumRoleTypes", "/v2/enums/role-types", EnumValuesResponse),
    enumRoleModes: read("enumRoleModes", "/v2/enums/role-modes", EnumValuesResponse),
    enumLogTypes: read("enumLogTypes", "/v2/enums/log-types", EnumValuesResponse),
    enumCountdownTypes: read("enumCountdownTypes", "/v2/enums/countdown-types", EnumValuesResponse),
    guildSummary: defineEndpoint({
        ...read("guildSummary", "/v2/activity/guild-summary", GuildSummaryResponse),
        query: GuildSummaryQuery,
    }),
};
