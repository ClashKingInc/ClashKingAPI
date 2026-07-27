package modelsv2

import (
	"encoding/json"
	"testing"
)

func TestClanRankingsResponseUsesExactCamelCaseCategories(t *testing.T) {
	payload, err := json.Marshal(ClanRankingsResponse{
		Tag: "#2PP",
		HomeVillage: ClanRankingCategory{
			Points: 53123,
			Placements: []ClanRankingPlacement{{
				LocationID: "global",
				Rank:       18,
				Points:     53100,
			}},
		},
		BuilderBase: ClanRankingCategory{Placements: []ClanRankingPlacement{}},
		ClanCapital: ClanRankingCategory{Placements: []ClanRankingPlacement{}},
	})
	if err != nil {
		t.Fatalf("marshal ClanRankingsResponse: %v", err)
	}

	var response map[string]any
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("decode ClanRankingsResponse: %v", err)
	}
	for _, field := range []string{"name", "tag", "badge", "homeVillage", "builderBase", "clanCapital"} {
		if _, exists := response[field]; !exists {
			t.Fatalf("response missing %q: %s", field, payload)
		}
	}
	for _, obsolete := range []string{
		"location",
		"clanPoints",
		"warWins",
		"warWinStreak",
		"donations",
		"donationsReceived",
		"globalRank",
		"localRank",
	} {
		if _, exists := response[obsolete]; exists {
			t.Fatalf("response exposes obsolete field %q: %s", obsolete, payload)
		}
	}

	homeVillage := response["homeVillage"].(map[string]any)
	placements := homeVillage["placements"].([]any)
	placement := placements[0].(map[string]any)
	for _, field := range []string{"locationId", "rank", "points"} {
		if _, exists := placement[field]; !exists {
			t.Fatalf("placement missing %q: %s", field, payload)
		}
	}
	for _, obsolete := range []string{"global", "local", "globalRank", "localRank", "countryCode", "countryName", "updatedAt"} {
		if _, exists := placement[obsolete]; exists {
			t.Fatalf("placement exposes obsolete field %q: %s", obsolete, payload)
		}
	}
}
