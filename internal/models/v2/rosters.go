package modelsv2

type RosterMember struct {
	Name             string         `json:"name"`
	Tag              string         `json:"tag"`
	Townhall         int            `json:"townhall"`
	Trophies         *int           `json:"trophies,omitempty"`
	CurrentClan      *string        `json:"current_clan,omitempty"`
	CurrentClanTag   *string        `json:"current_clan_tag,omitempty"`
	LeagueID         *int           `json:"league_id,omitempty"`
	LeagueName       *string        `json:"league_name,omitempty"`
	HeroLevelSum     int            `json:"hero_level_sum,omitempty"`
	MaxPercent       *float64       `json:"max_percent,omitempty"`
	WarPreference    *bool          `json:"war_pref,omitempty"`
	Discord          *string        `json:"discord,omitempty"`
	DiscordUsername  *string        `json:"discord_username,omitempty"`
	DiscordAvatarURL *string        `json:"discord_avatar_url,omitempty"`
	LastOnline       *string        `json:"last_online,omitempty"`
	RefreshedAt      *string        `json:"refreshed_at,omitempty"`
	Answers          map[string]any `json:"answers,omitempty"`
}

type Roster struct {
	ID                   string           `json:"id" format:"uuid"`
	ServerID             string           `json:"server_id"`
	Alias                string           `json:"alias"`
	Description          *string          `json:"description,omitempty"`
	RosterType           string           `json:"roster_type" enums:"clan,family"`
	SignupScope          string           `json:"signup_scope" enums:"clan-only,family-wide"`
	ClanTag              *string          `json:"clan_tag,omitempty"`
	ClanName             *string          `json:"clan_name,omitempty"`
	ClanBadge            *string          `json:"clan_badge,omitempty"`
	GroupID              *string          `json:"group_id,omitempty"`
	Members              []RosterMember   `json:"members"`
	MinTownhall          *int             `json:"min_th,omitempty"`
	MaxTownhall          *int             `json:"max_th,omitempty"`
	MinSignups           *int             `json:"min_signups,omitempty"`
	MaxAccountsPerUser   *int             `json:"max_accounts_per_user,omitempty"`
	Columns              []string         `json:"columns,omitempty"`
	Sort                 []RosterViewSort `json:"sort,omitempty"`
	WebhookID            *string          `json:"webhook_id,omitempty"`
	MessageID            *string          `json:"message_id,omitempty"`
	Image                *string          `json:"image,omitempty"`
	EventStartTime       *int64           `json:"event_start_time,omitempty"`
	RecurrenceDays       *int             `json:"recurrence_days,omitempty"`
	RecurrenceDayOfMonth *int             `json:"recurrence_day_of_month,omitempty"`
	CreatedAt            string           `json:"created_at"`
	UpdatedAt            string           `json:"updated_at"`
}

type CreateRosterRequest struct {
	Alias       string         `json:"alias"`
	Description *string        `json:"description,omitempty"`
	RosterType  string         `json:"roster_type" enums:"clan,family"`
	SignupScope string         `json:"signup_scope" enums:"clan-only,family-wide"`
	ClanTag     *string        `json:"clan_tag,omitempty"`
	GroupID     *string        `json:"group_id,omitempty"`
	Members     []RosterMember `json:"members,omitempty"`
}

type UpdateRosterRequest struct {
	Alias                *string          `json:"alias,omitempty"`
	Description          *string          `json:"description,omitempty"`
	RosterType           *string          `json:"roster_type,omitempty" enums:"clan,family"`
	SignupScope          *string          `json:"signup_scope,omitempty" enums:"clan-only,family-wide"`
	ClanTag              *string          `json:"clan_tag,omitempty"`
	GroupID              *string          `json:"group_id,omitempty"`
	MinTownhall          *int             `json:"min_th,omitempty"`
	MaxTownhall          *int             `json:"max_th,omitempty"`
	MinSignups           *int             `json:"min_signups,omitempty"`
	MaxAccountsPerUser   *int             `json:"max_accounts_per_user,omitempty"`
	Columns              []string         `json:"columns,omitempty"`
	Sort                 []RosterViewSort `json:"sort,omitempty"`
	WebhookID            *string          `json:"webhook_id,omitempty"`
	MessageID            *string          `json:"message_id,omitempty"`
	EventStartTime       *int64           `json:"event_start_time,omitempty"`
	RecurrenceDays       *int             `json:"recurrence_days,omitempty"`
	RecurrenceDayOfMonth *int             `json:"recurrence_day_of_month,omitempty"`
}

type RosterMutationResponse struct {
	Message  string `json:"message"`
	RosterID string `json:"roster_id,omitempty"`
	Roster   Roster `json:"roster,omitempty"`
}

type RosterResponse struct {
	Roster Roster `json:"roster"`
}

type RosterListResponse struct {
	Rosters []Roster `json:"rosters"`
	Count   int      `json:"count"`
}

type RosterRefreshResponse struct {
	Message          string   `json:"message"`
	RefreshedRosters []Roster `json:"refreshed_rosters"`
}

type RosterCloneRequest struct {
	NewAlias    string  `json:"new_alias"`
	CopyMembers bool    `json:"copy_members"`
	GroupID     *string `json:"group_id,omitempty"`
}

type RosterCloneResponse struct {
	Message        string `json:"message"`
	NewRosterID    string `json:"new_roster_id"`
	NewAlias       string `json:"new_alias"`
	TargetServerID string `json:"target_server_id"`
	SourceServerID string `json:"source_server_id"`
	MembersCopied  int    `json:"members_copied"`
}

