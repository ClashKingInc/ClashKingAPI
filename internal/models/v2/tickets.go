package modelsv2

type TicketButton struct {
	CustomID string         `json:"custom_id"`
	Label    string         `json:"label"`
	Style    int            `json:"style"`
	Emoji    map[string]any `json:"emoji,omitempty"`
	Type     int            `json:"type"`
}

type TicketButtonSettings struct {
	Questions            []string            `json:"questions"`
	ModRole              []string            `json:"mod_role"`
	NoPingModRole        []string            `json:"no_ping_mod_role"`
	PrivateThread        bool                `json:"private_thread"`
	THMin                int                 `json:"th_min"`
	NumApply             int                 `json:"num_apply"`
	Naming               string              `json:"naming"`
	AccountApply         bool                `json:"account_apply"`
	PlayerInfo           bool                `json:"player_info"`
	ApplyClans           []string            `json:"apply_clans"`
	RolesToAdd           []string            `json:"roles_to_add"`
	RolesToRemove        []string            `json:"roles_to_remove"`
	TownhallRequirements map[string]any      `json:"townhall_requirements"`
	NewMessage           *string             `json:"new_message,omitempty"`
}

type ApproveMessage struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

type TicketPanel struct {
	Name                 string                           `json:"name"`
	ServerID             int64                            `json:"server_id"`
	EmbedName            *string                          `json:"embed_name,omitempty"`
	Components           []TicketButton                   `json:"components"`
	ButtonSettings       map[string]TicketButtonSettings  `json:"button_settings"`
	OpenCategory         *string                          `json:"open_category,omitempty"`
	SleepCategory        *string                          `json:"sleep_category,omitempty"`
	ClosedCategory       *string                          `json:"closed_category,omitempty"`
	StatusChangeLog      *string                          `json:"status_change_log,omitempty"`
	TicketButtonClickLog *string                          `json:"ticket_button_click_log,omitempty"`
	TicketCloseLog       *string                          `json:"ticket_close_log,omitempty"`
	ApproveMessages      []ApproveMessage                 `json:"approve_messages"`
}

type TicketPanelsResponse struct {
	Items           []TicketPanel `json:"items"`
	Total           int           `json:"total"`
	AvailableEmbeds []string      `json:"available_embeds"`
}

type LinkedAccount struct {
	PlayerTag  string  `json:"player_tag"`
	PlayerName *string `json:"player_name"`
	TownHall   *int    `json:"town_hall"`
}

type OpenTicket struct {
	Channel            string           `json:"channel"`
	ChannelExists      bool             `json:"channel_exists"`
	User               string           `json:"user"`
	DiscordUsername    *string          `json:"discord_username,omitempty"`
	DiscordDisplayName *string          `json:"discord_display_name,omitempty"`
	DiscordAvatarURL   *string          `json:"discord_avatar_url,omitempty"`
	Thread             *string          `json:"thread,omitempty"`
	Server             string           `json:"server"`
	Status             string           `json:"status"`
	Number             int              `json:"number"`
	ApplyAccount       *string          `json:"apply_account,omitempty"`
	Panel              string           `json:"panel"`
	SetClan            *string          `json:"set_clan,omitempty"`
	LinkedAccounts     []LinkedAccount  `json:"linked_accounts,omitempty"`
}

type OpenTicketsResponse struct {
	Items []OpenTicket `json:"items"`
	Total int          `json:"total"`
}

type MessageResponse struct {
	Message string `json:"message"`
}

type UpdateTicketPanelRequest struct {
	OpenCategory         *string `json:"open_category,omitempty"`
	SleepCategory        *string `json:"sleep_category,omitempty"`
	ClosedCategory       *string `json:"closed_category,omitempty"`
	StatusChangeLog      *string `json:"status_change_log,omitempty"`
	TicketButtonClickLog *string `json:"ticket_button_click_log,omitempty"`
	TicketCloseLog       *string `json:"ticket_close_log,omitempty"`
	EmbedName            *string `json:"embed_name,omitempty"`
}

type UpdateButtonSettingsRequest struct {
	Questions            []string       `json:"questions"`
	ModRole              []string       `json:"mod_role"`
	NoPingModRole        []string       `json:"no_ping_mod_role"`
	PrivateThread        bool           `json:"private_thread"`
	THMin                int            `json:"th_min"`
	NumApply             int            `json:"num_apply"`
	Naming               string         `json:"naming"`
	AccountApply         bool           `json:"account_apply"`
	PlayerInfo           bool           `json:"player_info"`
	ApplyClans           []string       `json:"apply_clans"`
	RolesToAdd           []string       `json:"roles_to_add"`
	RolesToRemove        []string       `json:"roles_to_remove"`
	TownhallRequirements map[string]any `json:"townhall_requirements"`
	NewMessage           *string        `json:"new_message,omitempty"`
}

type UpdateApproveMessagesRequest struct {
	Messages []ApproveMessage `json:"messages"`
}

type ServerEmbed struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data,omitempty"`
}

type ServerEmbedsResponse struct {
	Items []ServerEmbed `json:"items"`
	Total int           `json:"total"`
}

type UpsertEmbedRequest struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data"`
}

type CreatePanelRequest struct {
	Name string `json:"name"`
}

type CreateButtonRequest struct {
	Label string         `json:"label"`
	Style int            `json:"style"`
	Emoji map[string]any `json:"emoji,omitempty"`
}

type UpdateButtonAppearanceRequest struct {
	Label string         `json:"label"`
	Style int            `json:"style"`
	Emoji map[string]any `json:"emoji,omitempty"`
}

type UpdateOpenTicketStatusRequest struct {
	Status string `json:"status"`
}

type UpdateOpenTicketClanRequest struct {
	SetClan *string `json:"set_clan,omitempty"`
}
