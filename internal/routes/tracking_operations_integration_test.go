package routes

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestTrackingOperationsQueriesAgainstTimescale(t *testing.T) {
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

	now := time.Now().UTC()
	if _, err := loadLatestTrackingProcesses(ctx, pool, now); err != nil {
		t.Fatalf("latest process query failed: %v", err)
	}
	if _, err := loadLatestTrackingDomains(ctx, pool, now); err != nil {
		t.Fatalf("latest domain query failed: %v", err)
	}
	if _, err := loadTrackingProcessSeries(ctx, pool, now.Add(-time.Hour), now, time.Minute, ""); err != nil {
		t.Fatalf("process series query failed: %v", err)
	}
	if _, err := loadTrackingDomainSeries(ctx, pool, now.Add(-time.Hour-time.Minute), now.Add(-time.Hour), now, time.Minute, "", ""); err != nil {
		t.Fatalf("domain series query failed: %v", err)
	}
}
