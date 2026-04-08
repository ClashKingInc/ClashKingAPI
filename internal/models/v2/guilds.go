package modelsv2

type GuildInfo struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Icon        *string  `json:"icon"`
	Owner       bool     `json:"owner"`
	Permissions string   `json:"permissions"`
	Role        string   `json:"role"`
	Features    []string `json:"features"`
	HasBot      bool     `json:"has_bot"`
	MemberCount *int     `json:"member_count,omitempty"`
}

type GuildDetails struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Icon        *string  `json:"icon"`
	OwnerID     *string  `json:"owner_id"`
	Features    []string `json:"features"`
	MemberCount *int     `json:"member_count"`
	Description *string  `json:"description"`
	Banner      *string  `json:"banner"`
	PremiumTier int      `json:"premium_tier"`
	BoostCount  int      `json:"boost_count"`
}
