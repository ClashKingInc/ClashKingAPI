package modelsv2

type GiveawayBooster struct {
	Value float64  `json:"value"`
	Roles []string `json:"roles"`
}

type GiveawayWinner struct {
	UserID    string  `json:"userId"`
	Username  *string `json:"username,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
	Status    string  `json:"status"`
	Timestamp *string `json:"timestamp,omitempty"`
	Reason    *string `json:"reason,omitempty"`
}

type GiveawayConfig struct {
	ID                     string            `json:"id"`
	ServerID               string            `json:"serverId"`
	Prize                  string            `json:"prize"`
	ChannelID              *string           `json:"channelId,omitempty"`
	Status                 string            `json:"status"`
	Start                  string            `json:"start"`
	End                    string            `json:"end"`
	Winners                int               `json:"winners"`
	Mentions               []string          `json:"mentions"`
	TextAboveEmbed         string            `json:"textAboveEmbed"`
	TextInEmbed            string            `json:"textInEmbed"`
	TextOnEnd              string            `json:"textOnEnd"`
	ImageURL               *string           `json:"imageUrl,omitempty"`
	ProfilePictureRequired bool              `json:"profilePictureRequired"`
	COCAccountRequired     bool              `json:"cocAccountRequired"`
	RolesMode              string            `json:"rolesMode"`
	Roles                  []string          `json:"roles"`
	Boosters               []GiveawayBooster `json:"boosters"`
	Entries                []any             `json:"entries"`
	WinnersList            []GiveawayWinner  `json:"winnersList"`
	Updated                bool              `json:"updated"`
	MessageID              *string           `json:"messageId,omitempty"`
	EventPending           *string           `json:"eventPending,omitempty"`
	EventPendingAt         *string           `json:"eventPendingAt,omitempty"`
	CreatedAt              string            `json:"createdAt"`
	UpdatedAt              string            `json:"updatedAt"`
}

type ServerGiveawaysResponse struct {
	Ongoing  []GiveawayConfig `json:"ongoing"`
	Upcoming []GiveawayConfig `json:"upcoming"`
	Ended    []GiveawayConfig `json:"ended"`
	Total    int              `json:"total"`
}

type GiveawayMutationResponse struct {
	Message    string `json:"message"`
	GiveawayID string `json:"giveawayId"`
	ServerID   string `json:"serverId"`
}

type GiveawayEntrant struct {
	UserID    string  `json:"userId"`
	Entries   int     `json:"entries"`
	WinChance float64 `json:"winChance"`
}

type GiveawayEntriesResponse struct {
	GiveawayID   string            `json:"giveawayId"`
	ServerID     string            `json:"serverId"`
	TotalEntries int               `json:"totalEntries"`
	UniqueUsers  int               `json:"uniqueUsers"`
	Entrants     []GiveawayEntrant `json:"entrants"`
}

type GiveawayRerollRequest struct {
	UserIDsToReplace []string `json:"user_ids_to_replace"`
}

type GiveawayRerollResponse struct {
	Message    string   `json:"message"`
	GiveawayID string   `json:"giveawayId"`
	ServerID   string   `json:"serverId"`
	NewWinners []string `json:"newWinners"`
}
