package models

type ClanPlayerTagsBody struct {
	PlayerTags []string `json:"player_tags"`
}

type ClanTagsBody struct {
	ClanTags []string `json:"clan_tags"`
}
