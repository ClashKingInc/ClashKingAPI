package modelsv2

// CurrentDatesResponse is returned by GET /v2/dates/current.
type CurrentDatesResponse struct {
	Season    string `json:"season"`
	Raid      string `json:"raid"`
	Legend    string `json:"legend"`
	ClanGames string `json:"clan-games"`
}

type DateItemsResponse struct {
	Items []string `json:"items"`
}

// SeasonBoundsResponse is returned by GET /v2/dates/season-start-end.
type SeasonBoundsResponse struct {
	SeasonStart string `json:"season_start"`
	SeasonEnd   string `json:"season_end"`
}
