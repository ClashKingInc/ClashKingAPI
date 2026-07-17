package routes

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// addAccount links a Clash of Clans account to the requested link subject.
//
// @Summary Link a Clash of Clans account
// @Description Links a Clash of Clans account.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param body body modelsv2.AccountsCOCAccountRequest true "Account payload"
// @Success 200 {object} modelsv2.AccountsLinkResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.AccountConflictErrorResponse
// @Router /v2/links/{id} [post]
func addAccount(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		var body modelsv2.AccountsCOCAccountRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerTag := clashy.CorrectTag(body.PlayerTag)
		player, err := a.Clash.GetPlayer(c.UserContext(), playerTag)
		if err != nil || player == nil {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account does not exist")
		}

		apiToken := strings.TrimSpace(body.APIToken)
		verifyOwnership := apiToken != ""
		if verifyOwnership {
			token := apiToken
			ok, err := a.Clash.Client().VerifyPlayerToken(c.UserContext(), playerTag, token)
			if err != nil || !ok {
				return apptypes.Error(fiber.StatusForbidden, "Invalid player token. Check your Clash of Clans account settings and try again.")
			}
		}
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var oldUserID *string
		var orderIndex int
		existingVerified := false
		existingHidden := false
		err = tx.QueryRow(c.UserContext(), `
			SELECT user_id, order_index, is_verified, hidden
			FROM player_links
			WHERE tag = $1
			FOR UPDATE
		`, playerTag).Scan(&oldUserID, &orderIndex, &existingVerified, &existingHidden)
		if err != nil && err != pgx.ErrNoRows {
			return err
		}
		hasExisting := err == nil
		previousOwner := ""
		if oldUserID != nil {
			previousOwner = *oldUserID
		}
		if hasExisting && previousOwner != userID && !verifyOwnership {
			return &apptypes.AppError{
				Status: fiber.StatusConflict,
				Code:   modelsv2.ErrorCodeConflict,
				Detail: "This Clash of Clans account is already linked to another user",
				Account: &modelsv2.AccountsLinkedPlayer{
					Tag:           player.Tag,
					Name:          player.Name,
					TownHallLevel: player.TownHall,
				},
			}
		}
		if hasExisting && previousOwner != userID {
			if _, err := tx.Exec(c.UserContext(), `DELETE FROM player_links WHERE tag = $1`, playerTag); err != nil {
				return err
			}
			if err := reorderUserAccountsTx(c.UserContext(), tx, previousOwner); err != nil {
				return err
			}
			hasExisting = false
			existingVerified = false
			existingHidden = false
		}
		if !hasExisting {
			if err := tx.QueryRow(c.UserContext(), `SELECT count(*) FROM player_links WHERE user_id = $1`, userID).Scan(&orderIndex); err != nil {
				return err
			}
		}
		verifiedAt := (*time.Time)(nil)
		if verifyOwnership {
			now := time.Now().UTC()
			verifiedAt = &now
		}
		_, err = tx.Exec(c.UserContext(), `
			INSERT INTO player_links (tag, user_id, source, order_index, is_verified, added_at, verified_at, updated_at)
			VALUES ($1, $2, 'clashking', $3, $4, now(), $5, now())
			ON CONFLICT (tag) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				source = EXCLUDED.source,
				order_index = EXCLUDED.order_index,
				is_verified = player_links.is_verified OR EXCLUDED.is_verified,
				verified_at = COALESCE(player_links.verified_at, EXCLUDED.verified_at),
				updated_at = now()
		`, player.Tag, userID, orderIndex, verifyOwnership, verifiedAt)
		if err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		message := "Clash of Clans account linked successfully"
		if verifyOwnership {
			message = "Clash of Clans account linked successfully with ownership verification"
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsLinkResponse{
			Message: message,
			Account: modelsv2.AccountsLinkedPlayer{
				Tag:           player.Tag,
				Name:          player.Name,
				TownHallLevel: player.TownHall,
				IsVerified:    existingVerified || verifyOwnership,
				Hidden:        existingHidden,
			},
		})
	}
}

