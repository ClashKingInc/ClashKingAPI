package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestTrackingWindowsAreFixedAndBounded(t *testing.T) {
	tests := map[string]struct {
		duration time.Duration
		bucket   time.Duration
		points   int
	}{
		"15m": {15 * time.Minute, 15 * time.Second, 60},
		"1h":  {time.Hour, time.Minute, 60},
		"6h":  {6 * time.Hour, 5 * time.Minute, 72},
		"24h": {24 * time.Hour, 15 * time.Minute, 96},
	}
	for value, expected := range tests {
		window, err := parseTrackingWindow(value)
		if err != nil {
			t.Fatalf("parseTrackingWindow(%q): %v", value, err)
		}
		if window.duration != expected.duration || window.bucket != expected.bucket {
			t.Errorf("parseTrackingWindow(%q) = %+v, want duration %s and bucket %s", value, window, expected.duration, expected.bucket)
		}
		if points := int(window.duration / window.bucket); points != expected.points {
			t.Errorf("parseTrackingWindow(%q) has %d points, want %d", value, points, expected.points)
		}
	}

	if _, err := parseTrackingWindow("2d"); err == nil {
		t.Fatal("expected arbitrary tracking window to be rejected")
	}
	window, err := parseTrackingWindow("")
	if err != nil || window.name != "1h" {
		t.Fatalf("empty window = %+v, %v; want 1h default", window, err)
	}
}

func TestTrackingSeriesFiltersAreExactNames(t *testing.T) {
	for _, value := range []string{"globalclans", "globalclans.priority", "war-discovery", "tracked_clans"} {
		if got, err := parseTrackingSeriesFilter("script", value); err != nil || got != value {
			t.Errorf("filter %q = %q, %v", value, got, err)
		}
	}
	for _, value := range []string{"globalclans; DROP TABLE tracking_domain_stats", "*", strings.Repeat("a", 101)} {
		if _, err := parseTrackingSeriesFilter("domain", value); err == nil {
			t.Errorf("expected unsupported filter %q to fail", value)
		}
	}
}

