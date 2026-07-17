package modelsv2

type TrackingPlayerListRequest struct {
	Tags []string `json:"tags"`
}

type TrackingPlayersResponse struct {
	Status                string   `json:"status"`
	PlayersAdded          []string `json:"players_added,omitempty"`
	PlayersAlreadyTracked []string `json:"players_already_tracked,omitempty"`
	PlayersRemoved        []string `json:"players_removed,omitempty"`
}
