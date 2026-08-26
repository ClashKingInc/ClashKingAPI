package modelsv2

type LeagueReference struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type CWLSeasonItem struct {
	Season      string            `json:"season"`
	State       string            `json:"state"`
	WarSize     *int              `json:"warSize"`
	WarLeague   *LeagueReference  `json:"warLeague"`
	Rank        *int              `json:"rank"`
	Stars       *int              `json:"stars"`
	Destruction *float64          `json:"destruction"`
	Rounds      *CWLRankingRounds `json:"rounds"`
}

type CWLSeasonsResponse struct {
	Items []CWLSeasonItem `json:"items"`
}

type CWLGroupMember struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
}

type CWLStoredGroupClan struct {
	Tag       string           `json:"tag"`
	Name      string           `json:"name"`
	ClanLevel int              `json:"clanLevel"`
	BadgeURLs PublicBadgeURLs  `json:"badgeUrls"`
	Members   []CWLGroupMember `json:"members"`
}

type CWLGroupRound struct {
	WarTags []any `json:"warTags"`
}

type CWLResponse struct {
	State     string               `json:"state"`
	Season    string               `json:"season"`
	WarLeague *LeagueReference     `json:"warLeague"`
	Clans     []CWLStoredGroupClan `json:"clans"`
	Rounds    []CWLGroupRound      `json:"rounds"`
}
