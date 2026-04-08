package modelsv2

type AccountsCOCAccountRequest struct {
	PlayerTag   string `json:"player_tag"`
	APIToken    string `json:"api_token"`
	PlayerToken string `json:"player_token"`
}

type AccountsReorderAccountsRequest struct {
	OrderedTags []string `json:"ordered_tags"`
}
