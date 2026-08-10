package routes

import (
	"encoding/json"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestJoinLeaveBuildResponseShapesClanAndPlayerItems(t *testing.T) {
	row := joinLeaveEventRow{
		Time: time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC),
		Type: "join", ClanTag: "#CLAN", ClanName: "Clan",
		PlayerTag: "#PLAYER", PlayerName: "Player", Townhall: 17,
	}
	const baseURL = "https://dev-api.clashk.ing"
	clan := joinLeaveBuildResponse([]joinLeaveEventRow{row}, 4438, 927, 50, joinLeaveScopeClan, baseURL)
	if clan["available"] != 4438 || clan["uniquePlayers"] != 927 {
		t.Fatalf("unexpected clan totals: %#v", clan)
	}
	clanItem := clan["items"].([]JoinLeaveEventAlias)[0]
	if clanItem.Clan != nil {
		t.Fatal("clan history items must not repeat clan metadata")
	}

	player := joinLeaveBuildResponse([]joinLeaveEventRow{row}, 12, 1, 50, joinLeaveScopePlayer, baseURL)
	if _, exists := player["uniquePlayers"]; exists {
		t.Fatal("player history must not expose the clan-only uniquePlayers summary")
	}
	playerItem := player["items"].([]JoinLeaveEventAlias)[0]
	if playerItem.Clan == nil || playerItem.Clan.Tag != "#CLAN" {
		t.Fatalf("player history must retain clan metadata: %#v", playerItem.Clan)
	}
	if playerItem.Clan.Badge != "https://dev-api.clashk.ing/v2/clan/%23CLAN/badge" {
		t.Fatalf("player history must use the v2 clan badge endpoint: %q", playerItem.Clan.Badge)
	}

	leave := row
	leave.Type = "leave"
	leave.Time = row.Time.Add(time.Hour)
	totals := joinLeaveClanTotals(
		[]joinLeaveEventRow{row, leave},
		joinLeaveWindow{start: row.Time, end: leave.Time},
		baseURL,
	)
	totalClan := totals[0]["clan"].(map[string]any)
	if totalClan["badge"] != "https://dev-api.clashk.ing/v2/clan/%23CLAN/badge" {
		t.Fatalf("player clan totals must use the v2 clan badge endpoint: %#v", totalClan)
	}
}

// Alias keeps the assertion readable while retaining the concrete slice type.
type JoinLeaveEventAlias = modelsv2.JoinLeaveEvent

func TestReconstructedWarLogUsesOfficialItemShape(t *testing.T) {
	attacks := 2
	war := officialWarResponse{
		TeamSize: 15, AttacksPerMember: &attacks, EndTime: "20260803T120000.000Z",
		Clan:     officialWarClan{Tag: "#CLAN", Stars: 40, DestructionPercentage: 96.2},
		Opponent: officialWarClan{Tag: "#OTHER", Stars: 38, DestructionPercentage: 94.1},
	}
	encoded, err := json.Marshal(buildClanWarLogItem(war))
	if err != nil {
		t.Fatal(err)
	}
	var item map[string]any
	if err := json.Unmarshal(encoded, &item); err != nil {
		t.Fatal(err)
	}
	if item["result"] != "win" {
		t.Fatalf("expected win, got %v", item["result"])
	}
	for _, forbidden := range []string{"state", "members", "preparationStartTime", "startTime"} {
		if _, exists := item[forbidden]; exists {
			t.Fatalf("reconstructed war-log item exposed non-warlog field %s", forbidden)
		}
	}
}
