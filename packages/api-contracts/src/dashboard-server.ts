import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { JsonValue } from "./expo-common.js"
import { ErrorCode, ErrorResponse } from "./errors.js"

const OptionalBoolean = Schema.optionalKey(Schema.Boolean)
const OptionalNumber = Schema.optionalKey(Schema.Number)
const OptionalString = Schema.optionalKey(Schema.String)
const OptionalNullableString = Schema.optionalKey(Schema.NullOr(Schema.String))

export const DashboardServerPath = Schema.Struct({ serverId: Schema.String })
export const DashboardGuildPath = Schema.Struct({ guildId: Schema.String })
export const DashboardServerClanPath = Schema.Struct({
  serverId: Schema.String,
  clanTag: Schema.String,
})

export const DashboardAccessLevel = Schema.Literals(["view", "manage"])
export const DashboardAccessGrant = Schema.Struct({
  role_id: Schema.String,
  section: Schema.String,
  access_level: DashboardAccessLevel,
})
export const DashboardAccessRole = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.Number,
  position: Schema.Number,
})
export const DashboardAccessConfig = Schema.Struct({
  server_id: Schema.String,
  roles: Schema.Array(DashboardAccessRole),
  grants: Schema.Array(DashboardAccessGrant),
  sections: Schema.Array(Schema.String),
})
export const DashboardAccessUpdate = Schema.Struct({
  grants: Schema.Array(DashboardAccessGrant),
})
export const DashboardCapabilities = Schema.Struct({
  server_id: Schema.String,
  full_access: Schema.Boolean,
  sections: Schema.Record(Schema.String, DashboardAccessLevel),
})

export const BotGuildProfile = Schema.Struct({
  name: Schema.String,
  avatar_url: Schema.NullOr(Schema.String),
  banner_url: Schema.NullOr(Schema.String),
  bio: Schema.String,
  name_inherited: Schema.Boolean,
  avatar_inherited: Schema.Boolean,
  banner_inherited: Schema.Boolean,
  bio_inherited: Schema.Boolean,
})
export const BotGuildProfileUpdate = Schema.Struct({
  name: OptionalString,
  avatar: OptionalString,
  banner: OptionalString,
  bio: OptionalString,
  clear_name: OptionalBoolean,
  clear_avatar: OptionalBoolean,
  clear_banner: OptionalBoolean,
  clear_bio: OptionalBoolean,
})

export const GuildInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  owner: Schema.Boolean,
  permissions: Schema.String,
  role: Schema.String,
  features: Schema.Array(Schema.String),
  has_bot: Schema.Boolean,
  member_count: OptionalNumber,
  delegated: Schema.Boolean,
  last_command_at: OptionalString,
  inactive: Schema.Boolean,
})
export const GuildDetails = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  owner_id: Schema.NullOr(Schema.String),
  features: Schema.Array(Schema.String),
  member_count: Schema.NullOr(Schema.Number),
  description: Schema.NullOr(Schema.String),
  banner: Schema.NullOr(Schema.String),
  premium_tier: Schema.Number,
  boost_count: Schema.Number,
})

export const MessageResponse = Schema.Struct({ message: Schema.String })
export const LinkParseSettings = Schema.Struct({
  clan: OptionalBoolean,
  army: OptionalBoolean,
  player: OptionalBoolean,
  base: OptionalBoolean,
  show: OptionalBoolean,
})
export const ServerSettingsUpdate = Schema.Struct({
  require_api_token_when_linking: Schema.optionalKey(Schema.Boolean),
  embed_color: OptionalNumber,
  nickname_rule: OptionalString,
  non_family_nickname_rule: OptionalString,
  change_nickname: OptionalBoolean,
  flair_non_family: OptionalBoolean,
  auto_eval_nickname: OptionalBoolean,
  autoeval_triggers: Schema.optionalKey(Schema.Array(Schema.String)),
  autoeval_log: OptionalString,
  autoeval: OptionalBoolean,
  full_whitelist_role: OptionalString,
  autoboard_limit: OptionalNumber,
  tied: OptionalBoolean,
  family_label: OptionalString,
  link_parse: Schema.optionalKey(LinkParseSettings),
})
export const ServerSettingsResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  updated_fields: Schema.Number,
})
export const EmbedColorResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  embed_color: Schema.Number,
})

export const ClanCategory = Schema.Struct({
  id: Schema.String,
  serverId: Schema.String,
  name: Schema.String,
  position: Schema.Number,
  clanCount: Schema.Number,
})
export const ClanCategoriesResponse = Schema.Struct({
  items: Schema.Array(ClanCategory),
  total: Schema.Number,
})
export const ClanCategoryMutationResponse = Schema.Struct({ category: ClanCategory })
export const ClanCategoryDeletePreview = Schema.Struct({
  category: ClanCategory,
  affectedClanCount: Schema.Number,
})
export const ClanCategoryDeleteResponse = Schema.Struct({
  categoryId: Schema.String,
  name: Schema.String,
  deleted: Schema.Boolean,
  uncategorizedClanCount: Schema.Number,
})

export const ClanSettingsUpdate = Schema.Struct({
  category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  abbreviation: OptionalString,
})
export const ClanSettings = Schema.Struct({
  category: OptionalString,
  abbreviation: OptionalString,
})
export const ClanSettingsDetail = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  server_id: Schema.String,
  category: OptionalString,
  abbreviation: OptionalString,
})
export const ClanSettingsResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  clan_tag: Schema.String,
  updated_fields: Schema.Number,
  category: Schema.NullOr(ClanCategory),
})
export const ClanReference = Schema.Struct({ tag: Schema.String, name: Schema.String })
export const ServerClanListItem = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  badge_url: OptionalString,
  level: OptionalNumber,
  member_count: OptionalNumber,
  added_at: Schema.String,
  settings: ClanSettings,
})
export const AddClanRequest = Schema.Struct({ tag: Schema.String })
export const AddClanResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  clan_tag: Schema.String,
  clan_name: Schema.String,
})
export const RemoveClanResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  clan_tag: Schema.String,
  deleted_count: Schema.Number,
})

