package routes

import (
	"context"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

const (
	trackingStaleAfter     = 2 * time.Minute
	trackingQueryTimeout   = 10 * time.Second
	globalClansPriority    = "globalclans.priority"
	globalClansNonPriority = "globalclans.non_priority"
)

var trackingSeriesNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)

type trackingWindow struct {
	name     string
	duration time.Duration
	bucket   time.Duration
}

var trackingWindows = map[string]trackingWindow{
	"15m": {name: "15m", duration: 15 * time.Minute, bucket: 15 * time.Second},
	"1h":  {name: "1h", duration: time.Hour, bucket: time.Minute},
	"6h":  {name: "6h", duration: 6 * time.Hour, bucket: 5 * time.Minute},
	"24h": {name: "24h", duration: 24 * time.Hour, bucket: 15 * time.Minute},
}

type trackingRawDomain struct {
	intervalStart, intervalEnd                   time.Time
	runID                                        int64
	script, name                                 string
	lastSuccess                                  *time.Time
	lastError                                    *string
	requests, writes, errors                     int64
	requestLatencyMS                             float64
	queueDepth                                   int
	reportedHealthy                              bool
	processingCount                              int64
	totalProcessTimeMS                           float64
	storeBatches, storeRowsRequested             int64
	storeRowsAffected                            int64
	storeDurationMS                              float64
	targetCount, targetProcessed                 int
	targetCycle                                  int64
	previousRunID                                *int64
	previousTargetCount, previousTargetProcessed *int
	previousTargetCycle                          *int64
}

type trackingTargetSnapshot struct {
	runID      int64
	count      int
	cycle      int64
	processed  int
	observedAt time.Time
}

const latestTrackingProcessesQuery = `
	SELECT DISTINCT ON (script)
		script, run_id, interval_start, interval_end, process_started_at,
		uptime_ms, goroutines, alloc_bytes, heap_objects, gc_cycles
	FROM tracking_process_stats
	ORDER BY script, interval_end DESC, run_id DESC
`

const latestTrackingDomainsQuery = `
	WITH latest AS (
		SELECT DISTINCT ON (script, name)
			interval_start, interval_end, run_id, script, name, last_success,
			last_error, requests, writes, errors, request_latency_ms, queue_depth,
			healthy, processing_count, total_process_time_ms, store_batches,
			store_rows_requested, store_rows_affected, store_duration_ms,
			target_count, target_cycle, target_processed
		FROM tracking_domain_stats
		ORDER BY script, name, interval_end DESC, run_id DESC
	)
	SELECT latest.interval_start, latest.interval_end, latest.run_id,
		latest.script, latest.name, latest.last_success, latest.last_error,
		latest.requests, latest.writes, latest.errors, latest.request_latency_ms,
		latest.queue_depth, latest.healthy, latest.processing_count,
		latest.total_process_time_ms, latest.store_batches,
		latest.store_rows_requested, latest.store_rows_affected,
		latest.store_duration_ms, latest.target_count, latest.target_cycle,
		latest.target_processed, previous.run_id, previous.target_count,
		previous.target_cycle, previous.target_processed
	FROM latest
	LEFT JOIN LATERAL (
		SELECT run_id, target_count, target_cycle, target_processed
		FROM tracking_domain_stats
		WHERE script = latest.script AND name = latest.name
			AND interval_end < latest.interval_end
		ORDER BY interval_end DESC, run_id DESC
		LIMIT 1
	) previous ON TRUE
	ORDER BY latest.script, latest.name
`

const trackingProcessSeriesQuery = `
	SELECT time_bucket($3::interval, interval_end) AS bucket, script,
		max(interval_end), avg(alloc_bytes)::double precision,
		avg(uptime_ms), avg(goroutines)::double precision,
		avg(heap_objects)::double precision, max(gc_cycles)
	FROM tracking_process_stats
	WHERE interval_end >= $1 AND interval_end < $2
		AND ($4 = '' OR script = $4)
	GROUP BY bucket, script
	ORDER BY bucket, script
	LIMIT 20000
`

const trackingDomainSeriesQuery = `
	SELECT time_bucket($3::interval, interval_end) AS bucket, script, name,
		max(interval_end), last(run_id, interval_end),
		sum(EXTRACT(EPOCH FROM interval_end - interval_start))::double precision,
		sum(requests), sum(writes), sum(errors), sum(request_latency_ms),
		last(queue_depth, interval_end), last(healthy, interval_end),
		sum(processing_count), sum(total_process_time_ms), sum(store_batches),
		sum(store_rows_requested), sum(store_rows_affected), sum(store_duration_ms),
		last(target_count, interval_end), last(target_cycle, interval_end),
		last(target_processed, interval_end)
	FROM tracking_domain_stats
	WHERE interval_end >= $1 AND interval_end < $2
		AND ($4 = '' OR script = $4)
		AND ($5 = '' OR name = $5)
	GROUP BY bucket, script, name
	ORDER BY bucket, script, name
	LIMIT 20000
`

