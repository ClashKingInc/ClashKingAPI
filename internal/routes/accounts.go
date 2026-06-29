package routes

import (
	"context"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

var cocTagPattern = regexp.MustCompile(`^#[A-Z0-9]{5,12}$`)

// addStandardAccount links a Clash of Clans account without explicit token verification.
//
// @Summary Link a Clash of Clans account to a user
// @Description Links a Clash of Clans account to the authenticated user.
// @Tags Coc Accounts
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.AccountsCOCAccountRequest true "Account payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 409 {object} map[string]interface{}
// @Router /v2/users/coc-accounts [post]
func addStandardAccount(a apptypes.Deps) fiber.Handler {
	return addAccount(a, false)
}

// addVerifiedAccount links a Clash of Clans account with ownership verification.
//
// @Summary Link a Clash of Clans account to a user with verification
// @Description Links a Clash of Clans account to the authenticated user after verifying the player token.
// @Tags Coc Accounts
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.AccountsCOCAccountRequest true "Verified account payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/users/coc-accounts/verified [post]
func addVerifiedAccount(a apptypes.Deps) fiber.Handler {
	return addAccount(a, true)
}

// addAccount links a Clash of Clans account to the authenticated user.
func addAccount(a apptypes.Deps, requireVerification bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		var body modelsv2.AccountsCOCAccountRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerTag := accountsNormalizeTag(body.PlayerTag)
		if err := validateCOCTag(playerTag); err != nil {
			return err
		}
		player, err := a.Clash.GetPlayer(c.UserContext(), playerTag)
		if err != nil || player == nil {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account does not exist")
		}

		oldAccount, err := findAccountByTag(c.UserContext(), a, playerTag)
		if err != nil && err != pgx.ErrNoRows {
			return err
		}
		if requireVerification {
			token := firstNonEmpty(body.PlayerToken, body.APIToken)
			ok, err := a.Clash.Client().VerifyPlayerToken(c.UserContext(), playerTag, token)
			if err != nil || !ok {
				return apptypes.Error(fiber.StatusForbidden, "Invalid player token. Check your Clash of Clans account settings and try again.")
			}
		}
		if oldAccount != nil && accountsStringify(oldAccount["user_id"]) != userID && !requireVerification {
			return apptypes.JSON(c, fiber.StatusConflict, map[string]any{
				"detail": map[string]any{
					"message": "This Clash of Clans account is already linked to another user",
					"account": map[string]any{
						"tag":           player.Tag,
						"name":          player.Name,
						"townHallLevel": player.TownHall,
					},
				},
			})
		}
		if oldAccount != nil && accountsStringify(oldAccount["user_id"]) != userID && requireVerification {
			oldUserID := accountsStringify(oldAccount["user_id"])
			if _, err := a.Store.SQL.Exec(c.UserContext(), `DELETE FROM player_links WHERE tag = $1`, playerTag); err != nil {
				return err
			}
			if err := reorderUserAccounts(c.UserContext(), a, oldUserID); err != nil {
				return err
			}
		}

		var orderIndex int
		err = a.Store.SQL.QueryRow(c.UserContext(), `SELECT count(*) FROM player_links WHERE user_id = $1`, userID).Scan(&orderIndex)
		if err != nil {
			return err
		}
		verifiedAt := (*time.Time)(nil)
		if requireVerification {
			now := time.Now().UTC()
			verifiedAt = &now
		}
		_, err = a.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO player_links (tag, user_id, source, order_index, is_verified, added_at, verified_at, updated_at)
			VALUES ($1, $2, 'api', $3, $4, now(), $5, now())
			ON CONFLICT (tag) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				source = EXCLUDED.source,
				order_index = EXCLUDED.order_index,
				is_verified = player_links.is_verified OR EXCLUDED.is_verified,
				verified_at = COALESCE(player_links.verified_at, EXCLUDED.verified_at),
				updated_at = now()
		`, player.Tag, userID, orderIndex, requireVerification, verifiedAt)
		if err != nil {
			return err
		}
		message := "Clash of Clans account linked successfully"
		if requireVerification {
			message = "Clash of Clans account linked successfully with ownership verification"
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"message": message,
			"account": map[string]any{
				"tag":           player.Tag,
				"name":          player.Name,
				"townHallLevel": player.TownHall,
				"is_verified":   requireVerification,
			},
		})
	}
}

// listAccounts returns the authenticated user's linked Clash of Clans accounts.
//
// @Summary Get all Clash of Clans accounts linked to a user
// @Description Returns the authenticated user's linked Clash of Clans accounts in order.
// @Tags Coc Accounts
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/users/coc-accounts [get]
func listAccounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		var accounts []map[string]any
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT user_id, tag, order_index, is_verified, added_at, verified_at
			FROM player_links
			WHERE user_id = $1
			ORDER BY order_index ASC, added_at ASC
		`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var userID, tag string
			var orderIndex int
			var isVerified bool
			var addedAt time.Time
			var verifiedAt *time.Time
			if err := rows.Scan(&userID, &tag, &orderIndex, &isVerified, &addedAt, &verifiedAt); err != nil {
				return err
			}
			account := map[string]any{
				"user_id":     userID,
				"player_tag":  tag,
				"order_index": orderIndex,
				"is_verified": isVerified,
				"added_at":    addedAt,
			}
			if verifiedAt != nil {
				account["verified_at"] = *verifiedAt
			}
			accounts = append(accounts, account)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"coc_accounts": accounts})
	}
}