type MissingRosterMember struct {
	Tag      string `json:"tag"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Trophies int    `json:"trophies"`
}

type MissingRosterResult struct {
	RosterID       string                `json:"roster_id"`
	RosterAlias    string                `json:"roster_alias"`
	ClanTag        string                `json:"clan_tag"`
	MissingMembers []MissingRosterMember `json:"missing_members"`
	MissingCount   int                   `json:"missing_count"`
}

type MissingRosterMembersResponse struct {
	QueryType           string                `json:"query_type" enums:"roster,group"`
	QueryValue          string                `json:"query_value"`
	ServerID            string                `json:"server_id"`
	Results             []MissingRosterResult `json:"results"`
	TotalRostersChecked int                   `json:"total_rosters_checked"`
}

type RosterGroup struct {
	GroupID            string   `json:"group_id"`
	ServerID           string   `json:"server_id"`
	Name               string   `json:"name"`
	Alias              *string  `json:"alias,omitempty"`
	Description        *string  `json:"description,omitempty"`
	MaxAccountsPerUser *int     `json:"max_accounts_per_user,omitempty"`
	MinSignups         *int     `json:"min_signups,omitempty"`
	Rosters            []Roster `json:"rosters,omitempty"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

type RosterGroupRequest struct {
	Name               *string `json:"name,omitempty"`
	Alias              *string `json:"alias,omitempty"`
	Description        *string `json:"description,omitempty"`
	MaxAccountsPerUser *int    `json:"max_accounts_per_user,omitempty"`
	MinSignups         *int    `json:"min_signups,omitempty"`
}

type RosterGroupMutationResponse struct {
	Message string      `json:"message"`
	GroupID string      `json:"group_id,omitempty"`
	Group   RosterGroup `json:"group,omitempty"`
}

type RosterGroupResponse struct {
	Group RosterGroup `json:"group"`
}

type RosterGroupListResponse struct {
	Items []RosterGroup `json:"items"`
	Count int           `json:"count"`
}

type RosterGroupDeleteResponse struct {
	Message         string `json:"message"`
	AffectedRosters int64  `json:"affected_rosters"`
}

type RosterMembersRequest struct {
	Members    []RosterMember `json:"members,omitempty"`
	Add        []RosterMember `json:"add,omitempty"`
	Operation  string         `json:"operation,omitempty" enums:"add,remove,update"`
	PlayerTags []string       `json:"player_tags,omitempty"`
}

type RosterMemberUpdateRequest struct {
	Answers map[string]any `json:"answers"`
}

type RosterMemberResponse struct {
	Message string       `json:"message"`
	Member  RosterMember `json:"member"`
}

type RosterAutomationOptions struct {
	PingType *string `json:"ping_type,omitempty" enums:"signup_reminder,missing"`
}

type RosterAutomation struct {
	AutomationID     string                   `json:"automation_id"`
	ServerID         string                   `json:"server_id"`
	RosterID         *string                  `json:"roster_id,omitempty"`
	GroupID          *string                  `json:"group_id,omitempty"`
	ActionType       string                   `json:"action_type"`
	TriggerType      *string                  `json:"trigger_type,omitempty"`
	OffsetSeconds    int                      `json:"offset_seconds"`
	DiscordChannelID *string                  `json:"discord_channel_id,omitempty"`
	Options          *RosterAutomationOptions `json:"options,omitempty"`
	Active           bool                     `json:"active"`
	Executed         bool                     `json:"executed"`
	ExecutedAt       *int64                   `json:"executed_at,omitempty"`
	LastTriggeredAt  *int64                   `json:"last_triggered_at,omitempty"`
	ExecutionStatus  *string                  `json:"execution_status,omitempty"`
	LastMissedAt     *int64                   `json:"last_missed_at,omitempty"`
	CreatedAt        string                   `json:"created_at"`
	UpdatedAt        string                   `json:"updated_at"`
}

type RosterAutomationRequest struct {
	RosterID         *string                  `json:"roster_id,omitempty"`
	GroupID          *string                  `json:"group_id,omitempty"`
	ActionType       *string                  `json:"action_type,omitempty"`
	TriggerType      *string                  `json:"trigger_type,omitempty"`
	OffsetSeconds    *int                     `json:"offset_seconds,omitempty"`
	DiscordChannelID *string                  `json:"discord_channel_id,omitempty"`
	Options          *RosterAutomationOptions `json:"options,omitempty"`
	Active           *bool                    `json:"active,omitempty"`
}

type RosterAutomationMutationResponse struct {
	Message      string           `json:"message"`
	AutomationID string           `json:"automation_id,omitempty"`
	Rule         RosterAutomation `json:"rule,omitempty"`
}

type RosterAutomationListResponse struct {
	Items    []RosterAutomation `json:"items"`
	Rules    []RosterAutomation `json:"rules"`
	Count    int                `json:"count"`
	ServerID string             `json:"server_id"`
	RosterID string             `json:"roster_id"`
	GroupID  string             `json:"group_id"`
}

type ServerClanMember struct {
	Tag      string `json:"tag"`
	Name     string `json:"name"`
	Townhall int    `json:"townhall"`
	ClanTag  string `json:"clan_tag"`
	ClanName string `json:"clan_name"`
}

type ServerClanMembersResponse struct {
	Members []ServerClanMember `json:"members"`
	Count   int                `json:"count"`
}
