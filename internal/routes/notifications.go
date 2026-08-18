package routes

import (
	"context"
	"errors"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	maxNotificationReminderTimings = 3
	maxNotificationReminderMinutes = 2820
	maxRaidReminderMinutes         = 4320
	verifiedPlayerTrackingTTL      = 7 * 24 * time.Hour
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
		if !notificationAllowed(body.Provider, "fcm") {
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

		ciphertext, err := apptypes.EncryptSecret(body.Token, a.Config.DataEncryptionKey)
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
			SELECT enabled, war_attacks_enabled, war_state_enabled, war_reminders_enabled,
				raid_reminders_enabled,
				events_enabled, announcements_enabled, monthly_support_enabled,
				reminder_timings, raid_reminder_timings
			FROM mobile_push_devices
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
			  AND provider = 'fcm'
		`, userID, deviceID, environment).Scan(
			&response.NotificationsEnabled,
			&response.WarAttacksEnabled, &response.WarStateEnabled,
			&response.WarRemindersEnabled, &response.RaidRemindersEnabled,
			&response.EventsEnabled,
			&response.AnnouncementsEnabled, &response.MonthlySupportEnabled,
			&response.ReminderTimings, &response.RaidReminderTimings,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(fiber.StatusNotFound, "Notification device is not registered")
		}
		if err != nil {
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
	return putNotificationPreferencesHandlerWithHook(configuredNotificationPreferencesDB(a), func(ctx context.Context, userID string) {
		if a.Cache != nil {
			_ = a.Cache.PublishTrackingEvent(ctx, "mobile_reminder_config", "", map[string]any{"user_id": userID})
		}
	})
}

func putNotificationPreferencesHandler(db notificationPreferencesDB) fiber.Handler {
	return putNotificationPreferencesHandlerWithHook(db, nil)
}

func putNotificationPreferencesHandlerWithHook(db notificationPreferencesDB, changed func(context.Context, string)) fiber.Handler {
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
		body.ReminderTimings, err = notificationReminderTimings(body.ReminderTimings)
		if err != nil {
			return err
		}
		body.RaidReminderTimings, err = raidReminderTimings(body.RaidReminderTimings)
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
		if changed != nil {
			changed(c.UserContext(), userID)
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// putNotificationAccount enables or disables notifications for one verified player.
//
// @Summary Set player notification preference
// @Tags Notifications
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param player_tag path string true "Player tag"
// @Param body body modelsv2.NotificationAccountPreferenceRequest true "Account notification preference"
// @Success 200 {object} modelsv2.NotificationAccount
// @Router /v2/notifications/accounts/{player_tag} [put]
func putNotificationAccount(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		var body modelsv2.NotificationAccountPreferenceRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := notificationTags([]string{c.Params("player_tag")})
		if len(tags) != 1 {
			return apptypes.Error(fiber.StatusBadRequest, "Player tag is required")
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		account, err := setNotificationAccount(c.UserContext(), a.Store.SQL, userID, tags[0], body.Enabled)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, account)
	}
}

// refreshVerifiedPlayerTracking refreshes the authenticated user's verified tags
// in the seven-day priority-tracking cache. Requested tags are always checked
// against player_links; clients cannot add somebody else's account.
func refreshVerifiedPlayerTracking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		var body modelsv2.VerifiedPlayerTrackingRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		requested := notificationTags(body.PlayerTags)
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT tag
			FROM player_links
			WHERE user_id = $1 AND is_verified = true
			  AND (cardinality($2::text[]) = 0 OR tag = ANY($2::text[]))
			ORDER BY tag
		`, userID, requested)
		if err != nil {
			return err
		}
		defer rows.Close()
		verified := make([]string, 0, len(requested))
		for rows.Next() {
			var tag string
			if err := rows.Scan(&tag); err != nil {
				return err
			}
			verified = append(verified, tag)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if len(requested) > 0 && len(verified) != len(requested) {
			return apptypes.Error(fiber.StatusForbidden, "Every tracking tag must be a verified account")
		}
		if a.Cache != nil {
			if err := a.Cache.RefreshVerifiedPlayers(c.UserContext(), verified, verifiedPlayerTrackingTTL); err != nil {
				return apptypes.Error(fiber.StatusServiceUnavailable, "Verified player tracking cache is unavailable")
			}
		}
		expiresAt := time.Now().UTC().Add(verifiedPlayerTrackingTTL)
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.VerifiedPlayerTrackingResponse{
			PlayerTags: verified,
			ExpiresAt:  expiresAt,
		})
	}
}

