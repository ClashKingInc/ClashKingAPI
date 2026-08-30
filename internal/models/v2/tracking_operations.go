package modelsv2

import "time"

// TrackingHealth describes whether an observation is both reported healthy and fresh.
type TrackingHealth struct {
	Healthy           bool      `json:"healthy"`
	ReportedHealthy   bool      `json:"reported_healthy"`
	Stale             bool      `json:"stale"`
	ObservedAt        time.Time `json:"observed_at"`
	AgeSeconds        float64   `json:"age_seconds"`
	StaleAfterSeconds int       `json:"stale_after_seconds"`
}

// TrackingProcessState is the latest runtime observation for one tracking script.
type TrackingProcessState struct {
	Script           string         `json:"script"`
	RunID            int64          `json:"run_id"`
	IntervalStart    time.Time      `json:"interval_start"`
	IntervalEnd      time.Time      `json:"interval_end"`
	ProcessStartedAt time.Time      `json:"process_started_at"`
	RAMBytes         int64          `json:"ram_bytes"` // Go heap bytes reported by tracking_process_stats.alloc_bytes.
	UptimeSeconds    float64        `json:"uptime_seconds"`
	Goroutines       int            `json:"goroutines"`
	HeapObjects      int64          `json:"heap_objects"`
	GCCycles         int64          `json:"gc_cycles"`
	Health           TrackingHealth `json:"health"`
}

// TrackingDatabaseMetrics contains database write activity for an interval.
type TrackingDatabaseMetrics struct {
	BatchCount             int64   `json:"batch_count"`
	RowsRequested          int64   `json:"rows_requested"`
	RowsAffected           int64   `json:"rows_affected"`
	AverageStoreDurationMS float64 `json:"average_store_duration_ms"`
}

// TrackingTargetProgress contains the current loop position and API-derived rate/ETA.
type TrackingTargetProgress struct {
	TargetCount               int        `json:"target_count"`
	CurrentCycle              int64      `json:"current_cycle"`
	ProcessedTargets          int        `json:"processed_targets"`
	TargetsPerSecond          float64    `json:"targets_per_second"`
	CompletionPercentage      float64    `json:"completion_percentage"`
	EstimatedSecondsRemaining *float64   `json:"estimated_seconds_remaining,omitempty"`
	EstimatedLoopCompletion   *time.Time `json:"estimated_loop_completion,omitempty"`
}

// TrackingLatestError is the most recently reported domain error and when it was observed.
type TrackingLatestError struct {
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// TrackingDomainState is the latest operational observation for one script/domain pair.
type TrackingDomainState struct {
	Script                      string                  `json:"script"`
	Domain                      string                  `json:"domain"`
	RunID                       int64                   `json:"run_id"`
	IntervalStart               time.Time               `json:"interval_start"`
	IntervalEnd                 time.Time               `json:"interval_end"`
	IntervalDurationSeconds     float64                 `json:"interval_duration_seconds"`
	LastSuccess                 *time.Time              `json:"last_success,omitempty"`
	LatestError                 *TrackingLatestError    `json:"latest_error" extensions:"x-nullable"`
	RequestCount                int64                   `json:"request_count"`
	RequestsPerSecond           float64                 `json:"requests_per_second"`
	ErrorCount                  int64                   `json:"error_count"`
	ErrorRate                   float64                 `json:"error_rate"`
	AverageRequestLatencyMS     float64                 `json:"average_request_latency_ms"`
	WriteCount                  int64                   `json:"write_count"`
	WritesPerSecond             float64                 `json:"writes_per_second"`
	ProcessingCount             int64                   `json:"processing_count"`
	AverageProcessingDurationMS float64                 `json:"average_processing_duration_ms"`
	QueueDepth                  int                     `json:"queue_depth"`
	Database                    TrackingDatabaseMetrics `json:"database"`
	Targets                     *TrackingTargetProgress `json:"targets" extensions:"x-nullable"`
	Health                      TrackingHealth          `json:"health"`
}

type TrackingOperationsSummaryResponse struct {
	GeneratedAt       time.Time              `json:"generated_at"`
	StaleAfterSeconds int                    `json:"stale_after_seconds"`
	Processes         []TrackingProcessState `json:"processes"`
	Domains           []TrackingDomainState  `json:"domains"`
}

// TrackingProcessPoint is one bounded chart bucket for a tracking process.
type TrackingProcessPoint struct {
	Timestamp     time.Time `json:"timestamp"`
	ObservedAt    time.Time `json:"observed_at"`
	RAMBytes      int64     `json:"ram_bytes"`
	UptimeSeconds float64   `json:"uptime_seconds"`
	Goroutines    float64   `json:"goroutines"`
	HeapObjects   int64     `json:"heap_objects"`
	GCCycles      int64     `json:"gc_cycles"`
}

type TrackingProcessSeries struct {
	Script string                 `json:"script"`
	Points []TrackingProcessPoint `json:"points"`
}

// TrackingDomainPoint is one bounded chart bucket with API-derived rates.
type TrackingDomainPoint struct {
	Timestamp                   time.Time               `json:"timestamp"`
	ObservedAt                  time.Time               `json:"observed_at"`
	IntervalDurationSeconds     float64                 `json:"interval_duration_seconds"`
	RequestCount                int64                   `json:"request_count"`
	RequestsPerSecond           float64                 `json:"requests_per_second"`
	ErrorCount                  int64                   `json:"error_count"`
	ErrorRate                   float64                 `json:"error_rate"`
	AverageRequestLatencyMS     float64                 `json:"average_request_latency_ms"`
	WriteCount                  int64                   `json:"write_count"`
	WritesPerSecond             float64                 `json:"writes_per_second"`
	ProcessingCount             int64                   `json:"processing_count"`
	AverageProcessingDurationMS float64                 `json:"average_processing_duration_ms"`
	QueueDepth                  int                     `json:"queue_depth"`
	Database                    TrackingDatabaseMetrics `json:"database"`
	Targets                     *TrackingTargetProgress `json:"targets" extensions:"x-nullable"`
	ReportedHealthy             bool                    `json:"reported_healthy"`
}

type TrackingDomainSeries struct {
	Script string                `json:"script"`
	Domain string                `json:"domain"`
	Points []TrackingDomainPoint `json:"points"`
}

type TrackingOperationsTimeSeriesResponse struct {
	GeneratedAt        time.Time               `json:"generated_at"`
	Window             string                  `json:"window"`
	Start              time.Time               `json:"start"`
	End                time.Time               `json:"end"`
	BucketSeconds      int                     `json:"bucket_seconds"`
	MaxPointsPerSeries int                     `json:"max_points_per_series"`
	Processes          []TrackingProcessSeries `json:"processes"`
	Domains            []TrackingDomainSeries  `json:"domains"`
}