// trackingOperationsSummary godoc
// @Summary Get tracking operations summary
// @Description Returns the latest API-derived operational state for every tracking script and domain. Requires the admin service token.
// @Tags Admin Tracking
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.TrackingOperationsSummaryResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/admin/tracking/summary [get]
func trackingOperationsSummary(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set(fiber.HeaderCacheControl, "no-store")
		pool, err := trackingSQLPool(a)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		ctx, cancel := context.WithTimeout(c.UserContext(), trackingQueryTimeout)
		defer cancel()

		var processes []modelsv2.TrackingProcessState
		var domains []modelsv2.TrackingDomainState
		group, groupCtx := errgroup.WithContext(ctx)
		group.Go(func() error {
			var loadErr error
			processes, loadErr = loadLatestTrackingProcesses(groupCtx, pool, now)
			return loadErr
		})
		group.Go(func() error {
			var loadErr error
			domains, loadErr = loadLatestTrackingDomains(groupCtx, pool, now)
			return loadErr
		})
		if err := group.Wait(); err != nil {
			return err
		}

		response := modelsv2.TrackingOperationsSummaryResponse{
			GeneratedAt:       now,
			StaleAfterSeconds: int(trackingStaleAfter / time.Second),
			Processes:         processes,
			Domains:           domains,
		}
		for index := range domains {
			domain := &domains[index]
			if domain.Script != "globalclans" {
				continue
			}
			switch domain.Domain {
			case globalClansPriority:
				progress := domain.Targets
				response.GlobalClans.Priority = &progress
			case globalClansNonPriority:
				progress := domain.Targets
				response.GlobalClans.NonPriority = &progress
			}
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// trackingOperationsTimeSeries godoc
// @Summary Get tracking operations time series
// @Description Returns bucketed, bounded operational chart data. Window is restricted to 15m, 1h, 6h, or 24h; script and domain are optional exact-match filters.
// @Tags Admin Tracking
// @Produce json
// @Security ApiKeyAuth
// @Param window query string false "Chart window" Enums(15m,1h,6h,24h) default(1h)
// @Param script query string false "Exact script name"
// @Param domain query string false "Exact domain name"
// @Success 200 {object} modelsv2.TrackingOperationsTimeSeriesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/admin/tracking/timeseries [get]
func trackingOperationsTimeSeries(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set(fiber.HeaderCacheControl, "no-store")
		window, err := parseTrackingWindow(c.Query("window"))
		if err != nil {
			return err
		}
		script, err := parseTrackingSeriesFilter("script", c.Query("script"))
		if err != nil {
			return err
		}
		domain, err := parseTrackingSeriesFilter("domain", c.Query("domain"))
		if err != nil {
			return err
		}
		pool, err := trackingSQLPool(a)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		end := now.Truncate(window.bucket)
		start := end.Add(-window.duration)
		lookbackStart := start.Add(-window.bucket)
		ctx, cancel := context.WithTimeout(c.UserContext(), trackingQueryTimeout)
		defer cancel()

		var processes []modelsv2.TrackingProcessSeries
		var domains []modelsv2.TrackingDomainSeries
		group, groupCtx := errgroup.WithContext(ctx)
		if domain == "" {
			group.Go(func() error {
				var loadErr error
				processes, loadErr = loadTrackingProcessSeries(groupCtx, pool, start, end, window.bucket, script)
				return loadErr
			})
		}
		group.Go(func() error {
			var loadErr error
			domains, loadErr = loadTrackingDomainSeries(groupCtx, pool, lookbackStart, start, end, window.bucket, script, domain)
			return loadErr
		})
		if err := group.Wait(); err != nil {
			return err
		}

		return apptypes.JSON(c, http.StatusOK, modelsv2.TrackingOperationsTimeSeriesResponse{
			GeneratedAt:        now,
			Window:             window.name,
			Start:              start,
			End:                end,
			BucketSeconds:      int(window.bucket / time.Second),
			MaxPointsPerSeries: int(window.duration / window.bucket),
			Processes:          processes,
			Domains:            domains,
		})
	}
}

func trackingSQLPool(a apptypes.Deps) (*pgxpool.Pool, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(http.StatusServiceUnavailable, "Tracking statistics store is unavailable")
	}
	return a.Store.SQL, nil
}

