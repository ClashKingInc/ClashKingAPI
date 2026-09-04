import { Schema } from "effect";
import { defineEndpoint, NoBody, NoQuery, } from "./endpoint.js";
import { DecimalSnowflake } from "./discord.js";
import { ApproveMessages } from "./dashboard-server.js";
import { RuntimeUUID } from "./persistent-runtime.js";
import { RosterCapacity, RosterBuilderMemberGroupSetting } from "./roster-configuration.js";
const OptionalBoolean = Schema.optionalKey(Schema.Boolean);
const OptionalNumber = Schema.optionalKey(Schema.Number);
const OptionalString = Schema.optionalKey(Schema.String);
const OptionalSnowflake = Schema.optionalKey(DecimalSnowflake);
const NullableSnowflake = Schema.optionalKey(Schema.NullOr(DecimalSnowflake));
const UserPath = Schema.Struct({ userId: DecimalSnowflake });
const ServerPath = Schema.Struct({ serverId: DecimalSnowflake });
const ServerTagPath = Schema.Struct({ serverId: DecimalSnowflake, tag: Schema.String });
const AccountsLinkedAccount = Schema.Struct({
    user_id: DecimalSnowflake,
    player_tag: Schema.String,
    order_index: Schema.Number,
    is_verified: Schema.Boolean,
    hidden: Schema.Boolean,
    added_at: Schema.String,
    verified_at: OptionalString,
    last_login: Schema.NullOr(Schema.String),
});
const AccountsListResponse = Schema.Struct({ items: Schema.Array(AccountsLinkedAccount) });
const AccountsLinkResponse = Schema.Struct({
    message: Schema.String,
    account: Schema.Struct({
        tag: Schema.String,
        name: Schema.String,
        townHallLevel: Schema.Number,
        is_verified: Schema.Boolean,
        hidden: Schema.Boolean,
    }),
});
const AccountsMessageResponse = Schema.Struct({ message: Schema.String });
const ServerLinkedAccount = Schema.Struct({
    player_tag: Schema.String,
    player_name: OptionalString,
    town_hall: OptionalNumber,
    is_verified: Schema.Boolean,
    added_at: Schema.String,
});
const ServerLinkRole = Schema.Struct({
    id: DecimalSnowflake,
    name: Schema.String,
    color: Schema.Number,
    position: Schema.Number,
});
const ServerLinksResponse = Schema.Struct({
    members: Schema.Array(Schema.Struct({
        user_id: DecimalSnowflake,
        username: Schema.String,
        display_name: Schema.String,
        avatar_url: Schema.String,
        linked_accounts: Schema.Array(ServerLinkedAccount),
        account_count: Schema.Number,
    })),
    roles: Schema.Array(ServerLinkRole),
    total_members: Schema.Number,
    filtered_members: Schema.Number,
    members_with_links: Schema.Number,
    total_linked_accounts: Schema.Number,
    verified_accounts: Schema.Number,
});
const ClanReference = Schema.Struct({ tag: Schema.String, name: Schema.String });
const DashboardCapabilities = Schema.Struct({
    server_id: DecimalSnowflake,
    full_access: Schema.Boolean,
    sections: Schema.Record(Schema.String, Schema.String),
});
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
const BanItem = Schema.Struct({
    VillageTag: Schema.String,
    VillageName: Schema.String,
    DateCreated: Schema.String,
    Notes: Schema.String,
    server: DecimalSnowflake,
    added_by: Schema.String,
    added_by_username: OptionalString,
    added_by_avatar_url: OptionalString,
    edited_by: Schema.Array(Schema.Struct({
        user: Schema.String,
        previous: Schema.Struct({ reason: Schema.String }),
    })),
    image: OptionalString,
    name: OptionalString,
    town_hall: OptionalNumber,
    clan_tag: OptionalString,
    clan_name: OptionalString,
    current_role: OptionalString,
    trophies: OptionalNumber,
});
const BanListResponse = Schema.Struct({ items: Schema.Array(BanItem), count: Schema.Number });
const BanMutationResponse = Schema.Struct({
    status: Schema.String,
    player_tag: Schema.String,
    player_name: OptionalString,
    server_id: DecimalSnowflake,
});
const StrikeItem = Schema.Struct({
    strike_id: Schema.String,
    tag: Schema.String,
    server: DecimalSnowflake,
    reason: Schema.String,
    added_by: Schema.String,
    added_by_username: OptionalString,
    added_by_avatar_url: OptionalString,
    strike_weight: Schema.Number,
    image: OptionalString,
    date_created: Schema.String,
    rollover_date: OptionalNumber,
    player_name: OptionalString,
    town_hall: OptionalNumber,
    clan_tag: OptionalString,
    clan_name: OptionalString,
    current_role: OptionalString,
    trophies: OptionalNumber,
});
const StrikeListResponse = Schema.Struct({ items: Schema.Array(StrikeItem), count: Schema.Number });
const StrikeSummaryResponse = Schema.Struct({
    player_tag: Schema.String,
    server_id: DecimalSnowflake,
    total_strikes: Schema.Number,
    total_weight: Schema.Number,
    strikes: Schema.Array(StrikeItem),
});
const StrikeMutationResponse = Schema.Struct({
    status: Schema.String,
    strike_id: Schema.String,
    player_tag: Schema.String,
    player_name: OptionalString,
    server_id: DecimalSnowflake,
    total_strikes: OptionalNumber,
    total_weight: OptionalNumber,
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
    capacity: RosterCapacity,
    minTownhall: Schema.NullOr(Schema.Number),
    maxTownhall: Schema.NullOr(Schema.Number),
    rosterRoleId: Schema.NullOr(DecimalSnowflake),
    memberGroups: Schema.Array(RosterBuilderMemberGroupSetting),
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
    memberGroupId: Schema.NullOr(RuntimeUUID),
    isSubstitute: Schema.Boolean,
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
const GiveawayWinner = Schema.Struct({
    userId: DecimalSnowflake,
    username: OptionalString,
    avatarUrl: OptionalString,
    inServer: Schema.Boolean,
    status: Schema.String,
    timestamp: OptionalString,
    reason: OptionalString,
});
const Giveaway = Schema.Struct({
    id: Schema.String,
    serverId: DecimalSnowflake,
    prize: Schema.String,
    channelId: OptionalSnowflake,
    status: Schema.String,
    start: Schema.String,
    end: Schema.String,
    winners: Schema.Number,
    mentions: Schema.Array(Schema.String),
    textAboveEmbed: Schema.String,
    textInEmbed: Schema.String,
    textOnEnd: Schema.String,
    imageUrl: OptionalString,
    profilePictureRequired: Schema.Boolean,
    cocAccountRequired: Schema.Boolean,
    rolesMode: Schema.String,
    roles: Schema.Array(DecimalSnowflake),
    boosters: Schema.Array(Schema.Struct({ value: Schema.Number, roles: Schema.Array(DecimalSnowflake) })),
    entries: Schema.Array(Schema.Json),
    winnersList: Schema.Array(GiveawayWinner),
    updated: Schema.Boolean,
    messageId: OptionalSnowflake,
    eventPending: OptionalString,
    eventPendingAt: OptionalString,
    createdAt: Schema.String,
    updatedAt: Schema.String,
});
const GiveawaysResponse = Schema.Struct({
    ongoing: Schema.Array(Giveaway),
    upcoming: Schema.Array(Giveaway),
    ended: Schema.Array(Giveaway),
    total: Schema.Number,
});
const GiveawayRerollResponse = Schema.Struct({
    message: Schema.String,
    giveawayId: Schema.String,
    serverId: DecimalSnowflake,
    newWinners: Schema.Array(DecimalSnowflake),
});
const Reminder = Schema.Struct({
    id: Schema.String,
    type: Schema.String,
    clan_tag: OptionalString,
    channel_id: OptionalSnowflake,
    thread_id: NullableSnowflake,
    time: Schema.String,
    custom_text: OptionalString,
    townhall_filter: Schema.optionalKey(Schema.Array(Schema.Number)),
    roles: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
    war_types: Schema.optionalKey(Schema.Array(Schema.String)),
    point_threshold: OptionalNumber,
    attack_threshold: OptionalNumber,
    roster_id: OptionalString,
    ping_type: OptionalString,
});
const RemindersResponse = Schema.Struct({
    war_reminders: Schema.Array(Reminder),
    capital_reminders: Schema.Array(Reminder),
    clan_games_reminders: Schema.Array(Reminder),
    inactivity_reminders: Schema.Array(Reminder),
    roster_reminders: Schema.Array(Reminder),
});
const DiscordEmoji = Schema.Struct({
    id: OptionalSnowflake,
    name: OptionalString,
    animated: OptionalBoolean,
});
const TicketButton = Schema.Struct({
    id: Schema.String,
    custom_id: Schema.String,
    label: Schema.String,
    style: Schema.Number,
    emoji: Schema.optionalKey(DiscordEmoji),
    type: Schema.Number,
});
const TicketButtonSettings = Schema.Struct({
    questions: Schema.Array(Schema.String),
    mod_role: Schema.Array(DecimalSnowflake),
    no_ping_mod_role: Schema.Array(DecimalSnowflake),
    private_thread: Schema.Boolean,
    th_min: Schema.Number,
    num_apply: Schema.Number,
    naming: Schema.String,
    account_apply: Schema.Boolean,
    player_info: Schema.Boolean,
    apply_clans: Schema.Array(Schema.String),
    roles_to_add: Schema.Array(DecimalSnowflake),
    roles_to_remove: Schema.Array(DecimalSnowflake),
    townhall_requirements: Schema.Record(Schema.String, Schema.Number),
    new_message: OptionalString,
});
const TicketPanel = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    server_id: DecimalSnowflake,
    embed_name: OptionalString,
    components: Schema.Array(TicketButton),
    button_settings: Schema.Record(Schema.String, TicketButtonSettings),
    open_category: OptionalSnowflake,
    sleep_category: OptionalSnowflake,
    closed_category: OptionalSnowflake,
    status_change_log: OptionalSnowflake,
    ticket_button_click_log: OptionalSnowflake,
    ticket_close_log: OptionalSnowflake,
    approve_messages: ApproveMessages,
});
const TicketsResponse = Schema.Struct({
    items: Schema.Array(TicketPanel),
    total: Schema.Number,
    available_embeds: Schema.Array(Schema.String),
    townhall_requirement_fields: Schema.Array(Schema.String),
});
const EmbedsResponse = Schema.Struct({
    items: Schema.Array(Schema.Struct({ name: Schema.String, data: Schema.JsonObject })),
    total: Schema.Number,
});
const Base = Schema.Struct({
    id: Schema.String,
    serverId: DecimalSnowflake,
    channelId: DecimalSnowflake,
    messageId: DecimalSnowflake,
    baseLink: Schema.String,
    images: Schema.Array(Schema.String),
    description: Schema.String,
    downloadCount: Schema.Number,
    upvotes: Schema.Number,
    downvotes: Schema.Number,
    downloaders: Schema.Array(DecimalSnowflake),
    createdAt: Schema.String,
    discordMessageUrl: Schema.String,
});
const BasesResponse = Schema.Struct({
    items: Schema.Array(Base),
    total: Schema.Number,
    limit: Schema.Number,
    offset: Schema.Number,
});
const get = (operationId, path, auth, pathParams, query, response, summary) => defineEndpoint({
    auth, body: NoBody, bodyMode: "none", method: "GET",
    operationId, path, pathParams, query, response, responseMode: "json", successStatus: 200, summary,
});
const mutate = (operationId, method, path, auth, pathParams, body, response, summary) => defineEndpoint({
    auth, body, bodyMode: method === "DELETE" ? "none" : "json", method,
    operationId, path, pathParams, query: NoQuery, response, responseMode: "json", successStatus: 200, summary,
});
export const BotAccountsEndpoint = get("botAccounts", "/v2/links/:userId", "user-or-bot", UserPath, NoQuery, AccountsListResponse, "Get linked accounts");
export const BotLinkAccountEndpoint = mutate("botLinkAccount", "POST", "/v2/links/:userId", "user-or-bot", UserPath, Schema.Struct({ player_tag: Schema.String, api_token: Schema.String }), AccountsLinkResponse, "Link an account");
export const BotUnlinkAccountEndpoint = mutate("botUnlinkAccount", "DELETE", "/v2/links/:userId/:tag", "user-or-bot", Schema.Struct({ userId: DecimalSnowflake, tag: Schema.String }), NoBody, AccountsMessageResponse, "Unlink an account");
export const BotServerLinksEndpoint = get("botServerLinks", "/v2/links/server/:serverId", "server-read", ServerPath, Schema.Struct({ limit: OptionalNumber, offset: OptionalNumber, query: OptionalString, account_filter: Schema.optionalKey(Schema.Literal("none")) }), ServerLinksResponse, "Get server member links");
export const BotServerClansEndpoint = get("botServerClans", "/v2/server/:serverId/clans-basic", "server-read", ServerPath, NoQuery, Schema.Array(ClanReference), "Get server clans");
export const BotDashboardCapabilitiesEndpoint = get("botDashboardCapabilities", "/v2/server/:serverId/dashboard-capabilities", "user-or-bot", ServerPath, NoQuery, DashboardCapabilities, "Get dashboard capabilities");
const ServerLeaderboardQuery = Schema.Struct({ season: OptionalString, limit: OptionalNumber });
export const BotServerWarLeaderboardEndpoint = get("botServerWarLeaderboard", "/v2/server/:serverId/leaderboards/war-performance", "server-read", ServerPath, Schema.Struct({ limit: OptionalNumber }), ServerWarLeaderboardResponse, "Get server war leaderboard");
export const BotServerDonationsLeaderboardEndpoint = get("botServerDonationsLeaderboard", "/v2/server/:serverId/leaderboards/donations", "server-read", ServerPath, ServerLeaderboardQuery, ServerDonationsLeaderboardResponse, "Get server donation leaderboard");
export const BotServerLegendsLeaderboardEndpoint = get("botServerLegendsLeaderboard", "/v2/server/:serverId/leaderboards/legends", "server-read", ServerPath, Schema.Struct({ limit: OptionalNumber }), ServerLegendsLeaderboardResponse, "Get server Legend leaderboard");
export const BotServerClanGamesLeaderboardEndpoint = get("botServerClanGamesLeaderboard", "/v2/server/:serverId/leaderboards/clan-games", "server-read", ServerPath, ServerLeaderboardQuery, ServerClanGamesLeaderboardResponse, "Get server Clan Games leaderboard");
export const BotBansEndpoint = get("botBans", "/v2/server/:serverId/bans", "server-read", ServerPath, NoQuery, BanListResponse, "Get server bans");
export const BotSaveBanEndpoint = mutate("botSaveBan", "POST", "/v2/server/:serverId/bans/:tag", "server-write", ServerTagPath, Schema.Struct({ reason: Schema.String, added_by: Schema.String, image: Schema.String }), BanMutationResponse, "Add or update a ban");
export const BotDeleteBanEndpoint = mutate("botDeleteBan", "DELETE", "/v2/server/:serverId/bans/:tag", "server-write", ServerTagPath, NoBody, BanMutationResponse, "Delete a ban");
export const BotStrikesEndpoint = get("botStrikes", "/v2/server/:serverId/strikes", "server-read", ServerPath, Schema.Struct({ player_tag: OptionalString, view_expired: Schema.optionalKey(Schema.Boolean) }), StrikeListResponse, "Get server strikes");
export const BotStrikeSummaryEndpoint = get("botStrikeSummary", "/v2/server/:serverId/strikes/player/:tag/summary", "server-read", ServerTagPath, NoQuery, StrikeSummaryResponse, "Get player strike summary");
export const BotAddStrikeEndpoint = mutate("botAddStrike", "POST", "/v2/server/:serverId/strikes/:tag", "server-write", ServerTagPath, Schema.Struct({ reason: Schema.String, added_by: Schema.String, rollover_days: Schema.Number, strike_weight: Schema.Number, image: Schema.String }), StrikeMutationResponse, "Add a strike");
export const BotDeleteStrikeEndpoint = mutate("botDeleteStrike", "DELETE", "/v2/server/:serverId/strikes/:strikeId", "server-write", Schema.Struct({ serverId: DecimalSnowflake, strikeId: Schema.String }), NoBody, StrikeMutationResponse, "Delete a strike");
export const BotRostersEndpoint = get("botRosters", "/v2/server/:serverId/rosters", "server-read", ServerPath, NoQuery, RosterListResponse, "Get server rosters");
export const BotRosterEndpoint = get("botRoster", "/v2/server/:serverId/rosters/:rosterId", "server-read", Schema.Struct({ serverId: DecimalSnowflake, rosterId: Schema.String }), NoQuery, RosterResponse, "Get server roster");
export const BotRefreshRosterEndpoint = mutate("botRefreshRoster", "POST", "/v2/server/:serverId/rosters/:rosterId/refresh", "server-write", Schema.Struct({ serverId: DecimalSnowflake, rosterId: Schema.String }), Schema.Struct({ scope: Schema.Literals(["data", "role"]) }), RosterRefreshResponse, "Refresh roster data");
export const BotGiveawaysEndpoint = get("botGiveaways", "/v2/server/:serverId/giveaways", "server-read", ServerPath, NoQuery, GiveawaysResponse, "Get server giveaways");
export const BotGiveawayEndpoint = get("botGiveaway", "/v2/server/:serverId/giveaways/:giveawayId", "server-read", Schema.Struct({ serverId: DecimalSnowflake, giveawayId: Schema.String }), NoQuery, Giveaway, "Get server giveaway");
export const BotRerollGiveawayEndpoint = mutate("botRerollGiveaway", "POST", "/v2/server/:serverId/giveaways/:giveawayId/reroll", "server-write", Schema.Struct({ serverId: DecimalSnowflake, giveawayId: Schema.String }), Schema.Struct({ user_ids_to_replace: Schema.Array(DecimalSnowflake) }), GiveawayRerollResponse, "Reroll giveaway winners");
export const BotRemindersEndpoint = get("botReminders", "/v2/server/:serverId/reminders", "server-read", ServerPath, NoQuery, RemindersResponse, "Get server reminders");
export const BotTicketsEndpoint = get("botTickets", "/v2/server/:serverId/tickets", "server-read", ServerPath, NoQuery, TicketsResponse, "Get server ticket panels");
export const BotEmbedsEndpoint = get("botEmbeds", "/v2/server/:serverId/embeds", "server-read", ServerPath, NoQuery, EmbedsResponse, "Get server embeds");
export const BotBasesEndpoint = get("botBases", "/v2/server/:serverId/bases", "server-manager-read", ServerPath, Schema.Struct({ limit: OptionalNumber, offset: OptionalNumber }), BasesResponse, "Get server bases");
export const BotBaseEndpoint = get("botBase", "/v2/server/:serverId/bases/:baseId", "server-manager-read", Schema.Struct({ serverId: DecimalSnowflake, baseId: Schema.String }), NoQuery, Base, "Get server base");
