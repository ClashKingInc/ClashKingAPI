package modelsv2

type ClanReference struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type ServerSettingsDocument struct {
	ServerID          string               `json:"server_id"`
	Server            int                  `json:"server"`
	Name              string               `json:"name"`
	EmbedColor        *string              `json:"embed_color,omitempty"`
	NicknameRule      *string              `json:"nickname_rule,omitempty"`
	NonFamilyNickname *string              `json:"non_family_nickname_rule,omitempty"`
	ChangeNickname    *bool                `json:"change_nickname,omitempty"`
	FlairNonFamily    *bool                `json:"flair_non_family,omitempty"`
	AutoEvalNickname  *bool                `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers  []string             `json:"autoeval_triggers,omitempty"`
	AutoevalLog       *string              `json:"autoeval_log,omitempty"`
	Autoeval          *bool                `json:"autoeval,omitempty"`
	BlacklistedRoles  []string             `json:"blacklisted_roles,omitempty"`
	FullWhitelistRole *string              `json:"full_whitelist_role,omitempty"`
	AutoboardLimit    *int                 `json:"autoboard_limit,omitempty"`
	APIToken          *bool                `json:"api_token,omitempty"`
	Tied              *bool                `json:"tied,omitempty"`
	Banlist           *string              `json:"banlist,omitempty"`
	StrikeLog         *string              `json:"strike_log,omitempty"`
	RedditFeed        *string              `json:"reddit_feed,omitempty"`
	FamilyLabel       *string              `json:"family_label,omitempty"`
	Greeting          *string              `json:"greeting,omitempty"`
	LinkParse         *LinkParseSettings   `json:"link_parse,omitempty"`
	Countdowns        map[string]string    `json:"countdowns"`
	ServerRoles       []ServerRole         `json:"server_roles"`
	Clans             []ClanSettingsDetail `json:"clans,omitempty"`
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
