package modelsv2

type SearchClanResult struct {
	Name        string `json:"name"`
	Tag         string `json:"tag"`
	MemberCount int    `json:"memberCount"`
	Level       int    `json:"level"`
	WarLeague   string `json:"warLeague"`
	Type        string `json:"type"`
}

type SearchClanResponse struct {
	Items []SearchClanResult `json:"items"`
}

type SearchPlayerReference struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type SearchPlayerReferenceResponse struct {
	Items []SearchPlayerReference `json:"items"`
}

type SuccessResponse struct {
	Success bool `json:"success"`
}