export const ServerRoleType = Schema.Literals([
  "townhall",
  "builderhall",
  "league",
  "builder_league",
  "clan_role",
  "clan_category",
  "family",
  "achievement",
  "status",
])
export const ServerRoleMode = Schema.Literals(["both", "add", "remove"])
export const DiscordRole = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.Number,
  position: Schema.Number,
  managed: Schema.Boolean,
  mentionable: Schema.Boolean,
})
export const DiscordRolesResponse = Schema.Struct({
  server_id: Schema.String,
  roles: Schema.Array(DiscordRole),
  count: Schema.Number,
})
export const ServerRole = Schema.Struct({
  id: Schema.String,
  server_id: Schema.String,
  clan_tag: OptionalString,
  type: ServerRoleType,
  option: Schema.String,
  role_id: Schema.String,
  mode: ServerRoleMode,
  created_at: Schema.String,
  updated_at: Schema.String,
})
export const ServerRoleCreate = Schema.Struct({
  clan_tag: OptionalString,
  type: ServerRoleType,
  option: Schema.String,
  role_id: Schema.String,
  mode: Schema.optionalKey(ServerRoleMode),
})
export const ServerRoleUpdate = Schema.Struct({
  clan_tag: OptionalString,
  type: Schema.optionalKey(ServerRoleType),
  option: OptionalString,
  role_id: OptionalString,
  mode: Schema.optionalKey(ServerRoleMode),
})
export const ServerRolesResponse = Schema.Struct({
  server_id: Schema.String,
  roles: Schema.Array(ServerRole),
  count: Schema.Number,
})
export const ServerRoleResponse = Schema.Struct({ message: Schema.String, role: ServerRole })
export const RoleSettings = Schema.Struct({
  server_id: Schema.String,
  auto_eval_status: OptionalBoolean,
  auto_eval_nickname: OptionalBoolean,
  autoeval_triggers: Schema.optionalKey(Schema.Array(Schema.String)),
  autoeval_log: OptionalString,
})
export const RoleSettingsUpdate = Schema.Struct({
  auto_eval_status: OptionalBoolean,
  auto_eval_nickname: OptionalBoolean,
  autoeval_triggers: Schema.optionalKey(Schema.Array(Schema.String)),
  autoeval_log: OptionalString,
})
export const RoleSettingsMutationResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
})

export const ServerLog = Schema.Struct({
  clan_tag: OptionalString,
  type: Schema.String,
  webhook_id: Schema.String,
  channel_id: OptionalString,
  thread_id: OptionalNullableString,
  disabled: Schema.Boolean,
  disabled_reason: OptionalNullableString,
})
export const ServerLogsResponse = Schema.Struct({
  logs: Schema.Array(ServerLog),
  count: Schema.Number,
})
export const UpdateServerLogsRequest = Schema.Struct({
  clan_tag: OptionalString,
  channel_id: Schema.String,
  thread_id: OptionalNullableString,
  log_types: Schema.Array(Schema.String),
})
export const UpdateServerLogsDisabledRequest = Schema.Struct({
  clan_tag: OptionalString,
  log_types: Schema.Array(Schema.String),
  disabled: Schema.Boolean,
})
export const ServerLogsDeleteQuery = Schema.Struct({
  clan_tag: OptionalString,
  log_types: Schema.String,
})
export const ServerLogsOperationResponse = Schema.Struct({
  message: Schema.String,
  server_id: Schema.String,
  clan_tag: OptionalString,
  updated_log_types: Schema.optionalKey(Schema.Array(Schema.String)),
  deleted_log_types: Schema.optionalKey(Schema.Array(Schema.String)),
  logs: Schema.optionalKey(Schema.Array(ServerLog)),
})

export const CountdownType = Schema.Literals([
  "clan_games_timer",
  "cwl_timer",
  "raid_weekend_timer",
  "season_end_timer",
  "season_day_timer",
  "war_score",
  "war_timer",
])
export const CountdownStatus = Schema.Struct({
  type: CountdownType,
  name: Schema.String,
  enabled: Schema.Boolean,
  channel_id: OptionalString,
})
export const ServerCountdownsResponse = Schema.Struct({
  server_id: Schema.String,
  countdowns: Schema.Array(CountdownStatus),
})
export const ClanCountdownsResponse = Schema.Struct({
  server_id: Schema.String,
  clan_tag: Schema.String,
  countdowns: Schema.Array(CountdownStatus),
})
export const CountdownMutationRequest = Schema.Struct({
  countdown_type: CountdownType,
  clan_tag: Schema.optionalKey(Schema.String),
})
export const EnableCountdownResponse = Schema.Struct({
  message: Schema.String,
  countdown_type: CountdownType,
  channel_id: Schema.String,
  channel_name: Schema.String,
})
export const DisableCountdownResponse = Schema.Struct({
  message: Schema.String,
  countdown_type: CountdownType,
})

export const DiscordChannel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.Literals(["category", "text", "news", "forum"]),
  parent_id: OptionalString,
  parent_name: OptionalString,
})
export const DiscordThread = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  parent_channel_id: Schema.String,
  parent_channel_name: Schema.String,
  archived: Schema.Boolean,
})

export const Reminder = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  clan_tag: OptionalString,
  channel_id: OptionalString,
  thread_id: OptionalNullableString,
  time: Schema.String,
  custom_text: OptionalString,
  townhall_filter: Schema.optionalKey(Schema.Array(Schema.Number)),
  roles: Schema.optionalKey(Schema.Array(Schema.String)),
  war_types: Schema.optionalKey(Schema.Array(Schema.String)),
  point_threshold: OptionalNumber,
  attack_threshold: OptionalNumber,
  roster_id: OptionalString,
  ping_type: OptionalString,
  disabled: Schema.Boolean,
  disabled_reason: OptionalNullableString,
})
export const RemindersResponse = Schema.Struct({
  war_reminders: Schema.Array(Reminder),
  capital_reminders: Schema.Array(Reminder),
  clan_games_reminders: Schema.Array(Reminder),
  inactivity_reminders: Schema.Array(Reminder),
  roster_reminders: Schema.Array(Reminder),
})
export const CreateReminderRequest = Schema.Struct({
  type: Schema.String,
  clan_tag: OptionalString,
  channel_id: Schema.String,
  thread_id: OptionalNullableString,
  time: Schema.String,
  custom_text: OptionalString,
  townhall_filter: Schema.optionalKey(Schema.Array(Schema.Number)),
  roles: Schema.optionalKey(Schema.Array(Schema.String)),
  war_types: Schema.optionalKey(Schema.Array(Schema.String)),
  point_threshold: OptionalNumber,
  attack_threshold: OptionalNumber,
  roster_id: OptionalString,
  ping_type: OptionalString,
})
export const UpdateReminderRequest = Schema.Struct({
  channel_id: OptionalString,
  thread_id: OptionalNullableString,
  time: OptionalString,
  custom_text: OptionalString,
  townhall_filter: Schema.optionalKey(Schema.Array(Schema.Number)),
  roles: Schema.optionalKey(Schema.Array(Schema.String)),
  war_types: Schema.optionalKey(Schema.Array(Schema.String)),
  point_threshold: OptionalNumber,
  attack_threshold: OptionalNumber,
  ping_type: OptionalString,
})
export const ReminderOperationResponse = Schema.Struct({
  message: Schema.String,
  reminder_id: Schema.String,
  server_id: Schema.String,
})

export const BanRequest = Schema.Struct({
  reason: Schema.NullOr(Schema.String),
  added_by: Schema.String,
  image: Schema.NullOr(Schema.String),
})
export const BanEdit = Schema.Struct({
  user: Schema.String,
  previous: Schema.Struct({ reason: Schema.String }),
})
export const BannedPlayer = Schema.Struct({
  VillageTag: Schema.String,
  VillageName: Schema.String,
  DateCreated: Schema.String,
  Notes: Schema.String,
  server: Schema.String,
  added_by: Schema.String,
  added_by_username: OptionalString,
  added_by_avatar_url: OptionalString,
  edited_by: Schema.Array(BanEdit),
  image: OptionalString,
  name: OptionalString,
  town_hall: OptionalNumber,
  clan_tag: OptionalString,
  clan_name: OptionalString,
  current_role: OptionalString,
  trophies: OptionalNumber,
})
export const BansResponse = Schema.Struct({
  items: Schema.Array(BannedPlayer),
  count: Schema.Number,
})
export const BanMutationResponse = Schema.Struct({
  status: Schema.String,
  player_tag: Schema.String,
  player_name: OptionalString,
  server_id: Schema.String,
})
export const SearchPlayerReference = Schema.Struct({ tag: Schema.String, name: Schema.String })
export const SearchBannedPlayersResponse = Schema.Struct({
  items: Schema.Array(SearchPlayerReference),
})

