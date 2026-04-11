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
	ClanTag                  string  `json:"clan_tag"`
	ClanName                 string  `json:"clan_name"`
	PlayersInLegends         int     `json:"players_in_legends"`
	AverageTrophies          float64 `json:"average_trophies"`
	TotalTrophies            int     `json:"total_trophies"`
	HighestTrophies          int     `json:"highest_trophies"`
	LowestTrophies           int     `json:"lowest_trophies"`
	TotalAttacks             int     `json:"total_attacks"`
	TotalDefenses            int     `json:"total_defenses"`
	AverageAttacksPerPlayer  float64 `json:"average_attacks_per_player"`
	AverageDefensesPerPlayer float64 `json:"average_defenses_per_player"`
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

// DailyTrackingDayData holds per-day legend stats for one player.
type DailyTrackingDayData struct {
	Date             string `json:"date"`
	StartingTrophies int    `json:"starting_trophies"`
	EndingTrophies   int    `json:"ending_trophies"`
	NetChange        int    `json:"net_change"`
	Attacks          int    `json:"attacks"`
	Defenses         int    `json:"defenses"`
	AttackWins       int    `json:"attack_wins"`
	DefenseWins      int    `json:"defense_wins"`
}

// PlayerDailyTracking is one player entry in the daily tracking response.
type PlayerDailyTracking struct {
	PlayerTag       string                 `json:"player_tag"`
	PlayerName      string                 `json:"player_name"`
	ClanTag         *string                `json:"clan_tag"`
	ClanName        *string                `json:"clan_name"`
	TownhallLevel   int                    `json:"townhall_level"`
	CurrentTrophies int                    `json:"current_trophies"`
	DailyData       []DailyTrackingDayData `json:"daily_data"`
}

// DailyTrackingResponse is returned by GET /v2/legends/daily-tracking.
type DailyTrackingResponse struct {
	GuildID    int64                 `json:"guild_id"`
	StartDate  string                `json:"start_date"`
	EndDate    string                `json:"end_date"`
	Players    []PlayerDailyTracking `json:"players"`
	TotalCount int                   `json:"total_count"`
	Limit      int                   `json:"limit"`
	Offset     int                   `json:"offset"`
}
