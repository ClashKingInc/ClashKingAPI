package modelsv2

type DiscohookResolveResponse struct {
	Payload     any    `json:"payload,omitempty"`
	ResolvedURL string `json:"resolvedUrl,omitempty"`
}
