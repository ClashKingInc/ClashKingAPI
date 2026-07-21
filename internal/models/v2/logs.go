package modelsv2

type ServerLog struct {
	ClanTag   *string `json:"clan_tag,omitempty"`
	Type      string  `json:"type"`
	WebhookID string  `json:"webhook_id"`
	ChannelID *string `json:"channel_id,omitempty"`
	ThreadID  *string `json:"thread_id,omitempty"`
	Disabled  bool    `json:"disabled"`
}

type UpdateServerLogsDisabledRequest struct {
	ClanTag  *string  `json:"clan_tag,omitempty"`
	LogTypes []string `json:"log_types"`
	Disabled *bool    `json:"disabled"`
}

type ServerLogsResponse struct {
	Logs  []ServerLog `json:"logs"`
	Count int         `json:"count"`
}

type UpdateServerLogsRequest struct {
	ClanTag   *string  `json:"clan_tag,omitempty"`
	ChannelID string   `json:"channel_id"`
	ThreadID  *string  `json:"thread_id,omitempty"`
	LogTypes  []string `json:"log_types"`
}

type ServerLogsOperationResponse struct {
	Message         string      `json:"message"`
	ServerID        int         `json:"server_id"`
	ClanTag         *string     `json:"clan_tag,omitempty"`
	UpdatedLogTypes []string    `json:"updated_log_types,omitempty"`
	DeletedLogTypes []string    `json:"deleted_log_types,omitempty"`
	Logs            []ServerLog `json:"logs,omitempty"`
}
