package routes

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestDecodeCWLRoundTagsSupportsMigratedAndTrackerShapes(t *testing.T) {
	want := [][]string{{"#WAR1", "#WAR2"}, {"#WAR3"}}
	for name, raw := range map[string]string{
		"migrated official shape": `[{"warTags":["#WAR1","#WAR2"]},{"warTags":["#WAR3"]}]`,
		"tracker compact shape":   `[["#WAR1","#WAR2"],["#WAR3"]]`,
	} {
		t.Run(name, func(t *testing.T) {
			if got := decodeCWLRoundTags([]byte(raw)); !reflect.DeepEqual(got, want) {
				t.Fatalf("decodeCWLRoundTags() = %#v, want %#v", got, want)
			}
		})
	}
}

func TestHydrateCWLRoundsMatchesLegacyNestedShape(t *testing.T) {
	warTag := "#WAR1"
	war := cwlStoredWarResponse{
		officialWarResponse: officialWarResponse{State: "warEnded", Tag: &warTag},
		Season:              "2026-07-02",
	}
	rounds := hydrateCWLRounds([][]string{{"#WAR1", "#MISSING"}}, map[string]cwlStoredWarResponse{"#WAR1": war})
	encoded, err := json.Marshal(rounds)
	if err != nil {
		t.Fatal(err)
	}
	var payload []map[string][]map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatal(err)
	}
	if payload[0]["warTags"][0]["tag"] != "#WAR1" || payload[0]["warTags"][0]["season"] != "2026-07-02" {
		t.Fatalf("stored war was not nested with its season: %s", encoded)
	}
	if _, exists := payload[0]["warTags"][0]["battleModifier"]; exists {
		t.Fatalf("legacy CWL wars must omit battleModifier: %s", encoded)
	}
	if !reflect.DeepEqual(payload[0]["warTags"][1], map[string]any{"tag": "#MISSING"}) {
		t.Fatalf("missing war placeholder = %#v", payload[0]["warTags"][1])
	}
}

func TestStoredCWLResponseIncludesWarLeague(t *testing.T) {
	encoded, err := json.Marshal(modelsv2.CWLResponse{
		Season: "2026-07",
		State:  "ended",
		WarLeague: &modelsv2.LeagueReference{
			ID: 48000018, Name: "Champion League I", IconURL: "https://example.com/champion.png",
		},
		Clans:  []modelsv2.CWLStoredGroupClan{},
		Rounds: []modelsv2.CWLGroupRound{},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatal(err)
	}
	warLeague, ok := payload["warLeague"].(map[string]any)
	if !ok || warLeague["id"] != float64(48000018) || warLeague["name"] != "Champion League I" {
		t.Fatalf("warLeague = %#v", payload["warLeague"])
	}
}

func TestCWLSeasonResponseIncludesCalculatedWarSummary(t *testing.T) {
	rank, stars, destruction := 2, 301, 95.1
	raw, err := json.Marshal(modelsv2.CWLSeasonsResponse{Items: []modelsv2.CWLSeasonItem{{
		Season: "2026-07", State: "ended",
		WarLeague:   &modelsv2.LeagueReference{ID: 48000015, Name: "Master League I"},
		Rank:        &rank,
		Stars:       &stars,
		Destruction: &destruction,
		Rounds:      &modelsv2.CWLRankingRounds{Won: 6, Tied: 0, Lost: 1},
	}}})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string][]map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	item := payload["items"][0]
	if item["rank"] != float64(2) || item["stars"] != float64(301) || item["destruction"] != 95.1 {
		t.Fatalf("standing summary = %s", raw)
	}
	rounds := item["rounds"].(map[string]any)
	if rounds["won"] != float64(6) || rounds["tied"] != float64(0) || rounds["lost"] != float64(1) {
		t.Fatalf("round record = %s", raw)
	}
}

func TestCWLSeasonsNeverReadsStandingsTable(t *testing.T) {
	raw, err := os.ReadFile("cwl.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "cwl_standings") {
		t.Fatal("CWL seasons must calculate from stored wars, not read cwl_standings")
	}
}
