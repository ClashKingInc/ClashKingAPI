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

func TestExtractLeagueWarTagsFiltersZerosAndDuplicates(t *testing.T) {
	tags := extractLeagueWarTags(map[string]any{
		"rounds": []any{
			map[string]any{"warTags": []any{"#AAA", "#0", "#BBB"}},
			map[string]any{"warTags": []any{"#BBB", "#CCC"}},
		},
	})

	if len(tags) != 3 {
		t.Fatalf("expected 3 unique war tags, got %d (%v)", len(tags), tags)
	}
	if tags[0] != "#AAA" || tags[1] != "#BBB" || tags[2] != "#CCC" {
		t.Fatalf("unexpected war tag order/content: %v", tags)
	}
}

func TestEnrichLeagueInfoBuildsRanksFromProxyWars(t *testing.T) {
	result := enrichLeagueInfo(
		map[string]any{
			"state": "inWar",
			"clans": []any{
				map[string]any{"tag": "#A", "name": "A"},
				map[string]any{"tag": "#B", "name": "B"},
			},
		},
		[]map[string]any{
			{
				"state": "warEnded",
				"clan": map[string]any{
					"tag":                   "#A",
					"stars":                 30,
					"destructionPercentage": 95.5,
				},
				"opponent": map[string]any{
					"tag":                   "#B",
					"stars":                 28,
					"destructionPercentage": 90.1,
				},
			},
		},
	)

	clans := result["clans"].([]any)
	first := clans[0].(map[string]any)
	second := clans[1].(map[string]any)

	if first["tag"] != "#A" || first["rank"] != 1 {
		t.Fatalf("expected #A to rank first, got %+v", first)
	}
	if second["tag"] != "#B" || second["rank"] != 2 {
		t.Fatalf("expected #B to rank second, got %+v", second)
	}
	if first["wars_played"] != 1 || second["wars_played"] != 1 {
		t.Fatalf("expected wars_played to be populated, got first=%v second=%v", first["wars_played"], second["wars_played"])
	}
}
