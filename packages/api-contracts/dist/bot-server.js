import { Schema } from "effect";
import { defineEndpoint, NoBody, NoQuery, } from "./endpoint.js";
import { DecimalSnowflake } from "./discord.js";
import * as Server from "./dashboard-server.js";
import * as Misc from "./dashboard-misc.js";
import * as Extra from "./dashboard-server-extra.js";
const OptionalNumber = Schema.optionalKey(Schema.Number);
const OptionalString = Schema.optionalKey(Schema.String);
const OptionalSnowflake = Schema.optionalKey(DecimalSnowflake);
const UserPath = Schema.Struct({ userId: DecimalSnowflake });
const ServerPath = Schema.Struct({ serverId: DecimalSnowflake });
const ServerTagPath = Schema.Struct({ serverId: DecimalSnowflake, tag: Schema.String });
const ServerWarLeaderboardResponse = Schema.Struct({
    server_id: DecimalSnowflake,
    items: Schema.Array(Schema.Struct({
        rank: Schema.Number,
        player_tag: Schema.String,
        player_name: Schema.String,
        townhall_level: OptionalNumber,
        clan_tag: Schema.String,
        clan_name: Schema.String,
        total_attacks: Schema.Number,
        total_stars: Schema.Number,
        average_stars: Schema.Number,
        average_destruction: Schema.Number,
        three_star_attacks: OptionalNumber,
        three_star_rate: OptionalNumber,
        destruction_percentage: Schema.Number,
    })),
    total: Schema.Number,
});
const ServerLegendsLeaderboardResponse = Schema.Struct({
    server_id: DecimalSnowflake,
    items: Schema.Array(Schema.Struct({
        player_tag: Schema.String,
        player_name: Schema.String,
        townhall_level: OptionalNumber,
        clan_tag: Schema.String,
        clan_name: Schema.String,
        trophies: Schema.Number,
    })),
    total: Schema.Number,
});
const ServerDonationsLeaderboardResponse = Schema.Struct({
    server_id: DecimalSnowflake,
    season: Schema.String,
    type: Schema.String,
    items: Schema.Array(Schema.Struct({
        rank: Schema.Number,
        player_tag: Schema.String,
        player_name: Schema.String,
        townhall_level: OptionalNumber,
        clan_tag: Schema.String,
        clan_name: Schema.String,
        donated: Schema.Number,
        received: Schema.Number,
        score: Schema.Number,
    })),
    total: Schema.Number,
});
const ServerClanGamesLeaderboardResponse = Schema.Struct({
    server_id: DecimalSnowflake,
    season: Schema.String,
    type: Schema.String,
    items: Schema.Array(Schema.Struct({
        rank: Schema.Number,
        player_tag: Schema.String,
        player_name: Schema.String,
        townhall_level: OptionalNumber,
        clan_tag: Schema.String,
        clan_name: Schema.String,
        clan_games: Schema.Number,
        score: Schema.Number,
    })),
    total: Schema.Number,
});
const RosterQuestion = Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    type: Schema.String,
    required: Schema.Boolean,
    options: Schema.Array(Schema.String),
    order: Schema.Number,
});
const RosterQuestionnaire = Schema.Struct({
    accountSelector: Schema.Struct({ id: Schema.String, type: Schema.String, required: Schema.Boolean }),
    questions: Schema.Array(RosterQuestion),
});
const RosterViewSort = Schema.Struct({ columnId: Schema.String, direction: Schema.Literals(["asc", "desc"]) });
const RosterSummary = Schema.Struct({
    minTownhall: Schema.NullOr(Schema.Number),
    maxTownhall: Schema.NullOr(Schema.Number),
    databaseId: OptionalString,
    id: Schema.String,
    serverId: DecimalSnowflake,
    alias: Schema.String,
    description: Schema.NullOr(Schema.String),
    clanTag: Schema.NullOr(Schema.String),
    publicShareId: Schema.NullOr(Schema.String),
    displayColumnIds: Schema.Array(Schema.String),
    sortConfiguration: Schema.Array(RosterViewSort),
    webhookId: Schema.NullOr(DecimalSnowflake),
    messageId: Schema.NullOr(DecimalSnowflake),
    questionnaire: RosterQuestionnaire,
    memberCount: Schema.Number,
    refreshedAt: Schema.NullOr(Schema.String),
    revision: Schema.Number,
    createdAt: Schema.String,
    updatedAt: Schema.String,
});
const RosterMember = Schema.Struct({
    playerTag: Schema.String,
    playerName: Schema.String,
    clanTag: Schema.NullOr(Schema.String),
    clanName: Schema.NullOr(Schema.String),
    townhall: Schema.Number,
    trophies: Schema.NullOr(Schema.Number),
    leagueId: Schema.NullOr(Schema.Number),
    leagueName: Schema.NullOr(Schema.String),
    heroLevelSum: Schema.Number,
    maxPercent: Schema.NullOr(Schema.Number),
    warPreference: Schema.NullOr(Schema.Boolean),
    discordUserId: Schema.NullOr(DecimalSnowflake),
    discordUsername: Schema.NullOr(Schema.String),
    discordAvatarUrl: Schema.NullOr(Schema.String),
    lastOnline: Schema.NullOr(Schema.String),
    refreshedAt: Schema.NullOr(Schema.String),
    answers: Schema.Json,
});
const RosterListResponse = Schema.Struct({ items: Schema.Array(RosterSummary) });
const RosterResponse = Schema.Struct({
    roster: Schema.Struct({ ...RosterSummary.fields, members: Schema.Array(RosterMember) }),
});
const RosterRefreshResponse = Schema.Struct({
    refreshId: Schema.String,
    scope: Schema.String,
    status: Schema.String,
    refreshedPlayers: Schema.Number,
    failedPlayers: Schema.Number,
    refreshedAt: Schema.String,
    reused: Schema.Boolean,
    roleId: OptionalSnowflake,
    roleMemberUserIds: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
});
const get = (operationId, path, auth, pathParams, query, response, summary) => defineEndpoint({
    auth, body: NoBody, bodyMode: "none", method: "GET",
    operationId, path, pathParams, query, response, responseMode: "json", successStatus: 200, summary,
});
const mutate = (operationId, method, path, auth, pathParams, body, response, summary) => defineEndpoint({
    auth, body, bodyMode: method === "DELETE" ? "none" : "json", method,
    operationId, path, pathParams, query: NoQuery, response, responseMode: "json", successStatus: 200, summary,
});
// A second client name does not define a second wire contract. Keep Bot method
// names and parameter names while sharing every existing operation schema.
const forBot = (endpoint, operationId, path, pathParams, summary) => {
    return defineEndpoint({
        ...endpoint, operationId, path, pathParams, summary,
    });
};
export const BotAccountsEndpoint = forBot(Misc.DashboardLinksListEndpoint, "botAccounts", "/v2/links/:userId", UserPath, "Get linked accounts");
export const BotLinkAccountEndpoint = forBot(Misc.DashboardLinksAddEndpoint, "botLinkAccount", "/v2/links/:userId", UserPath, "Link an account");
export const BotUnlinkAccountEndpoint = forBot(Misc.DashboardLinksRemoveEndpoint, "botUnlinkAccount", "/v2/links/:userId/:tag", Schema.Struct({ userId: DecimalSnowflake, tag: Schema.String }), "Unlink an account");
export const BotServerLinksEndpoint = forBot(Server.ServerLinksEndpoint, "botServerLinks", "/v2/links/server/:serverId", ServerPath, "Get server member links");
export const BotServerClansEndpoint = forBot(Server.ServerClansBasicEndpoint, "botServerClans", "/v2/server/:serverId/clans-basic", ServerPath, "Get server clans");
export const BotDashboardCapabilitiesEndpoint = forBot(Server.DashboardCapabilitiesEndpoint, "botDashboardCapabilities", "/v2/server/:serverId/dashboard-capabilities", ServerPath, "Get dashboard capabilities");
const ServerLeaderboardQuery = Schema.Struct({ season: OptionalString, limit: OptionalNumber });
export const BotServerWarLeaderboardEndpoint = get("botServerWarLeaderboard", "/v2/server/:serverId/leaderboards/war-performance", "server-read", ServerPath, Schema.Struct({ limit: OptionalNumber }), ServerWarLeaderboardResponse, "Get server war leaderboard");
export const BotServerDonationsLeaderboardEndpoint = get("botServerDonationsLeaderboard", "/v2/server/:serverId/leaderboards/donations", "server-read", ServerPath, ServerLeaderboardQuery, ServerDonationsLeaderboardResponse, "Get server donation leaderboard");
export const BotServerLegendsLeaderboardEndpoint = get("botServerLegendsLeaderboard", "/v2/server/:serverId/leaderboards/legends", "server-read", ServerPath, Schema.Struct({ limit: OptionalNumber }), ServerLegendsLeaderboardResponse, "Get server Legend leaderboard");
export const BotServerClanGamesLeaderboardEndpoint = get("botServerClanGamesLeaderboard", "/v2/server/:serverId/leaderboards/clan-games", "server-read", ServerPath, ServerLeaderboardQuery, ServerClanGamesLeaderboardResponse, "Get server Clan Games leaderboard");
export const BotBansEndpoint = forBot(Server.ServerBansEndpoint, "botBans", "/v2/server/:serverId/bans", ServerPath, "Get server bans");
export const BotSaveBanEndpoint = forBot(Server.AddServerBanEndpoint, "botSaveBan", "/v2/server/:serverId/bans/:tag", ServerTagPath, "Add or update a ban");
export const BotDeleteBanEndpoint = forBot(Server.RemoveServerBanEndpoint, "botDeleteBan", "/v2/server/:serverId/bans/:tag", ServerTagPath, "Delete a ban");
export const BotStrikesEndpoint = forBot(Server.ServerStrikesEndpoint, "botStrikes", "/v2/server/:serverId/strikes", ServerPath, "Get server strikes");
export const BotStrikeSummaryEndpoint = forBot(Server.PlayerStrikeSummaryEndpoint, "botStrikeSummary", "/v2/server/:serverId/strikes/player/:tag/summary", ServerTagPath, "Get player strike summary");
export const BotAddStrikeEndpoint = forBot(Server.AddServerStrikeEndpoint, "botAddStrike", "/v2/server/:serverId/strikes/:tag", ServerTagPath, "Add a strike");
export const BotDeleteStrikeEndpoint = forBot(Server.RemoveServerStrikeEndpoint, "botDeleteStrike", "/v2/server/:serverId/strikes/:strikeId", Schema.Struct({ serverId: DecimalSnowflake, strikeId: Schema.String }), "Delete a strike");
export const BotRostersEndpoint = get("botRosters", "/v2/server/:serverId/rosters", "server-read", ServerPath, NoQuery, RosterListResponse, "Get server rosters");
export const BotRosterEndpoint = get("botRoster", "/v2/server/:serverId/rosters/:rosterId", "server-read", Schema.Struct({ serverId: DecimalSnowflake, rosterId: Schema.String }), NoQuery, RosterResponse, "Get server roster");
export const BotRefreshRosterEndpoint = mutate("botRefreshRoster", "POST", "/v2/server/:serverId/rosters/:rosterId/refresh", "server-write", Schema.Struct({ serverId: DecimalSnowflake, rosterId: Schema.String }), Schema.Struct({ scope: Schema.Literals(["data", "role"]) }), RosterRefreshResponse, "Refresh roster data");
export const BotGiveawaysEndpoint = forBot(Server.ServerGiveawaysEndpoint, "botGiveaways", "/v2/server/:serverId/giveaways", ServerPath, "Get server giveaways");
export const BotGiveawayEndpoint = forBot(Extra.ServerGiveawayEndpoint, "botGiveaway", "/v2/server/:serverId/giveaways/:giveawayId", Schema.Struct({ serverId: DecimalSnowflake, giveawayId: Schema.String }), "Get server giveaway");
export const BotRerollGiveawayEndpoint = forBot(Server.RerollGiveawayEndpoint, "botRerollGiveaway", "/v2/server/:serverId/giveaways/:giveawayId/reroll", Schema.Struct({ serverId: DecimalSnowflake, giveawayId: Schema.String }), "Reroll giveaway winners");
export const BotRemindersEndpoint = forBot(Server.ServerRemindersEndpoint, "botReminders", "/v2/server/:serverId/reminders", ServerPath, "Get server reminders");
export const BotTicketsEndpoint = forBot(Server.TicketPanelsEndpoint, "botTickets", "/v2/server/:serverId/tickets", ServerPath, "Get server ticket panels");
export const BotEmbedsEndpoint = forBot(Server.ServerEmbedsEndpoint, "botEmbeds", "/v2/server/:serverId/embeds", ServerPath, "Get server embeds");
export const BotBasesEndpoint = forBot(Server.BasesEndpoint, "botBases", "/v2/server/:serverId/bases", ServerPath, "Get server bases");
export const BotBaseEndpoint = forBot(Server.BaseEndpoint, "botBase", "/v2/server/:serverId/bases/:baseId", Schema.Struct({ serverId: DecimalSnowflake, baseId: Schema.String }), "Get server base");
