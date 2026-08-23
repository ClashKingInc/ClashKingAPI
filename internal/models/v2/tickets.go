package modelsv2

import (
	"bytes"
	"encoding/json"
)

type TicketButton struct {
	CustomID string        `json:"custom_id"`
	Label    string        `json:"label"`
	Style    int           `json:"style"`
	Emoji    *DiscordEmoji `json:"emoji,omitempty"`
	Type     int           `json:"type"`
}

type TicketButtonSettings struct {
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
	TownhallRequirements map[string]int `json:"townhall_requirements"`
	NewMessage           *string        `json:"new_message,omitempty"`
}

type ApproveMessage struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

type TicketPanel struct {
	Name                 string                          `json:"name"`
	ServerID             int64                           `json:"server_id"`
	EmbedName            *string                         `json:"embed_name,omitempty"`
	Components           []TicketButton                  `json:"components"`
	ButtonSettings       map[string]TicketButtonSettings `json:"button_settings"`
	OpenCategory         *string                         `json:"open_category,omitempty"`
	SleepCategory        *string                         `json:"sleep_category,omitempty"`
	ClosedCategory       *string                         `json:"closed_category,omitempty"`
	StatusChangeLog      *string                         `json:"status_change_log,omitempty"`
	TicketButtonClickLog *string                         `json:"ticket_button_click_log,omitempty"`
	TicketCloseLog       *string                         `json:"ticket_close_log,omitempty"`
	ApproveMessages      []ApproveMessage                `json:"approve_messages"`
}

type TicketPanelsResponse struct {
	Items                     []TicketPanel `json:"items"`
	Total                     int           `json:"total"`
	AvailableEmbeds           []string      `json:"available_embeds"`
	TownhallRequirementFields []string      `json:"townhall_requirement_fields"`
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
	TownhallRequirements map[string]int `json:"townhall_requirements"`
	NewMessage           *string        `json:"new_message,omitempty"`
}

type UpdateApproveMessagesRequest struct {
	Messages []ApproveMessage `json:"messages"`
}

type ServerEmbed struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data"`
}

type ServerEmbedsResponse struct {
	Items []ServerEmbed `json:"items"`
	Total int           `json:"total"`
}

type UpsertEmbedRequest struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data"`
}

func (r *UpsertEmbedRequest) UnmarshalJSON(data []byte) error {
	type requestAlias UpsertEmbedRequest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	return decoder.Decode((*requestAlias)(r))
}

type CreatePanelRequest struct {
	Name string `json:"name"`
}

type CreateButtonRequest struct {
	Label string        `json:"label"`
	Style int           `json:"style"`
	Emoji *DiscordEmoji `json:"emoji,omitempty"`
}

type UpdateButtonAppearanceRequest struct {
	Label string        `json:"label"`
	Style int           `json:"style"`
	Emoji *DiscordEmoji `json:"emoji,omitempty"`
}

type DiscordEmoji struct {
	ID       *string `json:"id,omitempty"`
	Name     *string `json:"name,omitempty"`
	Animated bool    `json:"animated,omitempty"`
}

type DiscordEmbed struct {
	Title       *string             `json:"title,omitempty"`
	Description *string             `json:"description,omitempty"`
	URL         *string             `json:"url,omitempty"`
	Timestamp   *string             `json:"timestamp,omitempty"`
	Color       *int                `json:"color,omitempty"`
	Footer      *DiscordEmbedFooter `json:"footer,omitempty"`
	Image       *DiscordEmbedMedia  `json:"image,omitempty"`
	Thumbnail   *DiscordEmbedMedia  `json:"thumbnail,omitempty"`
	Author      *DiscordEmbedAuthor `json:"author,omitempty"`
	Fields      []DiscordEmbedField `json:"fields,omitempty"`
}

type DiscordEmbedFooter struct {
	Text    string  `json:"text"`
	IconURL *string `json:"icon_url,omitempty"`
}

type DiscordEmbedMedia struct {
	URL string `json:"url"`
}

type DiscordEmbedAuthor struct {
	Name    string  `json:"name"`
	URL     *string `json:"url,omitempty"`
	IconURL *string `json:"icon_url,omitempty"`
}

type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}
