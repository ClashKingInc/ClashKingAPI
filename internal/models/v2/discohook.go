package modelsv2

import "encoding/json"

type DiscohookResolveResponse struct {
	Payload     json.RawMessage `json:"payload,omitempty"`
	ResolvedURL string          `json:"resolvedUrl,omitempty"`
}
