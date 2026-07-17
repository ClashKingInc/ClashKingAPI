package modelsv2

type PlayerWarStatsExportRequest struct {
	PlayerTag      string  `json:"player_tag"`
	TimestampStart float64 `json:"timestamp_start"`
	TimestampEnd   float64 `json:"timestamp_end"`
	Limit          int     `json:"limit"`
}