// listAccounts returns the requested link subject's linked Clash of Clans accounts.
//
// @Summary Get all Clash of Clans accounts linked to a user
// @Description Returns linked Clash of Clans accounts in order.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Success 200 {object} modelsv2.AccountsListResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id} [get]
func listAccounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		accounts := make([]modelsv2.AccountsLinkedAccount, 0)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT user_id, tag, order_index, is_verified, hidden, added_at, verified_at
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
			var hidden bool
			var addedAt time.Time
			var verifiedAt *time.Time
			if err := rows.Scan(&userID, &tag, &orderIndex, &isVerified, &hidden, &addedAt, &verifiedAt); err != nil {
				return err
			}
			account := modelsv2.AccountsLinkedAccount{
				UserID:     userID,
				PlayerTag:  tag,
				OrderIndex: orderIndex,
				IsVerified: isVerified,
				Hidden:     hidden,
				AddedAt:    addedAt,
			}
			if verifiedAt != nil {
				account.VerifiedAt = verifiedAt
			}
			accounts = append(accounts, account)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsListResponse{Items: accounts})
	}
}

// removeAccount unlinks a Clash of Clans account from the requested link subject.
//
// @Summary Remove a linked Clash of Clans account
// @Description Unlinks a Clash of Clans account.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Success 200 {object} modelsv2.AccountsMessageResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag} [delete]
func removeAccount(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		playerTag := clashy.CorrectTag(decodeRouteTag(c.Params("playerTag")))
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var tag string
		err = tx.QueryRow(c.UserContext(), `DELETE FROM player_links WHERE user_id = $1 AND tag = $2 RETURNING tag`, userID, playerTag).Scan(&tag)
		if err != nil && err != pgx.ErrNoRows {
			return err
		}
		if tag == "" {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account not found or not linked to your profile")
		}
		if err := reorderUserAccountsTx(c.UserContext(), tx, userID); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsMessageResponse{Message: "Clash of Clans account unlinked successfully"})
	}
}

// setAccountVisibility updates the hidden status of a verified linked account.
//
// @Summary Set linked account visibility
// @Description Sets hidden for a verified account owned by the requested link subject. Unverified accounts cannot be hidden.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Param body body modelsv2.AccountsLinkVisibilityRequest true "Visibility payload"
// @Success 200 {object} modelsv2.AccountsLinkedAccount
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag} [patch]
func setAccountVisibility(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		playerTag := clashy.CorrectTag(decodeRouteTag(c.Params("playerTag")))
		var body modelsv2.AccountsLinkVisibilityRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		var account modelsv2.AccountsLinkedAccount
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			UPDATE player_links
			SET hidden = $1, updated_at = now()
			WHERE user_id = $2 AND tag = $3 AND is_verified = true
			RETURNING user_id, tag, order_index, is_verified, hidden, added_at, verified_at
		`, body.Hidden, userID, playerTag).Scan(
			&account.UserID,
			&account.PlayerTag,
			&account.OrderIndex,
			&account.IsVerified,
			&account.Hidden,
			&account.AddedAt,
			&account.VerifiedAt,
		)
		if err == nil {
			return apptypes.JSON(c, fiber.StatusOK, account)
		}
		if err != pgx.ErrNoRows {
			return err
		}
		var verified bool
		lookupErr := a.Store.SQL.QueryRow(c.UserContext(), `SELECT is_verified FROM player_links WHERE user_id = $1 AND tag = $2`, userID, playerTag).Scan(&verified)
		if lookupErr == pgx.ErrNoRows {
			return apptypes.Error(fiber.StatusNotFound, "Clash of Clans account not found or not linked to your profile")
		}
		if lookupErr != nil {
			return lookupErr
		}
		return apptypes.Error(fiber.StatusForbidden, "Only verified links can be hidden")
	}
}

// reorderAccounts reorders the requested link subject's linked Clash of Clans accounts.
//
// @Summary Reorder linked Clash of Clans accounts
// @Description Reorders linked Clash of Clans accounts.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param body body modelsv2.AccountsReorderAccountsRequest true "Reorder payload"
// @Success 200 {object} modelsv2.AccountsMessageResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/order [put]
func reorderAccounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		var body modelsv2.AccountsReorderAccountsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.OrderedTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Ordered tags list cannot be empty")
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		normalized := make([]string, 0, len(body.OrderedTags))
		for _, tag := range body.OrderedTags {
			normalized = append(normalized, clashy.CorrectTag(tag))
		}
		var count int
		err = a.Store.SQL.QueryRow(c.UserContext(), `SELECT count(*) FROM player_links WHERE user_id = $1 AND tag = ANY($2)`, userID, normalized).Scan(&count)
		if err != nil {
			return err
		}
		if count != len(normalized) {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid account tags provided")
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE player_links AS links
			SET order_index = (ordered.ordinal - 1)::integer, updated_at = now()
			FROM unnest($2::text[]) WITH ORDINALITY AS ordered(tag, ordinal)
			WHERE links.user_id = $1 AND links.tag = ordered.tag
		`, userID, normalized); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsMessageResponse{Message: "Accounts reordered successfully"})
	}
}

