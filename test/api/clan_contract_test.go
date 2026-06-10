package api_test

import (
	"testing"

	routes "github.com/ClashKingInc/ClashKingAPI/internal/routes"
	clashy "github.com/clashkinginc/clashy.go"
)

func TestBuildLeagueIconLookupUsesStaticDataURLs(t *testing.T) {
	icons := routes.BuildLeagueIconLookupForTest(
		[]map[string]any{
			{"name": "Master League I", "icon": "/war_leagues/master-league-i.png"},
		},
		[]map[string]any{
			{"name": "Unranked", "icon": "/league_tiers/unranked.png"},
			{"name": "Legend League", "icon": "/league_tiers/legend.png"},
		},
	)

	if got := icons["Master League I"].Medium; got != "https://coc-assets.clashk.ing/war_leagues/master-league-i.png" {
		t.Fatalf("expected Master League I icon URL, got %q", got)
	}
	if got := icons["Unranked"].Medium; got != "https://coc-assets.clashk.ing/league_tiers/unranked.png" {
		t.Fatalf("expected Unranked icon URL, got %q", got)
	}
	if _, exists := icons["Legend League"]; exists {
		t.Fatal("expected non-Unranked league_tiers entries to be ignored")
	}
}

func TestEnrichClanLeagueIconsFillsMissingWarLeagueIcon(t *testing.T) {
	clan := &clashy.Clan{
		Tag: "#CLAN",
		WarLeague: &clashy.BaseLeague{
			ID:   48000015,
			Name: "Master League I",
		},
	}

	routes.EnrichClanLeagueIconsForTest(clan, map[string]*clashy.Icon{
		"Master League I": {
			Small:  "small-url",
			Medium: "medium-url",
			Tiny:   "tiny-url",
		},
	})

	if clan.WarLeague.Icon == nil {
		t.Fatal("expected warLeague icon to be added")
	}
	if got := clan.WarLeague.Icon.Medium; got != "medium-url" {
		t.Fatalf("expected medium icon URL, got %q", got)
	}
}

func TestEnrichClanPayloadLeagueIconsMergesIconUrls(t *testing.T) {
	result := routes.EnrichClanPayloadLeagueIconsForTest(
		map[string]any{
			"tag": "#CLAN",
			"warLeague": map[string]any{
				"name": "Master League I",
				"iconUrls": map[string]any{
					"small": "existing-small",
				},
			},
		},
		map[string]*clashy.Icon{
			"Master League I": {
				Small:  "fallback-small",
				Medium: "medium-url",
				Tiny:   "tiny-url",
			},
		},
	)

	warLeague := result["warLeague"].(map[string]any)
	iconURLs := warLeague["iconUrls"].(map[string]any)

	if got := iconURLs["small"]; got != "existing-small" {
		t.Fatalf("expected existing small icon to be preserved, got %v", got)
	}
	if got := iconURLs["medium"]; got != "medium-url" {
		t.Fatalf("expected medium icon to be added, got %v", got)
	}
	if got := iconURLs["tiny"]; got != "tiny-url" {
		t.Fatalf("expected tiny icon to be added, got %v", got)
	}
}

func TestEnrichLeagueInfoIconsAddsCWLLeagueIconURLs(t *testing.T) {
	result := routes.EnrichLeagueInfoIconsForTest(
		map[string]any{
			"war_league": "Master League I",
			"clans": []any{
				map[string]any{
					"tag": "#CLAN",
					"warLeague": map[string]any{
						"name": "Master League I",
					},
				},
			},
		},
		map[string]*clashy.Icon{
			"Master League I": {
				Small:  "small-url",
				Medium: "medium-url",
				Tiny:   "tiny-url",
			},
		},
	)

	topLevelIcons := result["iconUrls"].(map[string]any)
	if got := topLevelIcons["medium"]; got != "medium-url" {
		t.Fatalf("expected top-level league_info icon, got %v", got)
	}

	clan := result["clans"].([]any)[0].(map[string]any)
	warLeague := clan["warLeague"].(map[string]any)
	iconURLs := warLeague["iconUrls"].(map[string]any)
	if got := iconURLs["medium"]; got != "medium-url" {
		t.Fatalf("expected clan warLeague icon, got %v", got)
	}
}
