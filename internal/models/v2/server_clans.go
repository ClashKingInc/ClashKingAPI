package modelsv2

type MemberCountWarning struct {
	Channel *string `json:"channel,omitempty"`
	Above   *int    `json:"above,omitempty"`
	Below   *int    `json:"below,omitempty"`
	Role    *string `json:"role,omitempty"`
}

type MemberCountWarningUpdate struct {
	Channel *string `json:"channel,omitempty"`
	Above   *int    `json:"above,omitempty"`
	Below   *int    `json:"below,omitempty"`
	Role    *string `json:"role,omitempty"`
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
	GeneralRole          *string                   `json:"generalRole,omitempty"`
	MemberRole           *string                   `json:"member_role,omitempty"`
	LeaderRole           *string                   `json:"leaderRole,omitempty"`
	LeaderRoleAlias      *string                   `json:"leader_role,omitempty"`
	ClanChannel          *string                   `json:"clanChannel,omitempty"`
	ClanChannelAlias     *string                   `json:"clan_channel,omitempty"`
	Category             *string                   `json:"category,omitempty"`
	Abbreviation         *string                   `json:"abbreviation,omitempty"`
	Greeting             *string                   `json:"greeting,omitempty"`
	AutoGreetOption      *string                   `json:"auto_greet_option,omitempty"`
	LeadershipEval       *bool                     `json:"leadership_eval,omitempty"`
	WarCountdown         *string                   `json:"warCountdown,omitempty"`
	WarCountdownAlias    *string                   `json:"war_countdown,omitempty"`
	WarTimerCountdown    *string                   `json:"warTimerCountdown,omitempty"`
	WarTimerCountdownAlt *string                   `json:"war_timer_countdown,omitempty"`
	BanAlertChannel      *string                   `json:"ban_alert_channel,omitempty"`
	MemberCountWarning   *MemberCountWarningUpdate `json:"member_count_warning,omitempty"`
	JoinLogProfileButton *bool                     `json:"join_log_profile_button,omitempty"`
	LeaveLogStrikeButton *bool                     `json:"leave_log_strike_button,omitempty"`
	LeaveLogBanButton    *bool                     `json:"leave_log_ban_button,omitempty"`
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
	Category           *string             `json:"category,omitempty"`
	Abbreviation       *string             `json:"abbreviation,omitempty"`
	Greeting           *string             `json:"greeting,omitempty"`
	AutoGreetOption    *string             `json:"auto_greet_option,omitempty"`
	LeadershipEval     *bool               `json:"leadership_eval,omitempty"`
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
	Level       *int         `json:"level,omitempty"`
	MemberCount *int         `json:"member_count,omitempty"`
	Settings    ClanSettings `json:"settings"`
}

type ClanSettingsDetail struct {
	Tag                string              `json:"tag"`
	Name               string              `json:"name"`
	Server             int                 `json:"server"`
	GeneralRole        *string             `json:"generalRole,omitempty"`
	LeaderRole         *string             `json:"leaderRole,omitempty"`
	ClanChannel        *string             `json:"clanChannel,omitempty"`
	Category           *string             `json:"category,omitempty"`
	Abbreviation       *string             `json:"abbreviation,omitempty"`
	Greeting           *string             `json:"greeting,omitempty"`
	AutoGreetOption    *string             `json:"auto_greet_option,omitempty"`
	LeadershipEval     *bool               `json:"leadership_eval,omitempty"`
	WarCountdown       *string             `json:"warCountdown,omitempty"`
	WarTimerCountdown  *string             `json:"warTimerCountdown,omitempty"`
	BanAlertChannel    *string             `json:"ban_alert_channel,omitempty"`
	MemberCountWarning *MemberCountWarning `json:"member_count_warning,omitempty"`
	Logs               *ClanLogSettings    `json:"logs,omitempty"`
}
