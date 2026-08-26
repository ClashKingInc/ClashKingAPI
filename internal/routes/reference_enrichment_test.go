package routes

import "testing"

func TestBuildLeagueReferencesIncludesOnlyIdentity(t *testing.T) {
	items := []map[string]any{{"_id": float64(48000018), "name": "Champion League I"}}
	reference := buildLeagueReferences(items)[48000018]
	if reference.ID != 48000018 || reference.Name != "Champion League I" {
		t.Fatalf("reference = %#v", reference)
	}
}
