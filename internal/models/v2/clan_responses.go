package modelsv2

// ClanRankingsResponse is returned by GET /v2/clan/:clan_tag/rankings.
type ClanRankingsResponse struct {
	Name        *string             `json:"name"`
	Tag         string              `json:"tag"`
	Badge       *string             `json:"badge"`
	HomeVillage ClanRankingCategory `json:"homeVillage"`
	BuilderBase ClanRankingCategory `json:"builderBase"`
	ClanCapital ClanRankingCategory `json:"clanCapital"`
}

// ClanRankingCategory contains one ranking category's current points and
// every current global/location placement stored for the clan.
type ClanRankingCategory struct {
	Points     int                    `json:"points"`
	Placements []ClanRankingPlacement `json:"placements"`
}

// ClanRankingPlacement is one row from clan_rankings_current.
type ClanRankingPlacement struct {
	LocationID string `json:"locationId"`
	Rank       int    `json:"rank"`
	Points     int    `json:"points"`
}

// ClanCompositionResponse is returned by GET /v2/clan/compo.
type ClanCompositionResponse struct {
	Townhall     map[string]int `json:"townhall"`
	Role         map[string]int `json:"role"`
	League       map[string]int `json:"league"`
	TotalMembers int            `json:"total_members"`
	ClanCount    int            `json:"clan_count"`
}
