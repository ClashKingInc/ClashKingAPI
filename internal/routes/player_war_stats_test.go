package routes

import (
	"strings"
	"testing"
	"time"

	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
)

func TestPlayerWarStatsUsesArchiveBackedSchema(t *testing.T) {
	for _, required := range []string{
		"FROM player_war_history AS history",
		"unnest(history.war_ids)",
		"JOIN wars AS war",
		"LEFT JOIN war_archive_pending AS pending",
		"war.archive_pack_id",
		"war.archive_offset",
		"war.archive_compressed_bytes",
		"history.player_tag = $1",
		"war.end_time >= $2",
		"war.end_time <= $3",
	} {
		if !strings.Contains(playerWarStatsArchiveQuery, required) {
			t.Fatalf("player war stats query missing %q: %s", required, playerWarStatsArchiveQuery)
		}
	}
	for _, removed := range []string{"FROM war_attacks", "FROM war_missed_attacks"} {
		if strings.Contains(playerWarStatsArchiveQuery, removed) {
			t.Fatalf("player war stats query still uses removed relation %q", removed)
		}
	}
}

func TestPlayerWarStatsAggregatesArchivedWarsForEitherSide(t *testing.T) {
	const playerTag = "#PLAYER"
	wars := []playerWarStatsWar{
		{
			warType: "random",
			war: wararchive.War{
				AttacksPerMember: 2,
				Clan: wararchive.Clan{Members: []wararchive.Member{{
					Tag: playerTag, TownhallLevel: 17,
					Attacks: []wararchive.Attack{
						{DefenderTag: "#SAME", Stars: 3, DestructionPercentage: 100, Duration: 90},
						{DefenderTag: "#LOWER", Stars: 2, DestructionPercentage: 80, Duration: 120},
					},
				}}},
				Opponent: wararchive.Clan{Members: []wararchive.Member{
					{Tag: "#SAME", TownhallLevel: 17},
					{Tag: "#LOWER", TownhallLevel: 16},
				}},
			},
		},
		{
			warType: "friendly",
			war: wararchive.War{
				AttacksPerMember: 2,
				Clan:             wararchive.Clan{Members: []wararchive.Member{{Tag: "#HIGHER", TownhallLevel: 18}}},
				Opponent: wararchive.Clan{Members: []wararchive.Member{{
					Tag: playerTag, TownhallLevel: 17,
					Attacks: []wararchive.Attack{{DefenderTag: "#HIGHER", Stars: 3, DestructionPercentage: 100, Duration: 75}},
				}}},
			},
		},
		{
			warType: "cwl",
			war: wararchive.War{
				AttacksPerMember: 1,
				Clan:             wararchive.Clan{Members: []wararchive.Member{{Tag: playerTag, TownhallLevel: 17}}},
			},
		},
		{
			warType: "random",
			war:     wararchive.War{AttacksPerMember: 2},
		},
	}
	start := time.Unix(100, 0).UTC()
	end := time.Unix(200, 0).UTC()
	response := playerWarStatsResponse(playerTag, start, end, wars)

	if response["playerTag"] != playerTag || response["timestampStart"] != start.Unix() || response["timestampEnd"] != end.Unix() {
		t.Fatalf("unexpected response identity/window: %#v", response)
	}
	assertWarStatsBucket(t, response["total"].(map[string]any), 3, 5, 3, 2, 8)
	assertWarStatsBucket(t, response["random"].(map[string]any), 1, 2, 2, 0, 5)
	assertWarStatsBucket(t, response["friendly"].(map[string]any), 1, 2, 1, 1, 3)
	assertWarStatsBucket(t, response["cwl"].(map[string]any), 1, 1, 0, 1, 0)

	random := response["random"].(map[string]any)
	if random["sameTownhallAttacks"] != 1 || random["dipAttacks"] != 1 || random["hitUpAttacks"] != 0 {
		t.Fatalf("random matchup buckets = %#v", random)
	}
	friendly := response["friendly"].(map[string]any)
	if friendly["hitUpAttacks"] != 1 || friendly["hitUpHitrate"] != float64(1) {
		t.Fatalf("friendly matchup buckets = %#v", friendly)
	}
}

func TestPlayerWarStatsDefaultsMissingAttacksPerMember(t *testing.T) {
	buckets := map[string]*warStatsBucket{"all": {}, "random": {}}
	addArchivedPlayerWarStats(buckets, "#PLAYER", "random", wararchive.War{
		Clan: wararchive.Clan{Members: []wararchive.Member{{Tag: "#PLAYER"}}},
	})
	if buckets["all"].ExpectedAttacks != 1 || buckets["random"].ExpectedAttacks != 1 {
		t.Fatalf("default expected attacks were not applied: %#v", buckets)
	}
}

func assertWarStatsBucket(t *testing.T, bucket map[string]any, wars, expected, attacks, missed, stars int) {
	t.Helper()
	for key, want := range map[string]int{
		"wars": wars, "expectedAttacks": expected, "attacks": attacks, "missedAttacks": missed, "stars": stars,
	} {
		if got := bucket[key]; got != want {
			t.Errorf("%s = %#v, want %d (bucket %#v)", key, got, want, bucket)
		}
	}
}
