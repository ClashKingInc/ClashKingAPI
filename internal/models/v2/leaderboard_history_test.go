package modelsv2

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLeaderboardHistoryItemUsesTypedCamelCaseContract(t *testing.T) {
	value := 42
	item := LeaderboardHistoryItem{
		Tag:                   "#P0Y",
		Name:                  "Player",
		ExpLevel:              &value,
		BuilderBaseTrophies:   &value,
		BuilderBaseBattleWins: &value,
		BuilderBaseLeague: &LeaderboardHistoryLeagueReference{
			ID: 44000041,
		},
		Rank: 1,
	}
	raw, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, field := range []string{
		`"tag":"#P0Y"`,
		`"expLevel":42`,
		`"builderBaseTrophies":42`,
		`"builderBaseBattleWins":42`,
		`"builderBaseLeague":{"id":44000041}`,
	} {
		if !strings.Contains(body, field) {
			t.Fatalf("response missing %s: %s", field, body)
		}
	}
	for _, forbidden := range []string{
		"exp_level",
		"builder_base_trophies",
		"badgeToken",
		`"data"`,
		`"kind"`,
		`"trophies"`,
		`"league"`,
	} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("response exposes %q: %s", forbidden, body)
		}
	}
}

func TestLeaderboardHistoryClanLocationAndBadgeReferencesAreTyped(t *testing.T) {
	points := 50000
	item := LeaderboardHistoryItem{
		Tag:  "#CLAN",
		Name: "Clan",
		Rank: 2,
		BadgeURLs: &PublicBadgeURLs{
			Small: "small", Medium: "medium", Large: "large",
		},
		ClanPoints: &points,
		Location: &LeaderboardHistoryLocationReference{
			ID:            32000006,
			Name:          "United States",
			IsCountry:     true,
			CountryCode:   "US",
			LocalizedName: "United States",
		},
	}
	raw, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, field := range []string{
		`"badgeUrls":{"small":"small","medium":"medium","large":"large"}`,
		`"clanPoints":50000`,
		`"location":{"id":32000006,"name":"United States","isCountry":true,"countryCode":"US","localizedName":"United States"}`,
	} {
		if !strings.Contains(body, field) {
			t.Fatalf("response missing %s: %s", field, body)
		}
	}
}
