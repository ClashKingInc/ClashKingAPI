package api_test

import (
	"testing"

	routesv2 "github.com/ClashKingInc/ClashKingAPI/internal/routes/v2"
)

func TestWarSummaryResponseMatchesAppContract(t *testing.T) {
	result := routesv2.WarSummaryResponseForTest("2qpcjqq2u", false, true, nil, nil, []any{
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
	info := routesv2.WarSummaryInfoMapForTest(map[string]any{
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
	tags := routesv2.ExtractLeagueWarTagsForTest(map[string]any{
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
	result := routesv2.EnrichLeagueInfoForTest(
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

func TestEnrichLeagueInfoEnrichesMemberStatsForMobile(t *testing.T) {
	result := routesv2.EnrichLeagueInfoForTest(
		map[string]any{
			"state": "inWar",
			"clans": []any{
				map[string]any{
					"tag":  "#A",
					"name": "A",
					"members": []any{
						map[string]any{"tag": "#A1", "name": "Alpha", "townHallLevel": 15},
						map[string]any{"tag": "#A2", "name": "Bench", "townHallLevel": 16},
					},
				},
				map[string]any{
					"tag":  "#B",
					"name": "B",
					"members": []any{
						map[string]any{"tag": "#B1", "name": "Beta", "townHallLevel": 14},
					},
				},
			},
		},
		[]map[string]any{
			{
				"state": "warEnded",
				"clan": map[string]any{
					"tag":                   "#A",
					"stars":                 3,
					"destructionPercentage": 100.0,
					"members": []any{
						map[string]any{
							"tag":           "#A1",
							"name":          "Alpha",
							"mapPosition":   1,
							"townhallLevel": 15,
							"attacks": []any{
								map[string]any{
									"stars":                 3,
									"destructionPercentage": 100.0,
									"order":                 1,
									"defenderTag":           "#B1",
								},
							},
							"bestOpponentAttack": map[string]any{
								"stars":                 1,
								"destructionPercentage": 50.0,
								"order":                 2,
								"attackerTag":           "#B1",
							},
						},
					},
				},
				"opponent": map[string]any{
					"tag":                   "#B",
					"stars":                 1,
					"destructionPercentage": 50.0,
					"members": []any{
						map[string]any{
							"tag":           "#B1",
							"name":          "Beta",
							"mapPosition":   1,
							"townhallLevel": 14,
							"attacks": []any{
								map[string]any{
									"stars":                 1,
									"destructionPercentage": 50.0,
									"order":                 2,
									"defenderTag":           "#A1",
								},
							},
							"bestOpponentAttack": map[string]any{
								"stars":                 3,
								"destructionPercentage": 100.0,
								"order":                 1,
								"attackerTag":           "#A1",
							},
						},
					},
				},
			},
		},
	)

	clanA := result["clans"].([]any)[0].(map[string]any)
	if clanA["attack_count"] != 1 {
		t.Fatalf("expected clan attack_count to be enriched, got %v", clanA["attack_count"])
	}
	if clanA["missed_attacks"] != 0 {
		t.Fatalf("expected clan missed_attacks to be enriched, got %v", clanA["missed_attacks"])
	}
	if clanA["total_destruction"] != 50.0 {
		t.Fatalf("expected defensive destruction total, got %v", clanA["total_destruction"])
	}
	if clanA["total_destruction_inflicted"] != 100.0 {
		t.Fatalf("expected offensive destruction total, got %v", clanA["total_destruction_inflicted"])
	}

	townHallLevels := clanA["town_hall_levels"].(map[string]int)
	if townHallLevels["15"] != 1 || townHallLevels["16"] != 1 {
		t.Fatalf("expected town_hall_levels to be populated, got %+v", townHallLevels)
	}

	members := clanA["members"].([]any)
	alpha := members[0].(map[string]any)
	bench := members[1].(map[string]any)

	if alpha["attackLowerTHLevel"] != 1 {
		t.Fatalf("expected lower TH attack count, got %v", alpha["attackLowerTHLevel"])
	}
	if alpha["defenseLowerTHLevel"] != 1 {
		t.Fatalf("expected lower TH defense count, got %v", alpha["defenseLowerTHLevel"])
	}

	attacks := alpha["attacks"].(map[string]any)
	if attacks["attack_count"] != 1 || attacks["missed_attacks"] != 0 {
		t.Fatalf("expected attack stats to be enriched, got %+v", attacks)
	}
	if attacks["3_stars"].(map[string]int)["14"] != 1 {
		t.Fatalf("expected TH bucketed attack stars, got %+v", attacks["3_stars"])
	}

	defense := alpha["defense"].(map[string]any)
	if defense["defense_count"] != 1 || defense["missed_defenses"] != 0 {
		t.Fatalf("expected defense stats to be enriched, got %+v", defense)
	}
	if defense["1_star"].(map[string]int)["14"] != 1 {
		t.Fatalf("expected TH bucketed defense stars, got %+v", defense["1_star"])
	}

	benchAttacks := bench["attacks"].(map[string]any)
	benchDefense := bench["defense"].(map[string]any)
	if benchAttacks["attack_count"] != 0 || benchDefense["defense_count"] != 0 {
		t.Fatalf("expected bench member to get zeroed stats, got attacks=%+v defense=%+v", benchAttacks, benchDefense)
	}
}
