package routes

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

type cwlPlayerSeedTestRow struct{}

func (cwlPlayerSeedTestRow) Scan(dest ...any) error {
	*dest[0].(*string) = "internal-cwl"
	*dest[1].(*string) = "2026-07"
	*dest[2].(*int) = 17
	*dest[3].(*pgtype.Int4) = pgtype.Int4{Int32: 48000017, Valid: true}
	*dest[4].(*pgtype.Int2) = pgtype.Int2{Int16: 15, Valid: true}
	*dest[5].(*string) = "#CLAN"
	*dest[6].(*string) = "Clan"
	*dest[7].(*string) = "badge-token"
	*dest[8].(*pgtype.Int4) = pgtype.Int4{Int32: 312, Valid: true}
	*dest[9].(*pgtype.Int4) = pgtype.Int4{Int32: 6, Valid: true}
	*dest[10].(*pgtype.Int4) = pgtype.Int4{Int32: 1, Valid: true}
	*dest[11].(*pgtype.Int4) = pgtype.Int4{Int32: 0, Valid: true}
	*dest[12].(*pgtype.Int4) = pgtype.Int4{Int32: 2, Valid: true}
	*dest[13].(*pgtype.Int4) = pgtype.Int4{Int32: 24, Valid: true}
	return nil
}

func TestScanCWLPlayerHistorySeedBuildsBadgeAndPersistedStandingFacts(t *testing.T) {
	seed, err := scanCWLPlayerHistorySeed(cwlPlayerSeedTestRow{})
	if err != nil {
		t.Fatal(err)
	}
	if seed.CWLID != "internal-cwl" {
		t.Fatalf("internal cwl id = %q", seed.CWLID)
	}
	if seed.LeagueID != 48000017 || seed.Item.TeamSize == nil || *seed.Item.TeamSize != 15 {
		t.Fatalf("unexpected league/team size: %#v", seed.Item)
	}
	if seed.Item.Clan.BadgeURLs.Medium != "https://api-assets.clashofclans.com/badges/200/badge-token.png" {
		t.Fatalf("badgeUrls = %#v", seed.Item.Clan.BadgeURLs)
	}
	if seed.Item.Clan.TotalStars == nil || *seed.Item.Clan.TotalStars != 312 ||
		seed.Item.Clan.Wars == nil || seed.Item.Clan.Wars.Won != 6 {
		t.Fatalf("standing facts = %#v", seed.Item.Clan)
	}
	if seed.Item.Clan.Placement == nil || *seed.Item.Clan.Placement.Group != 2 ||
		*seed.Item.Clan.Placement.Global != 24 {
		t.Fatalf("clan placement = %#v", seed.Item.Clan.Placement)
	}
}

func TestDecodeCWLRoundTagsAcceptsStoredAndOfficialShapes(t *testing.T) {
	for name, raw := range map[string]string{
		"stored":   `[["#WAR1"],["#WAR2","#0"]]`,
		"official": `[{"warTags":["#WAR1"]},{"warTags":["#WAR2","#0"]}]`,
	} {
		t.Run(name, func(t *testing.T) {
			got := decodeCWLRoundTags([]byte(raw))
			if len(got) != 2 || len(got[0]) != 1 || got[0][0] != "#WAR1" || len(got[1]) != 2 || got[1][0] != "#WAR2" {
				t.Fatalf("decoded rounds = %#v", got)
			}
		})
	}
}

func TestCWLPlayerHistoryResponseUsesDedicatedCamelCaseShape(t *testing.T) {
	response := modelsv2.CWLPlayerHistoryResponse{
		Items: []modelsv2.CWLPlayerHistoryItem{{
			Season: "2026-07", TownHallLevel: 17,
			Clan: modelsv2.CWLPlayerHistoryClan{
				Tag: "#CLAN", Name: "Clan",
				BadgeURLs: modelsv2.WarBadgeURLs{Small: "small", Medium: "medium", Large: "large"},
				WarLeague: &modelsv2.LeagueReference{ID: 48000017, Name: "Champion League II"},
			},
			Attacks: []modelsv2.CWLPlayerHistoryAttack{},
		}},
	}
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal CWL player history: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode CWL player history: %v", err)
	}
	if len(decoded) != 1 {
		t.Fatalf("outer response must contain only items, got %s", raw)
	}
	item := decoded["items"].([]any)[0].(map[string]any)
	for _, field := range []string{"season", "townHallLevel", "teamSize", "clan", "attacks", "placement", "missedAttacks"} {
		if _, found := item[field]; !found {
			t.Errorf("history item missing %q", field)
		}
	}
	for _, obsolete := range []string{"state", "rounds", "standing", "members", "clanLevel"} {
		if _, found := item[obsolete]; found {
			t.Errorf("player history retained obsolete generic field %q", obsolete)
		}
	}
	for _, retired := range []string{"cwlLeagueId", "warSize"} {
		if _, found := item[retired]; found {
			t.Errorf("history item retained retired field %q", retired)
		}
	}
	if item["teamSize"] != nil || item["placement"] != nil {
		t.Fatalf("unknown team size and placement must be explicit nulls, got %s", raw)
	}
	clan := item["clan"].(map[string]any)
	for _, field := range []string{"tag", "name", "badgeUrls", "warLeague", "wars", "totalStars", "placement"} {
		if _, found := clan[field]; !found {
			t.Errorf("player history clan missing %q", field)
		}
	}
	if clan["wars"] != nil || clan["totalStars"] != nil || clan["placement"] != nil {
		t.Fatalf("unpersisted standings facts must remain null, got %s", raw)
	}
	for _, internal := range []string{"playerTag", "cwlId", "endedAt", "createdAt", "updatedAt"} {
		if _, found := item[internal]; found {
			t.Errorf("history response exposed internal or dropped field %q", internal)
		}
	}
}

