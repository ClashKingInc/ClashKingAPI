package modelsv2

type LeaderboardHistoryType string

const (
	LeaderboardHistoryTypePlayerHomeTrophies        LeaderboardHistoryType = "player_home_trophies"
	LeaderboardHistoryTypePlayerBuilderBaseTrophies LeaderboardHistoryType = "player_builder_base_trophies"
	LeaderboardHistoryTypeClanHomePoints            LeaderboardHistoryType = "clan_home_points"
	LeaderboardHistoryTypeClanBuilderBasePoints     LeaderboardHistoryType = "clan_builder_base_points"
	LeaderboardHistoryTypeClanCapitalPoints         LeaderboardHistoryType = "clan_capital_points"
)

type LeaderboardHistoryClanReference struct {
	Tag       string          `json:"tag"`
	Name      string          `json:"name"`
	BadgeURLs PublicBadgeURLs `json:"badgeUrls"`
}

type LeaderboardHistoryLeagueReference struct {
	ID       int             `json:"id"`
	Name     string          `json:"name,omitempty"`
	IconURLs *PublicIconURLs `json:"iconUrls,omitempty"`
}

type LeaderboardHistoryLocationReference struct {
	ID            int    `json:"id"`
	Name          string `json:"name,omitempty"`
	IsCountry     bool   `json:"isCountry"`
	CountryCode   string `json:"countryCode,omitempty"`
	LocalizedName string `json:"localizedName,omitempty"`
}

// LeaderboardHistoryItem is the typed union of the five supported official
// leaderboard item shapes. Fields that do not belong to the selected
// leaderboard type are omitted.
type LeaderboardHistoryItem struct {
	Tag                   string                               `json:"tag"`
	Name                  string                               `json:"name"`
	ExpLevel              *int                                 `json:"expLevel,omitempty"`
	Trophies              *int                                 `json:"trophies,omitempty"`
	AttackWins            *int                                 `json:"attackWins,omitempty"`
	DefenseWins           *int                                 `json:"defenseWins,omitempty"`
	BuilderBaseTrophies   *int                                 `json:"builderBaseTrophies,omitempty"`
	BuilderBaseBattleWins *int                                 `json:"builderBaseBattleWins,omitempty"`
	Clan                  *LeaderboardHistoryClanReference     `json:"clan,omitempty"`
	League                *LeaderboardHistoryLeagueReference   `json:"league,omitempty"`
	LeagueTier            *LeaderboardHistoryLeagueReference   `json:"leagueTier,omitempty"`
	BuilderBaseLeague     *LeaderboardHistoryLeagueReference   `json:"builderBaseLeague,omitempty"`
	BadgeURLs             *PublicBadgeURLs                     `json:"badgeUrls,omitempty"`
	ClanLevel             *int                                 `json:"clanLevel,omitempty"`
	ClanPoints            *int                                 `json:"clanPoints,omitempty"`
	BuilderBasePoints     *int                                 `json:"builderBasePoints,omitempty"`
	CapitalPoints         *int                                 `json:"capitalPoints,omitempty"`
	Members               *int                                 `json:"members,omitempty"`
	Location              *LeaderboardHistoryLocationReference `json:"location,omitempty"`
	Rank                  int                                  `json:"rank"`
	PreviousRank          *int                                 `json:"previousRank,omitempty"`
}

type LeaderboardSnapshotHistoryResponse struct {
	Type       LeaderboardHistoryType   `json:"type"`
	LocationID string                   `json:"locationId"`
	Date       string                   `json:"date"`
	Items      []LeaderboardHistoryItem `json:"items"`
}

type LeaderboardEntityHistoryItem struct {
	Date       string                 `json:"date"`
	LocationID string                 `json:"locationId"`
	Name       string                 `json:"name"`
	Rank       int                    `json:"rank"`
	Details    LeaderboardHistoryItem `json:"details"`
}

type PlayerLeaderboardHistoryResponse struct {
	Type      LeaderboardHistoryType         `json:"type"`
	PlayerTag string                         `json:"playerTag"`
	Items     []LeaderboardEntityHistoryItem `json:"items"`
}

type ClanLeaderboardHistoryItem struct {
	Date              string                               `json:"date"`
	Rank              int                                  `json:"rank"`
	ClanPoints        *int                                 `json:"clanPoints,omitempty"`
	BuilderBasePoints *int                                 `json:"builderBasePoints,omitempty"`
	CapitalPoints     *int                                 `json:"capitalPoints,omitempty"`
	Members           int                                  `json:"members"`
	Location          *LeaderboardHistoryLocationReference `json:"location,omitempty"`
}

type ClanLeaderboardHistoryResponse struct {
	Items []ClanLeaderboardHistoryItem `json:"items"`
}
