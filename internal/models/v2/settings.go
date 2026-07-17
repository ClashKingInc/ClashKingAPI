package modelsv2

type LinkParseSettings struct {
	Clan   *bool `json:"clan,omitempty"`
	Army   *bool `json:"army,omitempty"`
	Player *bool `json:"player,omitempty"`
	Base   *bool `json:"base,omitempty"`
	Show   *bool `json:"show,omitempty"`
}

type ServerSettingsUpdate struct {
	EmbedColor        *int               `json:"embed_color,omitempty"`
	NicknameRule      *string            `json:"nickname_rule,omitempty"`
	NonFamilyNickname *string            `json:"non_family_nickname_rule,omitempty"`
	ChangeNickname    *bool              `json:"change_nickname,omitempty"`
	FlairNonFamily    *bool              `json:"flair_non_family,omitempty"`
	AutoEvalNickname  *bool              `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers  []string           `json:"autoeval_triggers,omitempty"`
	AutoevalLog       *string            `json:"autoeval_log,omitempty"`
	Autoeval          *bool              `json:"autoeval,omitempty"`
	BlacklistedRoles  []string           `json:"blacklisted_roles,omitempty"`
	RoleTreatment     []string           `json:"role_treatment,omitempty"`
	FullWhitelistRole *string            `json:"full_whitelist_role,omitempty"`
	LeadershipEval    *bool              `json:"leadership_eval,omitempty"`
	AutoboardLimit    *int               `json:"autoboard_limit,omitempty"`
	APIToken          *bool              `json:"api_token,omitempty"`
	Tied              *bool              `json:"tied,omitempty"`
	Banlist           *string            `json:"banlist,omitempty"`
	StrikeLog         *string            `json:"strike_log,omitempty"`
	RedditFeed        *string            `json:"reddit_feed,omitempty"`
	FamilyLabel       *string            `json:"family_label,omitempty"`
	Greeting          *string            `json:"greeting,omitempty"`
	LinkParse         *LinkParseSettings `json:"link_parse,omitempty"`
}

type ServerSettingsResponse struct {
	Message       string `json:"message"`
	ServerID      int    `json:"server_id"`
	UpdatedFields int    `json:"updated_fields"`
}

type EmbedColorResponse struct {
	Message    string `json:"message"`
	ServerID   int    `json:"server_id"`
	EmbedColor int    `json:"embed_color"`
}
