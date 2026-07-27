package modelsv2

// PlayerTagsRequest is the standard request body for endpoints accepting a list of player tags.
type PlayerTagsRequest struct {
	PlayerTags []string `json:"player_tags"`
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
