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
