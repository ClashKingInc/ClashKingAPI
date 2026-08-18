package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	autoBoardScopeFamily = "family"
	autoBoardScopeCustom = "custom"
	autoBoardModeRefresh = "refresh"
	autoBoardModeSend    = "send"
)

type autoBoardDefinition struct {
	BoardType            string
	Label                string
	TargetKind           string
	TargetMin            int
	TargetMax            int
	AllowedTargetScopes  []string
	AllowedDeliveryModes []string
	RefreshMinimum       int
	RefreshMaximum       int
	RefreshDefault       int
	UICapabilities       []string
	NormalizeTarget      func(string) (string, error)
}

// These sample definitions exercise the management contract while the final
// product catalog and executor implementations are still being designed.
// Keeping the sample prefix makes that boundary explicit in stored rows and
// in the Dashboard. Adding or replacing a board remains a registry-only change.
var autoBoardRegistry = map[string]autoBoardDefinition{
	"sample-family-overview": {
		BoardType:            "sample-family-overview",
		Label:                "Sample · Family overview",
		TargetKind:           "clan",
		TargetMin:            0,
		TargetMax:            0,
		AllowedTargetScopes:  []string{autoBoardScopeFamily},
		AllowedDeliveryModes: []string{autoBoardModeRefresh, autoBoardModeSend},
		RefreshMinimum:       15,
		RefreshMaximum:       1440,
		RefreshDefault:       60,
		UICapabilities:       []string{},
	},
	"sample-clan-activity": {
		BoardType:            "sample-clan-activity",
		Label:                "Sample · Clan activity",
		TargetKind:           "clan",
		TargetMin:            1,
		TargetMax:            5,
		AllowedTargetScopes:  []string{autoBoardScopeCustom},
		AllowedDeliveryModes: []string{autoBoardModeRefresh},
		RefreshMinimum:       15,
		RefreshMaximum:       360,
		RefreshDefault:       30,
		UICapabilities:       []string{},
	},
	"sample-player-leaderboard": {
		BoardType:            "sample-player-leaderboard",
		Label:                "Sample · Player leaderboard",
		TargetKind:           "player",
		TargetMin:            1,
		TargetMax:            25,
		AllowedTargetScopes:  []string{autoBoardScopeCustom},
		AllowedDeliveryModes: []string{autoBoardModeSend},
		UICapabilities:       []string{},
	},
	"sample-location-rankings": {
		BoardType:            "sample-location-rankings",
		Label:                "Sample · Location rankings",
		TargetKind:           "location",
		TargetMin:            1,
		TargetMax:            1,
		AllowedTargetScopes:  []string{autoBoardScopeCustom},
		AllowedDeliveryModes: []string{autoBoardModeRefresh, autoBoardModeSend},
		RefreshMinimum:       30,
		RefreshMaximum:       1440,
		RefreshDefault:       120,
		UICapabilities:       []string{},
	},
	"sample-war-summary": {
		BoardType:            "sample-war-summary",
		Label:                "Sample · War summary",
		TargetKind:           "war",
		TargetMin:            1,
		TargetMax:            1,
		AllowedTargetScopes:  []string{autoBoardScopeCustom},
		AllowedDeliveryModes: []string{autoBoardModeSend},
		UICapabilities:       []string{},
	},
}

var autoBoardNow = time.Now

type validatedAutoBoardWrite struct {
	Definition       autoBoardDefinition
	BoardType        string
	TargetScope      string
	Targets          []string
	DeliveryMode     string
	ChannelID        int64
	ThreadID         *int64
	ThreadIDText     *string
	MessageID        *string
	Enabled          bool
	IntervalMinutes  *int
	ScheduleKind     *string
	ScheduleTime     *string
	ScheduleWeekdays []int16
	ScheduleDay      *int16
	NextRunAt        *time.Time
}

