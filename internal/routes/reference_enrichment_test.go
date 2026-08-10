package routes

import "testing"

func TestBuildLeagueReferencesUsesSingularProgrammaticIconURL(t *testing.T) {
	items := []map[string]any{{"_id": float64(48000018), "name": "Champion League I"}}
	reference := buildLeagueReferences(items, "cwl")[48000018]
	if reference.ID != 48000018 || reference.Name != "Champion League I" {
		t.Fatalf("reference = %#v", reference)
	}
	if reference.IconURL != "https://assets.clashk.ing/leagues/cwl/champion_league_1.png" {
		t.Fatalf("iconUrl = %q", reference.IconURL)
	}
}

func TestLeagueIconURLSupportsGeneratedLeagueFamilies(t *testing.T) {
	for name, want := range map[string]string{
		"Bronze League III": "bronze_league_3.png",
		"Legend League":     "legend_league.png",
		"Skeleton League 1": "skeleton_league_1.png",
	} {
		if got := leagueIconURL("league-tier", name); got != "https://assets.clashk.ing/leagues/league-tier/"+want {
			t.Errorf("leagueIconURL(%q) = %q", name, got)
		}
	}
}
