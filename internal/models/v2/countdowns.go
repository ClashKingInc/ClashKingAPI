package modelsv2

type CountdownStatus struct {
	Type      string  `json:"type"`
	Name      string  `json:"name"`
	Enabled   bool    `json:"enabled"`
	ChannelID *string `json:"channel_id,omitempty"`
}

type ServerCountdownsResponse struct {
	ServerID   string            `json:"server_id"`
	Countdowns []CountdownStatus `json:"countdowns"`
}

type ClanCountdownsResponse struct {
	ServerID   string            `json:"server_id"`
	ClanTag    string            `json:"clan_tag"`
	Countdowns []CountdownStatus `json:"countdowns"`
}

type EnableCountdownRequest struct {
	CountdownType string `json:"countdown_type"`
	ClanTag       string `json:"clan_tag"`
}

type EnableCountdownResponse struct {
	Message       string `json:"message"`
	CountdownType string `json:"countdown_type"`
	ChannelID     string `json:"channel_id"`
	ChannelName   string `json:"channel_name"`
}

type DisableCountdownRequest struct {
	CountdownType string `json:"countdown_type"`
	ClanTag       string `json:"clan_tag"`
}

type DisableCountdownResponse struct {
	Message       string `json:"message"`
	CountdownType string `json:"countdown_type"`
}
