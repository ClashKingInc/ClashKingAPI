package routes

import (
	"context"
	"os"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestStatsQueriesAgainstTimescale(t *testing.T) {
	databaseURL := os.Getenv("TEST_TIMESCALE_URL")
	if databaseURL == "" {
		t.Skip("TEST_TIMESCALE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	if _, err := loadGlobalCounts(ctx, pool); err != nil {
		t.Fatalf("global counts query failed: %v", err)
	}

	rankedWindow := statsTimeWindow{
		start:        time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
		endExclusive: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
	}
	tier, minimum, limit := 1, 1, 10
	armies, err := loadStatsArmies(ctx, pool, modelsv2.StatsArmiesQuery{
		StatsBattleFilters: modelsv2.StatsBattleFilters{MinimumSampleSize: &minimum},
		Limit:              &limit,
	}, rankedWindow)
	if err != nil {
		t.Fatalf("army query failed: %v", err)
	}
	if len(armies) == 0 {
		t.Fatal("expected seeded ranked armies")
	}
	if armies[0].ArmyShareCode == "" || len(armies[0].ArmyCounts) == 0 {
		t.Fatalf("expected exact army identity, got %#v", armies[0])
	}

	item, err := loadStatsItem(ctx, pool, modelsv2.StatsBattleFilters{}, modelsv2.StatsItemSelector{Item: "u_8", Type: "troop"}, rankedWindow)
	if err != nil {
		t.Fatalf("item query failed: %v", err)
	}
	if item.UsageRate == nil || item.CompositionShare == nil {
		t.Fatalf("expected usage and composition shares, got %#v", item)
	}
	rankedMetrics, err := loadStatsPerformance(ctx, pool, statsRankedSourceSQL, []string{
		"event_time >= $1", "event_time < $2", "townhall_level = $3", "ranked_league_tier_id = $4",
	}, []any{rankedWindow.start, rankedWindow.endExclusive, 17, tier})
	if err != nil {
		t.Fatalf("season-attributed ranked query failed: %v", err)
	}
	if rankedMetrics.Available {
		t.Fatal("expected no attributed sample when battle month has no matching ranked membership")
	}

	warWindow := statsTimeWindow{
		start:        time.Date(2023, 3, 1, 0, 0, 0, 0, time.UTC),
		endExclusive: time.Date(2023, 4, 10, 0, 0, 0, 0, time.UTC),
	}
	warMetrics, err := loadStatsPerformance(ctx, pool, statsWarSourceSQL, []string{
		"event_time >= $1", "event_time < $2", "war_type = 'random'", "townhall_level = opponent_townhall_level",
	}, []any{warWindow.start, warWindow.endExclusive})
	if err != nil {
		t.Fatalf("war query failed: %v", err)
	}
	if !warMetrics.Available {
		t.Fatal("expected seeded regular-war metrics")
	}
	cwlMetrics, err := loadStatsPerformance(ctx, pool, statsCWLSourceSQL, []string{
		"event_time >= $1", "event_time < $2", "townhall_level = opponent_townhall_level",
	}, []any{warWindow.start, warWindow.endExclusive})
	if err != nil {
		t.Fatalf("CWL query failed: %v", err)
	}
	if !cwlMetrics.Available {
		t.Fatal("expected seeded CWL metrics")
	}
}