func parseTrackingWindow(value string) (trackingWindow, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		value = "1h"
	}
	window, ok := trackingWindows[value]
	if !ok {
		return trackingWindow{}, apptypes.Error(http.StatusBadRequest, "window must be one of 15m, 1h, 6h, or 24h")
	}
	return window, nil
}

func parseTrackingSeriesFilter(name, value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if !trackingSeriesNamePattern.MatchString(value) {
		return "", apptypes.Error(http.StatusBadRequest, name+" contains unsupported characters")
	}
	return value, nil
}

func loadLatestTrackingProcesses(ctx context.Context, pool *pgxpool.Pool, now time.Time) ([]modelsv2.TrackingProcessState, error) {
	rows, err := pool.Query(ctx, latestTrackingProcessesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.TrackingProcessState, 0)
	for rows.Next() {
		var item modelsv2.TrackingProcessState
		var uptimeMS float64
		if err := rows.Scan(&item.Script, &item.RunID, &item.IntervalStart, &item.IntervalEnd,
			&item.ProcessStartedAt, &uptimeMS, &item.Goroutines, &item.RAMBytes,
			&item.HeapObjects, &item.GCCycles); err != nil {
			return nil, err
		}
		item.UptimeSeconds = roundMetric(uptimeMS / 1000)
		item.Health = trackingHealth(true, item.IntervalEnd, now)
		items = append(items, item)
	}
	return items, rows.Err()
}

func loadLatestTrackingDomains(ctx context.Context, pool *pgxpool.Pool, now time.Time) ([]modelsv2.TrackingDomainState, error) {
	rows, err := pool.Query(ctx, latestTrackingDomainsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.TrackingDomainState, 0)
	for rows.Next() {
		var raw trackingRawDomain
		if err := rows.Scan(
			&raw.intervalStart, &raw.intervalEnd, &raw.runID, &raw.script, &raw.name,
			&raw.lastSuccess, &raw.lastError, &raw.requests, &raw.writes, &raw.errors,
			&raw.requestLatencyMS, &raw.queueDepth, &raw.reportedHealthy,
			&raw.processingCount, &raw.totalProcessTimeMS, &raw.storeBatches,
			&raw.storeRowsRequested, &raw.storeRowsAffected, &raw.storeDurationMS,
			&raw.targetCount, &raw.targetCycle, &raw.targetProcessed,
			&raw.previousRunID, &raw.previousTargetCount, &raw.previousTargetCycle,
			&raw.previousTargetProcessed,
		); err != nil {
			return nil, err
		}
		items = append(items, buildTrackingDomainState(raw, now))
	}
	return items, rows.Err()
}

func buildTrackingDomainState(raw trackingRawDomain, now time.Time) modelsv2.TrackingDomainState {
	durationSeconds := math.Max(raw.intervalEnd.Sub(raw.intervalStart).Seconds(), 0)
	current := trackingTargetSnapshot{runID: raw.runID, count: raw.targetCount, cycle: raw.targetCycle, processed: raw.targetProcessed, observedAt: raw.intervalEnd}
	var previous *trackingTargetSnapshot
	if raw.previousRunID != nil && raw.previousTargetCount != nil && raw.previousTargetCycle != nil && raw.previousTargetProcessed != nil {
		previous = &trackingTargetSnapshot{runID: *raw.previousRunID, count: *raw.previousTargetCount, cycle: *raw.previousTargetCycle, processed: *raw.previousTargetProcessed}
	}
	targetRate := safeRate(float64(trackingTargetDelta(current, previous)), durationSeconds)
	return modelsv2.TrackingDomainState{
		Script:                      raw.script,
		Domain:                      raw.name,
		RunID:                       raw.runID,
		IntervalStart:               raw.intervalStart,
		IntervalEnd:                 raw.intervalEnd,
		IntervalDurationSeconds:     roundMetric(durationSeconds),
		LastSuccess:                 raw.lastSuccess,
		LatestError:                 raw.lastError,
		RequestCount:                raw.requests,
		RequestsPerSecond:           safeRate(float64(raw.requests), durationSeconds),
		ErrorCount:                  raw.errors,
		ErrorRate:                   safeRate(float64(raw.errors), float64(raw.requests)),
		AverageRequestLatencyMS:     safeRate(raw.requestLatencyMS, float64(raw.requests)),
		WriteCount:                  raw.writes,
		WritesPerSecond:             safeRate(float64(raw.writes), durationSeconds),
		ProcessingCount:             raw.processingCount,
		AverageProcessingDurationMS: safeRate(raw.totalProcessTimeMS, float64(raw.processingCount)),
		QueueDepth:                  raw.queueDepth,
		Database: modelsv2.TrackingDatabaseMetrics{
			BatchCount:             raw.storeBatches,
			RowsRequested:          raw.storeRowsRequested,
			RowsAffected:           raw.storeRowsAffected,
			AverageStoreDurationMS: safeRate(raw.storeDurationMS, float64(raw.storeBatches)),
		},
		Targets: trackingTargetProgress(current, targetRate, now, now.Sub(raw.intervalEnd) > trackingStaleAfter),
		Health:  trackingHealth(raw.reportedHealthy, raw.intervalEnd, now),
	}
}