func TestCWLPlayerHistoryKeepsUnknownWarLeagueExplicit(t *testing.T) {
	raw, err := json.Marshal(modelsv2.CWLPlayerHistoryResponse{
		Items: []modelsv2.CWLPlayerHistoryItem{{
			Season: "2025-08",
			Clan: modelsv2.CWLPlayerHistoryClan{
				Tag: "#CLAN", Name: "Clan", BadgeURLs: modelsv2.WarBadgeURLs{},
			},
			Attacks: []modelsv2.CWLPlayerHistoryAttack{},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	clan := decoded["items"].([]any)[0].(map[string]any)["clan"].(map[string]any)
	if value, exists := clan["warLeague"]; !exists || value != nil {
		t.Fatalf("unknown warLeague must be explicit null: %s", raw)
	}
}

func TestCWLPlayerHistoryAttackIsCompactAndOmitsAttackerIdentity(t *testing.T) {
	raw, err := json.Marshal(modelsv2.CWLPlayerHistoryAttack{
		WarTag: "#WAR", Round: 3,
		Opponent: modelsv2.CWLPlayerHistoryAttackOpponent{Tag: "#OPP", Name: "Opponent"},
		Defender: modelsv2.CWLPlayerHistoryAttackDefender{
			Tag: "#DEF", Name: "Defender", TownHallLevel: 17, MapPosition: 4,
		},
		Stars: 3, DestructionPercentage: 100, Order: 14, Duration: 92,
	})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"warTag", "round", "opponent", "defender", "stars", "destructionPercentage", "order", "duration"} {
		if _, found := decoded[field]; !found {
			t.Errorf("attack missing %q", field)
		}
	}
	for _, forbidden := range []string{"attackerTag", "attackerName", "timestamp", "createdAt", "updatedAt"} {
		if _, found := decoded[forbidden]; found {
			t.Errorf("attack exposed redundant or invented field %q", forbidden)
		}
	}
}

func TestCWLQueriesUseFinalTypedSchema(t *testing.T) {
	for _, file := range []string{"war.go", "legacy_war.go", "stats.go"} {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		text := string(raw)
		for _, stale := range []string{"cwl_groups g\n\t\tWHERE $1 = ANY(clan_tags)", "SELECT season, cwl_league_id, rounds, data", "SELECT cwl_league_id, rounds, data"} {
			if strings.Contains(text, stale) {
				t.Errorf("%s retains obsolete CWL group JSON reader %q", file, stale)
			}
		}
	}

	warSource, err := os.ReadFile("war.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"JOIN cwl_group_clans AS gc ON gc.cwl_id = g.cwl_id",
		"FROM cwl_group_members AS member",
		"FROM cwl_group_members AS player_member",
		"player_member.tag = $1",
		"'townHallLevel', member.town_hall",
		"LEFT JOIN cwl_standings AS s ON s.cwl_id = gc.cwl_id AND s.clan_tag = gc.clan_tag",
		"FROM cwl_standings", "ORDER BY global_rank NULLS LAST, group_rank NULLS LAST, clan_tag",
		"roundTags := decodeCWLRoundTags(roundsJSON)",
		"war_tag = ANY($1)",
		"sqlArchiveWarsContext(c.UserContext(), a, warIDs)",
		"for _, attack := range member.Attacks",
		"strings.EqualFold(state, \"ended\")",
		"calculateCWLSeasonSummary",
	} {
		if !strings.Contains(string(warSource), required) {
			t.Errorf("typed CWL reader missing %q", required)
		}
	}
	for _, dropped := range []string{"g.ended_at", "g.created_at", "g.updated_at"} {
		if strings.Contains(string(warSource), dropped) {
			t.Errorf("typed CWL reader still selects dropped group column %q", dropped)
		}
	}
	for _, removedRoster := range []string{"gc.members", "jsonb_path_query_array"} {
		if strings.Contains(string(warSource), removedRoster) {
			t.Errorf("typed CWL reader still uses removed JSON roster %q", removedRoster)
		}
	}
}

func TestCWLPlayerHistoryLoadsEachSeasonsArchiveOnce(t *testing.T) {
	raw, err := os.ReadFile("war.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	start := strings.Index(source, "func cwlPlayerWarFacts")
	end := strings.Index(source, "type cwlHistoryScanner")
	if start == -1 || end == -1 || end <= start {
		t.Fatal("could not isolate CWL player history implementation")
	}
	historySource := source[start:end]
	if got := strings.Count(historySource, "sqlArchiveWarsContext("); got != 1 {
		t.Fatalf("CWL player history archive loads = %d, want 1", got)
	}
	if strings.Contains(historySource, "func cwlPlayerEarnedStarsPlacement(c *fiber.Ctx") {
		t.Fatal("earned-stars placement must use the already-loaded season wars")
	}
}
