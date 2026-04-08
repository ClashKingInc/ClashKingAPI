package modelsv2

// CurrentDatesResponse is returned by GET /v2/dates/current.
type CurrentDatesResponse struct {
	Season    any `json:"season"`
	Raid      any `json:"raid"`
	Legend    any `json:"legend"`
	ClanGames any `json:"clan-games"`
}

// SeasonBoundsResponse is returned by GET /v2/dates/season-start-end.
type SeasonBoundsResponse struct {
	SeasonStart string `json:"season_start"`
	SeasonEnd   string `json:"season_end"`
}
