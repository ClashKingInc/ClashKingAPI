package modelsv2

type BanRequest struct {
	Reason  string `json:"reason"`
	AddedBy any    `json:"added_by"`
	Image   string `json:"image"`
}
