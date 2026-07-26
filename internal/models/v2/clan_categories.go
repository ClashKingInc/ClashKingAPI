package modelsv2

type ClanCategory struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Name      string `json:"name"`
	ClanCount int    `json:"clanCount"`
}

type ClanCategoriesResponse struct {
	Items []ClanCategory `json:"items"`
	Total int            `json:"total"`
}

type CreateClanCategoryRequest struct {
	Name string `json:"name"`
}

type RenameClanCategoryRequest struct {
	Name string `json:"name"`
}

type ClanCategoryCreateResponse struct {
	Category ClanCategory `json:"category"`
}

type ClanCategoryRenameResponse struct {
	Category ClanCategory `json:"category"`
}

type ClanCategoryDeletePreviewResponse struct {
	Category          ClanCategory `json:"category"`
	AffectedClanCount int          `json:"affectedClanCount"`
}

type ClanCategoryDeleteResponse struct {
	CategoryID             string `json:"categoryId"`
	Name                   string `json:"name"`
	Deleted                bool   `json:"deleted"`
	UncategorizedClanCount int    `json:"uncategorizedClanCount"`
}
