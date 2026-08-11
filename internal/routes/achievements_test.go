package routes

import (
	"encoding/json"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	clashy "github.com/clashkinginc/clashy.go"
)

func TestAchievementCatalogIncludesAllAchievements(t *testing.T) {
	t.Parallel()

	response := achievementCatalog(map[string]int{
		townhall18AchievementID: 2,
		warWarriorAchievementID: 1,
	})
	if len(response.Items) != 4 {
		t.Fatalf("items length = %d, want 4", len(response.Items))
	}

	wantIDs := []string{
		townhall18AchievementID,
		warWarriorAchievementID,
		mrLegendAchievementID,
		defenseDoesntMatterAchievementID,
	}
	for index, wantID := range wantIDs {
		item := response.Items[index]
		if item.ID != wantID {
			t.Errorf("item %d id = %q, want %q", index, item.ID, wantID)
		}
		if !item.Repeatable {
			t.Errorf("item %q is not repeatable", item.ID)
		}
		if !strings.HasPrefix(item.AssetURL, achievementAssetBaseURL) || !strings.HasSuffix(item.AssetURL, ".glb") {
			t.Errorf("item %q has unexpected asset URL %q", item.ID, item.AssetURL)
		}
	}
	if response.Items[2].EarnedCount != 0 || response.Items[3].EarnedCount != 0 {
		t.Fatalf("unwired Legend achievements should remain unearned: %#v", response.Items)
	}
}

func TestEvaluatedAchievementIDsOnlyWiresTownhallAndWarWarrior(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		player clashy.Player
		want   []string
	}{
		{name: "neither", player: clashy.Player{TownHall: 17, WarStars: 4999}},
		{name: "townhall", player: clashy.Player{TownHall: 18, WarStars: 4999}, want: []string{townhall18AchievementID}},
		{name: "war warrior", player: clashy.Player{TownHall: 17, WarStars: 5000}, want: []string{warWarriorAchievementID}},
		{name: "both", player: clashy.Player{TownHall: 18, WarStars: 5000}, want: []string{townhall18AchievementID, warWarriorAchievementID}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := evaluatedAchievementIDs(&test.player)
			if strings.Join(got, ",") != strings.Join(test.want, ",") {
				t.Fatalf("ids = %v, want %v", got, test.want)
			}
		})
	}
}

func TestAchievementResponseJSONContract(t *testing.T) {
	t.Parallel()

	body, err := json.Marshal(achievementCatalog(map[string]int{townhall18AchievementID: 3}))
	if err != nil {
		t.Fatal(err)
	}
	var response modelsv2.AchievementsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	jsonBody := string(body)
	for _, field := range []string{`"items"`, `"id"`, `"asset_url"`, `"repeatable"`, `"earned_count"`} {
		if !strings.Contains(jsonBody, field) {
			t.Errorf("response is missing %s: %s", field, jsonBody)
		}
	}
	if strings.Contains(jsonBody, "observed_value") || strings.Contains(jsonBody, "source") {
		t.Fatalf("response contains an excluded field: %s", jsonBody)
	}
}
