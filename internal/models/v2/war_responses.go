package modelsv2

// CWLThresholdItem is one league row returned by GET /v2/cwl/league-thresholds.
type CWLThresholdItem struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Promo  int    `json:"promo"`
	Demote int    `json:"demote"`
}

// CWLRankingHistoryItem is one season row returned by GET /v2/cwl/:clan_tag/ranking-history.
type CWLRankingHistoryItem struct {
	Season string `json:"season"`
	League string `json:"league"`
	Rounds int    `json:"rounds"`
}

// WarStatsItem is the single entry returned by GET /v2/war/clan/stats.
type WarStatsItem struct {
	WarCount int      `json:"war_count"`
	ClanTags []string `json:"clan_tags"`
}

// WarSummaryResponse is returned by GET /v2/war/:clan_tag/war-summary.
type WarSummaryResponse struct {
	Tag              string `json:"tag"`
	State            string `json:"state"`
	TeamSize         int    `json:"team_size"`
	AttacksPerMember int    `json:"attacks_per_member"`
}
