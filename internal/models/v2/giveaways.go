package modelsv2

type GiveawayBooster struct {
	Value float64  `json:"value"`
	Roles []string `json:"roles"`
}

type GiveawayWinner struct {
	UserID    string  `json:"user_id"`
	Username  *string `json:"username,omitempty"`
	Status    string  `json:"status"`
	Timestamp *string `json:"timestamp,omitempty"`
	Reason    *string `json:"reason,omitempty"`
}

type GiveawayConfig struct {
	ID                     string            `json:"id"`
	Prize                  string            `json:"prize"`
	ChannelID              *string           `json:"channel_id,omitempty"`
	Status                 string            `json:"status"`
	StartTime              string            `json:"start_time"`
	EndTime                string            `json:"end_time"`
	Winners                int               `json:"winners"`
	Mentions               []string          `json:"mentions"`
	TextAboveEmbed         string            `json:"text_above_embed"`
	TextInEmbed            string            `json:"text_in_embed"`
	TextOnEnd              string            `json:"text_on_end"`
	ImageURL               *string           `json:"image_url,omitempty"`
	ProfilePictureRequired bool              `json:"profile_picture_required"`
	COCAccountRequired     bool              `json:"coc_account_required"`
	RolesMode              string            `json:"roles_mode"`
	Roles                  []string          `json:"roles"`
	Boosters               []GiveawayBooster `json:"boosters"`
	EntryCount             int               `json:"entry_count"`
	Updated                bool              `json:"updated"`
	MessageID              *string           `json:"message_id,omitempty"`
	WinnersList            []GiveawayWinner  `json:"winners_list"`
}

type ServerGiveawaysResponse struct {
	Ongoing  []GiveawayConfig `json:"ongoing"`
	Upcoming []GiveawayConfig `json:"upcoming"`
	Ended    []GiveawayConfig `json:"ended"`
	Total    int              `json:"total"`
}

type GiveawayMutationResponse struct {
	Message    string `json:"message"`
	GiveawayID string `json:"giveaway_id"`
	ServerID   int    `json:"server_id"`
}

type GiveawayRerollRequest struct {
	UserIDsToReplace []string `json:"user_ids_to_replace"`
}

type GiveawayRerollResponse struct {
	Message    string   `json:"message"`
	GiveawayID string   `json:"giveaway_id"`
	ServerID   int      `json:"server_id"`
	NewWinners []string `json:"new_winners"`
}
