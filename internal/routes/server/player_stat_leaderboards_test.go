package server

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDonationLeaderboardAggregatesOnlyTypedDonationDeltas(t *testing.T) {
	for _, required := range []string{
		"FROM player_stat_changes",
		"player_tag = ANY($1)",
		"stat_type IN ('donated', 'received')",
		"event_time >= $2",
		"event_time < $3",
		"sum(delta) FILTER (WHERE stat_type = 'donated')",
		"sum(delta) FILTER (WHERE stat_type = 'received')",
	} {
		if !strings.Contains(serverDonationStatChangesQuery, required) {
			t.Fatalf("donation delta query missing %q", required)
		}
	}
	assertNoRetiredSeasonStatsSource(t, serverDonationStatChangesQuery)
}

func TestClanGamesLeaderboardAggregatesOnlyTypedClanGamesDeltas(t *testing.T) {
	for _, required := range []string{
		"FROM player_stat_changes",
		"player_tag = ANY($1)",
		"stat_type = 'clan_games'",
		"event_time >= $2",
		"event_time < $3",
		"sum(delta)::bigint",
	} {
		if !strings.Contains(serverClanGamesStatChangesQuery, required) {
			t.Fatalf("Clan Games delta query missing %q", required)
		}
	}
	assertNoRetiredSeasonStatsSource(t, serverClanGamesStatChangesQuery)
}

func TestSeasonStatLeaderboardsUseClashSeasonWindowHelper(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve leaderboard test source path")
	}
	source, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "leaderboards.go"))
	if err != nil {
		t.Fatalf("read leaderboards.go: %v", err)
	}
	text := string(source)
	for _, required := range []string{"clashy.GetSeasonID()", "clashy.GetSeasonByID(seasonID)", "season.StartTime", "season.EndTime"} {
		if !strings.Contains(text, required) {
			t.Fatalf("leaderboards.go missing Clash season helper usage %q", required)
		}
	}
	if strings.Contains(text, `Format("2006-01")`) {
		t.Fatal("leaderboards.go derives leaderboard seasons from calendar months")
	}
}

func assertNoRetiredSeasonStatsSource(t *testing.T, query string) {
	t.Helper()
	for _, obsolete := range []string{
		"player_season_stats",
		"activity_score",
		"donations",
		"clan_games, activity",
		"data",
		"townhall_level",
		"last_online",
	} {
		if strings.Contains(query, obsolete) {
			t.Fatalf("typed delta query contains retired source %q", obsolete)
		}
	}
}
