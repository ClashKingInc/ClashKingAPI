package server

import (
	"encoding/json"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestDecodeEmbedJSONPreservesLargeIntegers(t *testing.T) {
	decoded, ok := decodeEmbedJSON([]byte(`{"application_id":9007199254740993}`)).(map[string]any)
	if !ok {
		t.Fatalf("expected an object, got %#v", decoded)
	}
	applicationID, ok := decoded["application_id"].(json.Number)
	if !ok || applicationID.String() != "9007199254740993" {
		t.Fatalf("expected the large integer to remain exact, got %#v", decoded["application_id"])
	}

	if got := decodeEmbedJSON(nil); got != nil {
		t.Fatalf("expected empty JSON to return nil, got %#v", got)
	}
	if got := decodeEmbedJSON([]byte(`{"invalid"`)); got != nil {
		t.Fatalf("expected invalid JSON to return nil, got %#v", got)
	}
}

func TestTicketEmbedFromMapPreservesPayload(t *testing.T) {
	payload := map[string]any{"content": "welcome", "application_id": json.Number("9007199254740993")}
	got := ticketEmbedFromMap(payload)
	if got["content"] != "welcome" || got["application_id"] != json.Number("9007199254740993") {
		t.Fatalf("expected payload to be returned unchanged, got %#v", got)
	}
}

func TestNormalizeApproveMessagesKeepsOnlyFirstNamedMessage(t *testing.T) {
	got := normalizeApproveMessages([]modelsv2.ApproveMessage{
		{Name: "", Message: "ignored"},
		{Name: "first", Message: "message one"},
		{Name: "second", Message: "message two"},
	})

	if len(got) != 1 {
		t.Fatalf("expected exactly one approve message, got %d", len(got))
	}
	if got[0].Name != "first" || got[0].Message != "message one" {
		t.Fatalf("expected first valid message to be kept, got %+v", got[0])
	}
}

func TestTicketApproveMessagesReturnsSingleEntry(t *testing.T) {
	got := ticketApproveMessages([]any{
		map[string]any{"name": "first", "message": "message one"},
		map[string]any{"name": "second", "message": "message two"},
	})

	if len(got) != 1 {
		t.Fatalf("expected exactly one approve message, got %d", len(got))
	}
	if got[0].Name != "first" || got[0].Message != "message one" {
		t.Fatalf("expected first stored message to be returned, got %+v", got[0])
	}
}

func TestTicketTownhallRequirementFields(t *testing.T) {
	got := ticketTownhallRequirementFields()
	want := []string{"BK", "AQ", "GW", "RC", "WARST"}

	if len(got) != len(want) {
		t.Fatalf("expected %d requirement fields, got %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected field %d to be %q, got %q", i, want[i], got[i])
		}
	}
}
