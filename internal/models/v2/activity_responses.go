package modelsv2

// GuildSummaryClanRow is one clan row in the guild activity summary.
type GuildSummaryClanRow struct {
	ClanTag       string `json:"clan_tag"`
	ClanName      string `json:"clan_name"`
	TotalMembers  int    `json:"total_members"`
	ActiveMembers int    `json:"active_members"`
	Inactive      int    `json:"inactive_members"`
}

// GuildSummaryResponse is returned by GET /v2/activity/guild-summary.
type GuildSummaryResponse struct {
	GuildID               int64                 `json:"guild_id"`
	TotalClans            int                   `json:"total_clans"`
	TotalMembers          int                   `json:"total_members"`
	TotalActiveMembers    int                   `json:"total_active_members"`
	TotalInactiveMembers  int                   `json:"total_inactive_members"`
	OverallActivityRate   int                   `json:"overall_activity_rate"`
	TotalDonationsSent    int                   `json:"total_donations_sent"`
	TotalDonationsReceived int                  `json:"total_donations_received"`
	Clans                 []GuildSummaryClanRow `json:"clans"`
}

// InactivePlayerItem is one player row returned by GET /v2/activity/inactive-players.
type InactivePlayerItem struct {
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	Townhall    *int   `json:"townhall"`
	ClanTag     string `json:"clan_tag"`
	DaysInactive int   `json:"days_inactive"`
}

// InactivePlayersResponse is returned by GET /v2/activity/inactive-players.
type InactivePlayersResponse struct {
	GuildID               int64                `json:"guild_id"`
	InactiveThresholdDays int                  `json:"inactive_threshold_days"`
	Players               []InactivePlayerItem `json:"players"`
	TotalCount            int                  `json:"total_count"`
	Limit                 int                  `json:"limit"`
	Offset                int                  `json:"offset"`
}

// CapitalPlayerItem is one player row returned by GET /v2/capital/player-stats.
type CapitalPlayerItem struct {
	Tag                    string `json:"tag"`
	Name                   string `json:"name"`
	ClanTag                string `json:"clan_tag"`
	Attacks                any    `json:"attacks"`
	CapitalResourcesLooted any    `json:"capital_resources_looted"`
}

// CapitalPlayerStatsResponse is returned by GET /v2/capital/player-stats.
type CapitalPlayerStatsResponse struct {
	Season     string              `json:"season"`
	Players    []CapitalPlayerItem `json:"players"`
	TotalCount int                 `json:"total_count"`
	Limit      int                 `json:"limit"`
	Offset     int                 `json:"offset"`
}

// CapitalClanLeaderboardItem is one clan row in the capital guild leaderboard.
type CapitalClanLeaderboardItem struct {
	ClanTag                   string  `json:"clan_tag"`
	ClanName                  string  `json:"clan_name"`
	TotalRaids                int     `json:"total_raids"`
	TotalCapitalGoldLooted    int     `json:"total_capital_gold_looted"`
	TotalRaidMedals           int     `json:"total_raid_medals"`
	AverageCapitalGoldPerRaid float64 `json:"average_capital_gold_per_raid"`
	AverageRaidMedalsPerRaid  float64 `json:"average_raid_medals_per_raid"`
	TotalAttacks              int     `json:"total_attacks"`
	AverageDestruction        float64 `json:"average_destruction"`
}

// CapitalLeaderboardResponse is returned by GET /v2/capital/guild-leaderboard.
type CapitalLeaderboardResponse struct {
	GuildID    int64                        `json:"guild_id"`
	Season     string                       `json:"season"`
	Clans      []CapitalClanLeaderboardItem `json:"clans"`
	TotalCount int                          `json:"total_count"`
}