func TestTrackingTargetDeltaHandlesLoopRolloverAndRestart(t *testing.T) {
	previous := &trackingTargetSnapshot{runID: 4, count: 100, cycle: 7, processed: 90}
	tests := []struct {
		name     string
		current  trackingTargetSnapshot
		previous *trackingTargetSnapshot
		want     int64
	}{
		{name: "same cycle", current: trackingTargetSnapshot{runID: 4, count: 100, cycle: 7, processed: 97}, previous: previous, want: 7},
		{name: "one rollover", current: trackingTargetSnapshot{runID: 4, count: 100, cycle: 8, processed: 6}, previous: previous, want: 16},
		{name: "multiple rollovers", current: trackingTargetSnapshot{runID: 4, count: 100, cycle: 10, processed: 6}, previous: previous, want: 216},
		{name: "process restart", current: trackingTargetSnapshot{runID: 5, count: 100, cycle: 1, processed: 8}, previous: previous, want: 8},
		{name: "first observation", current: trackingTargetSnapshot{runID: 5, count: 100, cycle: 1, processed: 8}, want: 8},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := trackingTargetDelta(test.current, test.previous); got != test.want {
				t.Fatalf("trackingTargetDelta() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestTrackingDomainCalculationsStayInAPI(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	previousRunID := int64(1)
	previousCount := 100
	previousCycle := int64(2)
	previousProcessed := 40
	latestError := "proxy timeout"
	latestErrorAt := now.Add(-3 * time.Second)
	raw := trackingRawDomain{
		intervalStart: now.Add(-10 * time.Second), intervalEnd: now,
		runID: 1, script: "globalclans", name: "globalclans.priority",
		lastError: &latestError, lastReadyChange: &latestErrorAt, requests: 50, writes: 20, errors: 5,
		requestLatencyMS: 1_000, queueDepth: 7, reportedHealthy: true,
		processingCount: 10, totalProcessTimeMS: 500,
		storeBatches: 4, storeRowsRequested: 30, storeRowsAffected: 28, storeDurationMS: 200,
		targetCount: 100, targetCycle: 2, targetProcessed: 50,
		previousRunID: &previousRunID, previousTargetCount: &previousCount,
		previousTargetCycle: &previousCycle, previousTargetProcessed: &previousProcessed,
	}
	got := buildTrackingDomainState(raw, now)
	if got.RequestsPerSecond != 5 || got.ErrorRate != 0.1 || got.AverageRequestLatencyMS != 20 {
		t.Fatalf("request metrics = rps %v, error rate %v, latency %v", got.RequestsPerSecond, got.ErrorRate, got.AverageRequestLatencyMS)
	}
	if got.WritesPerSecond != 2 || got.Database.AverageStoreDurationMS != 50 {
		t.Fatalf("write/store metrics = writes/s %v, store duration %v", got.WritesPerSecond, got.Database.AverageStoreDurationMS)
	}
	if got.Targets == nil || got.Targets.TargetsPerSecond != 1 || got.Targets.CompletionPercentage != 50 {
		t.Fatalf("target metrics = %+v", got.Targets)
	}
	if got.Targets.EstimatedSecondsRemaining == nil || *got.Targets.EstimatedSecondsRemaining != 50 {
		t.Fatalf("target ETA = %+v", got.Targets)
	}
	if got.LatestError == nil || got.LatestError.Message != latestError || !got.LatestError.Timestamp.Equal(latestErrorAt) {
		t.Fatalf("latest error = %+v", got.LatestError)
	}
}

func TestTrackingQueueOnlyDomainHasMetricsWithoutTargetProgress(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	latestError := "queue worker timeout"
	latestErrorAt := now.Add(-5 * time.Second)
	raw := trackingRawDomain{
		intervalStart: now.Add(-20 * time.Second), intervalEnd: now,
		runID: 3, script: "reminders", name: "reminders.mobile-reconciliation",
		requests: 40, writes: 10, errors: 2, requestLatencyMS: 800,
		queueDepth: 12, reportedHealthy: false, processingCount: 5,
		totalProcessTimeMS: 250, targetCount: 0, lastError: &latestError,
		lastReadyChange: &latestErrorAt,
	}
	got := buildTrackingDomainState(raw, now)
	if got.Domain != raw.name || got.Targets != nil {
		t.Fatalf("queue domain = %+v; want arbitrary name and null target progress", got)
	}
	if got.QueueDepth != 12 || got.ProcessingCount != 5 || got.AverageProcessingDurationMS != 50 || got.RequestsPerSecond != 2 || got.WritesPerSecond != .5 || got.ErrorCount != 2 || got.AverageRequestLatencyMS != 20 {
		t.Fatalf("queue metrics = %+v", got)
	}
	if got.Health.Stale || got.Health.Healthy || got.Health.AgeSeconds != 0 || got.LatestError == nil || !got.LatestError.Timestamp.Equal(latestErrorAt) {
		t.Fatalf("queue freshness/error = health %+v, error %+v", got.Health, got.LatestError)
	}
	payload, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), `"targets":null`) {
		t.Fatalf("queue domain JSON = %s; want explicit null target progress", payload)
	}
}

func TestTrackingArbitraryDomainNameIsPreserved(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	for _, domain := range []string{
		"globalclans.priority", "globalclans.non_priority",
		"war-discovery.active", "war-discovery.dormant", "war-discovery.finalization",
		"cwl.groups", "war-archiver",
		"reminders.events", "reminders.war-jobs", "reminders.mobile-reconciliation", "reminders.raid", "reminders.fixed",
		"mobilepush.events", "trackedplayers", "future-domain.with_any-name",
	} {
		raw := trackingRawDomain{intervalStart: now.Add(-time.Second), intervalEnd: now, script: "worker", name: domain, reportedHealthy: true}
		if got := buildTrackingDomainState(raw, now); got.Domain != domain {
			t.Errorf("domain %q became %q", domain, got.Domain)
		}
	}
}

func TestTrackingDomainFailureMakesFreshProcessUnhealthy(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	processes := []modelsv2.TrackingProcessState{{
		Script: "reminders", Health: trackingHealth(true, now, now),
	}}
	domains := []modelsv2.TrackingDomainState{
		{Script: "reminders", Domain: "reminders.events", Health: trackingHealth(true, now, now)},
		{Script: "reminders", Domain: "reminders.raid", Health: trackingHealth(false, now, now)},
	}
	rollUpTrackingProcessHealth(processes, domains)
	if processes[0].Health.Healthy || processes[0].Health.Stale || processes[0].Health.ReportedHealthy {
		t.Fatalf("fresh process with failed domain should be unhealthy: %+v", processes[0].Health)
	}
}

func TestTrackingHealthMarksOldObservationsStale(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	fresh := trackingHealth(true, now.Add(-trackingStaleAfter), now)
	if fresh.Stale || !fresh.Healthy {
		t.Fatalf("observation at threshold should be fresh: %+v", fresh)
	}
	stale := trackingHealth(true, now.Add(-trackingStaleAfter-time.Millisecond), now)
	if !stale.Stale || stale.Healthy || !stale.ReportedHealthy {
		t.Fatalf("old observation should be stale but retain reported health: %+v", stale)
	}
	unhealthy := trackingHealth(false, now, now)
	if unhealthy.Healthy || unhealthy.Stale {
		t.Fatalf("fresh reported failure should be unhealthy, not stale: %+v", unhealthy)
	}
}

func TestTrackingAdminEndpointsRequireServiceToken(t *testing.T) {
	deps := apptypes.Deps{Config: apptypes.Config{APIBotToken: "admin-secret"}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/admin/tracking/summary", authBot(deps, trackingOperationsSummary(deps)))

	for _, authorization := range []string{"", "Bearer wrong-secret"} {
		req := httptest.NewRequest(http.MethodGet, "/v2/admin/tracking/summary", nil)
		if authorization != "" {
			req.Header.Set(fiber.HeaderAuthorization, authorization)
		}
		response, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != fiber.StatusUnauthorized {
			t.Fatalf("authorization %q returned %d, want 401", authorization, response.StatusCode)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/v2/admin/tracking/summary", nil)
	req.Header.Set(fiber.HeaderAuthorization, "Bearer admin-secret")
	response, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("valid admin token returned %d, want handler's 503 without a test store", response.StatusCode)
	}
	if got := response.Header.Get(fiber.HeaderCacheControl); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}

func TestTrackingAdminEndpointsAreRegistered(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })
	for _, path := range []string{"/v2/admin/tracking/summary", "/v2/admin/tracking/timeseries"} {
		if registeredRouteIndex(app, fiber.MethodGet, path) < 0 {
			t.Fatalf("expected GET %s to be registered", path)
		}
	}
}

func TestTrackingQueriesAreTimeBoundedAndParameterized(t *testing.T) {
	for name, query := range map[string]string{
		"process": trackingProcessSeriesQuery,
		"domain":  trackingDomainSeriesQuery,
	} {
		for _, fragment := range []string{"interval_end >= $1", "interval_end < $2", "LIMIT 20000"} {
			if !strings.Contains(query, fragment) {
				t.Errorf("%s series query is missing %q", name, fragment)
			}
		}
		if strings.Contains(query, "%s") || strings.Contains(query, "+ script") {
			t.Errorf("%s series query appears to interpolate caller input: %s", name, query)
		}
	}
}
