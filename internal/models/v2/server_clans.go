package modelsv2

type MemberCountWarning struct {
	Channel *string `json:"channel,omitempty"`
	Above   any     `json:"above,omitempty"`
	Below   any     `json:"below,omitempty"`
	Role    *string `json:"role,omitempty"`
}

type MemberCountWarningUpdate struct {
	Channel any `json:"channel,omitempty"`
	Above   any `json:"above,omitempty"`
	Below   any `json:"below,omitempty"`
	Role    any `json:"role,omitempty"`
}

type LogButtonSettings struct {
	ProfileButton *bool `json:"profile_button,omitempty"`
	StrikeButton  *bool `json:"strike_button,omitempty"`
	BanButton     *bool `json:"ban_button,omitempty"`
}

type ClanLogSettings struct {
	JoinLog  *LogButtonSettings `json:"join_log,omitempty"`
	LeaveLog *LogButtonSettings `json:"leave_log,omitempty"`
}

type ClanSettingsUpdate struct {
	GeneralRole          any                     `json:"generalRole,omitempty"`
	MemberRole           any                     `json:"member_role,omitempty"`
	LeaderRole           any                     `json:"leaderRole,omitempty"`
	LeaderRoleAlias      any                     `json:"leader_role,omitempty"`
	ClanChannel          any                     `json:"clanChannel,omitempty"`
	ClanChannelAlias     any                     `json:"clan_channel,omitempty"`
	Category             *string                 `json:"category,omitempty"`
	Abbreviation         *string                 `json:"abbreviation,omitempty"`
	Greeting             *string                 `json:"greeting,omitempty"`
	AutoGreetOption      *string                 `json:"auto_greet_option,omitempty"`
	LeadershipEval       *bool                   `json:"leadership_eval,omitempty"`
	WarCountdown         any                     `json:"warCountdown,omitempty"`
	WarCountdownAlias    any                     `json:"war_countdown,omitempty"`
	WarTimerCountdown    any                     `json:"warTimerCountdown,omitempty"`
	WarTimerCountdownAlt any                     `json:"war_timer_countdown,omitempty"`
	BanAlertChannel      any                     `json:"ban_alert_channel,omitempty"`
	MemberCountWarning   *MemberCountWarningUpdate `json:"member_count_warning,omitempty"`
	JoinLogProfileButton *bool                   `json:"join_log_profile_button,omitempty"`
	LeaveLogStrikeButton *bool                   `json:"leave_log_strike_button,omitempty"`
	LeaveLogBanButton    *bool                   `json:"leave_log_ban_button,omitempty"`
}

type ClanSettingsResponse struct {
	Message       string `json:"message"`
	ServerID      int    `json:"server_id"`
	ClanTag       string `json:"clan_tag"`
	UpdatedFields int    `json:"updated_fields"`
}

type AddClanRequest struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type AddClanResponse struct {
	Message  string `json:"message"`
	ServerID int    `json:"server_id"`
	ClanTag  string `json:"clan_tag"`
	ClanName string `json:"clan_name"`
}

type RemoveClanResponse struct {
	Message      string `json:"message"`
	ServerID     int    `json:"server_id"`
	ClanTag      string `json:"clan_tag"`
	DeletedCount int64  `json:"deleted_count"`
}

type ClanSettings struct {
	GeneralRole        *string             `json:"generalRole,omitempty"`
	LeaderRole         *string             `json:"leaderRole,omitempty"`
	ClanChannel        *string             `json:"clanChannel,omitempty"`
	Category           any                 `json:"category,omitempty"`
	Abbreviation       any                 `json:"abbreviation,omitempty"`
	Greeting           any                 `json:"greeting,omitempty"`
	AutoGreetOption    any                 `json:"auto_greet_option,omitempty"`
	LeadershipEval     any                 `json:"leadership_eval,omitempty"`
	WarCountdown       *string             `json:"warCountdown,omitempty"`
	WarTimerCountdown  *string             `json:"warTimerCountdown,omitempty"`
	BanAlertChannel    *string             `json:"ban_alert_channel,omitempty"`
	MemberCountWarning *MemberCountWarning `json:"member_count_warning,omitempty"`
	Logs               *ClanLogSettings    `json:"logs,omitempty"`
}

type ClanListItem struct {
	Tag         string       `json:"tag"`
	Name        string       `json:"name"`
	BadgeURL    *string      `json:"badge_url,omitempty"`
	Level       any          `json:"level,omitempty"`
	MemberCount any          `json:"member_count,omitempty"`
	Settings    ClanSettings `json:"settings"`
}

type ClanSettingsDetail struct {
	Tag               string             `json:"tag"`
	Name              string             `json:"name"`
	Server            int                `json:"server"`
	GeneralRole       *string            `json:"generalRole,omitempty"`
	LeaderRole        *string            `json:"leaderRole,omitempty"`
	ClanChannel       *string            `json:"clanChannel,omitempty"`
	Category          any                `json:"category,omitempty"`
	Abbreviation      any                `json:"abbreviation,omitempty"`
	Greeting          any                `json:"greeting,omitempty"`
	AutoGreetOption   any                `json:"auto_greet_option,omitempty"`
	LeadershipEval    any                `json:"leadership_eval,omitempty"`
	WarCountdown      *string            `json:"warCountdown,omitempty"`
	WarTimerCountdown *string            `json:"warTimerCountdown,omitempty"`
	BanAlertChannel   *string            `json:"ban_alert_channel,omitempty"`
	MemberCountWarning *MemberCountWarning `json:"member_count_warning,omitempty"`
	Logs              *ClanLogSettings   `json:"logs,omitempty"`
}