type autoBoardRow struct {
	ID               string
	BoardType        string
	TargetScope      string
	Targets          []string
	DeliveryMode     string
	WebhookID        string
	ThreadID         *string
	MessageID        *string
	Enabled          bool
	IntervalMinutes  *int
	ScheduleKind     *string
	ScheduleTime     *string
	ScheduleWeekdays []int16
	ScheduleDay      *int16
	NextRunAt        *time.Time
	LastRunAt        *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// getAutoboardCapabilities godoc
// @Summary Get autoboard capabilities
// @Description Returns the code-owned board-type registry used by Dashboard. No board type is inferred from stored rows.
// @Tags Server Autoboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.AutoBoardCapabilitiesResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/autoboards/capabilities [get]
func getAutoboardCapabilities(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardCapabilitiesResponse{
			BoardTypes: autoBoardCapabilities(),
		})
	}
}

// getAutoboards godoc
// @Summary Get server autoboards
// @Description Returns typed autoboards and resolves each stored webhook back to its Discord parent channel.
// @Tags Server Autoboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.ServerAutoBoardsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/autoboards [get]
func getAutoboards(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		rows, err := sqlAutoboards(c, rt, serverID, "")
		if err != nil {
			return err
		}
		channelIDs := resolveAutoboardChannels(c, rt, rows)
		items := make([]modelsv2.AutoBoardConfig, 0, len(rows))
		refreshCount := 0
		sendCount := 0
		for _, row := range rows {
			if row.DeliveryMode == autoBoardModeRefresh {
				refreshCount++
			} else if row.DeliveryMode == autoBoardModeSend {
				sendCount++
			}
			items = append(items, autoBoardConfigFromRow(row, channelIDs))
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerAutoBoardsResponse{
			Items:        items,
			Total:        len(items),
			RefreshCount: refreshCount,
			SendCount:    sendCount,
			Limit:        asIntWithDefault(serverDoc["autoboard_limit"], 10),
		})
	}
}

// createAutoboard godoc
// @Summary Create an autoboard
// @Description Creates a typed autoboard after validating its registry capability, target scope, delivery schedule, and Discord destination.
// @Tags Server Autoboards
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param request body modelsv2.CreateAutoBoardRequest true "Autoboard"
// @Success 201 {object} modelsv2.AutoBoardItemResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/autoboards [post]
func createAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.CreateAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		write, err := validateAutoBoardWrite(body)
		if err != nil {
			return err
		}
		webhookID, err := prepareAutoBoardDestination(c, rt, serverID, write)
		if err != nil {
			return err
		}

		tx, err := rt.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var limit, count int
		if err := tx.QueryRow(c.UserContext(), `
			SELECT autoboard_limit
			FROM servers
			WHERE id = $1
			FOR UPDATE
		`, strconv.Itoa(serverID)).Scan(&limit); err != nil {
			return notFoundErr(err, "Server not found")
		}
		if err := tx.QueryRow(c.UserContext(), `SELECT count(*)::int FROM autoboards WHERE server_id = $1`, strconv.Itoa(serverID)).Scan(&count); err != nil {
			return err
		}
		if count >= limit {
			return autoBoardValidationError("autoboards", fmt.Sprintf("server autoboard limit reached (%d/%d)", count, limit))
		}
		id, err := insertAutoBoard(c, tx, serverID, webhookID, write)
		if err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		item, err := loadAutoBoardConfig(c, rt, serverID, id)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, modelsv2.AutoBoardItemResponse{Item: item})
	}
}

