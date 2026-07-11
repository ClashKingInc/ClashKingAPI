package routes

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

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
				token_ciphertext, token_hash, app_version, build_number,
				os_version, device_model, authorization_status, locale,
				timezone, enabled, last_seen_at, disabled_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9,
				$10, $11, $12, $13, $14, true, now(), NULL, now()
			)
			ON CONFLICT (user_id, device_id, provider, environment)
			DO UPDATE SET
				platform = EXCLUDED.platform,
				token_ciphertext = EXCLUDED.token_ciphertext,
				token_hash = EXCLUDED.token_hash,
				app_version = EXCLUDED.app_version,
				build_number = EXCLUDED.build_number,
				os_version = EXCLUDED.os_version,
				device_model = EXCLUDED.device_model,
				authorization_status = EXCLUDED.authorization_status,
				locale = EXCLUDED.locale,
				timezone = EXCLUDED.timezone,
				enabled = true,
				last_seen_at = now(),
				disabled_at = NULL,
				updated_at = now()
			RETURNING device_id, provider, platform, environment,
				authorization_status, enabled, last_seen_at
		`, userID, deviceID, body.Platform, body.Provider, body.Environment,
			ciphertext, tokenHash, body.AppVersion, body.BuildNumber,
			body.OSVersion, body.DeviceModel, body.AuthorizationStatus,
			body.Locale, body.Timezone,
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

// disableNotificationDevice disables push delivery for the current device.
//
// @Summary Disable notification device
// @Tags Notifications
// @Produce json
// @Security ApiKeyAuth
// @Param device_id query string false "Device id when the access token has no device claim"
// @Success 200 {object} modelsv2.NotificationMessageResponse
// @Router /v2/notifications/devices [delete]
func disableNotificationDevice(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		deviceID, err := notificationDeviceID(c, c.Query("device_id"))
		if err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		result, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE mobile_push_devices
			SET enabled = false, disabled_at = now(), updated_at = now()
			WHERE user_id = $1 AND device_id = $2 AND enabled = true
		`, userID, deviceID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Notification device not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.NotificationMessageResponse{Message: "Notification device disabled"})
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
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		response := defaultNotificationPreferences(deviceID, environment)
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT enabled, locale, timezone, enabled_types, war_attack_modes,
				event_types, reminder_timings, account_scope, selected_accounts,
				selected_town_halls, selected_clan_tags, updated_at
			FROM mobile_notification_preferences
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
		`, userID, deviceID, environment).Scan(
			&response.Enabled, &response.Locale, &response.Timezone,
			&response.EnabledTypes, &response.WarAttackModes, &response.EventTypes,
			&response.ReminderTimings, &response.AccountScope,
			&response.SelectedAccounts, &response.SelectedTownHalls,
			&response.SelectedClanTags, &response.UpdatedAt,
		)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT notification_type, player_tag, enabled, settings
			FROM mobile_notification_subscriptions
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
			ORDER BY notification_type, player_tag
		`, userID, deviceID, environment)
		if err != nil {
			return err
		}
		defer rows.Close()
		response.Subscriptions = []modelsv2.NotificationSubscription{}
		for rows.Next() {
			var subscription modelsv2.NotificationSubscription
			var rawSettings []byte
			if err := rows.Scan(&subscription.Type, &subscription.PlayerTag, &subscription.Enabled, &rawSettings); err != nil {
				return err
			}
			if len(rawSettings) > 0 {
				_ = json.Unmarshal(rawSettings, &subscription.Settings)
			}
			response.Subscriptions = append(response.Subscriptions, subscription)
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
		body.AccountScope = notificationValueOrDefault(body.AccountScope, "all")
		if !notificationAllowed(body.Environment, "sandbox", "production") {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported push environment")
		}
		if !notificationAllowed(body.AccountScope, "all", "selected") {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid account scope")
		}
		body.SelectedAccounts = notificationTags(body.SelectedAccounts)
		body.SelectedClanTags = notificationTags(body.SelectedClanTags)
		if body.AccountScope == "selected" && len(body.SelectedAccounts) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "At least one account must be selected")
		}
		for _, townHall := range body.SelectedTownHalls {
			if townHall < 1 || townHall > 99 {
				return apptypes.Error(fiber.StatusBadRequest, "Invalid Town Hall level")
			}
		}
		for index := range body.Subscriptions {
			subscription := &body.Subscriptions[index]
			subscription.Type = strings.TrimSpace(subscription.Type)
			if subscription.Type == "" || len(subscription.Type) > 100 {
				return apptypes.Error(fiber.StatusBadRequest, "Invalid notification subscription type")
			}
			tags := notificationTags([]string{subscription.PlayerTag})
			if len(tags) == 0 {
				subscription.PlayerTag = ""
			} else {
				subscription.PlayerTag = tags[0]
			}
			if subscription.Settings == nil {
				subscription.Settings = map[string]any{}
			}
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}

		response := modelsv2.NotificationPreferencesResponse{NotificationPreferencesRequest: body}
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO mobile_notification_preferences (
				user_id, device_id, environment, enabled, locale, timezone,
				enabled_types, war_attack_modes, event_types, reminder_timings,
				account_scope, selected_accounts, selected_town_halls,
				selected_clan_tags, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
				$11, $12, $13, $14, now()
			)
			ON CONFLICT (user_id, device_id, environment)
			DO UPDATE SET
				enabled = EXCLUDED.enabled,
				locale = EXCLUDED.locale,
				timezone = EXCLUDED.timezone,
				enabled_types = EXCLUDED.enabled_types,
				war_attack_modes = EXCLUDED.war_attack_modes,
				event_types = EXCLUDED.event_types,
				reminder_timings = EXCLUDED.reminder_timings,
				account_scope = EXCLUDED.account_scope,
				selected_accounts = EXCLUDED.selected_accounts,
				selected_town_halls = EXCLUDED.selected_town_halls,
				selected_clan_tags = EXCLUDED.selected_clan_tags,
				updated_at = now()
			RETURNING updated_at
		`, userID, body.DeviceID, body.Environment, body.Enabled,
			body.Locale, body.Timezone, body.EnabledTypes, body.WarAttackModes,
			body.EventTypes, body.ReminderTimings, body.AccountScope,
			body.SelectedAccounts, body.SelectedTownHalls, body.SelectedClanTags,
		).Scan(&response.UpdatedAt)
		if err != nil {
			return err
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM mobile_notification_subscriptions
			WHERE user_id = $1 AND device_id = $2 AND environment = $3
		`, userID, body.DeviceID, body.Environment); err != nil {
			return err
		}
		for _, subscription := range body.Subscriptions {
			settings, err := json.Marshal(subscription.Settings)
			if err != nil {
				return apptypes.Error(fiber.StatusBadRequest, "Invalid notification subscription settings")
			}
			if _, err := a.Store.SQL.Exec(c.UserContext(), `
				INSERT INTO mobile_notification_subscriptions (
					user_id, device_id, environment, notification_type,
					player_tag, enabled, settings
				) VALUES ($1, $2, $3, $4, $5, $6, $7)
			`, userID, body.DeviceID, body.Environment, subscription.Type,
				subscription.PlayerTag, subscription.Enabled, settings); err != nil {
				return err
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
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
		value = strings.ToUpper(strings.TrimSpace(value))
		value = strings.TrimPrefix(value, "#")
		if value == "" {
			continue
		}
		value = "#" + value
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func defaultNotificationPreferences(deviceID, environment string) modelsv2.NotificationPreferencesResponse {
	return modelsv2.NotificationPreferencesResponse{
		NotificationPreferencesRequest: modelsv2.NotificationPreferencesRequest{
			DeviceID:          deviceID,
			Environment:       environment,
			Enabled:           true,
			EnabledTypes:      []string{},
			WarAttackModes:    []string{},
			EventTypes:        []string{},
			ReminderTimings:   []string{},
			AccountScope:      "all",
			SelectedAccounts:  []string{},
			SelectedTownHalls: []int{},
			SelectedClanTags:  []string{},
			Subscriptions:     []modelsv2.NotificationSubscription{},
		},
		UpdatedAt: time.Time{},
	}
}
