package modelsv2

// GuildStatsTopPlayer is one player entry in the guild legends stats.
type GuildStatsTopPlayer struct {
	Tag      string `json:"tag"`
	Name     string `json:"name"`
	Trophies int    `json:"trophies"`
	ClanTag  string `json:"clan_tag"`
	ClanName string `json:"clan_name"`
}

// GuildStatsClanRow is one clan row in the guild legends stats.
type GuildStatsClanRow struct {
	ClanTag          string `json:"clan_tag"`
	ClanName         string `json:"clan_name"`
	PlayersInLegends int    `json:"players_in_legends"`
}

// GuildStatsResponse is returned by GET /v2/legends/guild-stats.
type GuildStatsResponse struct {
	GuildID               int64                 `json:"guild_id"`
	Season                string                `json:"season"`
	TotalPlayersInLegends int                   `json:"total_players_in_legends"`
	TotalClans            int                   `json:"total_clans"`
	AverageTrophies       float64               `json:"average_trophies"`
	TotalTrophies         int                   `json:"total_trophies"`
	TopPlayers            []GuildStatsTopPlayer `json:"top_players"`
	Clans                 []GuildStatsClanRow   `json:"clans"`
}

// DailyTrackingPlayer is one player row in the daily tracking response.
type DailyTrackingPlayer struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
	Day  string `json:"day"`
}

// DailyTrackingResponse is returned by GET /v2/legends/daily-tracking.
type DailyTrackingResponse struct {
	GuildID    int64                 `json:"guild_id"`
	Day        string                `json:"day"`
	Players    []DailyTrackingPlayer `json:"players"`
	TotalCount int                   `json:"total_count"`
}
