package routes

import (
	"context"
	"errors"
	"fmt"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	maxNotificationReminderTimings = 3
	maxNotificationReminderMinutes = 2820
)

type notificationDeviceUnregistration struct {
	DeviceID    string `json:"device_id"`
	Environment string `json:"environment"`
}

// registerNotificationDevice registers or refreshes the authenticated user's push device.
//
// @Summary Register notification device
// @Tags Notifications
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.NotificationDeviceRequest true "Push device"
// @Success 200 {object} modelsv2.NotificationDeviceResponse
// @Router /v2/notifications/devices [post]
func registerNotificationDevice(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		var body modelsv2.NotificationDeviceRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		deviceID, err := notificationDeviceID(c, body.DeviceID)
		if err != nil {
			return err
		}
		if len(strings.TrimSpace(body.Token)) < 20 {
			return apptypes.Error(fiber.StatusBadRequest, "Push token is invalid")
		}
		body.Provider = notificationValueOrDefault(body.Provider, "fcm")
		body.Environment = notificationValueOrDefault(body.Environment, "production")
		body.AuthorizationStatus = notificationValueOrDefault(body.AuthorizationStatus, "not_determined")
		if !notificationAllowed(body.Provider, "fcm", "apns") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push provider")
		}
		if !notificationAllowed(body.Platform, "android", "ios") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push platform")
		}
		if !notificationAllowed(body.Environment, "sandbox", "production") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push environment")
		}
		if !notificationAllowed(body.AuthorizationStatus, "authorized", "provisional", "denied", "not_determined") {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid notification authorization status")
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}

		ciphertext, err := apptypes.EncryptSecret(body.Token, a.Config.EncryptionKey)
		if err != nil {
			return err
		}
		tokenHash := apptypes.SecretHash(body.Token)
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(c.UserContext()) }()

		if _, err := tx.Exec(c.UserContext(), `
			DELETE FROM mobile_push_devices
			WHERE token_hash = $1
			  AND (user_id, device_id, provider, environment) <> ($2, $3, $4, $5)
		`, tokenHash, userID, deviceID, body.Provider, body.Environment); err != nil {
			return err
		}

		var response modelsv2.NotificationDeviceResponse
		err = tx.QueryRow(c.UserContext(), `
			INSERT INTO mobile_push_devices (
				user_id, device_id, platform, provider, environment,
				token_ciphertext, token_hash, app_version, locale,
				authorization_status, enabled, last_seen_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9,
				$10, true, now()
			)
			ON CONFLICT (user_id, device_id, provider, environment)
			DO UPDATE SET
				platform = EXCLUDED.platform,
				token_ciphertext = EXCLUDED.token_ciphertext,
				token_hash = EXCLUDED.token_hash,
				app_version = EXCLUDED.app_version,
				authorization_status = EXCLUDED.authorization_status,
				locale = EXCLUDED.locale,
				enabled = true,
				last_seen_at = now()
			RETURNING device_id, provider, platform, environment,
				authorization_status, enabled, last_seen_at
		`, userID, deviceID, body.Platform, body.Provider, body.Environment,
			ciphertext, tokenHash, body.AppVersion, body.Locale,
			body.AuthorizationStatus,
		).Scan(
			&response.DeviceID, &response.Provider, &response.Platform,
			&response.Environment, &response.AuthorizationStatus,
			&response.Enabled, &response.LastSeenAt,
		)
		if err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// unregisterNotificationDevice permanently removes push data for the current device.