func resolveLinkSubject(_ context.Context, _ apptypes.Deps, c *fiber.Ctx, rawID string) (string, error) {
	id := strings.TrimSpace(rawID)
	if id == "" {
		return "", apptypes.Error(fiber.StatusBadRequest, "Invalid link subject")
	}

	if !isBotPrincipal(c) {
		authenticatedID := apptypes.UserID(c.UserContext())
		if authenticatedID == "" {
			return "", apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}
		if id != authenticatedID {
			return "", apptypes.Error(fiber.StatusForbidden, "You cannot manage links for another user")
		}
	}
	return id, nil
}

func findAccountByTag(ctx context.Context, a apptypes.Deps, playerTag string) (map[string]any, error) {
	return scanPlayerLink(ctx, a, `WHERE tag = $1`, playerTag)
}

func reorderUserAccountsTx(ctx context.Context, tx pgx.Tx, userID string) error {
	if userID == "" {
		return nil
	}
	_, err := tx.Exec(ctx, `
		WITH ordered AS (
			SELECT tag, (row_number() OVER (ORDER BY order_index, added_at) - 1)::integer AS order_index
			FROM player_links
			WHERE user_id = $1
		)
		UPDATE player_links AS links
		SET order_index = ordered.order_index, updated_at = now()
		FROM ordered
		WHERE links.tag = ordered.tag
	`, userID)
	return err
}

func scanPlayerLink(ctx context.Context, a apptypes.Deps, where string, args ...any) (map[string]any, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT user_id, tag, order_index, is_verified, hidden, added_at, verified_at
		FROM player_links ` + where + ` LIMIT 1`
	var userID *string
	var tag string
	var orderIndex int
	var verified bool
	var hidden bool
	var addedAt time.Time
	var verifiedAt *time.Time
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(&userID, &tag, &orderIndex, &verified, &hidden, &addedAt, &verifiedAt); err != nil {
		return nil, err
	}
	account := map[string]any{
		"player_tag":  tag,
		"order_index": orderIndex,
		"is_verified": verified,
		"hidden":      hidden,
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
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT tag, order_index, is_verified, hidden, added_at, verified_at
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
		var hidden bool
		var addedAt time.Time
		var verifiedAt *time.Time
		if err := rows.Scan(&tag, &orderIndex, &verified, &hidden, &addedAt, &verifiedAt); err != nil {
			return nil, err
		}
		account := map[string]any{
			"user_id":     userID,
			"player_tag":  tag,
			"order_index": orderIndex,
			"is_verified": verified,
			"hidden":      hidden,
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
	if a.Store == nil || a.Store.SQL == nil {
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
