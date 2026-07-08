package routes

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestProxyRecentTargetDetectsPlayersAndClans(t *testing.T) {
	entityType, tag, ok := proxyRecentTarget("v1/players/%232PP?realtime=true")
	if !ok {
		t.Fatal("expected player proxy path to be recordable")
	}
	if entityType != "player" || tag != "#2PP" {
		t.Fatalf("unexpected player target: %s %s", entityType, tag)
	}

	entityType, tag, ok = proxyRecentTarget("/v1/clans/2ABC")
	if !ok {
		t.Fatal("expected clan proxy path to be recordable")
	}
	if entityType != "clan" || tag != "#2ABC" {
		t.Fatalf("unexpected clan target: %s %s", entityType, tag)
	}

	if _, _, ok := proxyRecentTarget("v1/players/%232PP/battlelog"); ok {
		t.Fatal("did not expect nested player path to be recordable")
	}
}

func TestSearchRecentGroupedResponseUsesPlayersAndClansJSON(t *testing.T) {
	body, err := json.Marshal(modelsv2.SearchRecentGroupedResponse{
		Players: []modelsv2.SearchRecentPlayerItem{{Name: "Player", Tag: "#2PP", TownHallLevel: 17}},
		Clans:   []modelsv2.SearchRecentClanItem{{Name: "Clan", Tag: "#CLAN", BadgeURLs: &modelsv2.SearchRecentBadgeURLs{Large: "large.png"}}},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	raw := string(body)
	for _, field := range []string{`"players"`, `"clans"`} {
		if !strings.Contains(raw, field) {
			t.Fatalf("expected %s field in response JSON: %s", field, raw)
		}
	}
	if strings.Contains(raw, `"items"`) {
		t.Fatalf("did not expect single items list in grouped response JSON: %s", raw)
	}
	for _, field := range []string{`"type"`, `"player_tag"`, `"clan_tag"`} {
		if strings.Contains(raw, field) {
			t.Fatalf("did not expect stale recent field %s in response JSON: %s", field, raw)
		}
	}
}

func TestSearchRecentItemJSONFieldOrderMatchesClashStyle(t *testing.T) {
	createdAt := time.Date(2026, 7, 7, 12, 0, 0, 0, time.UTC)
	player, err := json.Marshal(modelsv2.SearchRecentPlayerItem{
		Name:          "Player",
		Tag:           "#2PP",
		TownHallLevel: 17,
		Clan: &modelsv2.SearchRecentClan{
			Tag:       "#CLAN",
			Name:      "Clan",
			BadgeURLs: &modelsv2.SearchRecentBadgeURLs{Large: "large.png"},
		},
		League: &modelsv2.SearchRecentLeague{
			ID:       29000022,
			Name:     "Legend League",
			IconURLs: &modelsv2.SearchRecentLeagueIconURLs{Medium: "medium.png"},
		},
		CreatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("marshal player: %v", err)
	}
	assertJSONFieldOrder(t, string(player), []string{`"name"`, `"tag"`, `"townHallLevel"`, `"clan"`, `"league"`, `"created_at"`})

	clan, err := json.Marshal(modelsv2.SearchRecentClanItem{
		Name:      "Clan",
		Tag:       "#CLAN",
		BadgeURLs: &modelsv2.SearchRecentBadgeURLs{Large: "large.png"},
		Members:   44,
		CreatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("marshal clan: %v", err)
	}
	assertJSONFieldOrder(t, string(clan), []string{`"name"`, `"tag"`, `"badgeUrls"`, `"members"`, `"created_at"`})
}

func assertJSONFieldOrder(t *testing.T, payload string, fields []string) {
	t.Helper()

	last := -1
	for _, field := range fields {
		index := strings.Index(payload, field)
		if index == -1 {
			t.Fatalf("expected %s in JSON payload: %s", field, payload)
		}
		if index < last {
			t.Fatalf("expected %s after previous fields in JSON payload: %s", field, payload)
		}
		last = index
	}
}

func TestRecentSnapshotDataKeepsOfficialDisplayFields(t *testing.T) {
	body := []byte(`{
		"name": "Player",
		"townHallLevel": 17,
		"clan": {
			"tag": "#CLAN",
			"name": "Clan",
			"badgeUrls": {
				"small": "small.png",
				"large": "large.png"
			}
		},
		"league": {
			"id": 29000022,
			"name": "Legend League",
			"iconUrls": {
				"small": "small.png",
				"medium": "medium.png"
			}
		},
		"expLevel": 250
	}`)

	data := recentSnapshotData("player", body)
	if data["name"] != "Player" || data["townHallLevel"] != 17 {
		t.Fatalf("unexpected player snapshot: %#v", data)
	}
	if data["expLevel"] != nil {
		t.Fatalf("unexpected extra player field in snapshot: %#v", data)
	}
	clan := data["clan"].(map[string]any)
	badgeURLs := clan["badgeUrls"].(map[string]any)
	if badgeURLs["large"] != "large.png" || badgeURLs["small"] != nil {
		t.Fatalf("unexpected clan badge urls: %#v", badgeURLs)
	}
	league := data["league"].(map[string]any)
	iconURLs := league["iconUrls"].(map[string]any)
	if iconURLs["medium"] != "medium.png" || iconURLs["small"] != nil {
		t.Fatalf("unexpected league icon urls: %#v", iconURLs)
	}
}

func TestRecentItemFromDataFlattensStoredSnapshot(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"name":      "Clan",
		"badgeUrls": map[string]any{"large": "large.png"},
		"members":   44,
	})
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}

	createdAt := time.Now().UTC()
	item := recentItemFromData("clan", "#CLAN", raw, createdAt)
	if item.Tag != "#CLAN" {
		t.Fatalf("unexpected recent item identity: %#v", item)
	}
	if item.Name != "Clan" || item.Members != 44 {
		t.Fatalf("unexpected recent item display fields: %#v", item)
	}
	if item.BadgeURLs == nil || item.BadgeURLs.Large != "large.png" {
		t.Fatalf("unexpected badge urls: %#v", item.BadgeURLs)
	}
}
