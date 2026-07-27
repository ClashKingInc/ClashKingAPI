package modelsv2

type LeaderboardHistoryType string

const (
	LeaderboardHistoryTypePlayerHomeTrophies        LeaderboardHistoryType = "player_home_trophies"
	LeaderboardHistoryTypePlayerBuilderBaseTrophies LeaderboardHistoryType = "player_builder_base_trophies"
	LeaderboardHistoryTypeClanHomePoints            LeaderboardHistoryType = "clan_home_points"
	LeaderboardHistoryTypeClanBuilderBasePoints     LeaderboardHistoryType = "clan_builder_base_points"
	LeaderboardHistoryTypeClanCapitalPoints         LeaderboardHistoryType = "clan_capital_points"
)

type LeaderboardSnapshotHistoryResponse struct {
	Type       LeaderboardHistoryType `json:"type"`
	LocationID string                 `json:"locationId"`
	Date       string                 `json:"date"`
	Items      []map[string]any       `json:"items"`
}

type LeaderboardEntityHistoryItem struct {
	Date       string         `json:"date"`
	LocationID string         `json:"locationId"`
	Name       string         `json:"name"`
	Rank       int            `json:"rank"`
	Details    map[string]any `json:"details"`
}

type PlayerLeaderboardHistoryResponse struct {
	Type      LeaderboardHistoryType         `json:"type"`
	PlayerTag string                         `json:"playerTag"`
	Items     []LeaderboardEntityHistoryItem `json:"items"`
}

type ClanLeaderboardHistoryResponse struct {
	Type    LeaderboardHistoryType         `json:"type"`
	ClanTag string                         `json:"clanTag"`
	Items   []LeaderboardEntityHistoryItem `json:"items"`
}
