package server

import (
	"strings"
	"testing"
)

func TestClanLeaderboardRankQueryUsesDecisionTenSchema(t *testing.T) {
	for _, required := range []string{
		"FROM basic_clan clan",
		"LEFT JOIN clan_rankings_current ranking",
		"ranking.ranking_type = 'home'",
		"ranking.location_id = 'global'",
		"ranking.location_id = clan.location_id::text",
		"clan.clan_level",
		"clan.clan_points",
		"clan.member_count",
		"clan.capital_points",
		"clan.tag = ANY($1)",
	} {
		if !strings.Contains(lbClanRankQuery, required) {
			t.Fatalf("clan leaderboard query missing %q", required)
		}
	}
	for _, obsolete := range []string{
		"ranking.country_code",
		"ranking.country_name",
		"ranking.global_rank",
		"ranking.local_rank",
		"ranking.data",
	} {
		if strings.Contains(lbClanRankQuery, obsolete) {
			t.Fatalf("clan leaderboard query still reads obsolete column %q", obsolete)
		}
	}
}