export const StrikeRequest = Schema.Struct({
  reason: OptionalString,
  added_by: OptionalString,
  rollover_days: OptionalNumber,
  strike_weight: OptionalNumber,
  image: OptionalString,
})
export const Strike = Schema.Struct({
  strike_id: Schema.String,
  tag: Schema.String,
  server: Schema.String,
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
})
export const StrikesResponse = Schema.Struct({
  items: Schema.Array(Strike),
  count: Schema.Number,
})
export const StrikeMutationResponse = Schema.Struct({
  status: Schema.String,
  strike_id: Schema.String,
  player_tag: Schema.String,
  player_name: OptionalString,
  server_id: Schema.String,
  total_strikes: OptionalNumber,
  total_weight: OptionalNumber,
})
export const StrikeSummary = Schema.Struct({
  player_tag: Schema.String,
  server_id: Schema.String,
  total_strikes: Schema.Number,
  total_weight: Schema.Number,
  strikes: Schema.Array(Strike),
})

export const GiveawayBooster = Schema.Struct({
  value: Schema.Number,
  roles: Schema.Array(Schema.String),
})
export const GiveawayWinner = Schema.Struct({
  userId: Schema.String,
  username: OptionalString,
  avatarUrl: OptionalString,
  inServer: Schema.Boolean,
  status: Schema.Literals(["winner", "rerolled"]),
  timestamp: OptionalString,
  reason: OptionalString,
})
export const GiveawayEntry = Schema.Union([
  Schema.String,
  Schema.Struct({ user_id: Schema.String }),
])
export const Giveaway = Schema.Struct({
  id: Schema.String,
  serverId: Schema.String,
  prize: Schema.String,
  channelId: OptionalString,
  status: Schema.Literals(["scheduled", "ongoing", "ended"]),
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
  rolesMode: Schema.Literals(["allow", "deny", "none"]),
  roles: Schema.Array(Schema.String),
  boosters: Schema.Array(GiveawayBooster),
  entries: Schema.Array(GiveawayEntry),
  winnersList: Schema.Array(GiveawayWinner),
  updated: Schema.Boolean,
  disabled: Schema.Boolean,
  disabled_reason: OptionalNullableString,
  messageId: OptionalString,
  eventPending: OptionalString,
  eventPendingAt: OptionalString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export const GiveawaysResponse = Schema.Struct({
  ongoing: Schema.Array(Giveaway),
  upcoming: Schema.Array(Giveaway),
  ended: Schema.Array(Giveaway),
  total: Schema.Number,
})
export const GiveawayMutationResponse = Schema.Struct({
  message: Schema.String,
  giveawayId: Schema.String,
  serverId: Schema.String,
})
export const GiveawayEntrant = Schema.Struct({
  userId: Schema.String,
  entries: Schema.Number,
  winChance: Schema.Number,
})
export const GiveawayEntriesResponse = Schema.Struct({
  giveawayId: Schema.String,
  serverId: Schema.String,
  totalEntries: Schema.Number,
  uniqueUsers: Schema.Number,
  entrants: Schema.Array(GiveawayEntrant),
})
export const GiveawayRerollRequest = Schema.Struct({
  user_ids_to_replace: Schema.Array(Schema.String),
})
export const GiveawayRerollResponse = Schema.Struct({
  message: Schema.String,
  giveawayId: Schema.String,
  serverId: Schema.String,
  newWinners: Schema.Array(Schema.String),
})

export const DiscordEmoji = Schema.Struct({
  id: OptionalString,
  name: OptionalString,
  animated: OptionalBoolean,
})
export const TicketButton = Schema.Struct({
  custom_id: Schema.String,
  label: Schema.String,
  style: Schema.Number,
  emoji: Schema.optionalKey(DiscordEmoji),
  type: Schema.Number,
})
export const TicketButtonSettings = Schema.Struct({
  questions: Schema.Array(Schema.String),
  mod_role: Schema.Array(Schema.String),
  no_ping_mod_role: Schema.Array(Schema.String),
  private_thread: Schema.Boolean,
  th_min: Schema.Number,
  num_apply: Schema.Number,
  naming: Schema.String,
  account_apply: Schema.Boolean,
  player_info: Schema.Boolean,
  apply_clans: Schema.Array(Schema.String),
  roles_to_add: Schema.Array(Schema.String),
  roles_to_remove: Schema.Array(Schema.String),
  townhall_requirements: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Number)),
  new_message: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export const ApproveMessage = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100), Schema.makeFilter(value => value.trim() !== "" ? undefined : "Template name must not be blank")),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000), Schema.makeFilter(value => value.trim() !== "" ? undefined : "Template message must not be blank")),
})
export const ApproveMessages = Schema.Array(ApproveMessage).check(Schema.isMaxLength(25), Schema.makeFilter(messages =>
  new Set(messages.map(message => message.name.trim())).size === messages.length ? undefined : "Template names must be unique after trimming"))
export const TicketPanel = Schema.Struct({
  name: Schema.String,
  server_id: Schema.String,
  embed_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  components: Schema.Array(TicketButton),
  button_settings: Schema.Record(Schema.String, TicketButtonSettings),
  open_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  sleep_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  closed_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status_change_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ticket_button_click_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ticket_close_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  approve_messages: Schema.Array(Schema.Struct({ name: Schema.String, message: Schema.String })),
})
export const TicketPanelsResponse = Schema.Struct({
  items: Schema.Array(TicketPanel),
  total: Schema.Number,
  available_embeds: Schema.Array(Schema.String),
  townhall_requirement_fields: Schema.Array(Schema.String),
})
export const CreateTicketPanelRequest = Schema.Struct({ name: Schema.String })
export const UpdateTicketPanelRequest = Schema.Struct({
  open_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  sleep_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  closed_category: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status_change_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ticket_button_click_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ticket_close_log: Schema.optionalKey(Schema.NullOr(Schema.String)),
  embed_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export const CreateTicketButtonRequest = Schema.Struct({
  label: Schema.String,
  style: Schema.Number,
  emoji: Schema.optionalKey(Schema.NullOr(DiscordEmoji)),
})
export const UpdateTicketButtonAppearanceRequest = CreateTicketButtonRequest
export const UpdateTicketButtonSettingsRequest = Schema.Struct({
  questions: Schema.Array(Schema.String),
  mod_role: Schema.Array(Schema.String),
  no_ping_mod_role: Schema.Array(Schema.String),
  private_thread: Schema.Boolean,
  th_min: Schema.Number,
  num_apply: Schema.Number,
  naming: Schema.String,
  account_apply: Schema.Boolean,
  player_info: Schema.Boolean,
  apply_clans: Schema.Array(Schema.String),
  roles_to_add: Schema.Array(Schema.String),
  roles_to_remove: Schema.Array(Schema.String),
  townhall_requirements: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Number)),
  new_message: Schema.NullOr(Schema.String),
})
export const UpdateApproveMessagesRequest = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ name: Schema.String, message: Schema.String })),
})

