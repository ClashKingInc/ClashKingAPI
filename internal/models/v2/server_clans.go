package modelsv2

type ClanSettingsUpdate struct {
	ClanChannel     *string `json:"clan_channel,omitempty"`
	Category        *string `json:"category,omitempty"`
	Abbreviation    *string `json:"abbreviation,omitempty"`
	Greeting        *string `json:"greeting,omitempty"`
	AutoGreetOption *string `json:"auto_greet_option,omitempty"`
	BanAlertChannel *string `json:"ban_alert_channel,omitempty"`
}

type ClanSettingsResponse struct {
	Message       string `json:"message"`
	ServerID      int    `json:"server_id"`
	ClanTag       string `json:"clan_tag"`
	UpdatedFields int    `json:"updated_fields"`
}

type AddClanRequest struct {
	Tag string `json:"tag"`
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
	ClanChannel     *string `json:"clan_channel,omitempty"`
	Category        *string `json:"category,omitempty"`
	Abbreviation    *string `json:"abbreviation,omitempty"`
	Greeting        *string `json:"greeting,omitempty"`
	AutoGreetOption *string `json:"auto_greet_option,omitempty"`
	BanAlertChannel *string `json:"ban_alert_channel,omitempty"`
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
	Tag             string  `json:"tag"`
	Name            string  `json:"name"`
	ServerID        int     `json:"server_id"`
	ClanChannel     *string `json:"clan_channel,omitempty"`
	Category        *string `json:"category,omitempty"`
	Abbreviation    *string `json:"abbreviation,omitempty"`
	Greeting        *string `json:"greeting,omitempty"`
	AutoGreetOption *string `json:"auto_greet_option,omitempty"`
	BanAlertChannel *string `json:"ban_alert_channel,omitempty"`
}
