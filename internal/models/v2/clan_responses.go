package modelsv2

// ClanRankingsResponse is returned by GET /v2/clan/:clan_tag/rankings.
type ClanRankingsResponse struct {
	Name              *string           `json:"name"`
	Tag               string            `json:"tag"`
	Badge             *string           `json:"badge"`
	Location          *ClanLeagueRef    `json:"location"`
	ClanPoints        ClanRankingMetric `json:"clanPoints"`
	WarWins           ClanRankingMetric `json:"warWins"`
	WarWinStreak      ClanRankingMetric `json:"warWinStreak"`
	Donations         ClanRankingMetric `json:"donations"`
	DonationsReceived ClanRankingMetric `json:"donationsReceived"`
}

// ClanRankingMetric contains one rankable clan value and known global/local ranks.
type ClanRankingMetric struct {
	Value      *int   `json:"value"`
	GlobalRank *int64 `json:"globalRank"`
	LocalRank  any    `json:"localRank,omitempty"`
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
