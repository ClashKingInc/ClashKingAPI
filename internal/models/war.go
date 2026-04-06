package models

type WarClanTagsBody struct {
	ClanTags []string `json:"clan_tags"`
}

type WarPlayersBody struct {
	Players []string `json:"players"`
}
