package modelsv2

type ClanSettingsUpdate struct {
	Category     *string `json:"category,omitempty"`
	Abbreviation *string `json:"abbreviation,omitempty"`
}

type ClanSettingsResponse struct {
	Message       string        `json:"message"`
	ServerID      int           `json:"server_id"`
	ClanTag       string        `json:"clan_tag"`
	UpdatedFields int           `json:"updated_fields"`
	Category      *ClanCategory `json:"category"`
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
	Category     *string `json:"category,omitempty"`
	Abbreviation *string `json:"abbreviation,omitempty"`
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
	Tag          string  `json:"tag"`
	Name         string  `json:"name"`
	ServerID     int     `json:"server_id"`
	Category     *string `json:"category,omitempty"`
	Abbreviation *string `json:"abbreviation,omitempty"`
}
