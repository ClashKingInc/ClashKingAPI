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

type SearchGroup struct {
	GroupID string   `json:"group_id"`
	UserID  string   `json:"user_id"`
	Type    string   `json:"type" enums:"player,clan"`
	Name    string   `json:"name"`
	Tags    []string `json:"tags"`
}

type SearchGroupCreateResponse struct {
	Success bool   `json:"success"`
	GroupID string `json:"group_id"`
}

type SuccessResponse struct {
	Success bool `json:"success"`
}

type SearchGroupListResponse struct {
	Items []SearchGroup `json:"items"`
}
