package server

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

type giveawayTestRow struct{}

func (giveawayTestRow) Scan(dest ...any) error {
	channelID, imageURL, messageID, eventPending := "222", "giveaway-1.png", "333", "giveaway_start"
	start := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	eventPendingAt := start.Add(-time.Minute)
	createdAt := start.Add(-time.Hour)
	updatedAt := start.Add(time.Minute)

	*dest[0].(*string) = "giveaway-1"
	*dest[1].(*string) = "111"
	*dest[2].(*string) = "A prize"
	*dest[3].(**string) = &channelID
	*dest[4].(*string) = "ended"
	*dest[5].(**time.Time) = &start
	*dest[6].(**time.Time) = &end
	*dest[7].(*int) = 2
	*dest[8].(*[]string) = []string{"@here"}
	*dest[9].(*string) = "above"
	*dest[10].(*string) = "inside"
	*dest[11].(*string) = "after"
	*dest[12].(**string) = &imageURL
	*dest[13].(*bool) = true
	*dest[14].(*bool) = true
	*dest[15].(*string) = "allow"
	*dest[16].(*[]string) = []string{"role-1"}
	*dest[17].(*[]byte) = []byte(`[{"value":2,"roles":["role-1"]}]`)
	*dest[18].(*[]byte) = []byte(`["user-1",{"user_id":"user-2"}]`)
	*dest[19].(*[]byte) = []byte(`[{"user_id":"user-1","status":"winner"}]`)
	*dest[20].(*bool) = true
	*dest[21].(**string) = &messageID
	*dest[22].(**string) = &eventPending
	*dest[23].(**time.Time) = &eventPendingAt
	*dest[24].(*time.Time) = createdAt
	*dest[25].(*time.Time) = updatedAt
	return nil
}

func TestGiveawayTypedScanAndCamelCaseModel(t *testing.T) {
	doc, err := giveawayScan(giveawayTestRow{})
	if err != nil {
		t.Fatalf("scan typed giveaway: %v", err)
	}
	if _, found := doc["data"]; found {
		t.Fatal("typed giveaway scan must not recreate removed data JSONB")
	}

	encoded, err := json.Marshal(giveawayModel(doc, nil))
	if err != nil {
		t.Fatalf("marshal giveaway response: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(encoded, &response); err != nil {
		t.Fatalf("decode giveaway response: %v", err)
	}
	for _, field := range []string{
		"id", "serverId", "prize", "channelId", "status", "start", "end", "winners",
		"mentions", "textAboveEmbed", "textInEmbed", "textOnEnd", "imageUrl",
		"profilePictureRequired", "cocAccountRequired", "rolesMode", "roles", "boosters",
		"entries", "winnersList", "updated", "messageId", "eventPending", "eventPendingAt",
		"createdAt", "updatedAt",
	} {
		if _, found := response[field]; !found {
			t.Errorf("response missing %q: %s", field, encoded)
		}
	}
	for _, obsolete := range []string{"server_id", "channel_id", "start_time", "entry_count", "winners_list", "created_at"} {
		if _, found := response[obsolete]; found {
			t.Errorf("response leaked snake_case field %q: %s", obsolete, encoded)
		}
	}
}

func TestGiveawayWinnersExposeCurrentServerMembership(t *testing.T) {
	memberName := "Current member"
	avatarURL := "https://cdn.discordapp.com/avatar.png"
	winners := giveawayWinners([]any{
		map[string]any{"user_id": "1", "username": "Stored member", "status": "winner"},
		map[string]any{"user_id": "2", "username": "Former member", "status": "winner"},
	}, map[string]giveawayUserIdentity{
		"1": {DisplayName: &memberName, AvatarURL: &avatarURL},
	})

	if len(winners) != 2 {
		t.Fatalf("winner count = %d, want 2", len(winners))
	}
	if !winners[0].InServer || winners[0].Username == nil || *winners[0].Username != memberName {
		t.Fatalf("current member identity = %#v", winners[0])
	}
	if winners[1].InServer || winners[1].Username == nil || *winners[1].Username != "Former member" {
		t.Fatalf("former member identity = %#v", winners[1])
	}
}

func TestGiveawayPublicImageURLExpandsCanonicalFilename(t *testing.T) {
	got := giveawayPublicImageURL("123e4567-e89b-12d3-a456-426614174000.png")
	if got == nil || *got != "https://cdn.clashk.ing/giveaway_123e4567-e89b-12d3-a456-426614174000.png" {
		t.Fatalf("giveawayPublicImageURL() = %#v", got)
	}
	for _, invalid := range []any{"", "folder/image.png", "https://cdn.clashk.ing/giveaway_image.png"} {
		if got := giveawayPublicImageURL(invalid); got != nil {
			t.Errorf("giveawayPublicImageURL(%q) = %q, want nil", invalid, *got)
		}
	}
}

func TestGiveawaySQLUsesOnlyTypedColumnsAcrossFlows(t *testing.T) {
	source, err := os.ReadFile("giveaways.go")
	if err != nil {
		t.Fatalf("read giveaways route: %v", err)
	}
	text := string(source)
	for _, required := range []string{
		"func getServerGiveaways", "func getServerGiveaway", "func createServerGiveaway",
		"func updateServerGiveaway", "func deleteServerGiveaway", "func getGiveawayEntries",
		"func rerollGiveawayWinners", "mentions, text_above_embed, text_in_embed, text_on_end, image_url",
		"profile_picture_required, coc_account_required, roles_mode, roles, boosters",
		"entries, winners_list, updated, message_id, event_pending, event_pending_at",
		"created_at, updated_at", "updated = EXCLUDED.updated", "event_pending_at = EXCLUDED.event_pending_at",
	} {
		if !strings.Contains(text, required) {
			t.Errorf("giveaway typed flow missing %q", required)
		}
	}
	for _, obsolete := range []string{"data, created_at", "data = EXCLUDED.data", "decodeJSONAny(dataRaw)", "data jsonb"} {
		if strings.Contains(text, obsolete) {
			t.Errorf("giveaway route still depends on removed data JSONB via %q", obsolete)
		}
	}
}