func setNotificationAccount(ctx context.Context, db notificationPreferencesDB, userID, playerTag string, enabled bool) (modelsv2.NotificationAccount, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return modelsv2.NotificationAccount{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	account := modelsv2.NotificationAccount{PlayerTag: playerTag, Active: false}
	if !enabled {
		if _, err := tx.Exec(ctx, `DELETE FROM mobile_notification_accounts WHERE user_id = $1 AND player_tag = $2`, userID, playerTag); err != nil {
			return modelsv2.NotificationAccount{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return modelsv2.NotificationAccount{}, err
		}
		return account, nil
	}

	var verified bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM player_links WHERE user_id = $1 AND tag = $2 AND is_verified = true)
	`, userID, playerTag).Scan(&verified)
	if err != nil {
		return modelsv2.NotificationAccount{}, err
	}
	if !verified {
		return modelsv2.NotificationAccount{}, apptypes.Error(fiber.StatusBadRequest, "Player is not a verified account")
	}
	account.Source = "verified"

	if _, err := tx.Exec(ctx, `
		INSERT INTO mobile_notification_accounts (user_id, player_tag, source, active, created_at, updated_at)
		VALUES ($1, $2, $3, true, now(), now())
		ON CONFLICT (user_id, player_tag) DO UPDATE SET source = EXCLUDED.source, active = true, updated_at = now()
	`, userID, playerTag, account.Source); err != nil {
		return modelsv2.NotificationAccount{}, err
	}
	account.Active = true
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.NotificationAccount{}, err
	}
	return account, nil
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
		SET enabled = $4,
			war_attacks_enabled = $5,
			war_state_enabled = $6,
			war_reminders_enabled = $7,
			raid_reminders_enabled = $8,
			events_enabled = $9,
			announcements_enabled = $10,
			monthly_support_enabled = $11,
			reminder_timings = $12,
			raid_reminder_timings = $13
		WHERE user_id = $1 AND device_id = $2 AND environment = $3
		  AND provider = 'fcm'
	`, userID, body.DeviceID, body.Environment, body.NotificationsEnabled,
		body.WarAttacksEnabled, body.WarStateEnabled, body.WarRemindersEnabled,
		body.RaidRemindersEnabled,
		body.EventsEnabled, body.AnnouncementsEnabled, body.MonthlySupportEnabled,
		body.ReminderTimings, body.RaidReminderTimings,
	)
	if err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	if deviceResult.RowsAffected() == 0 {
		return modelsv2.NotificationPreferencesResponse{}, apptypes.Error(
			fiber.StatusNotFound,
			"Notification device is not registered",
		)
	}
	accounts, err := queryNotificationAccounts(ctx, tx, userID)
	if err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.NotificationPreferencesResponse{}, err
	}
	return notificationPreferencesResponse(body, accounts), nil
}

func queryNotificationAccounts(
	ctx context.Context,
	db notificationPreferencesDB,
	userID string,
) ([]modelsv2.NotificationAccount, error) {
	rows, err := db.Query(ctx, `
		SELECT player_tag, source, active
		FROM mobile_notification_accounts
		WHERE user_id = $1 AND source = 'verified'
		ORDER BY player_tag
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []modelsv2.NotificationAccount{}
	for rows.Next() {
		var account modelsv2.NotificationAccount
		if err := rows.Scan(&account.PlayerTag, &account.Source, &account.Active); err != nil {
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
	return validateNotificationTimings(values, maxNotificationReminderMinutes, 1)
}

func raidReminderTimings(values []int) ([]int, error) {
	return validateNotificationTimings(values, maxRaidReminderMinutes, 15)
}

func validateNotificationTimings(values []int, maximum, granularity int) ([]int, error) {
	seen := make(map[int]struct{}, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value < 1 || value > maximum || value%granularity != 0 {
			return nil, apptypes.Error(
				fiber.StatusBadRequest,
				"Reminder timing is outside the allowed range or granularity",
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
		DeviceID:            deviceID,
		Environment:         environment,
		ReminderTimings:     []int{},
		RaidReminderTimings: []int{},
		Accounts:            []modelsv2.NotificationAccount{},
	}
}

func notificationPreferencesResponse(
	body modelsv2.NotificationPreferencesRequest,
	accounts []modelsv2.NotificationAccount,
) modelsv2.NotificationPreferencesResponse {
	return modelsv2.NotificationPreferencesResponse{
		DeviceID:              body.DeviceID,
		Environment:           body.Environment,
		NotificationsEnabled:  body.NotificationsEnabled,
		WarAttacksEnabled:     body.WarAttacksEnabled,
		WarStateEnabled:       body.WarStateEnabled,
		WarRemindersEnabled:   body.WarRemindersEnabled,
		RaidRemindersEnabled:  body.RaidRemindersEnabled,
		EventsEnabled:         body.EventsEnabled,
		AnnouncementsEnabled:  body.AnnouncementsEnabled,
		MonthlySupportEnabled: body.MonthlySupportEnabled,
		ReminderTimings:       body.ReminderTimings,
		RaidReminderTimings:   body.RaidReminderTimings,
		Accounts:              accounts,
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
