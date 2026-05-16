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
