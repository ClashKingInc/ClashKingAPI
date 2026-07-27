package modelsv2

import "encoding/json"

type LegendHistoryClan struct {
	Tag       string          `json:"tag"`
	Name      string          `json:"name"`
	BadgeURLs PublicBadgeURLs `json:"badgeUrls"`
}

type LegendHistoryLeague struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"`
	IconURLs PublicIconURLs `json:"iconUrls"`
}

// LegendHistoryItem documents the official final Legend ranking item while
// retaining any additional official fields stored in data.
type LegendHistoryItem struct {
	Season        string               `json:"season"`
	Tag           string               `json:"tag"`
	Name          string               `json:"name"`
	ExpLevel      int                  `json:"expLevel"`
	Trophies      int                  `json:"trophies"`
	AttackWins    int                  `json:"attackWins"`
	DefenseWins   int                  `json:"defenseWins"`
	Rank          int                  `json:"rank"`
	PreviousRank  int                  `json:"previousRank"`
	Clan          *LegendHistoryClan   `json:"clan,omitempty"`
	League        *LegendHistoryLeague `json:"league,omitempty"`
	TownHallLevel int                  `json:"townHallLevel,omitempty"`
	stored        map[string]any
}

func (item *LegendHistoryItem) UnmarshalJSON(data []byte) error {
	type wire LegendHistoryItem
	var decoded wire
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var stored map[string]any
	if err := json.Unmarshal(data, &stored); err != nil {
		return err
	}
	*item = LegendHistoryItem(decoded)
	item.stored = stored
	return nil
}

func (item LegendHistoryItem) MarshalJSON() ([]byte, error) {
	stored := make(map[string]any, len(item.stored)+4)
	for key, value := range item.stored {
		stored[key] = value
	}
	stored["season"] = item.Season
	stored["tag"] = item.Tag
	stored["rank"] = item.Rank
	stored["trophies"] = item.Trophies
	return json.Marshal(stored)
}

type LegendSeasonHistoryResponse struct {
	Items []LegendHistoryItem `json:"items"`
}

type PlayerLegendHistoryResponse struct {
	Items []LegendHistoryItem `json:"items"`
}
