package modelsv2

type ServerPlayerRanking struct {
	PlayerTag      string  `json:"player_tag"`
	PlayerName     string  `json:"player_name"`
	TownhallLevel  *int    `json:"townhall_level,omitempty"`
	ClanTag        string  `json:"clan_tag"`
	ClanName       string  `json:"clan_name"`
	Trophies       *int    `json:"trophies,omitempty"`
	GlobalRank     *int    `json:"global_rank,omitempty"`
	LocalRank      *int    `json:"local_rank,omitempty"`
	CountryCode    *string `json:"country_code,omitempty"`
	CountryName    *string `json:"country_name,omitempty"`
	LegendTrophies *int    `json:"legend_trophies,omitempty"`
}

type ServerClanRanking struct {
	ClanTag       string  `json:"clan_tag"`
	ClanName      string  `json:"clan_name"`
	GlobalRank    *int    `json:"global_rank,omitempty"`
	LocalRank     *int    `json:"local_rank,omitempty"`
	CountryCode   *string `json:"country_code,omitempty"`
	CountryName   *string `json:"country_name,omitempty"`
	ClanLevel     *int    `json:"clan_level,omitempty"`
	ClanPoints    *int    `json:"clan_points,omitempty"`
	MemberCount   *int    `json:"member_count,omitempty"`
	CapitalPoints *int    `json:"capital_points,omitempty"`
}

type ServerLeaderboardsResponse struct {
	ServerID     int                   `json:"server_id"`
	TotalPlayers int                   `json:"total_players"`
	TotalClans   int                   `json:"total_clans"`
	Players      []ServerPlayerRanking `json:"players"`
	Clans        []ServerClanRanking   `json:"clans"`
}

type ServerWarLeaderboardItem struct {
	Rank                  int      `json:"rank"`
	PlayerTag             string   `json:"player_tag"`
	PlayerName            string   `json:"player_name"`
	TownhallLevel         *int     `json:"townhall_level,omitempty"`
	ClanTag               string   `json:"clan_tag"`
	ClanName              string   `json:"clan_name"`
	TotalAttacks          int64    `json:"total_attacks"`
	TotalStars            int64    `json:"total_stars"`
	AverageStars          float64  `json:"average_stars"`
	AverageDestruction    float64  `json:"average_destruction"`
	ThreeStarAttacks      *int     `json:"three_star_attacks,omitempty"`
	ThreeStarRate         *float64 `json:"three_star_rate,omitempty"`
	DestructionPercentage float64  `json:"destruction_percentage"`
}

type ServerCapitalLeaderboardItem struct {
	Rank        int     `json:"rank"`
	PlayerTag   string  `json:"player_tag"`
	PlayerName  string  `json:"player_name"`
	ClanTag     string  `json:"clan_tag"`
	ClanName    string  `json:"clan_name"`
	CapitalGold float64 `json:"capital_gold"`
	Attacks     float64 `json:"attacks"`
}

type ServerLegendsLeaderboardItem struct {
	PlayerTag     string `json:"player_tag"`
	PlayerName    string `json:"player_name"`
	TownhallLevel *int   `json:"townhall_level,omitempty"`
	ClanTag       string `json:"clan_tag"`
	ClanName      string `json:"clan_name"`
	Trophies      int    `json:"trophies"`
	Streak        int    `json:"streak"`
}

type ServerSeasonLeaderboardItem struct {
	Rank          int     `json:"rank"`
	PlayerTag     string  `json:"player_tag"`
	PlayerName    string  `json:"player_name"`
	TownhallLevel *int    `json:"townhall_level,omitempty"`
	ClanTag       string  `json:"clan_tag"`
	ClanName      string  `json:"clan_name"`
	Donated       int     `json:"donated,omitempty"`
	Received      int     `json:"received,omitempty"`
	ActivityScore int     `json:"activity_score,omitempty"`
	Score         float64 `json:"score"`
}

type ServerWarLeaderboardResponse struct {
	ServerID int                        `json:"server_id"`
	Items    []ServerWarLeaderboardItem `json:"items"`
	Total    int                        `json:"total"`
}

type ServerCapitalLeaderboardResponse struct {
	ServerID int                            `json:"server_id"`
	Items    []ServerCapitalLeaderboardItem `json:"items"`
	Total    int                            `json:"total"`
}

type ServerLegendsLeaderboardResponse struct {
	ServerID int                            `json:"server_id"`
	Items    []ServerLegendsLeaderboardItem `json:"items"`
	Total    int                            `json:"total"`
}

type ServerSeasonLeaderboardResponse struct {
	ServerID int                           `json:"server_id"`
	Season   string                        `json:"season"`
	Type     string                        `json:"type"`
	Items    []ServerSeasonLeaderboardItem `json:"items"`
	Total    int                           `json:"total"`
}
