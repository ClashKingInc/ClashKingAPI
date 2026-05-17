package server

import (
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

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
	got := ticketApproveMessages(bson.A{
		bson.M{"name": "first", "message": "message one"},
		bson.M{"name": "second", "message": "message two"},
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

func TestNormalizeEmbedPayloadCoercesWholeNumberFloatsRecursively(t *testing.T) {
	got := normalizeEmbedPayload(map[string]any{
		"color": float64(16711680),
		"author": map[string]any{
			"icon_width": float64(64),
		},
		"fields": []any{
			map[string]any{"inline": true, "order": float64(1)},
			float64(1.5),
		},
	}).(map[string]any)

	if color, ok := got["color"].(int64); !ok || color != 16711680 {
		t.Fatalf("expected top-level color to be coerced to int64, got %#v", got["color"])
	}

	author, ok := got["author"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested author map, got %T", got["author"])
	}
	if width, ok := author["icon_width"].(int64); !ok || width != 64 {
		t.Fatalf("expected nested whole number to be coerced to int64, got %#v", author["icon_width"])
	}

	fields, ok := got["fields"].([]any)
	if !ok {
		t.Fatalf("expected fields slice, got %T", got["fields"])
	}
	firstField, ok := fields[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first field map, got %T", fields[0])
	}
	if order, ok := firstField["order"].(int64); !ok || order != 1 {
		t.Fatalf("expected slice item whole number to be coerced to int64, got %#v", firstField["order"])
	}
	if decimal, ok := fields[1].(float64); !ok || decimal != 1.5 {
		t.Fatalf("expected non-integer float to be preserved, got %#v", fields[1])
	}
}
