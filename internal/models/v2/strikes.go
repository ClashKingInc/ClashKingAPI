package modelsv2

type StrikeRequest struct {
	Reason       string `json:"reason"`
	AddedBy      string `json:"added_by"`
	RolloverDays int    `json:"rollover_days"`
	StrikeWeight int    `json:"strike_weight"`
	Image        string `json:"image"`
}

type StrikeSummaryResponse struct {
	PlayerTag    string       `json:"player_tag"`
	ServerID     int          `json:"server_id"`
	TotalStrikes int          `json:"total_strikes"`
	TotalWeight  int          `json:"total_weight"`
	Strikes      []StrikeItem `json:"strikes"`
}
