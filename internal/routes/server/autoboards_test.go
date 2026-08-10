package server

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
)

func withTestAutoBoardRegistry(t *testing.T) {
	t.Helper()
	previous := autoBoardRegistry
	autoBoardRegistry = map[string]autoBoardDefinition{
		"fixture": {
			BoardType:            "fixture",
			Label:                "Fixture board",
			TargetKind:           "location",
			TargetMin:            1,
			TargetMax:            2,
			AllowedTargetScopes:  []string{autoBoardScopeFamily, autoBoardScopeCustom},
			AllowedDeliveryModes: []string{autoBoardModeRefresh, autoBoardModeSend},
			RefreshMinimum:       15,
			RefreshMaximum:       1440,
			RefreshDefault:       60,
			UICapabilities:       []string{"compact"},
			NormalizeTarget: func(value string) (string, error) {
				if strings.Contains(value, " ") {
					return "", errors.New("must not contain spaces")
				}
				return strings.ToLower(value), nil
			},
		},
	}
	t.Cleanup(func() {
		autoBoardRegistry = previous
	})
}

func TestAutoBoardCapabilitiesExposeRegistryContract(t *testing.T) {
	withTestAutoBoardRegistry(t)

	items := autoBoardCapabilities()
	if len(items) != 1 {
		t.Fatalf("capabilities count = %d, want 1", len(items))
	}
	item := items[0]
	if item.BoardType != "fixture" || item.Label != "Fixture board" ||
		item.TargetKind != "location" || item.MinTargets != 1 || item.MaxTargets != 2 {
		t.Fatalf("unexpected capability: %#v", item)
	}
	if item.RefreshInterval == nil || item.RefreshInterval.MinMinutes != 15 ||
		item.RefreshInterval.MaxMinutes != 1440 || item.RefreshInterval.DefaultMinutes != 60 {
		t.Fatalf("unexpected refresh interval: %#v", item.RefreshInterval)
	}
}

func TestSampleAutoBoardRegistryExercisesDashboardCapabilities(t *testing.T) {
	items := autoBoardCapabilities()
	if len(items) != 5 {
		t.Fatalf("sample capabilities count = %d, want 5", len(items))
	}

	byType := make(map[string]modelsv2.AutoBoardTypeCapability, len(items))
	for _, item := range items {
		byType[item.BoardType] = item
	}

	family := byType["sample-family-overview"]
	if family.Label != "Sample · Family overview" ||
		len(family.AllowedScopes) != 1 || family.AllowedScopes[0] != autoBoardScopeFamily ||
		len(family.AllowedModes) != 2 || family.RefreshInterval == nil {
		t.Fatalf("unexpected family sample: %#v", family)
	}

	location := byType["sample-location-rankings"]
	if location.TargetKind != "location" || location.MinTargets != 1 || location.MaxTargets != 1 {
		t.Fatalf("unexpected location sample: %#v", location)
	}

	player := byType["sample-player-leaderboard"]
	if player.TargetKind != "player" || len(player.AllowedModes) != 1 || player.AllowedModes[0] != autoBoardModeSend || player.RefreshInterval != nil {
		t.Fatalf("unexpected player sample: %#v", player)
	}

	war := byType["sample-war-summary"]
	if war.TargetKind != "war" || war.MinTargets != 1 || war.MaxTargets != 1 {
		t.Fatalf("unexpected war sample: %#v", war)
	}

	payload, err := json.Marshal(modelsv2.AutoBoardCapabilitiesResponse{BoardTypes: items})
	if err != nil {
		t.Fatalf("marshal sample capabilities: %v", err)
	}
	if strings.Contains(string(payload), `"uiCapabilities":null`) {
		t.Fatalf("sample capability arrays must serialize as arrays: %s", payload)
	}
}

func TestValidateAutoBoardRefreshNormalizesOpaqueTargets(t *testing.T) {
	withTestAutoBoardRegistry(t)
	interval := 30
	threadID := "1127708751479197812"
	now := time.Date(2026, time.July, 30, 12, 0, 0, 0, time.UTC)
	previousNow := autoBoardNow
	autoBoardNow = func() time.Time { return now }
	t.Cleanup(func() { autoBoardNow = previousNow })

	write, err := validateAutoBoardWrite(modelsv2.AutoBoardWriteRequest{
		BoardType:       "fixture",
		TargetScope:     autoBoardScopeCustom,
		Targets:         []string{" Global ", "global", "32000007"},
		DeliveryMode:    autoBoardModeRefresh,
		ChannelID:       "1127708751479197806",
		ThreadID:        &threadID,
		Enabled:         true,
		IntervalMinutes: &interval,
	})
	if err != nil {
		t.Fatalf("validateAutoBoardWrite() error = %v", err)
	}
	if got, want := strings.Join(write.Targets, ","), "global,32000007"; got != want {
		t.Fatalf("targets = %q, want %q", got, want)
	}
	if write.NextRunAt == nil || !write.NextRunAt.Equal(now.Add(30*time.Minute)) {
		t.Fatalf("next_run_at = %v", write.NextRunAt)
	}
}

