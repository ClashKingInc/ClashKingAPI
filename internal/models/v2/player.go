package modelsv2

// PlayerTagsRequest is the standard request body for endpoints accepting a list of player tags.
type PlayerTagsRequest struct {
	PlayerTags []string `json:"player_tags"`
}

// PlayerLocationItem is a single row returned by POST /v2/players/location.
type PlayerLocationItem struct {
	Tag         string  `json:"tag"`
	CountryName *string `json:"country_name"`
	CountryCode *string `json:"country_code"`
}

// PlayerSortedItem is a single row returned by POST /v2/players/sorted/:attribute.
type PlayerSortedItem struct {
	Name  string         `json:"name"`
	Tag   string         `json:"tag"`
	Value any            `json:"value"`
	Clan  map[string]any `json:"clan"`
}

// PlayerSummaryCategoryEntry is one player entry inside a summary category.
type PlayerSummaryCategoryEntry struct {
	Tag   string `json:"tag"`
	Value any    `json:"value"`
	Count int    `json:"count"`
}

// PlayerLegendDaysItem is a single row returned by POST /v2/players/legend-days.
type PlayerLegendDaysItem struct {
	Tag             string `json:"tag"`
	LegendsBySeason any    `json:"legends_by_season"`
}

// PlayerLegendRankingItem is a single row returned by POST /v2/players/legend_rankings.
type PlayerLegendRankingItem struct {
	Tag      string `json:"tag"`
	Rankings []any  `json:"rankings"`
}
