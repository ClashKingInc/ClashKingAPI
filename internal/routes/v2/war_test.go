package v2

import "testing"

func TestWarSummaryResponseMatchesAppContract(t *testing.T) {
	result := warSummaryResponse("2qpcjqq2u", false, true, nil, nil, []any{
		nil,
		map[string]any{
			"war_tag": "#WAR1",
			"state":   "inWar",
			"clan": map[string]any{
				"tag": "#2QPCJQQ2U",
			},
			"opponent": map[string]any{
				"tag": "#VY2J0LL",
			},
		},
		nil,
	})

	if got := result["clan_tag"]; got != "#2QPCJQQ2U" {
		t.Fatalf("expected normalized clan_tag, got %v", got)
	}
	if got := result["isInCwl"]; got != true {
		t.Fatalf("expected isInCwl=true, got %v", got)
	}

	warInfo, ok := result["war_info"].(map[string]any)
	if !ok {
		t.Fatalf("expected war_info map, got %T", result["war_info"])
	}
	if got := warInfo["state"]; got != "notInWar" {
		t.Fatalf("expected default notInWar state, got %v", got)
	}

	leagueWars, ok := result["war_league_infos"].([]any)
	if !ok {
		t.Fatalf("expected war_league_infos slice, got %T", result["war_league_infos"])
	}
	if len(leagueWars) != 1 {
		t.Fatalf("expected nil league wars to be filtered out, got %d items", len(leagueWars))
	}
}

func TestWarSummaryInfoMapRemovesInvalidCurrentWarInfo(t *testing.T) {
	info := warSummaryInfoMap(map[string]any{
		"state":          "war",
		"currentWarInfo": nil,
		"bypass":         false,
	})

	if got := info["state"]; got != "war" {
		t.Fatalf("expected state to be preserved, got %v", got)
	}
	if _, exists := info["currentWarInfo"]; exists {
		t.Fatal("expected nil currentWarInfo to be removed from payload")
	}
	if got := info["bypass"]; got != false {
		t.Fatalf("expected bypass to be preserved, got %v", got)
	}
}
