package routes

import (
	"testing"

	clashy "github.com/clashkinginc/clashy.go"
)

func TestPlayerStructToMapKeepsLeagueAlias(t *testing.T) {
	response := playerStructToMap(&clashy.Player{
		Tag:        "#PLAYER",
		LeagueTier: clashy.League{ID: 29000022, Name: "Legend League"},
	})

	league := response["league"].(map[string]any)
	leagueTier := response["leagueTier"].(map[string]any)
	if league["name"] != "Legend League" || leagueTier["name"] != "Legend League" {
		t.Fatalf("expected league and leagueTier aliases, got %#v", response)
	}
}

func TestLegacyClashyClanResponseKeepsMemberContract(t *testing.T) {
	response := legacyClashyClanResponse(&clashy.Clan{
		Tag:   "#CLAN",
		Name:  "Clan",
		Level: 20,
		Members: []clashy.ClanMember{{
			Tag:        "#PLAYER",
			TownHall:   18,
			LeagueTier: clashy.League{ID: 29000022, Name: "Legend League"},
		}},
	})

	if _, ok := response["warLeague"]; ok {
		t.Fatal("expected an empty value-typed war league to remain omitted")
	}
	if response["members"] != 1 {
		t.Fatalf("expected member count fallback, got %#v", response["members"])
	}
	member := response["memberList"].([]any)[0].(map[string]any)
	if _, ok := member["leagueTier"]; ok {
		t.Fatal("expected the renamed clan-member leagueTier field to remain hidden")
	}
	if member["league"].(map[string]any)["name"] != "Legend League" {
		t.Fatalf("expected legacy clan-member league field, got %#v", member)
	}
	if _, ok := member["townHallLevel"]; ok {
		t.Fatal("expected the new clashy.go-only clan-member field to remain hidden")
	}
	if member["clan"].(map[string]any)["tag"] != "#CLAN" {
		t.Fatalf("expected legacy member clan context, got %#v", member["clan"])
	}
}
