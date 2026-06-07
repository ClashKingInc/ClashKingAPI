//go:build integration

package integration_test

// Fix #300: POST /v2/server/:id/giveaways must initialise entries: [].
// Before the fix, giveawayBuildDocument() never set the field, causing the bot to
// fail when trying to push entries into a non-existent array.

import (
	"fmt"
	"testing"
	"time"
)

func TestGiveaway_EntryCountIsZeroOnCreate(t *testing.T) {
	sid := serverID(t)
	endTime := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)

	// Create a minimal giveaway
	status, body := doMultipart(t, fmt.Sprintf("/v2/server/%s/giveaways", sid), map[string]string{
		"prize":            "[integration-test] delete me",
		"now":              "true",
		"end_time":         endTime,
		"winners":          "1",
		"channel_id":       "0",
		"mentions_json":    "[]",
		"roles_json":       "[]",
		"boosters_json":    "[]",
		"roles_mode":       "none",
		"text_above_embed": "",
		"text_in_embed":    "",
		"text_on_end":      "",
	})
	requireStatus(t, status, 200, body)

	giveawayID := getString(t, body, "giveaway_id")
	t.Cleanup(func() {
		do(t, "DELETE", fmt.Sprintf("/v2/server/%s/giveaways/%s", sid, giveawayID), nil)
	})

	// Fetch the specific giveaway and verify entry_count = 0
	getStatus, giveaway := do(t, "GET", fmt.Sprintf("/v2/server/%s/giveaways/%s", sid, giveawayID), nil)
	requireStatus(t, getStatus, 200, giveaway)

	entryCount := getFloat(t, giveaway, "entry_count")
	if entryCount != 0 {
		t.Errorf("expected entry_count = 0 on new giveaway, got %v", entryCount)
	}
}
