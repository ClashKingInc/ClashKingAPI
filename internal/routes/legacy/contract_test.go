package legacy

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
)

func TestBuildPlayerWarHitMatchesLegacyNestedShape(t *testing.T) {
	preparation := time.Date(2026, time.August, 1, 1, 2, 3, 0, time.UTC)
	start := preparation.Add(23 * time.Hour)
	war := wararchive.War{
		Type: "random", State: "ended", TeamSize: 2, AttacksPerMember: 2,
		PreparationStartTime: preparation, StartTime: &start, EndTime: start.Add(24 * time.Hour),
		Clan: wararchive.Clan{Tag: "#OURS", Name: "Ours", Members: []wararchive.Member{
			{Tag: "#PLAYER", Name: "Player", TownhallLevel: 17, MapPosition: 1, Attacks: []wararchive.Attack{{DefenderTag: "#ENEMY", Stars: 3, DestructionPercentage: 100, Duration: 120, Order: 2}}},
		}},
		Opponent: wararchive.Clan{Tag: "#THEM", Name: "Them", Members: []wararchive.Member{
			{Tag: "#ENEMY", Name: "Enemy", TownhallLevel: 17, MapPosition: 1, Attacks: []wararchive.Attack{
				{DefenderTag: "#PLAYER", Stars: 1, DestructionPercentage: 55, Duration: 180, Order: 1},
				{DefenderTag: "#PLAYER", Stars: 2, DestructionPercentage: 80, Duration: 170, Order: 3},
			}},
		}},
	}
	item, ok := buildPlayerWarHit("#PLAYER", war)
	if !ok {
		t.Fatal("expected player war hit")
	}
	if item.WarData.Type != "random" || item.WarData.Clan.Members != nil || item.WarData.Opponent.Members != nil {
		t.Fatalf("war_data did not match the stripped legacy shape: %#v", item.WarData)
	}
	if item.MemberData.Attacks != nil || item.MemberData.BestOpponentAttack != nil || item.MemberData.OpponentAttacks == nil || *item.MemberData.OpponentAttacks != 2 {
		t.Fatalf("member_data did not match the stripped legacy shape: %#v", item.MemberData)
	}
	if len(item.Attacks) != 1 || item.Attacks[0].Defender == nil || item.Attacks[0].Attacker != nil || item.Attacks[0].AttackOrder != 2 {
		t.Fatalf("unexpected attacks: %#v", item.Attacks)
	}
	if item.Attacks[0].Defender.OpponentAttacks == nil || *item.Attacks[0].Defender.OpponentAttacks != 1 {
		t.Fatalf("nested defender lost opponentAttacks: %#v", item.Attacks[0].Defender)
	}
	if len(item.Defenses) != 2 || item.Defenses[0].Attacker == nil || !item.Defenses[0].Fresh || item.Defenses[1].Fresh {
		t.Fatalf("unexpected defenses: %#v", item.Defenses)
	}

	payload, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	warData := decoded["war_data"].(map[string]any)
	if warData["type"] != "random" {
		t.Fatalf("war_data type = %#v, want random", warData["type"])
	}
	if _, exists := warData["clan"].(map[string]any)["members"]; exists {
		t.Fatal("war_data unexpectedly exposed clan members")
	}
	attack := decoded["attacks"].([]any)[0].(map[string]any)
	if _, exists := attack["attack_order"]; !exists {
		t.Fatalf("legacy attack_order is missing: %s", payload)
	}
}

func TestLegacyFullWarOmitsSyntheticTypeAndKeepsMembers(t *testing.T) {
	war := wararchive.War{
		Type: "random", State: "warEnded", TeamSize: 1, AttacksPerMember: 2,
		PreparationStartTime: time.Unix(1, 0), EndTime: time.Unix(2, 0),
		Clan:     wararchive.Clan{Tag: "#A", Members: []wararchive.Member{{Tag: "#P"}}},
		Opponent: wararchive.Clan{Tag: "#B", Members: []wararchive.Member{{Tag: "#Q"}}},
	}
	result := legacyWar(war, true)
	if result.Type != "" || len(result.Clan.Members) != 1 || len(result.Opponent.Members) != 1 {
		t.Fatalf("unexpected full war: %#v", result)
	}
}

func TestProcessPlayerJoinLeaveMirrorsLegacyCorrection(t *testing.T) {
	first := time.Date(2024, 4, 5, 0, 0, 0, 0, time.UTC)
	events := []joinLeaveRow{
		{Time: first, Type: "join", Clan: "#A", Tag: "#P"},
		{Time: first.Add(time.Hour), Type: "leave", Clan: "#A", Tag: "#P"},
		{Time: first.Add(2 * time.Hour), Type: "join", Clan: "#B", Tag: "#P"},
	}
	processed := processPlayerJoinLeave(events)
	if len(processed) != 3 || !processed[0].Time.Equal(first) || processed[1].Type != "leave" || !processed[1].Time.Equal(first.Add(2*time.Hour)) || processed[2].Type != "join" {
		t.Fatalf("unexpected corrected events: %#v", processed)
	}
	if got := legacyDateTime(first.Add(123456 * time.Microsecond)); got != "2024-04-05T00:00:00.123456" {
		t.Fatalf("legacy timestamp = %q", got)
	}
}

func TestCWLCompatibilityNormalizationAndRoundDecoding(t *testing.T) {
	for input, expected := range map[string]string{
		"2026-05":    "2026-05",
		"2026-05-17": "2026-05",
		"2026-06-14": "2026-06-14",
		"2026-08":    "2026-08",
		"invalid":    "invalid",
	} {
		if got := normalizeCWLSeason(input); got != expected {
			t.Fatalf("normalizeCWLSeason(%q) = %q, want %q", input, got, expected)
		}
	}
	if got := decodeCWLRounds([]byte(`[{"warTags":["#ONE","#0"]}]`)); !reflect.DeepEqual(got, [][]string{{"#ONE", "#0"}}) {
		t.Fatalf("official rounds = %#v", got)
	}
	if got := decodeCWLRounds([]byte(`[["#TWO"]]`)); !reflect.DeepEqual(got, [][]string{{"#TWO"}}) {
		t.Fatalf("direct rounds = %#v", got)
	}
}
