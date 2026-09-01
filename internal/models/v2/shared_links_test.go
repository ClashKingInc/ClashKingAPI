package modelsv2

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSharedLinksResponsesKeepStableEmptyListsAndNullableGrant(t *testing.T) {
	payload, err := json.Marshal(SharedLinksConsentResponse{
		Application: SharedLinksApplication{ID: "app-id", Name: "Example"},
		Accounts:    []SharedLinksAccount{},
		Grant:       nil,
	})
	if err != nil {
		t.Fatal(err)
	}
	body := string(payload)
	for _, required := range []string{`"accounts":[]`, `"grant":null`} {
		if !strings.Contains(body, required) {
			t.Fatalf("response missing %s: %s", required, body)
		}
	}

	lookup, err := json.Marshal(SharedLinksLookupResponse{Links: []SharedLink{}})
	if err != nil {
		t.Fatal(err)
	}
	if string(lookup) != `{"links":[]}` {
		t.Fatalf("lookup response = %s", lookup)
	}
}
