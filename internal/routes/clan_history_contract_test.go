package routes

import (
	"encoding/json"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestCachedClanMembersUsesOfficialTownHallField(t *testing.T) {
	members := cachedClanMembers([]any{map[string]any{
		"tag": "#P1", "name": "Player", "town_hall": float64(17),
	}})
	if len(members) != 1 || members[0].TownHallLevel != 17 {
		t.Fatalf("unexpected cached members: %#v", members)
	}
	payload, err := json.Marshal(members)
	if err != nil {
		t.Fatal(err)
	}
	encoded := string(payload)
	if encoded != `[{"tag":"#P1","name":"Player","townHallLevel":17}]` {
		t.Fatalf("unexpected cached member JSON: %s", encoded)
	}
}

func TestClanChangeValuesUsePrimitivesAndLeagueReferences(t *testing.T) {
	references := referenceCatalog{
		warLeagues: map[int]modelsv2.LeagueReference{
			48000014: {ID: 48000014, Name: "Crystal League I"},
		},
		capitalLeagues: map[int]modelsv2.LeagueReference{
			85000015: {ID: 85000015, Name: "Gold League II"},
		},
	}
	tests := []struct {
		changeType string
		raw        string
		want       any
	}{
		{changeType: "description", raw: `"Old description"`, want: "Old description"},
		{changeType: "clan_level", raw: `19`, want: 19},
		{changeType: "cwl_league_id", raw: `48000014`, want: modelsv2.LeagueReference{ID: 48000014, Name: "Crystal League I"}},
		{changeType: "capital_league_id", raw: `85000015`, want: modelsv2.LeagueReference{ID: 85000015, Name: "Gold League II"}},
	}
	for _, test := range tests {
		got, err := clanChangeValue(test.changeType, []byte(test.raw), references)
		if err != nil {
			t.Fatalf("change value %s: %v", test.changeType, err)
		}
		if got != test.want {
			t.Fatalf("change value %s = %#v, want %#v", test.changeType, got, test.want)
		}
	}
}

func TestClanChangeStorageTypesAreLimitedToDocumentedOptions(t *testing.T) {
	for apiType, storageType := range map[string]string{
		"": "", "description": "description", "clanLevel": "clan_level",
		"warLeague": "cwl_league_id", "capitalLeague": "capital_league_id",
	} {
		got, err := clanChangeStorageType(apiType)
		if err != nil || got != storageType {
			t.Fatalf("storage type %q = %q, %v", apiType, got, err)
		}
	}
	if _, err := clanChangeStorageType("name"); err == nil {
		t.Fatal("unsupported clan change type unexpectedly succeeded")
	}
}

func TestMergeClanWarLogItemsPrefersOfficialAndAppliesWarLimit(t *testing.T) {
	official := clanWarLogItem{EndTime: "20260803T120000.000Z", Type: "random", Opponent: clanWarLogClanSide{Tag: "#A"}, Clan: clanWarLogClanSide{Name: "Official"}}
	duplicate := official
	duplicate.Clan.Name = "Stored"
	older := clanWarLogItem{EndTime: "20260703T120000.000Z", Type: "cwl", Opponent: clanWarLogClanSide{Tag: "#B"}}
	items := mergeClanWarLogItems([]clanWarLogItem{official}, []clanWarLogItem{duplicate, older}, 1)
	if len(items) != 1 || items[0].Clan.Name != "Official" {
		t.Fatalf("unexpected merged war log: %#v", items)
	}
}
