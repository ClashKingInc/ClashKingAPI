package modelsv2

type Achievement struct {
	ID          string `json:"id"`
	AssetURL    string `json:"asset_url"`
	Repeatable  bool   `json:"repeatable"`
	EarnedCount int    `json:"earned_count"`
}

type AchievementsResponse struct {
	Items []Achievement `json:"items"`
}
