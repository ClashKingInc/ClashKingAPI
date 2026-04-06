package models

type MobilePlayerTagsRequest struct {
	PlayerTags []string          `json:"player_tags"`
	ClanTags   map[string]string `json:"clan_tags"`
}