export const DiscordEmbedFooter = Schema.Struct({
  text: Schema.String,
  icon_url: OptionalString,
})
export const DiscordEmbedMedia = Schema.Struct({ url: Schema.String })
export const DiscordEmbedAuthor = Schema.Struct({
  name: Schema.String,
  url: OptionalString,
  icon_url: OptionalString,
})
export const DiscordEmbedField = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  inline: OptionalBoolean,
})
export const DiscordEmbed = Schema.Struct({
  title: OptionalString,
  description: OptionalString,
  url: OptionalString,
  timestamp: OptionalString,
  color: OptionalNumber,
  footer: Schema.optionalKey(DiscordEmbedFooter),
  image: Schema.optionalKey(DiscordEmbedMedia),
  thumbnail: Schema.optionalKey(DiscordEmbedMedia),
  author: Schema.optionalKey(DiscordEmbedAuthor),
  fields: Schema.optionalKey(Schema.Array(DiscordEmbedField)),
})
const DiscordWebhookMessage = Schema.StructWithRest(Schema.Struct({
  content: Schema.optionalKey(Schema.NullOr(Schema.String)),
  username: Schema.optionalKey(Schema.String),
  avatar_url: Schema.optionalKey(Schema.String),
  tts: Schema.optionalKey(Schema.Boolean),
  embeds: Schema.optionalKey(Schema.Array(DiscordEmbed)),
  components: Schema.optionalKey(Schema.Array(JsonValue)),
  attachments: Schema.optionalKey(Schema.Array(JsonValue)),
  allowed_mentions: Schema.optionalKey(JsonValue),
  flags: Schema.optionalKey(Schema.Number),
}), [Schema.Record(Schema.String, JsonValue)])
export const DiscordWebhookPayload = Schema.StructWithRest(Schema.Struct({
  content: Schema.optionalKey(Schema.NullOr(Schema.String)),
  username: Schema.optionalKey(Schema.String),
  avatar_url: Schema.optionalKey(Schema.String),
  embeds: Schema.optionalKey(Schema.Array(DiscordEmbed)),
  components: Schema.optionalKey(Schema.Array(JsonValue)),
  messages: Schema.optionalKey(Schema.Array(Schema.StructWithRest(
    Schema.Struct({ data: DiscordWebhookMessage }),
    [Schema.Record(Schema.String, JsonValue)],
  ))),
  application_id: Schema.optionalKey(Schema.String),
}), [Schema.Record(Schema.String, JsonValue)])
export const ServerEmbed = Schema.Struct({ name: Schema.String, data: DiscordWebhookPayload })
export const ServerEmbedsResponse = Schema.Struct({
  items: Schema.Array(ServerEmbed),
  total: Schema.Number,
})
export const UpsertEmbedRequest = Schema.Struct({
  name: Schema.String,
  data: DiscordWebhookPayload,
})

