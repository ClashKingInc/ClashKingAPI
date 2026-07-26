package modelsv2

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestClanCategoryModelsUseCamelCaseJSON(t *testing.T) {
	preview, err := json.Marshal(ClanCategoryDeletePreviewResponse{
		Category: ClanCategory{
			ID: "category-1", ServerID: "server-1", Name: "CWL", ClanCount: 10,
		},
		AffectedClanCount: 10,
	})
	if err != nil {
		t.Fatalf("marshal preview: %v", err)
	}
	previewJSON := string(preview)
	for _, field := range []string{`"serverId"`, `"clanCount"`, `"affectedClanCount"`} {
		if !strings.Contains(previewJSON, field) {
			t.Fatalf("preview omits %s: %s", field, previewJSON)
		}
	}

	deleted, err := json.Marshal(ClanCategoryDeleteResponse{
		CategoryID: "category-1", Name: "CWL",
		Deleted: true, UncategorizedClanCount: 10,
	})
	if err != nil {
		t.Fatalf("marshal delete response: %v", err)
	}
	deleteJSON := string(deleted)
	for _, field := range []string{`"categoryId"`, `"uncategorizedClanCount"`} {
		if !strings.Contains(deleteJSON, field) {
			t.Fatalf("delete response omits %s: %s", field, deleteJSON)
		}
	}

	for _, stale := range []string{
		"server_id", "clan_count", "affected_clan_count",
		"category_id", "uncategorized_clan_count",
	} {
		if strings.Contains(previewJSON, stale) || strings.Contains(deleteJSON, stale) {
			t.Fatalf("category models expose snake_case field %q", stale)
		}
	}
}

func TestClanSettingsResponseReturnsSharedCategoryRepresentation(t *testing.T) {
	body, err := json.Marshal(ClanSettingsResponse{
		Message:       "updated",
		ServerID:      1,
		ClanTag:       "#2PP",
		UpdatedFields: 1,
		Category: &ClanCategory{
			ID: "category-1", ServerID: "server-1", Name: "CWL", ClanCount: 3,
		},
	})
	if err != nil {
		t.Fatalf("marshal clan settings response: %v", err)
	}
	text := string(body)
	for _, field := range []string{`"category"`, `"serverId"`, `"clanCount"`} {
		if !strings.Contains(text, field) {
			t.Fatalf("assignment response omits shared category field %s: %s", field, text)
		}
	}
}
