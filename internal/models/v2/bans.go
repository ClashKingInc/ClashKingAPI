package modelsv2

type BanRequest struct {
	Reason  string `json:"reason"`
	AddedBy string `json:"added_by"`
	Image   string `json:"image"`
}