export const ServerPanel = Schema.Struct({
  embed_name: OptionalString,
  buttons: Schema.Array(Schema.String),
  button_color: Schema.String,
  welcome_channel: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export const UpdateServerPanelRequest = Schema.Struct({
  embed_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  buttons: Schema.Array(Schema.String),
  button_color: Schema.String,
  welcome_channel: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

export const Base = Schema.Struct({
  id: Schema.String,
  serverId: Schema.String,
  channelId: Schema.String,
  messageId: Schema.String,
  baseLink: Schema.String,
  images: Schema.Array(Schema.String),
  description: Schema.String,
  downloadCount: Schema.Number,
  upvotes: Schema.Number,
  downvotes: Schema.Number,
  downloaders: Schema.Array(Schema.String),
  createdAt: Schema.String,
  discordMessageUrl: Schema.String,
})
export const BasesResponse = Schema.Struct({
  items: Schema.Array(Base),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
})
export const CreateBaseRequest = Schema.Struct({
  channelId: Schema.String,
  baseLink: Schema.String,
  images: Schema.Array(Schema.String),
  description: Schema.String,
})
export const BaseDownloader = Schema.Struct({
  userId: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
})
export const BaseDeleteResponse = Schema.Struct({
  baseId: Schema.String,
  databaseDeleted: Schema.Literal(true),
  discordMessageCleanup: Schema.Literals(["deleted", "alreadyMissing"]),
})
const BaseFailureCode = Schema.Union([
  ErrorCode,
  Schema.Literals([
    "database_insert_failed",
    "database_delete_failed",
    "discord_unavailable",
    "discord_invalid_response",
    "discord_cleanup_failed",
    "invalid_discord_location",
  ]),
])
export const BaseCreateFailure = Schema.Struct({
  code: BaseFailureCode,
  message: Schema.String,
  requestId: OptionalString,
  databaseInserted: Schema.Literal(false),
  discordMessageCreated: Schema.Boolean,
  discordMessageId: OptionalString,
  discordMessageCleanup: Schema.Literals(["notNeeded", "deleted", "alreadyMissing", "failed"]),
  retryable: Schema.Boolean,
})
export const BaseDeleteFailure = Schema.Struct({
  code: BaseFailureCode,
  message: Schema.String,
  requestId: OptionalString,
  baseId: Schema.String,
  databaseDeleted: Schema.Literal(false),
  discordMessageCleanup: Schema.Literals(["deleted", "alreadyMissing", "failed"]),
  retryable: Schema.Boolean,
})
export const BaseImageUploadResponse = Schema.Struct({
  url: Schema.String,
  filename: Schema.String,
})

export const ServerLinkedAccount = Schema.Struct({
  player_tag: Schema.String,
  player_name: OptionalString,
  town_hall: OptionalNumber,
  is_verified: Schema.Boolean,
  added_at: Schema.String,
})
export const ServerLinkRole = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.Number,
  position: Schema.Number,
})
export const ServerLinkedMember = Schema.Struct({
  user_id: Schema.String,
  username: Schema.String,
  display_name: Schema.String,
  avatar_url: Schema.String,
  linked_accounts: Schema.Array(ServerLinkedAccount),
  account_count: Schema.Number,
})
export const ServerLinksResponse = Schema.Struct({
  members: Schema.Array(ServerLinkedMember),
  roles: Schema.Array(ServerLinkRole),
  total_members: Schema.Number,
  filtered_members: Schema.Number,
  members_with_links: Schema.Number,
  total_linked_accounts: Schema.Number,
  verified_accounts: Schema.Number,
})

export const ServerSettings = Schema.Struct({
  server_id: Schema.String,
  server: Schema.String,
  name: Schema.String,
  require_api_token_when_linking: Schema.Boolean,
  embed_color: OptionalString,
  nickname_rule: OptionalString,
  non_family_nickname_rule: OptionalString,
  change_nickname: OptionalBoolean,
  flair_non_family: OptionalBoolean,
  auto_eval_nickname: OptionalBoolean,
  autoeval_triggers: Schema.optionalKey(Schema.Array(Schema.String)),
  autoeval_log: OptionalString,
  autoeval: OptionalBoolean,
  full_whitelist_role: OptionalString,
  autoboard_limit: OptionalNumber,
  tied: OptionalBoolean,
  family_label: OptionalString,
  link_parse: Schema.optionalKey(LinkParseSettings),
  countdowns: Schema.Record(Schema.String, Schema.String),
  server_roles: Schema.Array(ServerRole),
  clans: Schema.optionalKey(Schema.Array(ClanSettingsDetail)),
})

const ServerRolePath = Schema.Struct({ serverId: Schema.String, roleId: Schema.String })
const ServerReminderPath = Schema.Struct({ serverId: Schema.String, reminderId: Schema.String })
const ServerGiveawayPath = Schema.Struct({ serverId: Schema.String, giveawayId: Schema.String })
const ServerTicketPanelPath = Schema.Struct({ serverId: Schema.String, panelName: Schema.String })
const ServerTicketButtonPath = Schema.Struct({
  serverId: Schema.String,
  panelName: Schema.String,
  customId: Schema.String,
})
const ServerEmbedPath = Schema.Struct({ serverId: Schema.String, embedName: Schema.String })
const ServerBasePath = Schema.Struct({ serverId: Schema.String, baseId: Schema.String })
const ServerBaseDownloaderPath = Schema.Struct({
  serverId: Schema.String,
  baseId: Schema.String,
  userId: Schema.String,
})
const ServerCategoryPath = Schema.Struct({ serverId: Schema.String, categoryId: Schema.String })

export const DashboardCapabilitiesEndpoint = defineEndpoint({
  auth: "user-or-bot", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "dashboardCapabilities",
  path: "/v2/server/:serverId/dashboard-capabilities", pathParams: DashboardServerPath,
  query: NoQuery, response: DashboardCapabilities, responseMode: "json", successStatus: 200,
  summary: "Get effective Dashboard section capabilities",
})
export const DashboardAccessEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "dashboardAccess",
  path: "/v2/server/:serverId/dashboard-access", pathParams: DashboardServerPath,
  query: NoQuery, response: DashboardAccessConfig, responseMode: "json", successStatus: 200,
  summary: "Get assignable roles and Dashboard access grants",
})
export const UpdateDashboardAccessEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [],
  body: DashboardAccessUpdate, bodyMode: "json", method: "PUT",
  operationId: "updateDashboardAccess", path: "/v2/server/:serverId/dashboard-access",
  pathParams: DashboardServerPath, query: NoQuery, response: DashboardAccessConfig,
  responseMode: "json", successStatus: 200, summary: "Replace Dashboard access grants",
})
export const BotGuildProfileEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "botGuildProfile",
  path: "/v2/server/:serverId/bot-profile", pathParams: DashboardServerPath,
  query: NoQuery, response: BotGuildProfile, responseMode: "json", successStatus: 200,
  summary: "Get the bot's per-server profile",
})
export const UpdateBotGuildProfileEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: BotGuildProfileUpdate, bodyMode: "json", method: "PATCH",
  operationId: "updateBotGuildProfile", path: "/v2/server/:serverId/bot-profile",
  pathParams: DashboardServerPath, query: NoQuery, response: BotGuildProfile,
  responseMode: "json", successStatus: 200, summary: "Update the bot's per-server profile",
})
export const GuildsEndpoint = defineEndpoint({
  auth: "user", errors: [], body: NoBody, bodyMode: "none",
  method: "GET", operationId: "dashboardGuilds", path: "/v2/guilds",
  pathParams: NoPathParams, query: NoQuery, response: Schema.Array(GuildInfo),
  responseMode: "json", successStatus: 200, summary: "List Dashboard-accessible Discord guilds",
})
export const GuildEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "dashboardGuild",
  path: "/v2/guild/:guildId", pathParams: DashboardGuildPath, query: NoQuery,
  response: GuildDetails, responseMode: "json", successStatus: 200,
  summary: "Get one Discord guild",
})
export const ReactivateServerEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [],
  body: NoBody, bodyMode: "none", method: "POST", operationId: "reactivateServer",
  path: "/v2/server/:serverId/reactivate", pathParams: DashboardServerPath,
  query: NoQuery, response: MessageResponse, responseMode: "json", successStatus: 200,
  summary: "Re-enable inactive server tracking",
})

export const ServerSettingsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverSettings",
  path: "/v2/server/:serverId/settings", pathParams: DashboardServerPath,
  query: Schema.Struct({ clan_settings: OptionalBoolean }), response: ServerSettings,
  responseMode: "json", successStatus: 200, summary: "Get server settings",
})
export const UpdateServerSettingsEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: ServerSettingsUpdate, bodyMode: "json", method: "PATCH",
  operationId: "updateServerSettings", path: "/v2/server/:serverId/settings",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerSettingsResponse,
  responseMode: "json", successStatus: 200, summary: "Update server settings",
})
export const ClanSettingsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverClanSettings",
  path: "/v2/server/:serverId/clan/:clanTag/settings", pathParams: DashboardServerClanPath,
  query: NoQuery, response: ClanSettingsDetail, responseMode: "json", successStatus: 200,
  summary: "Get one server clan's settings",
})
export const UpdateClanSettingsEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: ClanSettingsUpdate, bodyMode: "json", method: "PATCH",
  operationId: "updateServerClanSettings", path: "/v2/server/:serverId/clan/:clanTag/settings",
  pathParams: DashboardServerClanPath, query: NoQuery, response: ClanSettingsResponse,
  responseMode: "json", successStatus: 200, summary: "Update one server clan's settings",
})
export const ServerClansEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverClans",
  path: "/v2/server/:serverId/clans", pathParams: DashboardServerPath, query: NoQuery,
  response: Schema.Array(ServerClanListItem), responseMode: "json", successStatus: 200,
  summary: "List full server clans",
})
export const ServerClansBasicEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverClansBasic",
  path: "/v2/server/:serverId/clans-basic", pathParams: DashboardServerPath,
  query: NoQuery, response: Schema.Array(ClanReference), responseMode: "json", successStatus: 200,
  summary: "List basic server clan references",
})
export const AddServerClanEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: AddClanRequest, bodyMode: "json", method: "POST", operationId: "addServerClan",
  path: "/v2/server/:serverId/clans", pathParams: DashboardServerPath,
  query: NoQuery, response: AddClanResponse, responseMode: "json", successStatus: 200,
  summary: "Add a clan to a server",
})
export const RemoveServerClanEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody,
  bodyMode: "none", method: "DELETE", operationId: "removeServerClan",
  path: "/v2/server/:serverId/clans/:clanTag", pathParams: DashboardServerClanPath,
  query: NoQuery, response: RemoveClanResponse, responseMode: "json", successStatus: 200,
  summary: "Remove a clan from a server",
})
export const UpdateEmbedColorEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody,
  bodyMode: "none", method: "PUT", operationId: "updateServerEmbedColor",
  path: "/v2/server/:serverId/embed-color/:hexCode",
  pathParams: Schema.Struct({ serverId: Schema.String, hexCode: Schema.String }),
  query: NoQuery, response: EmbedColorResponse, responseMode: "json", successStatus: 200,
  summary: "Set the server embed color",
})

