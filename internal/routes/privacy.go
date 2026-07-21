package routes

import (
	"context"
	"errors"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func privacyExport(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "User not found")
			}
			return err
		}
		if user == nil {
			return apptypes.Error(fiber.StatusNotFound, "User not found")
		}

		export := map[string]any{"account": privacySafeUser(user)}
		queries := []struct {
			name     string
			query    string
			optional bool
		}{
			{"player_links", `SELECT tag, source, order_index, is_verified, added_at, verified_at, updated_at FROM player_links WHERE user_id = $1 ORDER BY order_index ASC`, false},
			{"bookmarks", `SELECT entity_type, tag, order_index, created_at FROM user_bookmarks WHERE user_id = $1 ORDER BY order_index ASC`, false},
			{"recent_searches", `SELECT entity_type, tag, created_at FROM user_recent_searches WHERE user_id = $1 ORDER BY created_at DESC`, false},
			{"legacy_search_settings", `SELECT search, updated_at FROM user_settings WHERE user_id = $1`, false},
			{"discord_sessions", `SELECT device_id, data ->> 'device_name' AS device_name, expires_at, scopes, created_at, updated_at FROM auth_discord_tokens WHERE user_id = $1 ORDER BY updated_at DESC`, false},
			{"notification_settings", `SELECT device_id, environment, enabled, locale, timezone, enabled_types, war_attack_modes, event_types, reminder_timings, account_scope, selected_accounts, selected_town_halls, selected_clan_tags, created_at, updated_at FROM mobile_notification_preferences WHERE user_id = $1`, true},
			{"notification_devices", `SELECT device_id, provider, platform, environment, app_version, build_number, os_version, device_model, locale, timezone, authorization_status, enabled, last_seen_at, disabled_at, created_at, updated_at FROM mobile_push_devices WHERE user_id = $1`, true},
			{"notification_war_clans", `SELECT device_id, clan_tag, war_start_enabled, score_change_enabled, war_end_enabled, cwl_rank_enabled, live_activity_enabled, enabled, created_at, updated_at FROM mobile_war_subscriptions WHERE user_id = $1`, true},
			{"live_activities", `SELECT device_id, activity_id, clan_tag, war_id, war_tag, environment, status, started_at, ended_at, created_at, updated_at FROM mobile_live_activities WHERE user_id = $1`, true},
		}
		for _, item := range queries {
			rows, err := privacyQuery(c.UserContext(), a, item.optional, item.query, userID)
			if err != nil {
				return err
			}
			export[item.name] = rows
		}
		return apptypes.JSON(c, fiber.StatusOK, export)
	}
}

func privacyDelete(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		if strings.TrimSpace(userID) == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Missing authenticated user")
		}

		deleted := map[string]int64{}
		statements := []struct {
			name string
			sql  string
		}{
			{"mobile_live_activities", `DELETE FROM mobile_live_activities WHERE user_id = $1`},
			{"mobile_war_subscriptions", `DELETE FROM mobile_war_subscriptions WHERE user_id = $1`},
			{"mobile_notification_subscriptions", `DELETE FROM mobile_notification_subscriptions WHERE user_id = $1`},
			{"mobile_notification_preferences", `DELETE FROM mobile_notification_preferences WHERE user_id = $1`},
			{"mobile_push_devices", `DELETE FROM mobile_push_devices WHERE user_id = $1`},
			{"user_recent_searches", `DELETE FROM user_recent_searches WHERE user_id = $1`},
			{"user_bookmarks", `DELETE FROM user_bookmarks WHERE user_id = $1`},
			{"user_settings", `DELETE FROM user_settings WHERE user_id = $1`},
			{"player_links", `DELETE FROM player_links WHERE user_id = $1`},
			{"auth_discord_tokens", `DELETE FROM auth_discord_tokens WHERE user_id = $1`},
			{"auth_refresh_tokens", `DELETE FROM auth_refresh_tokens WHERE user_id = $1`},
			{"auth_password_reset_tokens", `DELETE FROM auth_password_reset_tokens WHERE user_id = $1`},
			{"api_tokens", `DELETE FROM api_tokens WHERE user_id = $1`},
			{"auth_users", `DELETE FROM auth_users WHERE user_id = $1`},
		}
		for _, statement := range statements {
			count, err := privacyExec(c.UserContext(), a, statement.sql, userID)
			if err != nil {
				return err
			}
			deleted[statement.name] = count
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"ok":      true,
			"message": "Account and linked personal data deleted or unlinked where present.",
			"deleted": deleted,
		})
	}
}

func privacySafeUser(user map[string]any) map[string]any {
	out := map[string]any{
		"user_id":      authStringify(user["user_id"]),
		"username":     fallbackUserName(user),
		"avatar_url":   fallbackAvatar(user),
		"auth_methods": toStringSlice(user["auth_methods"]),
		"verified":     user["verified"],
	}
	if email, err := apptypes.DecryptString(authStringify(user["email_encrypted"])); err == nil && email != "" {
		out["email"] = email
	}
	if discordID := authStringify(user["discord_user_id"]); discordID != "" {
		out["discord_user_id"] = discordID
	}
	return out
}

func privacyQuery(ctx context.Context, a apptypes.Deps, optional bool, query string, args ...any) ([]map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := a.Store.SQL.Query(ctx, query, args...)
	if optional && privacyOptionalSQLError(err) {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	out := []map[string]any{}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		item := map[string]any{}
		for index, field := range fields {
			item[string(field.Name)] = values[index]
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func privacyExec(ctx context.Context, a apptypes.Deps, query string, args ...any) (int64, error) {
	if a.Store.SQL == nil {
		return 0, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	tag, err := a.Store.SQL.Exec(ctx, query, args...)
	if privacyOptionalSQLError(err) {
		return 0, nil
	}
	return tag.RowsAffected(), err
}

func privacyOptionalSQLError(err error) bool {
	if err == nil || err == pgx.ErrNoRows {
		return err == pgx.ErrNoRows
	}
	pgErr, ok := err.(*pgconn.PgError)
	if !ok {
		return false
	}
	return pgErr.Code == "42P01" || pgErr.Code == "42703"
}
