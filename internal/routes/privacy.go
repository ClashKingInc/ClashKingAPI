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
			{"discord_sessions", `SELECT device_id, expires_at, created_at, updated_at FROM auth_discord_tokens WHERE user_id = $1 ORDER BY updated_at DESC`, false},
			{"notification_accounts", `SELECT player_tag, source, active, created_at, updated_at FROM mobile_notification_accounts WHERE user_id = $1 ORDER BY player_tag`, true},
			{"notification_devices", `SELECT device_id, provider, platform, environment, app_version, locale, authorization_status, enabled, war_attacks_enabled, war_state_enabled, war_reminders_enabled, raid_reminders_enabled, events_enabled, announcements_enabled, monthly_support_enabled, reminder_timings, raid_reminder_timings, last_seen_at FROM mobile_push_devices WHERE user_id = $1`, true},
			{"billing_subscription", `SELECT provider, provider_subscription_id, provider_price_id, status, current_period_end, cancel_at_period_end, created_at, updated_at FROM billing_subscriptions WHERE user_id = $1`, true},
			{"subscription_entitlements", `SELECT active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd, updated_at FROM subscription_entitlements WHERE user_id = $1`, true},
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
			{"mobile_notification_accounts", `DELETE FROM mobile_notification_accounts WHERE user_id = $1`},
			{"mobile_push_devices", `DELETE FROM mobile_push_devices WHERE user_id = $1`},
			{"billing_webhook_events", `DELETE FROM billing_webhook_events events USING billing_customers customers WHERE customers.user_id = $1 AND events.payload #>> '{data,object,customer}' = customers.stripe_customer_id`},
			{"subscription_entitlements", `DELETE FROM subscription_entitlements WHERE user_id = $1`},
			{"billing_subscriptions", `DELETE FROM billing_subscriptions WHERE user_id = $1`},
			{"billing_customers", `DELETE FROM billing_customers WHERE user_id = $1`},
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

func privacySafeUser(user *authUser) map[string]any {
	out := map[string]any{
		"user_id":      user.UserID,
		"provider":     user.Provider,
		"auth_methods": user.AuthMethods(),
		"created_at":   user.CreatedAt,
		"updated_at":   user.UpdatedAt,
	}
	if user.Username != nil {
		out["username"] = *user.Username
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
