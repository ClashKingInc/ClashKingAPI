package routes

import (
	"testing"
)

func TestDecodeTownhallLeaderboardPreservesLeagueBadgesAndLimit(t *testing.T) {
	raw := []byte(`{
		"generated_at":"2026-07-21T05:00:00Z",
		"items":[
			{"rank":1,"tag":"#ONE","name":"One","clan":{"tag":"#CLAN","name":"Clan","badge":"clan.png"},"league":{"id":105000036,"name":"Legend I","badge":"legend-i.png"},"townhall_level":18,"trophies":5513},
			{"rank":2,"tag":"#TWO","name":"Two","league":{"id":105000035,"name":"Legend II","badge":"legend-ii.png"},"townhall_level":18,"trophies":5400}
		]
	}`)

	response, err := decodeTownhallLeaderboard(raw, 18, 1)
	if err != nil {
		t.Fatalf("decodeTownhallLeaderboard() error = %v", err)
	}
	if response.Townhall == nil || *response.Townhall != 18 {
		t.Fatalf("townhall = %#v, want 18", response.Townhall)
	}
	if response.Count != 1 || len(response.Items) != 1 {
		t.Fatalf("count/items = %d/%d, want 1/1", response.Count, len(response.Items))
	}
	item := response.Items[0]
	if item.League == nil || item.League.Badge != "legend-i.png" {
		t.Fatalf("league = %#v, want Legend I badge", item.League)
	}
	if item.Clan == nil || item.Clan.Badge != "clan.png" {
		t.Fatalf("clan = %#v, want clan badge", item.Clan)
	}
	if response.GeneratedAt == nil {
		t.Fatal("generated_at should be preserved")
	}
}

func TestDecodeTownhallLeaderboardRejectsInvalidJSON(t *testing.T) {
	if _, err := decodeTownhallLeaderboard([]byte(`{"items":`), 18, 500); err == nil {
		t.Fatal("decodeTownhallLeaderboard() error = nil, want error")
	}
}

func TestDecodeLeagueLeaderboardPreservesClanAndLeagueBadges(t *testing.T) {
	raw := []byte(`{
		"generated_at":"2026-07-21T05:00:00Z",
		"items":[
			{"rank":1,"tag":"#ONE","name":"One","clan":{"tag":"#CLAN","name":"Clan","badge":"clan.png"},"league":{"id":105000036,"name":"Legend League 1","badge":"legend-1.png"},"townhall_level":18,"trophies":724}
		]
	}`)

	response, err := decodeLeagueLeaderboard(raw, 105000036, 500)
	if err != nil {
		t.Fatalf("decodeLeagueLeaderboard() error = %v", err)
	}
	if response.LeagueTierID == nil || *response.LeagueTierID != 105000036 {
		t.Fatalf("league_tier_id = %#v, want 105000036", response.LeagueTierID)
	}
	if response.Count != 1 || len(response.Items) != 1 {
		t.Fatalf("count/items = %d/%d, want 1/1", response.Count, len(response.Items))
	}
	item := response.Items[0]
	if item.League == nil || item.League.Badge != "legend-1.png" {
		t.Fatalf("league = %#v, want Legend League 1 badge", item.League)
	}
	if item.Clan == nil || item.Clan.Badge != "clan.png" {
		t.Fatalf("clan = %#v, want clan badge", item.Clan)
	}
}
