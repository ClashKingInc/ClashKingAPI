package modelsv2

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSharedLinksResponseUsesItemsEnvelopeWithoutVisibilityMetadata(t *testing.T) {
	payload, err := json.Marshal(SharedLinksLookupResponse{Items: []SharedLink{}})
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != `{"items":[]}` {
		t.Fatalf("empty response = %s", payload)
	}

	payload, err = json.Marshal(SharedLinksLookupResponse{Items: []SharedLink{{
		IsVerified: true,
		PlayerTag:  "#2PP",
		UserID:     "123456789012345678",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	body := string(payload)
	for _, required := range []string{`"is_verified":true`, `"player_tag":"#2PP"`, `"user_id":"123456789012345678"`} {
		if !strings.Contains(body, required) {
			t.Fatalf("response missing %s: %s", required, body)
		}
	}
	for _, forbidden := range []string{`"hidden"`, `"discord_id"`, `"links"`} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("response exposes obsolete field %s: %s", forbidden, body)
		}
	}
}
