package modelsv2

type SharedLinksLookupRequest struct {
	DiscordIDs []string `json:"discord_ids,omitempty"`
	PlayerTags []string `json:"player_tags,omitempty"`
}

type SharedLink struct {
	IsVerified bool   `json:"is_verified"`
	PlayerTag  string `json:"player_tag"`
	UserID     string `json:"user_id"`
}

type SharedLinksLookupResponse struct {
	Items []SharedLink `json:"items"`
}
