package modelsv2

// GuildSummaryClanRow is one clan row in the guild activity summary.
type GuildSummaryClanRow struct {
	ClanTag                  string  `json:"clan_tag"`
	ClanName                 string  `json:"clan_name"`
	TotalMembers             int     `json:"total_members"`
	ActiveMembers            int     `json:"active_members"`
	InactiveMembers          int     `json:"inactive_members"`
	ActivityRate             float64 `json:"activity_rate"`
	AverageDonationsSent     float64 `json:"average_donations_sent"`
	AverageDonationsReceived float64 `json:"average_donations_received"`
	TotalDonationsSent       int     `json:"total_donations_sent"`
	TotalDonationsReceived   int     `json:"total_donations_received"`
	AverageTrophies          float64 `json:"average_trophies"`
}

// GuildSummaryResponse is returned by GET /v2/activity/guild-summary.
type GuildSummaryResponse struct {
	GuildID                int64                 `json:"guild_id"`
	TotalClans             int                   `json:"total_clans"`
	TotalMembers           int                   `json:"total_members"`
	TotalActiveMembers     int                   `json:"total_active_members"`
	TotalInactiveMembers   int                   `json:"total_inactive_members"`
	OverallActivityRate    float64               `json:"overall_activity_rate"`
	TotalDonationsSent     int                   `json:"total_donations_sent"`
	TotalDonationsReceived int                   `json:"total_donations_received"`
	Clans                  []GuildSummaryClanRow `json:"clans"`
}

// InactivePlayerItem is one player row returned by GET /v2/activity/inactive-players.
type InactivePlayerItem struct {
	Tag               string `json:"tag"`
	Name              string `json:"name"`
	ClanTag           string `json:"clan_tag"`
	ClanName          string `json:"clan_name"`
	Role              string `json:"role"`
	Trophies          int    `json:"trophies"`
	Townhall          *int   `json:"townhall"`
	DaysInactive      *int   `json:"days_inactive"`
	DonationsSent     int    `json:"donations_sent"`
	DonationsReceived int    `json:"donations_received"`
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

// RaidAttack is one attack entry within a capital raid.
type RaidAttack struct {
	AttackerTag  string  `json:"attacker_tag"`
	AttackerName string  `json:"attacker_name"`
	DefenderTag  string  `json:"defender_tag"`
	DefenderName string  `json:"defender_name"`
	Destruction  float64 `json:"destruction"`
	Stars        int     `json:"stars"`
}

// CapitalPlayerItem is one player row returned by GET /v2/capital/player-stats.
type CapitalPlayerItem struct {
	PlayerTag              string       `json:"player_tag"`
	PlayerName             string       `json:"player_name"`
	ClanTag                string       `json:"clan_tag"`
	ClanName               string       `json:"clan_name"`
	TotalAttacks           int          `json:"total_attacks"`
	TotalCapitalGoldLooted int64        `json:"total_capital_gold_looted"`
	TotalRaidMedals        int64        `json:"total_raid_medals"`
	TotalDestruction       float64      `json:"total_destruction"`
	AverageDestruction     float64      `json:"average_destruction"`
	Attacks                []RaidAttack `json:"attacks"`
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
	TotalCapitalGoldLooted    int64   `json:"total_capital_gold_looted"`
	TotalRaidMedals           int64   `json:"total_raid_medals"`
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