func trackingHealth(reportedHealthy bool, observedAt, now time.Time) modelsv2.TrackingHealth {
	age := math.Max(now.Sub(observedAt).Seconds(), 0)
	stale := age > trackingStaleAfter.Seconds()
	return modelsv2.TrackingHealth{
		Healthy:           reportedHealthy && !stale,
		ReportedHealthy:   reportedHealthy,
		Stale:             stale,
		ObservedAt:        observedAt,
		AgeSeconds:        roundMetric(age),
		StaleAfterSeconds: int(trackingStaleAfter / time.Second),
	}
}

func trackingTargetDelta(current trackingTargetSnapshot, previous *trackingTargetSnapshot) int64 {
	if current.count <= 0 || current.processed < 0 {
		return 0
	}
	if previous == nil || previous.runID != current.runID || current.cycle < previous.cycle {
		return int64(current.processed)
	}
	if current.cycle == previous.cycle {
		return int64(max(current.processed-previous.processed, 0))
	}
	previousRemainder := max(previous.count-previous.processed, 0)
	completedCycles := current.cycle - previous.cycle - 1
	if completedCycles < 0 {
		completedCycles = 0
	}
	return int64(previousRemainder) + completedCycles*int64(current.count) + int64(current.processed)
}

func trackingTargetProgress(snapshot trackingTargetSnapshot, rate float64, now time.Time, stale bool) modelsv2.TrackingTargetProgress {
	progress := modelsv2.TrackingTargetProgress{
		TargetCount:          snapshot.count,
		CurrentCycle:         snapshot.cycle,
		ProcessedTargets:     snapshot.processed,
		TargetsPerSecond:     roundMetric(rate),
		CompletionPercentage: safePercentage(float64(snapshot.processed), float64(snapshot.count)),
	}
	remaining := max(snapshot.count-snapshot.processed, 0)
	if !stale && remaining > 0 && rate > 0 {
		seconds := roundMetric(float64(remaining) / rate)
		completion := now.Add(time.Duration(seconds * float64(time.Second))).UTC()
		progress.EstimatedSecondsRemaining = &seconds
		progress.EstimatedLoopCompletion = &completion
	}
	return progress
}

func safeRate(numerator, denominator float64) float64 {
	if denominator <= 0 || math.IsNaN(numerator) || math.IsInf(numerator, 0) {
		return 0
	}
	return roundMetric(numerator / denominator)
}

func safePercentage(numerator, denominator float64) float64 {
	return roundMetric(math.Min(math.Max(safeRate(numerator, denominator)*100, 0), 100))
}

func roundMetric(value float64) float64 {
	return math.Round(value*1000) / 1000
}