// removeAccount unlinks a Clash of Clans account from the authenticated user.
//
// @Summary Remove a linked Clash of Clans account
// @Description Unlinks a Clash of Clans account from the authenticated user.
// @Tags Coc Accounts
// @Produce json
// @Security ApiKeyAuth
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/users/coc-accounts/{player_tag} [delete]
func removeAccount(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		playerTag := accountsNormalizeTag(c.Params("player_tag"))
		tag, err := deleteUserAccount(c.UserContext(), a, userID, playerTag)
		if err != nil {
			return err
		}
		if tag == "" {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account not found or not linked to your profile")
		}
		if err := reorderUserAccounts(c.UserContext(), a, userID); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"message": "Clash of Clans account unlinked successfully"})
	}
}

// accountStatus checks whether a Clash of Clans account is linked.
//
// @Summary Check if a Clash of Clans account is linked
// @Description Checks whether a Clash of Clans account is linked to any user.
// @Tags Coc Accounts
// @Produce json
// @Security ApiKeyAuth
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/users/coc-accounts/{player_tag}/status [get]
func accountStatus(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := accountsNormalizeTag(c.Params("player_tag"))
		account, err := findAccountByTag(c.UserContext(), a, playerTag)
		if err == pgx.ErrNoRows {
			return apptypes.JSON(c, fiber.StatusOK, map[string]any{
				"linked":  false,
				"message": "This Clash of Clans account is not linked to any user.",
			})
		}
		if err != nil {
			return err
		}
		userID := apptypes.UserID(c.UserContext())
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"linked":         true,
			"is_own_account": accountsStringify(account["user_id"]) == userID,
			"message":        "This Clash of Clans account is already linked to a user.",
		})
	}
}

// reorderAccounts reorders the authenticated user's linked Clash of Clans accounts.
//
// @Summary Reorder linked Clash of Clans accounts
// @Description Reorders the authenticated user's linked Clash of Clans accounts.
// @Tags Coc Accounts
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.AccountsReorderAccountsRequest true "Reorder payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/users/coc-accounts/order [put]
func reorderAccounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		var body modelsv2.AccountsReorderAccountsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.OrderedTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Ordered tags list cannot be empty")
		}
		normalized := make([]string, 0, len(body.OrderedTags))
		for _, tag := range body.OrderedTags {
			normalized = append(normalized, accountsNormalizeTag(tag))
		}
		var count int
		err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT count(*) FROM player_links WHERE user_id = $1 AND tag = ANY($2)`, userID, normalized).Scan(&count)
		if err != nil {
			return err
		}
		if count != len(normalized) {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid account tags provided")
		}
		for index, tag := range normalized {
			if _, err := a.Store.SQL.Exec(c.UserContext(), `UPDATE player_links SET order_index = $1, updated_at = now() WHERE user_id = $2 AND tag = $3`, index, userID, tag); err != nil {
				return err
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"message": "Accounts reordered successfully"})
	}
}

// verifyAccount verifies ownership of an existing linked Clash of Clans account.
//
// @Summary Verify ownership of an existing linked Clash of Clans account
// @Description Verifies ownership of a linked account using the provided player token.
// @Tags Coc Accounts
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param player_tag path string true "Player tag"
// @Param body body modelsv2.AccountsCOCAccountRequest true "Verification payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/users/coc-accounts/{player_tag}/verify [post]
func verifyAccount(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		playerTag := accountsNormalizeTag(c.Params("player_tag"))
		if err := validateCOCTag(playerTag); err != nil {
			return err
		}
		var body modelsv2.AccountsCOCAccountRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerToken := firstNonEmpty(body.PlayerToken, body.APIToken)
		if strings.TrimSpace(playerToken) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Player token is required for verification")
		}
		existing, err := findAccountByUserAndTag(c.UserContext(), a, userID, playerTag)
		if err == pgx.ErrNoRows {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account not found or not linked to your profile")
		}
		if err != nil {
			return err
		}
		if verified, _ := existing["is_verified"].(bool); verified {
			return apptypes.JSON(c, fiber.StatusOK, map[string]any{"message": "Account is already verified", "verified": true})
		}
		ok, err := a.Clash.Client().VerifyPlayerToken(c.UserContext(), playerTag, playerToken)
		if err != nil || !ok {
			return apptypes.Error(fiber.StatusForbidden, "Invalid player token. Check your Clash of Clans account settings and try again.")
		}
		_, err = a.Store.SQL.Exec(c.UserContext(), `UPDATE player_links SET is_verified = true, verified_at = now(), updated_at = now() WHERE user_id = $1 AND tag = $2`, userID, playerTag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"message": "Account verified successfully", "verified": true})
	}
}

func validateCOCTag(tag string) error {
	if !cocTagPattern.MatchString(tag) {
		return apptypes.Error(fiber.StatusBadRequest, "Invalid Clash of Clans tag format")
	}
	return nil
}

func accountsNormalizeTag(tag string) string {
	tag = decodeRouteTag(tag)
	tag = strings.ToUpper(strings.TrimSpace(tag))
	if tag == "" {
		return tag
	}
	tag = strings.TrimLeft(tag, "#!")
	if !strings.HasPrefix(tag, "#") {
		tag = "#" + tag
	}
	tag = strings.ReplaceAll(tag, "O", "0")
	return tag
}

func findAccountByTag(ctx context.Context, a apptypes.Deps, playerTag string) (map[string]any, error) {
	return scanPlayerLink(ctx, a, `WHERE tag = $1`, playerTag)
}

func findAccountByUserAndTag(ctx context.Context, a apptypes.Deps, userID, playerTag string) (map[string]any, error) {
	return scanPlayerLink(ctx, a, `WHERE user_id = $1 AND tag = $2`, userID, playerTag)
}

func scanPlayerLink(ctx context.Context, a apptypes.Deps, where string, args ...any) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT user_id, tag, order_index, is_verified, added_at, verified_at
		FROM player_links ` + where + ` LIMIT 1`
	var userID *string
	var tag string
	var orderIndex int
	var verified bool
	var addedAt time.Time
	var verifiedAt *time.Time
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(&userID, &tag, &orderIndex, &verified, &addedAt, &verifiedAt); err != nil {
		return nil, err
	}
	account := map[string]any{
		"player_tag":  tag,
		"order_index": orderIndex,
		"is_verified": verified,
		"added_at":    addedAt,
	}
	if userID != nil {
		account["user_id"] = *userID
	}
	if verifiedAt != nil {
		account["verified_at"] = *verifiedAt
	}
	return account, nil
}

