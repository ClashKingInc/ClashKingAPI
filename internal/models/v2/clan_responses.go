package modelsv2

// ClanRankingResponse is returned by GET /v2/clan/:clan_tag/ranking.
type ClanRankingResponse struct {
	Tag         string  `json:"tag"`
	GlobalRank  *int    `json:"global_rank"`
	CountryCode *string `json:"country_code"`
	CountryName *string `json:"country_name"`
	LocalRank   *int    `json:"local_rank"`
}

// BoardTotalsResponse is returned by GET /v2/clan/:clan_tag/board/totals.
type BoardTotalsResponse struct {
	Tag                string `json:"tag"`
	TrackedPlayerCount int    `json:"tracked_player_count"`
	ClanGamesPoints    int    `json:"clan_games_points"`
	TroopsDonated      int    `json:"troops_donated"`
	TroopsReceived     int    `json:"troops_received"`
	ClanCapitalDonated int    `json:"clan_capital_donated"`
	Activity           int    `json:"activity"`
}

// DonationEntry is a single player donation row returned by /v2/clan/:clan_tag/donations/:season.
type DonationEntry struct {
	Tag      string `json:"tag"`
	Donated  any    `json:"donated"`
	Received any    `json:"received"`
}

// ClanCompositionResponse is returned by GET /v2/clan/compo.
type ClanCompositionResponse struct {
	Townhall     map[string]int `json:"townhall"`
	Role         map[string]int `json:"role"`
	League       map[string]int `json:"league"`
	TotalMembers int            `json:"total_members"`
	ClanCount    int            `json:"clan_count"`
}
