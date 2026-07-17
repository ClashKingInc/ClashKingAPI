package modelsv2

type ClanReference struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type ServerSettingsEval struct {
	LeagueRoles         []RoleBinding `json:"league_roles"`
	IgnoredRoles        []RoleBinding `json:"ignored_roles"`
	FamilyRoles         []RoleBinding `json:"family_roles"`
	NotFamilyRoles      []RoleBinding `json:"not_family_roles"`
	OnlyFamilyRoles     []RoleBinding `json:"only_family_roles"`
	FamilyPositionRoles []RoleBinding `json:"family_position_roles"`
	TownhallRoles       []RoleBinding `json:"townhall_roles"`
	BuilderhallRoles    []RoleBinding `json:"builderhall_roles"`
	AchievementRoles    []RoleBinding `json:"achievement_roles"`
	StatusRoles         []RoleBinding `json:"status_roles"`
	BuilderLeagueRoles  []RoleBinding `json:"builder_league_roles"`
}

type ServerSettingsDocument struct {
	ServerID          string                  `json:"server_id"`
	Server            int                     `json:"server"`
	Name              string                  `json:"name"`
	EmbedColor        *string                 `json:"embed_color,omitempty"`
	NicknameRule      *string                 `json:"nickname_rule,omitempty"`
	NonFamilyNickname *string                 `json:"non_family_nickname_rule,omitempty"`
	ChangeNickname    *bool                   `json:"change_nickname,omitempty"`
	FlairNonFamily    *bool                   `json:"flair_non_family,omitempty"`
	AutoEvalNickname  *bool                   `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers  []string                `json:"autoeval_triggers,omitempty"`
	AutoevalLog       *string                 `json:"autoeval_log,omitempty"`
	Autoeval          *bool                   `json:"autoeval,omitempty"`
	BlacklistedRoles  []string                `json:"blacklisted_roles,omitempty"`
	RoleTreatment     []string                `json:"role_treatment,omitempty"`
	FullWhitelistRole *string                 `json:"full_whitelist_role,omitempty"`
	LeadershipEval    *bool                   `json:"leadership_eval,omitempty"`
	AutoboardLimit    *int                    `json:"autoboard_limit,omitempty"`
	APIToken          *bool                   `json:"api_token,omitempty"`
	Tied              *bool                   `json:"tied,omitempty"`
	Banlist           *string                 `json:"banlist,omitempty"`
	StrikeLog         *string                 `json:"strike_log,omitempty"`
	RedditFeed        *string                 `json:"reddit_feed,omitempty"`
	FamilyLabel       *string                 `json:"family_label,omitempty"`
	Greeting          *string                 `json:"greeting,omitempty"`
	LinkParse         *LinkParseSettings      `json:"link_parse,omitempty"`
	LogsConfig        ServerLogsResponse      `json:"logs_config"`
	Logs              ServerLogsResponse      `json:"logs"`
	StatusRoles       StatusRolesDocument     `json:"status_roles"`
	Countdowns        ServerCountdownDocument `json:"countdowns"`
	Eval              ServerSettingsEval      `json:"eval"`
	Clans             []ClanSettingsDetail    `json:"clans,omitempty"`
}

type ServerCountdownDocument struct {
	CWL         *string `json:"cwlCountdown,omitempty"`
	ClanGames   *string `json:"gamesCountdown,omitempty"`
	RaidWeekend *string `json:"raidCountdown,omitempty"`
	EndOfSeason *string `json:"eosCountdown,omitempty"`
	MemberCount *string `json:"memberCountWarning,omitempty"`
	SeasonDay   *string `json:"seasonCountdown,omitempty"`
}

type StatusRolesDocument struct {
	Discord []RoleBinding `json:"discord"`
}

type RoleBinding struct {
	ID     *string `json:"id,omitempty"`
	Role   string  `json:"role"`
	Type   *string `json:"type,omitempty"`
	Number *int    `json:"number,omitempty"`
	Key    *string `json:"key,omitempty"`
}

type ServerLogsResponse struct {
	JoinLeaveLog         *LogConfig `json:"join_leave_log,omitempty"`
	DonationLog          *LogConfig `json:"donation_log,omitempty"`
	ClanAchievementLog   *LogConfig `json:"clan_achievement_log,omitempty"`
	ClanRequirementsLog  *LogConfig `json:"clan_requirements_log,omitempty"`
	ClanDescriptionLog   *LogConfig `json:"clan_description_log,omitempty"`
	WarLog               *LogConfig `json:"war_log,omitempty"`
	WarPanel             *LogConfig `json:"war_panel,omitempty"`
	CWLLineupChangeLog   *LogConfig `json:"cwl_lineup_change_log,omitempty"`
	CapitalDonationLog   *LogConfig `json:"capital_donation_log,omitempty"`
	CapitalRaidLog       *LogConfig `json:"capital_raid_log,omitempty"`
	RaidPanel            *LogConfig `json:"raid_panel,omitempty"`
	CapitalWeeklySummary *LogConfig `json:"capital_weekly_summary,omitempty"`
	PlayerUpgradeLog     *LogConfig `json:"player_upgrade_log,omitempty"`
	LegendLog            *LogConfig `json:"legend_log,omitempty"`
}

type ServerLogOperationResponse struct {
	Message  string  `json:"message"`
	ServerID int     `json:"server_id"`
	LogType  *string `json:"log_type,omitempty"`
}

type ServerPanelResponse struct {
	EmbedName      *string  `json:"embed_name,omitempty"`
	Buttons        []string `json:"buttons"`
	ButtonColor    string   `json:"button_color"`
	WelcomeChannel *int64   `json:"welcome_channel,omitempty"`
}

type DiscordChannel struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	ParentID   *string `json:"parent_id,omitempty"`
	ParentName *string `json:"parent_name,omitempty"`
}

type DiscordThread struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	ParentChannelID   string `json:"parent_channel_id"`
	ParentChannelName string `json:"parent_channel_name"`
	Archived          bool   `json:"archived"`
}

type DiscordStatusResponse struct {
	Status          string  `json:"status"`
	Message         string  `json:"message"`
	BotTokenPresent bool    `json:"bot_token_present"`
	GuildName       *string `json:"guild_name,omitempty"`
	StatusCode      *string `json:"status_code,omitempty"`
}

type BanEditPrevious struct {
	Reason string `json:"reason"`
}

type BanEdit struct {
	User     string          `json:"user"`
	Previous BanEditPrevious `json:"previous"`
}

type BanItem struct {
	VillageTag       string    `json:"VillageTag"`
	VillageName      string    `json:"VillageName"`
	DateCreated      string    `json:"DateCreated"`
	Notes            string    `json:"Notes"`
	Server           int       `json:"server"`
	AddedBy          string    `json:"added_by"`
	AddedByUsername  *string   `json:"added_by_username,omitempty"`
	AddedByAvatarURL *string   `json:"added_by_avatar_url,omitempty"`
	EditedBy         []BanEdit `json:"edited_by"`
	Image            *string   `json:"image,omitempty"`
	Name             *string   `json:"name,omitempty"`
	TownHall         *int      `json:"town_hall,omitempty"`
	ClanTag          *string   `json:"clan_tag,omitempty"`
	ClanName         *string   `json:"clan_name,omitempty"`
	CurrentRole      *string   `json:"current_role,omitempty"`
	Trophies         *int      `json:"trophies,omitempty"`
}

type BanListResponse struct {
	Items []BanItem `json:"items"`
	Count int       `json:"count"`
}

type BanMutationResponse struct {
	Status     string  `json:"status"`
	PlayerTag  string  `json:"player_tag"`
	PlayerName *string `json:"player_name,omitempty"`
	ServerID   int     `json:"server_id"`
}

type StrikeItem struct {
	StrikeID         string  `json:"strike_id"`
	Tag              string  `json:"tag"`
	Server           int     `json:"server"`
	Reason           string  `json:"reason"`
	AddedBy          string  `json:"added_by"`
	AddedByUsername  *string `json:"added_by_username,omitempty"`
	AddedByAvatarURL *string `json:"added_by_avatar_url,omitempty"`
	StrikeWeight     int     `json:"strike_weight"`
	Image            *string `json:"image,omitempty"`
	DateCreated      string  `json:"date_created"`
	RolloverDate     *int64  `json:"rollover_date,omitempty"`
	PlayerName       *string `json:"player_name,omitempty"`
	TownHall         *int    `json:"town_hall,omitempty"`
	ClanTag          *string `json:"clan_tag,omitempty"`
	ClanName         *string `json:"clan_name,omitempty"`
	CurrentRole      *string `json:"current_role,omitempty"`
	Trophies         *int    `json:"trophies,omitempty"`
}

type StrikeListResponse struct {
	Items []StrikeItem `json:"items"`
	Count int          `json:"count"`
}

type StrikeMutationResponse struct {
	Status       string  `json:"status"`
	StrikeID     string  `json:"strike_id"`
	PlayerTag    string  `json:"player_tag"`
	PlayerName   *string `json:"player_name,omitempty"`
	ServerID     int     `json:"server_id"`
	TotalStrikes *int    `json:"total_strikes,omitempty"`
	TotalWeight  *int    `json:"total_weight,omitempty"`
}

type ServerLinkedAccount struct {
	PlayerTag  string  `json:"player_tag"`
	PlayerName *string `json:"player_name,omitempty"`
	TownHall   *int    `json:"town_hall,omitempty"`
	IsVerified bool    `json:"is_verified"`
	AddedAt    string  `json:"added_at"`
}

type ServerLinkRole struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Color    int    `json:"color"`
	Position int    `json:"position"`
}

type ServerLinkedMember struct {
	UserID         string                `json:"user_id"`
	Username       string                `json:"username"`
	DisplayName    string                `json:"display_name"`
	AvatarURL      string                `json:"avatar_url"`
	LinkedAccounts []ServerLinkedAccount `json:"linked_accounts"`
	AccountCount   int                   `json:"account_count"`
}

type ServerLinksResponse struct {
	Members             []ServerLinkedMember `json:"members"`
	Roles               []ServerLinkRole     `json:"roles"`
	TotalMembers        int                  `json:"total_members"`
	FilteredMembers     int                  `json:"filtered_members"`
	MembersWithLinks    int                  `json:"members_with_links"`
	TotalLinkedAccounts int                  `json:"total_linked_accounts"`
	VerifiedAccounts    int                  `json:"verified_accounts"`
}

type ServerLinkCreateRequest struct {
	PlayerTag string `json:"playerTag"`
	UserID    string `json:"userID"`
}

type ServerLinkMutationResponse struct {
	Message   string `json:"message"`
	PlayerTag string `json:"player_tag"`
	UserID    string `json:"user_id"`
}

type ServerBulkUnlinkResponse struct {
	Message      string `json:"message"`
	DeletedCount int64  `json:"deleted_count"`
}