export const ServerBansEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverBans",
  path: "/v2/server/:serverId/bans", pathParams: DashboardServerPath,
  query: Schema.Struct({ user_id: OptionalString }), response: BansResponse,
  responseMode: "json", successStatus: 200, summary: "List server bans",
})
export const AddServerBanEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: BanRequest, bodyMode: "json", method: "POST", operationId: "addServerBan",
  path: "/v2/server/:serverId/bans/:playerTag",
  pathParams: Schema.Struct({ serverId: Schema.String, playerTag: Schema.String }),
  query: Schema.Struct({ user_id: OptionalString }), response: BanMutationResponse,
  responseMode: "json", successStatus: 200, summary: "Add or update a server ban",
})
export const RemoveServerBanEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody,
  bodyMode: "none", method: "DELETE", operationId: "removeServerBan",
  path: "/v2/server/:serverId/bans/:playerTag",
  pathParams: Schema.Struct({ serverId: Schema.String, playerTag: Schema.String }),
  query: Schema.Struct({ user_id: OptionalString }), response: BanMutationResponse,
  responseMode: "json", successStatus: 200, summary: "Remove a server ban",
})
export const SearchBannedPlayersEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "searchBannedPlayers",
  path: "/v2/search/:guildId/banned-players", pathParams: DashboardGuildPath,
  query: Schema.Struct({ query: OptionalString }), response: SearchBannedPlayersResponse,
  responseMode: "json", successStatus: 200, summary: "Search server bans by player name",
})
export const ServerStrikesEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverStrikes",
  path: "/v2/server/:serverId/strikes", pathParams: DashboardServerPath,
  query: Schema.Struct({ player_tag: OptionalString, view_expired: OptionalBoolean }),
  response: StrikesResponse, responseMode: "json", successStatus: 200,
  summary: "List server strikes",
})
export const AddServerStrikeEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: StrikeRequest, bodyMode: "json", method: "POST", operationId: "addServerStrike",
  path: "/v2/server/:serverId/strikes/:playerTag",
  pathParams: Schema.Struct({ serverId: Schema.String, playerTag: Schema.String }),
  query: NoQuery, response: StrikeMutationResponse, responseMode: "json", successStatus: 200,
  summary: "Add a server strike",
})
export const RemoveServerStrikeEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody,
  bodyMode: "none", method: "DELETE", operationId: "removeServerStrike",
  path: "/v2/server/:serverId/strikes/:strikeId",
  pathParams: Schema.Struct({ serverId: Schema.String, strikeId: Schema.String }),
  query: NoQuery, response: StrikeMutationResponse, responseMode: "json", successStatus: 200,
  summary: "Remove a server strike",
})
export const PlayerStrikeSummaryEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "playerStrikeSummary",
  path: "/v2/server/:serverId/strikes/player/:playerTag/summary",
  pathParams: Schema.Struct({ serverId: Schema.String, playerTag: Schema.String }),
  query: NoQuery, response: StrikeSummary, responseMode: "json", successStatus: 200,
  summary: "Get a player's active strike summary",
})

export const DiscordRolesEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "discordRoles",
  path: "/v2/server/:serverId/discord-roles", pathParams: DashboardServerPath,
  query: NoQuery, response: DiscordRolesResponse, responseMode: "json", successStatus: 200,
  summary: "List assignable Discord roles",
})
export const RoleSettingsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "roleSettings",
  path: "/v2/server/:serverId/role-settings", pathParams: DashboardServerPath,
  query: NoQuery, response: RoleSettings, responseMode: "json", successStatus: 200,
  summary: "Get server role automation settings",
})
export const UpdateRoleSettingsEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: RoleSettingsUpdate, bodyMode: "json", method: "PATCH",
  operationId: "updateRoleSettings", path: "/v2/server/:serverId/role-settings",
  pathParams: DashboardServerPath, query: NoQuery, response: RoleSettingsMutationResponse,
  responseMode: "json", successStatus: 200, summary: "Update server role automation settings",
})
export const ServerRolesEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody,
  bodyMode: "none", method: "GET", operationId: "serverRoles",
  path: "/v2/server/:serverId/server-roles", pathParams: DashboardServerPath,
  query: Schema.Struct({ type: Schema.optionalKey(ServerRoleType), clan_tag: OptionalString }),
  response: ServerRolesResponse, responseMode: "json", successStatus: 200,
  summary: "List configured server roles",
})
export const CreateServerRoleEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: ServerRoleCreate, bodyMode: "json", method: "POST", operationId: "createServerRole",
  path: "/v2/server/:serverId/server-roles", pathParams: DashboardServerPath,
  query: NoQuery, response: ServerRoleResponse, responseMode: "json", successStatus: 201,
  summary: "Create a server role rule",
})
export const UpdateServerRoleEndpoint = defineEndpoint({
  auth: "server-write", errors: [],
  body: ServerRoleUpdate, bodyMode: "json", method: "PATCH", operationId: "updateServerRole",
  path: "/v2/server/:serverId/server-roles/:roleId", pathParams: ServerRolePath,
  query: NoQuery, response: ServerRoleResponse, responseMode: "json", successStatus: 200,
  summary: "Update a server role rule",
})
export const DeleteServerRoleEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody,
  bodyMode: "none", method: "DELETE", operationId: "deleteServerRole",
  path: "/v2/server/:serverId/server-roles/:roleId", pathParams: ServerRolePath,
  query: NoQuery, response: ServerRoleResponse, responseMode: "json", successStatus: 200,
  summary: "Delete a server role rule",
})

export const ServerLogsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverLogs", path: "/v2/server/:serverId/logs",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerLogsResponse,
  responseMode: "json", successStatus: 200, summary: "List server log destinations",
})
export const SaveServerLogsEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateServerLogsRequest, bodyMode: "json",
  method: "PUT", operationId: "saveServerLogs", path: "/v2/server/:serverId/logs",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerLogsOperationResponse,
  responseMode: "json", successStatus: 200, summary: "Assign server log destinations",
})
export const UpdateServerLogsStateEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateServerLogsDisabledRequest, bodyMode: "json",
  method: "PATCH", operationId: "updateServerLogsState", path: "/v2/server/:serverId/logs",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerLogsOperationResponse,
  responseMode: "json", successStatus: 200, summary: "Enable or disable server logs",
})
export const DeleteServerLogsEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteServerLogs", path: "/v2/server/:serverId/logs",
  pathParams: DashboardServerPath, query: ServerLogsDeleteQuery,
  response: ServerLogsOperationResponse, responseMode: "json", successStatus: 200,
  summary: "Delete server log destinations",
})

