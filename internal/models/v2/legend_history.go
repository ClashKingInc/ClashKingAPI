package modelsv2

import "time"

type LegendHistoryClan struct {
	Tag       string           `json:"tag,omitempty"`
	Name      string           `json:"name,omitempty"`
	BadgeURLs *PublicBadgeURLs `json:"badgeUrls,omitempty"`
}

type LegendHistoryLeagueTier struct {
	ID       int             `json:"id"`
	Name     string          `json:"name,omitempty"`
	IconURLs *PublicIconURLs `json:"iconUrls,omitempty"`
}

type LegendHistoryItem struct {
	Season      string                   `json:"season"`
	Tag         string                   `json:"tag"`
	Name        string                   `json:"name"`
	ExpLevel    int                      `json:"expLevel"`
	Trophies    int                      `json:"trophies"`
	AttackWins  int                      `json:"attackWins"`
	DefenseWins int                      `json:"defenseWins"`
	Rank        int                      `json:"rank"`
	Clan        *LegendHistoryClan       `json:"clan,omitempty"`
	LeagueTier  *LegendHistoryLeagueTier `json:"leagueTier,omitempty"`
}

type LegendSeasonHistoryResponse struct {
	Items []LegendHistoryItem `json:"items"`
}

type PlayerLegendHistoryResponse struct {
	Items []LegendHistoryItem `json:"items"`
}

type ClanLegendHistoryResponse struct {
	Items []ClanLegendHistoryItem `json:"items"`
}

type ClanLegendSeasonSummary struct {
	Season      string    `json:"season"`
	After       time.Time `json:"after"`
	Before      time.Time `json:"before"`
	PlayerCount int       `json:"playerCount"`
}

type ClanLegendHistorySummaryResponse struct {
	Seasons     []ClanLegendSeasonSummary `json:"seasons"`
	TopFinishes []ClanLegendTopFinish     `json:"topFinishes"`
}

type ClanLegendTopFinish struct {
	Season      string `json:"season"`
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	Trophies    int    `json:"trophies"`
	AttackWins  int    `json:"attackWins"`
	DefenseWins int    `json:"defenseWins"`
	Rank        int    `json:"rank"`
}

type ClanLegendHistoryItem struct {
	Season      string `json:"season"`
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	Trophies    int    `json:"trophies"`
	AttackWins  int    `json:"attackWins"`
	DefenseWins int    `json:"defenseWins"`
	Rank        int    `json:"rank"`
}
