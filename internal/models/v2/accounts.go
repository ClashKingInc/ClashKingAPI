package modelsv2

import "time"

type AccountsCOCAccountRequest struct {
	PlayerTag string `json:"player_tag"`
	APIToken  string `json:"api_token,omitempty"`
}

type AccountsReorderAccountsRequest struct {
	OrderedTags []string `json:"ordered_tags"`
}

type AccountsLinkVisibilityRequest struct {
	Hidden bool `json:"hidden"`
}

type AccountsLinkedPlayer struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
	IsVerified    bool   `json:"is_verified"`
	Hidden        bool   `json:"hidden"`
}

type AccountsLinkResponse struct {
	Message string               `json:"message"`
	Account AccountsLinkedPlayer `json:"account"`
}

type AccountsLinkedAccount struct {
	UserID     string     `json:"user_id"`
	PlayerTag  string     `json:"player_tag"`
	OrderIndex int        `json:"order_index"`
	IsVerified bool       `json:"is_verified"`
	Hidden     bool       `json:"hidden"`
	AddedAt    time.Time  `json:"added_at"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
}

type AccountsListResponse struct {
	Items []AccountsLinkedAccount `json:"items"`
}

type AccountsMessageResponse struct {
	Message string `json:"message"`
}