//
// @Summary Unregister notification device
// @Tags Notifications
// @Produce json
// @Security ApiKeyAuth
// @Param device_id query string false "Device id when the access token has no device claim"
// @Success 200 {object} modelsv2.NotificationMessageResponse
// @Router /v2/notifications/devices [delete]
func unregisterNotificationDevice(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		body, err := decodeNotificationDeviceUnregistration(c)
		if err != nil {
			return err
		}
		requestDeviceID := strings.TrimSpace(body.DeviceID)
		if requestDeviceID == "" {
			requestDeviceID = strings.TrimSpace(c.Query("device_id"))
		}
		tokenDeviceID := strings.TrimSpace(apptypes.DeviceID(c.UserContext()))
		if tokenDeviceID != "" && requestDeviceID != "" && tokenDeviceID != requestDeviceID {
			return apptypes.Error(fiber.StatusForbidden, "Device does not match the authenticated session")
		}
		deviceID, err := notificationDeviceID(c, requestDeviceID)
		if err != nil {
			return err
		}
		environment := body.Environment
		if strings.TrimSpace(environment) == "" {
			environment = c.Query("environment")
		}
		environment = notificationValueOrDefault(environment, "production")
		if !notificationAllowed(environment, "sandbox", "production") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push environment")
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		result, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM mobile_push_devices
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
		`, userID, deviceID, environment)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, "Failed to unregister notification device")
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"ok":      true,
			"removed": result.RowsAffected(),
		})
	}
}

// getNotificationPreferences returns preferences for the current device.
//
// @Summary Get notification preferences
// @Tags Notifications
// @Produce json
// @Security ApiKeyAuth
// @Param device_id query string false "Device id when the access token has no device claim"
// @Param environment query string false "Push environment" Enums(sandbox,production)
// @Success 200 {object} modelsv2.NotificationPreferencesResponse
// @Router /v2/notifications/preferences [get]
func getNotificationPreferences(a apptypes.Deps) fiber.Handler {
	return getNotificationPreferencesHandler(configuredNotificationPreferencesDB(a))
}

type notificationPreferencesDB interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Begin(context.Context) (pgx.Tx, error)
}

func configuredNotificationPreferencesDB(a apptypes.Deps) notificationPreferencesDB {
	if a.Store == nil {
		return nil
	}
	return a.Store.SQL
}

func getNotificationPreferencesHandler(db notificationPreferencesDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		deviceID, err := notificationDeviceID(c, c.Query("device_id"))
		if err != nil {
			return err
		}
		environment := notificationValueOrDefault(c.Query("environment"), "production")
		if !notificationAllowed(environment, "sandbox", "production") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push environment")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		response := defaultNotificationPreferences(deviceID, environment)
		err = db.QueryRow(c.UserContext(), `
			SELECT bool_or(enabled)
			FROM mobile_push_devices
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
			HAVING count(*) > 0
		`, userID, deviceID, environment).Scan(&response.DeviceEnabled)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(fiber.StatusNotFound, "Notification device is not registered")
		}
		if err != nil {
			return err
		}
		err = db.QueryRow(c.UserContext(), `
			SELECT league_battles_enabled, war_attacks_enabled,
				war_state_enabled, war_reminders_enabled, events_enabled,
				announcements_enabled, upgrade_finishes_enabled,
				monthly_support_enabled, reminder_timings
			FROM mobile_notification_preferences
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
		`, userID, deviceID, environment).Scan(
			&response.LeagueBattlesEnabled, &response.WarAttacksEnabled,
			&response.WarStateEnabled, &response.WarRemindersEnabled,
			&response.EventsEnabled, &response.AnnouncementsEnabled,
			&response.UpgradeFinishesEnabled, &response.MonthlySupportEnabled,
			&response.ReminderTimings,
		)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		response.Accounts, err = queryNotificationAccounts(c.UserContext(), db, userID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// putNotificationPreferences replaces preferences for the current device.
//
// @Summary Save notification preferences
// @Tags Notifications
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.NotificationPreferencesRequest true "Notification preferences"
// @Success 200 {object} modelsv2.NotificationPreferencesResponse
// @Router /v2/notifications/preferences [put]
func putNotificationPreferences(a apptypes.Deps) fiber.Handler {
	return putNotificationPreferencesHandler(configuredNotificationPreferencesDB(a))
}

func putNotificationPreferencesHandler(db notificationPreferencesDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		var body modelsv2.NotificationPreferencesRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body.DeviceID, err = notificationDeviceID(c, body.DeviceID)
		if err != nil {
			return err
		}
		body.Environment = notificationValueOrDefault(body.Environment, "production")
		if !notificationAllowed(body.Environment, "sandbox", "production") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push environment")
		}
		body.AccountTags = notificationTags(body.AccountTags)
		body.ReminderTimings, err = notificationReminderTimings(body.ReminderTimings)
		if err != nil {
			return err
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		response, err := replaceNotificationPreferences(c.UserContext(), db, userID, body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

func replaceNotificationPreferences(
	ctx context.Context,
	db notificationPreferencesDB,
	userID string,
	body modelsv2.NotificationPreferencesRequest,
) (modelsv2.NotificationPreferencesResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	deviceResult, err := tx.Exec(ctx, `
		UPDATE mobile_push_devices
		SET enabled = $4
		WHERE user_id = $1 AND device_id = $2 AND environment = $3
	`, userID, body.DeviceID, body.Environment, body.DeviceEnabled)
	if err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	if deviceResult.RowsAffected() == 0 {
		return modelsv2.NotificationPreferencesResponse{}, apptypes.Error(
			fiber.StatusNotFound,
			"Notification device is not registered",
		)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO mobile_notification_preferences (
			user_id, device_id, environment, league_battles_enabled,
			war_attacks_enabled, war_state_enabled, war_reminders_enabled,
			events_enabled, announcements_enabled, upgrade_finishes_enabled,
			monthly_support_enabled, reminder_timings
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
		)
		ON CONFLICT (user_id, device_id, environment)
		DO UPDATE SET
			league_battles_enabled = EXCLUDED.league_battles_enabled,
			war_attacks_enabled = EXCLUDED.war_attacks_enabled,
			war_state_enabled = EXCLUDED.war_state_enabled,
			war_reminders_enabled = EXCLUDED.war_reminders_enabled,
			events_enabled = EXCLUDED.events_enabled,
			announcements_enabled = EXCLUDED.announcements_enabled,
			upgrade_finishes_enabled = EXCLUDED.upgrade_finishes_enabled,
			monthly_support_enabled = EXCLUDED.monthly_support_enabled,
			reminder_timings = EXCLUDED.reminder_timings
	`, userID, body.DeviceID, body.Environment, body.LeagueBattlesEnabled,
		body.WarAttacksEnabled, body.WarStateEnabled, body.WarRemindersEnabled,
		body.EventsEnabled, body.AnnouncementsEnabled,
		body.UpgradeFinishesEnabled, body.MonthlySupportEnabled,
		body.ReminderTimings,
	); err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}

	accounts, err := eligibleNotificationAccounts(ctx, tx, userID, body.AccountTags)
	if err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM mobile_notification_accounts
		WHERE user_id = $1
	`, userID); err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	if len(accounts) > 0 {
		tags := make([]string, 0, len(accounts))
		sources := make([]string, 0, len(accounts))
		for _, account := range accounts {
			tags = append(tags, account.PlayerTag)
			sources = append(sources, account.Source)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO mobile_notification_accounts (user_id, player_tag, source)
			SELECT $1, input.player_tag, input.source
			FROM unnest($2::text[], $3::text[]) AS input(player_tag, source)
		`, userID, tags, sources); err != nil {
			return modelsv2.NotificationPreferencesResponse{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	return notificationPreferencesResponse(body, accounts), nil
}

func eligibleNotificationAccounts(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
	tags []string,
) ([]modelsv2.NotificationAccount, error) {
	if len(tags) == 0 {
		return []modelsv2.NotificationAccount{}, nil
	}
	rows, err := tx.Query(ctx, `
		WITH requested AS (
			SELECT tag, ordinality
			FROM unnest($2::text[]) WITH ORDINALITY AS requested(tag, ordinality)
		),
		verified AS MATERIALIZED (
			SELECT links.tag
			FROM player_links AS links
			JOIN requested ON requested.tag = links.tag
			WHERE links.user_id = $1 AND links.is_verified = true
			FOR KEY SHARE OF links
		),
		bookmarked AS MATERIALIZED (
			SELECT bookmarks.tag
			FROM user_bookmarks AS bookmarks
			JOIN requested ON requested.tag = bookmarks.tag
			WHERE bookmarks.user_id = $1
			  AND bookmarks.entity_type = 'player'
			FOR KEY SHARE OF bookmarks
		)
		SELECT requested.tag,
			CASE
				WHEN verified.tag IS NOT NULL THEN 'verified'
				WHEN bookmarked.tag IS NOT NULL THEN 'bookmarked'
			END AS source
		FROM requested
		LEFT JOIN verified ON verified.tag = requested.tag
		LEFT JOIN bookmarked ON bookmarked.tag = requested.tag
		ORDER BY requested.ordinality
	`, userID, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]modelsv2.NotificationAccount, 0, len(tags))
	for rows.Next() {
		var account modelsv2.NotificationAccount
		var source *string
		if err := rows.Scan(&account.PlayerTag, &source); err != nil {
			return nil, err
		}
		if source == nil {
			return nil, apptypes.Error(
				fiber.StatusBadRequest,
				fmt.Sprintf(
					"Notification account %s is not a verified link or player bookmark",
					account.PlayerTag,
				),
			)
		}
		account.Source = *source
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(accounts) != len(tags) {
		return nil, apptypes.Error(fiber.StatusBadRequest, "Invalid notification account selection")
	}
	return accounts, nil
}

func queryNotificationAccounts(
	ctx context.Context,
	db notificationPreferencesDB,
	userID string,
) ([]modelsv2.NotificationAccount, error) {
	rows, err := db.Query(ctx, `
		SELECT player_tag, source
		FROM mobile_notification_accounts
		WHERE user_id = $1
		ORDER BY player_tag
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []modelsv2.NotificationAccount{}
	for rows.Next() {
		var account modelsv2.NotificationAccount
		if err := rows.Scan(&account.PlayerTag, &account.Source); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func authenticatedNotificationUser(c *fiber.Ctx) (string, error) {
	userID := strings.TrimSpace(apptypes.UserID(c.UserContext()))
	if userID == "" || strings.HasPrefix(userID, "server:") {
		return "", apptypes.Error(fiber.StatusUnauthorized, "Authenticated user required")
	}
	return userID, nil
}

func notificationDeviceID(c *fiber.Ctx, fallback string) (string, error) {
	deviceID := strings.TrimSpace(apptypes.DeviceID(c.UserContext()))
	if deviceID == "" {
		deviceID = strings.TrimSpace(fallback)
	}
	if deviceID == "" {
		return "", apptypes.Error(fiber.StatusBadRequest, "Device id is required")
	}
	if len(deviceID) > 200 {
		return "", apptypes.Error(fiber.StatusBadRequest, "Device id is too long")
	}
	return deviceID, nil
}

func notificationValueOrDefault(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return fallback
	}
	return value
}

func notificationAllowed(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func notificationTags(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = clashy.CorrectTag(strings.TrimSpace(value))
		if value == "" || value == "#" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func notificationReminderTimings(values []int) ([]int, error) {
	seen := make(map[int]struct{}, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value < 1 || value > maxNotificationReminderMinutes {
			return nil, apptypes.Error(
				fiber.StatusBadRequest,
				"Reminder timings must be between 1 and 2820 minutes",
			)
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	if len(result) > maxNotificationReminderTimings {
		return nil, apptypes.Error(fiber.StatusBadRequest, "At most 3 reminder timings are allowed")
	}
	return result, nil
}

func defaultNotificationPreferences(deviceID, environment string) modelsv2.NotificationPreferencesResponse {
	return modelsv2.NotificationPreferencesResponse{
		DeviceID:        deviceID,
		Environment:     environment,
		ReminderTimings: []int{},
		Accounts:        []modelsv2.NotificationAccount{},
	}
}

func notificationPreferencesResponse(
	body modelsv2.NotificationPreferencesRequest,
	accounts []modelsv2.NotificationAccount,
) modelsv2.NotificationPreferencesResponse {
	return modelsv2.NotificationPreferencesResponse{
		DeviceID:               body.DeviceID,
		Environment:            body.Environment,
		DeviceEnabled:          body.DeviceEnabled,
		LeagueBattlesEnabled:   body.LeagueBattlesEnabled,
		WarAttacksEnabled:      body.WarAttacksEnabled,
		WarStateEnabled:        body.WarStateEnabled,
		WarRemindersEnabled:    body.WarRemindersEnabled,
		EventsEnabled:          body.EventsEnabled,
		AnnouncementsEnabled:   body.AnnouncementsEnabled,
		UpgradeFinishesEnabled: body.UpgradeFinishesEnabled,
		MonthlySupportEnabled:  body.MonthlySupportEnabled,
		ReminderTimings:        body.ReminderTimings,
		Accounts:               accounts,
	}
}

func decodeNotificationDeviceUnregistration(c *fiber.Ctx) (notificationDeviceUnregistration, error) {
	var request notificationDeviceUnregistration
	if strings.TrimSpace(string(c.Body())) == "" {
		return request, nil
	}
	if err := apptypes.DecodeJSON(c, &request); err != nil {
		return notificationDeviceUnregistration{}, err
	}
	return request, nil
}