// replaceAutoboard godoc
// @Summary Replace an autoboard
// @Description Fully replaces an autoboard. This endpoint is not a partial patch.
// @Tags Server Autoboards
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Param request body modelsv2.ReplaceAutoBoardRequest true "Complete replacement"
// @Success 200 {object} modelsv2.AutoBoardItemResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [put]
func replaceAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := parseAutoBoardID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		var exists bool
		if err := rt.Store.SQL.QueryRow(c.UserContext(), `
			SELECT EXISTS(SELECT 1 FROM autoboards WHERE server_id = $1 AND id = $2::uuid)
		`, strconv.Itoa(serverID), id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		var body modelsv2.ReplaceAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		write, err := validateAutoBoardWrite(body)
		if err != nil {
			return err
		}
		webhookID, err := prepareAutoBoardDestination(c, rt, serverID, write)
		if err != nil {
			return err
		}

		tx, err := rt.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var lockedID string
		if err := tx.QueryRow(c.UserContext(), `
			SELECT id::text FROM autoboards
			WHERE server_id = $1 AND id = $2::uuid
			FOR UPDATE
		`, strconv.Itoa(serverID), id).Scan(&lockedID); err != nil {
			return notFoundErr(err, "Autoboard not found")
		}
		if _, err := tx.Exec(c.UserContext(), `
			UPDATE autoboards
			SET board_type = $3,
				target_scope = $4,
				delivery_mode = $5,
				webhook_id = $6,
				thread_id = $7,
				message_id = $8,
				enabled = $9,
				interval_minutes = $10,
				schedule_kind = $11,
				schedule_time = $12::time,
				schedule_weekdays = $13,
				schedule_day_of_month = $14,
				next_run_at = $15,
				last_run_at = NULL,
				updated_at = now()
			WHERE server_id = $1 AND id = $2::uuid
		`, strconv.Itoa(serverID), id, write.BoardType, write.TargetScope, write.DeliveryMode,
			webhookID, write.ThreadIDText, write.MessageID, write.Enabled, write.IntervalMinutes,
			write.ScheduleKind, write.ScheduleTime, nullableAutoBoardWeekdays(write.ScheduleWeekdays),
			write.ScheduleDay, write.NextRunAt); err != nil {
			return err
		}
		if err := replaceAutoBoardTargets(c, tx, id, write.Targets); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		item, err := loadAutoBoardConfig(c, rt, serverID, id)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardItemResponse{Item: item})
	}
}