func loadTrackingProcessSeries(ctx context.Context, pool *pgxpool.Pool, start, end time.Time, bucket time.Duration, script string) ([]modelsv2.TrackingProcessSeries, error) {
	rows, err := pool.Query(ctx, trackingProcessSeriesQuery, start, end, postgresDuration(bucket), script)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	series := make(map[string]*modelsv2.TrackingProcessSeries)
	for rows.Next() {
		var timestamp, observedAt time.Time
		var name string
		var ram, uptimeMS, goroutines, heapObjects float64
		var gcCycles int64
		if err := rows.Scan(&timestamp, &name, &observedAt, &ram, &uptimeMS, &goroutines, &heapObjects, &gcCycles); err != nil {
			return nil, err
		}
		item := series[name]
		if item == nil {
			item = &modelsv2.TrackingProcessSeries{Script: name, Points: make([]modelsv2.TrackingProcessPoint, 0)}
			series[name] = item
		}
		item.Points = append(item.Points, modelsv2.TrackingProcessPoint{
			Timestamp: timestamp, ObservedAt: observedAt, RAMBytes: int64(math.Round(ram)),
			UptimeSeconds: roundMetric(uptimeMS / 1000), Goroutines: roundMetric(goroutines),
			HeapObjects: int64(math.Round(heapObjects)), GCCycles: gcCycles,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sortedProcessSeries(series), nil
}

func loadTrackingDomainSeries(ctx context.Context, pool *pgxpool.Pool, queryStart, responseStart, end time.Time, bucket time.Duration, script, domain string) ([]modelsv2.TrackingDomainSeries, error) {
	rows, err := pool.Query(ctx, trackingDomainSeriesQuery, queryStart, end, postgresDuration(bucket), script, domain)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	series := make(map[string]*modelsv2.TrackingDomainSeries)
	previous := make(map[string]trackingTargetSnapshot)
	for rows.Next() {
		var timestamp, observedAt time.Time
		var name, domainName string
		var runID int64
		var durationSeconds, requestLatencyMS, processDurationMS, storeDurationMS float64
		var requests, writes, errorCount, processingCount int64
		var storeBatches, rowsRequested, rowsAffected int64
		var queueDepth, targetCount, targetProcessed int
		var targetCycle int64
		var reportedHealthy bool
		if err := rows.Scan(&timestamp, &name, &domainName, &observedAt, &runID,
			&durationSeconds, &requests, &writes, &errorCount, &requestLatencyMS,
			&queueDepth, &reportedHealthy, &processingCount, &processDurationMS,
			&storeBatches, &rowsRequested, &rowsAffected, &storeDurationMS,
			&targetCount, &targetCycle, &targetProcessed); err != nil {
			return nil, err
		}
		key := name + "\x00" + domainName
		current := trackingTargetSnapshot{runID: runID, count: targetCount, cycle: targetCycle, processed: targetProcessed, observedAt: observedAt}
		prior, hasPrior := previous[key]
		previous[key] = current
		if timestamp.Before(responseStart) {
			continue
		}
		var priorPointer *trackingTargetSnapshot
		if hasPrior {
			priorPointer = &prior
		}
		targetDuration := durationSeconds
		if hasPrior && observedAt.After(prior.observedAt) {
			targetDuration = observedAt.Sub(prior.observedAt).Seconds()
		}
		targetRate := safeRate(float64(trackingTargetDelta(current, priorPointer)), targetDuration)
		item := series[key]
		if item == nil {
			item = &modelsv2.TrackingDomainSeries{Script: name, Domain: domainName, Points: make([]modelsv2.TrackingDomainPoint, 0)}
			series[key] = item
		}
		item.Points = append(item.Points, modelsv2.TrackingDomainPoint{
			Timestamp: timestamp, ObservedAt: observedAt,
			IntervalDurationSeconds: roundMetric(durationSeconds),
			RequestCount:            requests, RequestsPerSecond: safeRate(float64(requests), durationSeconds),
			ErrorCount: errorCount, ErrorRate: safeRate(float64(errorCount), float64(requests)),
			AverageRequestLatencyMS: safeRate(requestLatencyMS, float64(requests)),
			WriteCount:              writes, WritesPerSecond: safeRate(float64(writes), durationSeconds),
			ProcessingCount:             processingCount,
			AverageProcessingDurationMS: safeRate(processDurationMS, float64(processingCount)),
			QueueDepth:                  queueDepth,
			Database: modelsv2.TrackingDatabaseMetrics{
				BatchCount: storeBatches, RowsRequested: rowsRequested, RowsAffected: rowsAffected,
				AverageStoreDurationMS: safeRate(storeDurationMS, float64(storeBatches)),
			},
			Targets:         trackingTargetProgress(current, targetRate, observedAt, false),
			ReportedHealthy: reportedHealthy,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sortedDomainSeries(series), nil
}

func postgresDuration(value time.Duration) string {
	return value.String()
}

func sortedProcessSeries(values map[string]*modelsv2.TrackingProcessSeries) []modelsv2.TrackingProcessSeries {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]modelsv2.TrackingProcessSeries, 0, len(keys))
	for _, key := range keys {
		out = append(out, *values[key])
	}
	return out
}

func sortedDomainSeries(values map[string]*modelsv2.TrackingDomainSeries) []modelsv2.TrackingDomainSeries {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]modelsv2.TrackingDomainSeries, 0, len(keys))
	for _, key := range keys {
		out = append(out, *values[key])
	}
	return out
}
