package modelsv2

import "time"

// PlayerBattlelogStatsRequest is the request body for bulk player legend battlelog stats.
type PlayerBattlelogStatsRequest struct {
	PlayerTags []string `json:"player_tags"`
}

type ClanChangesResponse struct {
	Name      string             `json:"name"`
	Tag       string             `json:"tag"`
	BadgeURLs any                `json:"badgeUrls"`
	Count     int                `json:"count"`
	Items     []ClanChangeRecord `json:"items"`
}

type ClanChangeRecord struct {
	Time     time.Time `json:"time"`
	Type     string    `json:"type"`
	Previous any       `json:"previous"`
	Current  any       `json:"current"`
}

type BattlelogItemFilters struct {
	TownHallLevel *int `json:"townHallLevel,omitempty"`
	LeagueID      *int `json:"leagueId,omitempty"`
	Top200        bool `json:"top200,omitempty"`
}

type BattlelogItemUsagePoint struct {
	Date      string  `json:"date"`
	Used      int     `json:"used"`
	Total     int     `json:"total"`
	UsageRate float64 `json:"usageRate"`
}

type BattlelogItemUsageResponse struct {
	Item      string                    `json:"item"`
	Metric    string                    `json:"metric"`
	Dimension string                    `json:"dimension"`
	Filters   BattlelogItemFilters      `json:"filters"`
	Items     []BattlelogItemUsagePoint `json:"items"`
}

type BattlelogItemHitratePoint struct {
	Date       string  `json:"date"`
	ThreeStars int     `json:"threeStars"`
	Total      int     `json:"total"`
	HitRate    float64 `json:"hitRate"`
}

type BattlelogItemHitrateResponse struct {
	Item      string                      `json:"item"`
	Metric    string                      `json:"metric"`
	Dimension string                      `json:"dimension"`
	Filters   BattlelogItemFilters        `json:"filters"`
	Items     []BattlelogItemHitratePoint `json:"items"`
}