func listUserAccountLinks(ctx context.Context, a apptypes.Deps, userID string) ([]map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT tag, order_index, is_verified, added_at, verified_at
		FROM player_links
		WHERE user_id = $1
		ORDER BY order_index ASC, added_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []map[string]any{}
	for rows.Next() {
		var tag string
		var orderIndex int
		var verified bool
		var addedAt time.Time
		var verifiedAt *time.Time
		if err := rows.Scan(&tag, &orderIndex, &verified, &addedAt, &verifiedAt); err != nil {
			return nil, err
		}
		account := map[string]any{
			"user_id":     userID,
			"player_tag":  tag,
			"order_index": orderIndex,
			"is_verified": verified,
			"added_at":    addedAt,
		}
		if verifiedAt != nil {
			account["verified_at"] = *verifiedAt
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return accounts, nil
}

func deleteUserAccount(ctx context.Context, a apptypes.Deps, userID, playerTag string) (string, error) {
	if a.Store.SQL == nil {
		return "", apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var deleted string
	err := a.Store.SQL.QueryRow(ctx, `DELETE FROM player_links WHERE user_id = $1 AND tag = $2 RETURNING tag`, userID, playerTag).Scan(&deleted)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return deleted, nil
}

func reorderUserAccounts(ctx context.Context, a apptypes.Deps, userID string) error {
	accounts, err := listUserAccountLinks(ctx, a, userID)
	if err != nil {
		return err
	}
	slices.SortFunc(accounts, func(left, right map[string]any) int {
		return int(asInt64(left["order_index"]) - asInt64(right["order_index"]))
	})
	for index, account := range accounts {
		if _, err := a.Store.SQL.Exec(ctx, `UPDATE player_links SET order_index = $1, updated_at = now() WHERE tag = $2`, index, accountsStringify(account["player_tag"])); err != nil {
			return err
		}
	}
	return nil
}

func asInt64(value any) int64 {
	switch typed := value.(type) {
	case int32:
		return int64(typed)
	case int64:
		return typed
	case float64:
		return int64(typed)
	case int:
		return int64(typed)
	default:
		return 0
	}
}

func accountsStringify(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int:
		return fmt.Sprintf("%d", typed)
	case int32:
		return fmt.Sprintf("%d", typed)
	case int64:
		return fmt.Sprintf("%d", typed)
	case float64:
		return fmt.Sprintf("%d", int64(typed))
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