export const ServerCountdownsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverCountdowns", path: "/v2/server/:serverId/countdowns",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerCountdownsResponse,
  responseMode: "json", successStatus: 200, summary: "List server countdowns",
})
export const ClanCountdownsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "clanCountdowns", path: "/v2/server/:serverId/clan/:clanTag/countdowns",
  pathParams: DashboardServerClanPath, query: NoQuery, response: ClanCountdownsResponse,
  responseMode: "json", successStatus: 200, summary: "List clan countdowns",
})
export const EnableCountdownEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: CountdownMutationRequest, bodyMode: "json",
  method: "POST", operationId: "enableCountdown", path: "/v2/server/:serverId/countdowns",
  pathParams: DashboardServerPath, query: NoQuery, response: EnableCountdownResponse,
  responseMode: "json", successStatus: 200, summary: "Enable a server or clan countdown",
})
export const DisableCountdownEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: CountdownMutationRequest, bodyMode: "json",
  method: "DELETE", operationId: "disableCountdown", path: "/v2/server/:serverId/countdowns",
  pathParams: DashboardServerPath, query: NoQuery, response: DisableCountdownResponse,
  responseMode: "json", successStatus: 200, summary: "Disable a server or clan countdown",
})

export const ServerChannelsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverChannels", path: "/v2/server/:serverId/channels",
  pathParams: DashboardServerPath, query: NoQuery, response: Schema.Array(DiscordChannel),
  responseMode: "json", successStatus: 200, summary: "List Discord channels",
})
export const ServerThreadsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverThreads", path: "/v2/server/:serverId/threads",
  pathParams: DashboardServerPath, query: NoQuery, response: Schema.Array(DiscordThread),
  responseMode: "json", successStatus: 200, summary: "List active Discord threads",
})

export const ServerRemindersEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverReminders", path: "/v2/server/:serverId/reminders",
  pathParams: DashboardServerPath, query: NoQuery, response: RemindersResponse,
  responseMode: "json", successStatus: 200, summary: "List server reminders",
})
export const CreateServerReminderEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: CreateReminderRequest, bodyMode: "json",
  method: "POST", operationId: "createServerReminder", path: "/v2/server/:serverId/reminders",
  pathParams: DashboardServerPath, query: NoQuery, response: ReminderOperationResponse,
  responseMode: "json", successStatus: 200, summary: "Create a server reminder",
})
export const UpdateServerReminderEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateReminderRequest, bodyMode: "json",
  method: "PUT", operationId: "updateServerReminder",
  path: "/v2/server/:serverId/reminders/:reminderId", pathParams: ServerReminderPath,
  query: NoQuery, response: ReminderOperationResponse, responseMode: "json", successStatus: 200,
  summary: "Update a server reminder",
})
export const DeleteServerReminderEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteServerReminder", path: "/v2/server/:serverId/reminders/:reminderId",
  pathParams: ServerReminderPath, query: NoQuery, response: ReminderOperationResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server reminder",
})

export const ServerGiveawaysEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverGiveaways", path: "/v2/server/:serverId/giveaways",
  pathParams: DashboardServerPath, query: NoQuery, response: GiveawaysResponse,
  responseMode: "json", successStatus: 200, summary: "List server giveaways",
})
export const CreateServerGiveawayEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: Schema.FormData, bodyMode: "multipart",
  method: "POST", operationId: "createServerGiveaway", path: "/v2/server/:serverId/giveaways",
  pathParams: DashboardServerPath, query: NoQuery, response: GiveawayMutationResponse,
  responseMode: "json", successStatus: 200, summary: "Create a server giveaway",
})
export const UpdateServerGiveawayEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: Schema.FormData, bodyMode: "multipart",
  method: "PUT", operationId: "updateServerGiveaway",
  path: "/v2/server/:serverId/giveaways/:giveawayId", pathParams: ServerGiveawayPath,
  query: NoQuery, response: GiveawayMutationResponse, responseMode: "json", successStatus: 200,
  summary: "Update a server giveaway",
})
export const DeleteServerGiveawayEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteServerGiveaway", path: "/v2/server/:serverId/giveaways/:giveawayId",
  pathParams: ServerGiveawayPath, query: NoQuery, response: GiveawayMutationResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server giveaway",
})
export const GiveawayEntriesEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "giveawayEntries",
  path: "/v2/server/:serverId/giveaways/:giveawayId/entries", pathParams: ServerGiveawayPath,
  query: NoQuery, response: GiveawayEntriesResponse, responseMode: "json", successStatus: 200,
  summary: "List giveaway entrants",
})
export const RerollGiveawayEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: GiveawayRerollRequest, bodyMode: "json",
  method: "POST", operationId: "rerollGiveaway",
  path: "/v2/server/:serverId/giveaways/:giveawayId/reroll", pathParams: ServerGiveawayPath,
  query: NoQuery, response: GiveawayRerollResponse, responseMode: "json", successStatus: 200,
  summary: "Reroll selected giveaway winners",
})

export const TicketPanelsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "ticketPanels", path: "/v2/server/:serverId/tickets",
  pathParams: DashboardServerPath, query: NoQuery, response: TicketPanelsResponse,
  responseMode: "json", successStatus: 200, summary: "List server ticket panels",
})
export const CreateTicketPanelEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: CreateTicketPanelRequest, bodyMode: "json",
  method: "POST", operationId: "createTicketPanel", path: "/v2/server/:serverId/tickets",
  pathParams: DashboardServerPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Create a server ticket panel",
})
export const DeleteTicketPanelEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteTicketPanel", path: "/v2/server/:serverId/tickets/:panelName",
  pathParams: ServerTicketPanelPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server ticket panel",
})
export const CreateTicketButtonEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: CreateTicketButtonRequest, bodyMode: "json",
  method: "POST", operationId: "createTicketButton",
  path: "/v2/server/:serverId/tickets/:panelName/buttons", pathParams: ServerTicketPanelPath,
  query: NoQuery, response: MessageResponse, responseMode: "json", successStatus: 200,
  summary: "Create a ticket panel button",
})
export const DeleteTicketButtonEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteTicketButton",
  path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId",
  pathParams: ServerTicketButtonPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a ticket panel button",
})
export const UpdateTicketButtonAppearanceEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateTicketButtonAppearanceRequest,
  bodyMode: "json", method: "PATCH", operationId: "updateTicketButtonAppearance",
  path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId",
  pathParams: ServerTicketButtonPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Update ticket button appearance",
})
export const UpdateTicketPanelEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateTicketPanelRequest, bodyMode: "json",
  method: "PUT", operationId: "updateTicketPanel",
  path: "/v2/server/:serverId/tickets/:panelName", pathParams: ServerTicketPanelPath,
  query: NoQuery, response: MessageResponse, responseMode: "json", successStatus: 200,
  summary: "Update a server ticket panel",
})
export const UpdateTicketButtonSettingsEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateTicketButtonSettingsRequest,
  bodyMode: "json", method: "PUT", operationId: "updateTicketButtonSettings",
  path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId",
  pathParams: ServerTicketButtonPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Update ticket button settings",
})
export const UpdateTicketApproveMessagesEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateApproveMessagesRequest,
  bodyMode: "json", method: "PUT", operationId: "updateTicketApproveMessages",
  path: "/v2/server/:serverId/tickets/:panelName/approve-messages",
  pathParams: ServerTicketPanelPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Update ticket approval messages",
})

