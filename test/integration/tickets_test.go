//go:build integration

package integration_test

// Fix #275 — PUT /v2/server/:id/tickets/:panel with an empty string for a channel
// field must remove the field from MongoDB ($unset), not set it to null.

import (
	"fmt"
	"net/url"
	"testing"
)

func TestTickets_Shape(t *testing.T) {
	sid := serverID(t)
	status, body := do(t, "GET", fmt.Sprintf("/v2/server/%s/tickets", sid), nil)
	requireStatus(t, status, 200, body)
	getSlice(t, body, "items")
}

func TestTickets_EmptyChannelUnsetField(t *testing.T) {
	sid := serverID(t)

	// Get panels
	_, list := do(t, "GET", fmt.Sprintf("/v2/server/%s/tickets", sid), nil)
	items := getSlice(t, list, "items")
	if len(items) == 0 {
		t.Skip("no ticket panels found — skipping")
	}

	// Find panel by name or use first
	var panel map[string]any
	pn := panelName()
	for _, raw := range items {
		p := raw.(map[string]any)
		if p["name"] == pn {
			panel = p
			break
		}
	}
	if panel == nil {
		panel = items[0].(map[string]any)
	}

	name := panel["name"].(string)
	originalCategory, _ := panel["open_category"].(string) // may be "" if not set

	// Send empty string — should $unset the field
	status, resp := do(t, "PUT",
		fmt.Sprintf("/v2/server/%s/tickets/%s", sid, url.PathEscape(name)),
		jsonBody(map[string]any{"open_category": ""}),
	)
	requireStatus(t, status, 200, resp)

	// Re-fetch and verify field is absent or null (not a non-empty string)
	_, after := do(t, "GET", fmt.Sprintf("/v2/server/%s/tickets", sid), nil)
	afterItems := getSlice(t, after, "items")

	var updated map[string]any
	for _, raw := range afterItems {
		p := raw.(map[string]any)
		if p["name"] == name {
			updated = p
			break
		}
	}
	if updated == nil {
		t.Fatalf("panel %q not found after update", name)
	}

	category := updated["open_category"]
	if s, ok := category.(string); ok && s != "" {
		t.Errorf("expected open_category to be absent/null after clearing, got %q", s)
	}

	// Restore original value if it was set
	if originalCategory != "" {
		do(t, "PUT",
			fmt.Sprintf("/v2/server/%s/tickets/%s", sid, url.PathEscape(name)),
			jsonBody(map[string]any{"open_category": originalCategory}),
		)
	}
}
