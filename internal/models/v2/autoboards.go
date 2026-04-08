package modelsv2

type AutoBoardConfig struct {
	ID        string   `json:"id"`
	Type      string   `json:"type"`
	BoardType string   `json:"board_type"`
	ButtonID  string   `json:"button_id"`
	WebhookID string   `json:"webhook_id"`
	ThreadID  *string  `json:"thread_id,omitempty"`
	ChannelID *string  `json:"channel_id,omitempty"`
	Days      []string `json:"days,omitempty"`
	Locale    string   `json:"locale,omitempty"`
	CreatedAt *string  `json:"created_at,omitempty"`
}

type ServerAutoBoardsResponse struct {
	Autoboards   []AutoBoardConfig `json:"autoboards"`
	Total        int               `json:"total"`
	PostCount    int               `json:"post_count"`
	RefreshCount int               `json:"refresh_count"`
	Limit        int               `json:"limit"`
}

type CreateAutoBoardRequest struct {
	Type      string   `json:"type"`
	BoardType string   `json:"board_type"`
	ButtonID  string   `json:"button_id"`
	WebhookID string   `json:"webhook_id"`
	ThreadID  *string  `json:"thread_id,omitempty"`
	ChannelID *string  `json:"channel_id,omitempty"`
	Days      []string `json:"days,omitempty"`
	Locale    string   `json:"locale,omitempty"`
}

type UpdateAutoBoardRequest struct {
	Type      *string  `json:"type,omitempty"`
	Days      []string `json:"days,omitempty"`
	WebhookID *string  `json:"webhook_id,omitempty"`
	ThreadID  *string  `json:"thread_id,omitempty"`
}

type AutoBoardOperationResponse struct {
	Message     string `json:"message"`
	AutoboardID string `json:"autoboard_id"`
	ServerID    int    `json:"server_id,omitempty"`
	Type        any    `json:"type,omitempty"`
	UpdatedFields int  `json:"updated_fields,omitempty"`
}