export const ServerEmbedsEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverEmbeds", path: "/v2/server/:serverId/embeds",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerEmbedsResponse,
  responseMode: "json", successStatus: 200, summary: "List server embeds",
})
export const CreateServerEmbedEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpsertEmbedRequest, bodyMode: "json",
  method: "POST", operationId: "createServerEmbed", path: "/v2/server/:serverId/embeds",
  pathParams: DashboardServerPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Create a server embed",
})
export const UpdateServerEmbedEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpsertEmbedRequest, bodyMode: "json",
  method: "PUT", operationId: "updateServerEmbed",
  path: "/v2/server/:serverId/embeds/:embedName", pathParams: ServerEmbedPath,
  query: NoQuery, response: MessageResponse, responseMode: "json", successStatus: 200,
  summary: "Update a server embed",
})
export const DeleteServerEmbedEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteServerEmbed", path: "/v2/server/:serverId/embeds/:embedName",
  pathParams: ServerEmbedPath, query: NoQuery, response: MessageResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server embed",
})

export const ServerPanelEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverPanel", path: "/v2/server/:serverId/panel",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerPanel,
  responseMode: "json", successStatus: 200, summary: "Get the server welcome panel",
})
export const UpdateServerPanelEndpoint = defineEndpoint({
  auth: "server-write", errors: [], body: UpdateServerPanelRequest, bodyMode: "json",
  method: "PUT", operationId: "updateServerPanel", path: "/v2/server/:serverId/panel",
  pathParams: DashboardServerPath, query: NoQuery, response: ServerPanel,
  responseMode: "json", successStatus: 200, summary: "Update the server welcome panel",
})

export const BasesEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "dashboardBases", path: "/v2/server/:serverId/bases",
  pathParams: DashboardServerPath,
  query: Schema.Struct({ limit: OptionalNumber, offset: OptionalNumber }), response: BasesResponse,
  responseMode: "json", successStatus: 200, summary: "List server bases",
})
export const BaseEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "dashboardBase", path: "/v2/server/:serverId/bases/:baseId",
  pathParams: ServerBasePath, query: NoQuery, response: Base, responseMode: "json",
  successStatus: 200, summary: "Get one server base",
})
export const CreateBaseEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [{ status: 409, body: BaseCreateFailure }, { status: 500, body: Schema.Union([BaseCreateFailure, ErrorResponse]) }, { status: 502, body: Schema.Union([BaseCreateFailure, ErrorResponse]) }, { status: 503, body: Schema.Union([BaseCreateFailure, ErrorResponse]) }],
  body: CreateBaseRequest, bodyMode: "json",
  method: "POST", operationId: "createDashboardBase", path: "/v2/server/:serverId/bases",
  pathParams: DashboardServerPath, query: NoQuery, response: Base, responseMode: "json",
  successStatus: 201, summary: "Create a server base",
})
export const DeleteBaseEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [{ status: 409, body: BaseDeleteFailure }, { status: 500, body: Schema.Union([BaseDeleteFailure, ErrorResponse]) }, { status: 502, body: Schema.Union([BaseDeleteFailure, ErrorResponse]) }, { status: 503, body: Schema.Union([BaseDeleteFailure, ErrorResponse]) }],
  body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteDashboardBase", path: "/v2/server/:serverId/bases/:baseId",
  pathParams: ServerBasePath, query: NoQuery, response: BaseDeleteResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server base",
})
export const UploadBaseImageEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [], body: Schema.FormData, bodyMode: "multipart",
  method: "POST", operationId: "uploadDashboardBaseImage",
  path: "/v2/server/:serverId/bases/images", pathParams: DashboardServerPath,
  query: NoQuery, response: BaseImageUploadResponse, responseMode: "json", successStatus: 200,
  summary: "Upload a server base image",
})
export const BaseDownloaderEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "baseDownloader",
  path: "/v2/server/:serverId/bases/:baseId/downloaders/:userId",
  pathParams: ServerBaseDownloaderPath, query: NoQuery, response: BaseDownloader,
  responseMode: "json", successStatus: 200, summary: "Get a base downloader's Discord profile",
})

export const ClanCategoriesEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "clanCategories", path: "/v2/server/:serverId/clan-categories",
  pathParams: DashboardServerPath, query: NoQuery, response: ClanCategoriesResponse,
  responseMode: "json", successStatus: 200, summary: "List server clan categories",
})
export const CreateClanCategoryEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [], body: Schema.Struct({ name: Schema.String }),
  bodyMode: "json", method: "POST", operationId: "createClanCategory",
  path: "/v2/server/:serverId/clan-categories", pathParams: DashboardServerPath,
  query: NoQuery, response: ClanCategoryMutationResponse, responseMode: "json", successStatus: 201,
  summary: "Create a server clan category",
})
export const RenameClanCategoryEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [], body: Schema.Struct({ name: Schema.String }),
  bodyMode: "json", method: "PATCH", operationId: "renameClanCategory",
  path: "/v2/server/:serverId/clan-categories/:categoryId", pathParams: ServerCategoryPath,
  query: NoQuery, response: ClanCategoryMutationResponse, responseMode: "json", successStatus: 200,
  summary: "Rename a server clan category",
})
export const ReorderClanCategoriesEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [],
  body: Schema.Struct({ categoryIds: Schema.Array(Schema.String) }), bodyMode: "json",
  method: "PUT", operationId: "reorderClanCategories",
  path: "/v2/server/:serverId/clan-categories/order", pathParams: DashboardServerPath,
  query: NoQuery, response: ClanCategoriesResponse, responseMode: "json", successStatus: 200,
  summary: "Replace the server clan category order",
})
export const PreviewClanCategoryDeleteEndpoint = defineEndpoint({
  auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "previewClanCategoryDelete",
  path: "/v2/server/:serverId/clan-categories/:categoryId/delete-preview",
  pathParams: ServerCategoryPath, query: NoQuery, response: ClanCategoryDeletePreview,
  responseMode: "json", successStatus: 200, summary: "Preview deleting a clan category",
})
export const DeleteClanCategoryEndpoint = defineEndpoint({
  auth: "server-manager-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
  operationId: "deleteClanCategory", path: "/v2/server/:serverId/clan-categories/:categoryId",
  pathParams: ServerCategoryPath, query: NoQuery, response: ClanCategoryDeleteResponse,
  responseMode: "json", successStatus: 200, summary: "Delete a server clan category",
})

export const ServerLinksEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverLinks", path: "/v2/links/server/:serverId",
  pathParams: DashboardServerPath,
  query: Schema.Struct({
    limit: OptionalNumber,
    offset: OptionalNumber,
    query: OptionalString,
    account_filter: Schema.optionalKey(Schema.Literal("none")),
  }),
  response: ServerLinksResponse, responseMode: "json", successStatus: 200,
  summary: "List linked accounts for Discord server members",
})