func TestValidateAutoBoardFamilyRejectsTargets(t *testing.T) {
	withTestAutoBoardRegistry(t)
	interval := 60
	_, err := validateAutoBoardWrite(modelsv2.AutoBoardWriteRequest{
		BoardType:       "fixture",
		TargetScope:     autoBoardScopeFamily,
		Targets:         []string{"#CLAN"},
		DeliveryMode:    autoBoardModeRefresh,
		ChannelID:       "1127708751479197806",
		IntervalMinutes: &interval,
	})
	assertAutoBoardFieldError(t, err, "targets")
}

func TestValidateAutoBoardWeekdaySendSchedule(t *testing.T) {
	withTestAutoBoardRegistry(t)
	now := time.Date(2026, time.July, 30, 17, 0, 0, 0, time.UTC)
	previousNow := autoBoardNow
	autoBoardNow = func() time.Time { return now }
	t.Cleanup(func() { autoBoardNow = previousNow })

	write, err := validateAutoBoardWrite(modelsv2.AutoBoardWriteRequest{
		BoardType:    "fixture",
		TargetScope:  autoBoardScopeCustom,
		Targets:      []string{"global"},
		DeliveryMode: autoBoardModeSend,
		ChannelID:    "1127708751479197806",
		Enabled:      true,
		Schedule: &modelsv2.AutoBoardSchedule{
			Kind:      "weekdays",
			TimeOfDay: "13:45",
			Weekdays:  []int{5, 1},
		},
	})
	if err != nil {
		t.Fatalf("validateAutoBoardWrite() error = %v", err)
	}
	if got, want := write.ScheduleWeekdays, []int16{1, 5}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("weekdays = %#v, want %#v", got, want)
	}
	if want := time.Date(2026, time.July, 31, 13, 45, 0, 0, time.UTC); write.NextRunAt == nil || !write.NextRunAt.Equal(want) {
		t.Fatalf("next_run_at = %v, want %v", write.NextRunAt, want)
	}
}

func TestAutoBoardModelsExposeOnlyTypedCleanBreakFields(t *testing.T) {
	payload, err := json.Marshal(modelsv2.AutoBoardWriteRequest{})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var fields map[string]any
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	for _, retired := range []string{"type", "button_id", "webhook_id", "messageId", "days", "locale", "data"} {
		if _, exists := fields[retired]; exists {
			t.Fatalf("request still exposes retired field %q", retired)
		}
	}
	for _, required := range []string{
		"boardType", "targetScope", "targets", "deliveryMode", "channelId", "threadId",
		"enabled", "intervalMinutes", "schedule",
	} {
		if _, exists := fields[required]; !exists {
			t.Fatalf("request is missing %q", required)
		}
	}
}

func TestAutoBoardSQLUsesFinalTypedTablesAndColumns(t *testing.T) {
	source, err := os.ReadFile("autoboards.go")
	if err != nil {
		t.Fatalf("read autoboards.go: %v", err)
	}
	text := string(source)
	for _, required := range []string{
		"LEFT JOIN autoboard_targets",
		"INSERT INTO autoboard_targets (autoboard_id, position, target)",
		"target_scope",
		"delivery_mode",
		"schedule_kind",
		"schedule_time",
		"schedule_weekdays",
		"schedule_day_of_month",
		"FindOrCreateLogWebhook",
		"message_id = $8",
		"last_run_at = NULL",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("autoboards.go is missing %q", required)
		}
	}
	for _, retired := range []string{
		"schedule_timezone",
		"SELECT id::text, type, board_type, button_id",
		"INSERT INTO autoboards (\n\t\t\tserver_id, type",
		" data, created_at",
		" days, locale",
	} {
		if strings.Contains(text, retired) {
			t.Fatalf("autoboards.go still contains retired contract %q", retired)
		}
	}
}

func assertAutoBoardFieldError(t *testing.T, err error, field string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s validation error", field)
	}
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) || len(appErr.Details) != 1 || appErr.Details[0].Field != field {
		t.Fatalf("unexpected error: %v", err)
	}
}