// deleteAutoboard godoc
// @Summary Delete an autoboard
// @Description Deletes a server-scoped autoboard and its normalized targets.
// @Tags Server Autoboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Success 200 {object} modelsv2.AutoBoardDeleteResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [delete]
func deleteAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := parseAutoBoardID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM autoboards WHERE server_id = $1 AND id = $2::uuid
		`, strconv.Itoa(serverID), id)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardDeleteResponse{ID: id, Deleted: true})
	}
}

func autoBoardCapabilities() []modelsv2.AutoBoardTypeCapability {
	keys := make([]string, 0, len(autoBoardRegistry))
	for key := range autoBoardRegistry {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	items := make([]modelsv2.AutoBoardTypeCapability, 0, len(keys))
	for _, key := range keys {
		definition := autoBoardRegistry[key]
		var interval *modelsv2.AutoBoardRefreshIntervalCapability
		if containsString(definition.AllowedDeliveryModes, autoBoardModeRefresh) {
			interval = &modelsv2.AutoBoardRefreshIntervalCapability{
				MinMinutes:     definition.RefreshMinimum,
				MaxMinutes:     definition.RefreshMaximum,
				DefaultMinutes: definition.RefreshDefault,
			}
		}
		items = append(items, modelsv2.AutoBoardTypeCapability{
			BoardType:       definition.BoardType,
			Label:           definition.Label,
			TargetKind:      definition.TargetKind,
			MinTargets:      definition.TargetMin,
			MaxTargets:      definition.TargetMax,
			AllowedScopes:   append([]string{}, definition.AllowedTargetScopes...),
			AllowedModes:    append([]string{}, definition.AllowedDeliveryModes...),
			RefreshInterval: interval,
			UICapabilities:  append([]string{}, definition.UICapabilities...),
		})
	}
	return items
}

func validateAutoBoardWrite(body modelsv2.AutoBoardWriteRequest) (validatedAutoBoardWrite, error) {
	boardType := strings.TrimSpace(body.BoardType)
	definition, ok := autoBoardRegistry[boardType]
	if !ok {
		return validatedAutoBoardWrite{}, autoBoardValidationError("boardType", "is not a supported board type")
	}
	scope := strings.TrimSpace(body.TargetScope)
	if !containsString(definition.AllowedTargetScopes, scope) {
		return validatedAutoBoardWrite{}, autoBoardValidationError("targetScope", "is not allowed for this board type")
	}
	targets, err := normalizeAutoBoardTargets(definition, scope, body.Targets)
	if err != nil {
		return validatedAutoBoardWrite{}, err
	}
	mode := strings.TrimSpace(body.DeliveryMode)
	if !containsString(definition.AllowedDeliveryModes, mode) {
		return validatedAutoBoardWrite{}, autoBoardValidationError("deliveryMode", "is not allowed for this board type")
	}
	channelID, err := parseDiscordDestinationID(body.ChannelID, "channelId")
	if err != nil {
		return validatedAutoBoardWrite{}, err
	}
	threadID, err := parseOptionalDiscordDestinationID(body.ThreadID, "threadId")
	if err != nil {
		return validatedAutoBoardWrite{}, err
	}
	threadText := normalizedOptionalString(body.ThreadID)
	write := validatedAutoBoardWrite{
		Definition:      definition,
		BoardType:       boardType,
		TargetScope:     scope,
		Targets:         targets,
		DeliveryMode:    mode,
		ChannelID:       channelID,
		ThreadID:        threadID,
		ThreadIDText:    threadText,
		Enabled:         body.Enabled,
		IntervalMinutes: body.IntervalMinutes,
	}
	now := autoBoardNow().UTC()
	switch mode {
	case autoBoardModeRefresh:
		if body.Schedule != nil {
			return validatedAutoBoardWrite{}, autoBoardValidationError("schedule", "must be null for refresh delivery")
		}
		if body.IntervalMinutes == nil || *body.IntervalMinutes < definition.RefreshMinimum || *body.IntervalMinutes > definition.RefreshMaximum {
			return validatedAutoBoardWrite{}, autoBoardValidationError(
				"intervalMinutes",
				fmt.Sprintf("must be between %d and %d for this board type", definition.RefreshMinimum, definition.RefreshMaximum),
			)
		}
		if body.Enabled {
			next := now.Add(time.Duration(*body.IntervalMinutes) * time.Minute)
			write.NextRunAt = &next
		}
	case autoBoardModeSend:
		if body.IntervalMinutes != nil {
			return validatedAutoBoardWrite{}, autoBoardValidationError("intervalMinutes", "must be null for send delivery")
		}
		if body.Schedule == nil {
			return validatedAutoBoardWrite{}, autoBoardValidationError("schedule", "is required for send delivery")
		}
		if err := validateAutoBoardSchedule(&write, *body.Schedule, now); err != nil {
			return validatedAutoBoardWrite{}, err
		}
	default:
		return validatedAutoBoardWrite{}, autoBoardValidationError("deliveryMode", "must be refresh or send")
	}
	return write, nil
}

func normalizeAutoBoardTargets(definition autoBoardDefinition, scope string, input []string) ([]string, error) {
	if scope == autoBoardScopeFamily {
		if len(input) != 0 {
			return nil, autoBoardValidationError("targets", "must be empty for family scope")
		}
		return []string{}, nil
	}
	if scope != autoBoardScopeCustom {
		return nil, autoBoardValidationError("targetScope", "must be family or custom")
	}
	targets := make([]string, 0, len(input))
	seen := map[string]struct{}{}
	for _, raw := range input {
		target := strings.TrimSpace(raw)
		var err error
		if definition.NormalizeTarget != nil {
			target, err = definition.NormalizeTarget(target)
			if err != nil {
				return nil, autoBoardValidationError("targets", err.Error())
			}
		}
		if target == "" {
			return nil, autoBoardValidationError("targets", "must not contain blank values")
		}
		if _, exists := seen[target]; exists {
			continue
		}
		seen[target] = struct{}{}
		targets = append(targets, target)
	}
	if len(targets) < definition.TargetMin || len(targets) > definition.TargetMax {
		return nil, autoBoardValidationError(
			"targets",
			fmt.Sprintf("must contain between %d and %d unique values for this board type", definition.TargetMin, definition.TargetMax),
		)
	}
	return targets, nil
}

func validateAutoBoardSchedule(write *validatedAutoBoardWrite, schedule modelsv2.AutoBoardSchedule, now time.Time) error {
	kind := strings.TrimSpace(schedule.Kind)
	parsedTime, err := time.Parse("15:04", strings.TrimSpace(schedule.TimeOfDay))
	if err != nil || parsedTime.Format("15:04") != strings.TrimSpace(schedule.TimeOfDay) {
		return autoBoardValidationError("schedule.timeOfDay", "must use 24-hour HH:MM format")
	}
	timeOfDay := parsedTime.Format("15:04")
	write.ScheduleKind = &kind
	write.ScheduleTime = &timeOfDay

	var weekdays []int
	var dayOfMonth int
	switch kind {
	case "daily":
		if len(schedule.Weekdays) != 0 || schedule.DayOfMonth != nil {
			return autoBoardValidationError("schedule", "daily schedules cannot include weekdays or dayOfMonth")
		}
	case "weekdays":
		if schedule.DayOfMonth != nil || len(schedule.Weekdays) == 0 || len(schedule.Weekdays) > 7 {
			return autoBoardValidationError("schedule.weekdays", "must contain between 1 and 7 ISO weekdays and no dayOfMonth")
		}
		seen := map[int]struct{}{}
		for _, weekday := range schedule.Weekdays {
			if weekday < 1 || weekday > 7 {
				return autoBoardValidationError("schedule.weekdays", "values must be ISO weekdays 1 through 7")
			}
			seen[weekday] = struct{}{}
		}
		if len(seen) != len(schedule.Weekdays) {
			return autoBoardValidationError("schedule.weekdays", "must not contain duplicates")
		}
		weekdays = append([]int(nil), schedule.Weekdays...)
		sort.Ints(weekdays)
		write.ScheduleWeekdays = make([]int16, len(weekdays))
		for i, weekday := range weekdays {
			write.ScheduleWeekdays[i] = int16(weekday)
		}
	case "day_of_month":
		if len(schedule.Weekdays) != 0 || schedule.DayOfMonth == nil || *schedule.DayOfMonth < 1 || *schedule.DayOfMonth > 31 {
			return autoBoardValidationError("schedule.dayOfMonth", "must be between 1 and 31 and cannot be combined with weekdays")
		}
		dayOfMonth = *schedule.DayOfMonth
		day := int16(dayOfMonth)
		write.ScheduleDay = &day
	default:
		return autoBoardValidationError("schedule.kind", "must be daily, weekdays, or day_of_month")
	}
	if write.Enabled {
		next := nextAutoBoardScheduleRun(now, time.UTC, parsedTime.Hour(), parsedTime.Minute(), kind, weekdays, dayOfMonth)
		write.NextRunAt = &next
	}
	return nil
}

func nextAutoBoardScheduleRun(now time.Time, location *time.Location, hour, minute int, kind string, weekdays []int, dayOfMonth int) time.Time {
	localNow := now.In(location)
	switch kind {
	case "daily":
		candidate := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), hour, minute, 0, 0, location)
		if !candidate.After(localNow) {
			candidate = candidate.AddDate(0, 0, 1)
		}
		return candidate.UTC()
	case "weekdays":
		allowed := map[int]struct{}{}
		for _, weekday := range weekdays {
			allowed[weekday] = struct{}{}
		}
		for offset := 0; offset <= 7; offset++ {
			day := localNow.AddDate(0, 0, offset)
			candidate := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, location)
			isoWeekday := int(candidate.Weekday())
			if isoWeekday == 0 {
				isoWeekday = 7
			}
			if _, ok := allowed[isoWeekday]; ok && candidate.After(localNow) {
				return candidate.UTC()
			}
		}
	case "day_of_month":
		for offset := 0; offset < 24; offset++ {
			month := localNow.AddDate(0, offset, 0)
			candidate := time.Date(month.Year(), month.Month(), dayOfMonth, hour, minute, 0, 0, location)
			if candidate.Month() == month.Month() && candidate.After(localNow) {
				return candidate.UTC()
			}
		}
	}
	return now.UTC()
}

func prepareAutoBoardDestination(c *fiber.Ctx, rt apptypes.Deps, serverID int, write validatedAutoBoardWrite) (string, error) {
	if err := validateDiscordDestination(c, rt, serverID, write.ChannelID, write.ThreadID); err != nil {
		return "", camelCaseAutoBoardDestinationError(err)
	}
	webhook, err := rt.Discord.FindOrCreateLogWebhook(c.UserContext(), int64(serverID), write.ChannelID)
	if err != nil {
		return "", apptypes.Error(http.StatusBadGateway, "Failed to prepare Discord webhook")
	}
	return webhook.ID().String(), nil
}

func camelCaseAutoBoardDestinationError(err error) error {
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) {
		return err
	}
	remapped := *appErr
	remapped.Details = append([]modelsv2.FieldError(nil), appErr.Details...)
	for index := range remapped.Details {
		switch remapped.Details[index].Field {
		case "channel_id":
			remapped.Details[index].Field = "channelId"
		case "thread_id":
			remapped.Details[index].Field = "threadId"
		}
	}
	return &remapped
}

func insertAutoBoard(c *fiber.Ctx, tx pgx.Tx, serverID int, webhookID string, write validatedAutoBoardWrite) (string, error) {
	var id string
	if err := tx.QueryRow(c.UserContext(), `
		INSERT INTO autoboards (
			server_id,
			board_type,
			target_scope,
			delivery_mode,
			webhook_id,
			thread_id,
			message_id,
			enabled,
			interval_minutes,
			schedule_kind,
			schedule_time,
			schedule_weekdays,
			schedule_day_of_month,
			next_run_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::time, $12, $13, $14
		)
		RETURNING id::text
	`, strconv.Itoa(serverID), write.BoardType, write.TargetScope, write.DeliveryMode,
		webhookID, write.ThreadIDText, write.MessageID, write.Enabled, write.IntervalMinutes,
		write.ScheduleKind, write.ScheduleTime, nullableAutoBoardWeekdays(write.ScheduleWeekdays),
		write.ScheduleDay, write.NextRunAt).Scan(&id); err != nil {
		return "", err
	}
	if err := insertAutoBoardTargets(c.UserContext(), tx, id, write.Targets); err != nil {
		return "", err
	}
	return id, nil
}

func replaceAutoBoardTargets(c *fiber.Ctx, tx pgx.Tx, id string, targets []string) error {
	if _, err := tx.Exec(c.UserContext(), `DELETE FROM autoboard_targets WHERE autoboard_id = $1::uuid`, id); err != nil {
		return err
	}
	return insertAutoBoardTargets(c.UserContext(), tx, id, targets)
}

func insertAutoBoardTargets(ctx context.Context, tx pgx.Tx, id string, targets []string) error {
	for position, target := range targets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO autoboard_targets (autoboard_id, position, target)
			VALUES ($1::uuid, $2, $3)
		`, id, position, target); err != nil {
			return err
		}
	}
	return nil
}

