package modelsv2

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPlayerStatChangeUsesResponseSpecificCamelCaseShape(t *testing.T) {
	eventTime := time.Date(2026, time.July, 28, 12, 30, 0, 0, time.UTC)
	change := PlayerStatChange{
		EventTime:     eventTime,
		StatType:      PlayerStatTypeCapitalGoldDonated,
		PreviousValue: 100,
		CurrentValue:  175,
		Delta:         75,
	}

	encoded, err := json.Marshal(change)
	if err != nil {
		t.Fatalf("marshal player stat change: %v", err)
	}
	var object map[string]any
	if err := json.Unmarshal(encoded, &object); err != nil {
		t.Fatalf("decode player stat change: %v", err)
	}
	for _, field := range []string{
		"eventTime",
		"clanTag",
		"statType",
		"previousValue",
		"currentValue",
		"delta",
	} {
		if _, ok := object[field]; !ok {
			t.Fatalf("player stat change missing %s", field)
		}
	}
	for _, obsolete := range []string{
		"playerTag",
		"season",
		"trophies",
		"loot",
		"activity",
		"activityScore",
		"attackWins",
		"townHallLevel",
		"lastOnline",
		"data",
	} {
		if _, ok := object[obsolete]; ok {
			t.Fatalf("player stat change exposes unsupported field %s", obsolete)
		}
	}
	if object["clanTag"] != nil {
		t.Fatalf("expected nullable clanTag, got %#v", object["clanTag"])
	}
	if object["statType"] != "capital_gold_donated" {
		t.Fatalf("unexpected statType %#v", object["statType"])
	}
}

func TestPlayerStatTypeConstantsMatchDatabaseCheck(t *testing.T) {
	got := []PlayerStatType{
		PlayerStatTypeDonated,
		PlayerStatTypeReceived,
		PlayerStatTypeClanGames,
		PlayerStatTypeCapitalGoldDonated,
	}
	want := []PlayerStatType{
		"donated",
		"received",
		"clan_games",
		"capital_gold_donated",
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("stat type %d = %q, want %q", index, got[index], want[index])
		}
	}
}