func sqlAutoboards(c *fiber.Ctx, rt apptypes.Deps, serverID int, id string) ([]autoBoardRow, error) {
	args := []any{strconv.Itoa(serverID)}
	idFilter := ""
	if id != "" {
		idFilter = " AND a.id = $2::uuid"
		args = append(args, id)
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT a.id::text,
			a.board_type,
			a.target_scope,
			COALESCE(array_agg(target.target ORDER BY target.position)
				FILTER (WHERE target.target IS NOT NULL), ARRAY[]::text[]),
			a.delivery_mode,
			a.webhook_id,
			a.thread_id,
			a.message_id,
			a.enabled,
			a.interval_minutes,
			a.schedule_kind,
			to_char(a.schedule_time, 'HH24:MI'),
			a.schedule_weekdays,
			a.schedule_day_of_month,
			a.next_run_at,
			a.last_run_at,
			a.created_at,
			a.updated_at
		FROM autoboards AS a
		LEFT JOIN autoboard_targets AS target ON target.autoboard_id = a.id
		WHERE a.server_id = $1`+idFilter+`
		GROUP BY a.id
		ORDER BY a.created_at, a.id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []autoBoardRow{}
	for rows.Next() {
		var item autoBoardRow
		if err := rows.Scan(
			&item.ID, &item.BoardType, &item.TargetScope, &item.Targets, &item.DeliveryMode,
			&item.WebhookID, &item.ThreadID, &item.MessageID, &item.Enabled, &item.IntervalMinutes,
			&item.ScheduleKind, &item.ScheduleTime, &item.ScheduleWeekdays,
			&item.ScheduleDay, &item.NextRunAt, &item.LastRunAt, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func loadAutoBoardConfig(c *fiber.Ctx, rt apptypes.Deps, serverID int, id string) (modelsv2.AutoBoardConfig, error) {
	rows, err := sqlAutoboards(c, rt, serverID, id)
	if err != nil {
		return modelsv2.AutoBoardConfig{}, err
	}
	if len(rows) == 0 {
		return modelsv2.AutoBoardConfig{}, apptypes.Error(http.StatusNotFound, "Autoboard not found")
	}
	return autoBoardConfigFromRow(rows[0], resolveAutoboardChannels(c, rt, rows)), nil
}

func resolveAutoboardChannels(c *fiber.Ctx, rt apptypes.Deps, rows []autoBoardRow) map[string]string {
	resolved := map[string]string{}
	for _, row := range rows {
		if _, seen := resolved[row.WebhookID]; seen {
			continue
		}
		webhookID, err := parseDiscordDestinationID(row.WebhookID, "webhook_id")
		if err != nil || rt.Discord == nil {
			resolved[row.WebhookID] = ""
			continue
		}
		webhook, err := rt.Discord.GetWebhook(c.UserContext(), webhookID)
		if err != nil {
			resolved[row.WebhookID] = ""
			continue
		}
		switch typed := webhook.(type) {
		case discord.IncomingWebhook:
			resolved[row.WebhookID] = typed.ChannelID.String()
		case discord.ChannelFollowerWebhook:
			resolved[row.WebhookID] = typed.ChannelID.String()
		default:
			resolved[row.WebhookID] = ""
		}
	}
	return resolved
}

func autoBoardConfigFromRow(row autoBoardRow, channelIDs map[string]string) modelsv2.AutoBoardConfig {
	var channelID *string
	if value := channelIDs[row.WebhookID]; value != "" {
		channelID = &value
	}
	var schedule *modelsv2.AutoBoardSchedule
	if row.ScheduleKind != nil && row.ScheduleTime != nil {
		schedule = &modelsv2.AutoBoardSchedule{
			Kind:      *row.ScheduleKind,
			TimeOfDay: *row.ScheduleTime,
			Weekdays:  make([]int, len(row.ScheduleWeekdays)),
		}
		for i, weekday := range row.ScheduleWeekdays {
			schedule.Weekdays[i] = int(weekday)
		}
		if row.ScheduleDay != nil {
			day := int(*row.ScheduleDay)
			schedule.DayOfMonth = &day
		}
	}
	var nextRunAt, lastRunAt *string
	if row.NextRunAt != nil {
		value := row.NextRunAt.UTC().Format(time.RFC3339Nano)
		nextRunAt = &value
	}
	if row.LastRunAt != nil {
		value := row.LastRunAt.UTC().Format(time.RFC3339Nano)
		lastRunAt = &value
	}
	targetKind := ""
	if definition, ok := autoBoardRegistry[row.BoardType]; ok {
		targetKind = definition.TargetKind
	}
	return modelsv2.AutoBoardConfig{
		ID:              row.ID,
		BoardType:       row.BoardType,
		TargetKind:      targetKind,
		TargetScope:     row.TargetScope,
		Targets:         append([]string(nil), row.Targets...),
		DeliveryMode:    row.DeliveryMode,
		ChannelID:       channelID,
		ChannelDeleted:  channelID == nil,
		ThreadID:        row.ThreadID,
		MessageID:       row.MessageID,
		Enabled:         row.Enabled,
		IntervalMinutes: row.IntervalMinutes,
		Schedule:        schedule,
		NextRunAt:       nextRunAt,
		LastRunAt:       lastRunAt,
		CreatedAt:       row.CreatedAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt:       row.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func parseAutoBoardID(value string) (string, error) {
	parsed, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", autoBoardValidationError("autoboardId", "must be a valid UUID")
	}
	return parsed.String(), nil
}

func normalizedOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func stringPtrMaybe(value any) *string {
	if value == nil {
		return nil
	}
	out := serverAsString(value)
	if out == "" {
		return nil
	}
	return &out
}

func nullableAutoBoardWeekdays(value []int16) []int16 {
	if len(value) == 0 {
		return nil
	}
	return value
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func autoBoardValidationError(field, message string) error {
	return &apptypes.AppError{
		Status: http.StatusBadRequest,
		Code:   modelsv2.ErrorCodeValidationFailed,
		Detail: "Invalid autoboard configuration",
		Details: []modelsv2.FieldError{{
			Field:   field,
			Message: message,
		}},
	}
}
