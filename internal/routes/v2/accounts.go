package v2

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
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
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
		if err != nil && err != mongo.ErrNoDocuments {
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
			if _, err := a.Store.C.COCAccounts.DeleteOne(c.UserContext(), bson.M{"player_tag": playerTag}); err != nil {
				return err
			}
			if err := reorderUserAccounts(c.UserContext(), a, accountsStringify(oldAccount["user_id"])); err != nil {
				return err
			}
		}

		orderIndex, err := a.Store.C.COCAccounts.CountDocuments(c.UserContext(), bson.M{"user_id": userID})
		if err != nil {
			return err
		}
		_, err = a.Store.C.COCAccounts.InsertOne(c.UserContext(), bson.M{
			"user_id":     userID,
			"player_tag":  player.Tag,
			"order_index": orderIndex,
			"is_verified": requireVerification,
			"added_at":    time.Now().UTC(),
		})
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
		cursor, err := a.Store.C.COCAccounts.Find(c.UserContext(), bson.M{"user_id": userID})
		if err != nil {
			return err
		}
		var accounts []map[string]any
		if err := cursor.All(c.UserContext(), &accounts); err != nil {
			return err
		}
		slices.SortFunc(accounts, func(left, right map[string]any) int {
			return int(asInt64(left["order_index"]) - asInt64(right["order_index"]))
		})
		for _, account := range accounts {
			delete(account, "_id")
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
		result, err := a.Store.C.COCAccounts.DeleteOne(c.UserContext(), bson.M{"user_id": userID, "player_tag": playerTag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
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
		if err == mongo.ErrNoDocuments {
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
		count, err := a.Store.C.COCAccounts.CountDocuments(c.UserContext(), bson.M{"user_id": userID, "player_tag": bson.M{"$in": normalized}})
		if err != nil {
			return err
		}
		if int(count) != len(normalized) {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid account tags provided")
		}
		models := make([]mongo.WriteModel, 0, len(normalized))
		for index, tag := range normalized {
			models = append(models, mongo.NewUpdateOneModel().SetFilter(bson.M{"user_id": userID, "player_tag": tag}).SetUpdate(bson.M{"$set": bson.M{"order_index": index}}))
		}
		if len(models) > 0 {
			if _, err := a.Store.C.COCAccounts.BulkWrite(c.UserContext(), models); err != nil {
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
		var existing map[string]any
		err := a.Store.C.COCAccounts.FindOne(c.UserContext(), bson.M{"user_id": userID, "player_tag": playerTag}).Decode(&existing)
		if err == mongo.ErrNoDocuments {
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
		_, err = a.Store.C.COCAccounts.UpdateOne(c.UserContext(), bson.M{"user_id": userID, "player_tag": playerTag}, bson.M{"$set": bson.M{"is_verified": true, "verified_at": time.Now().UTC()}})
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
	var account map[string]any
	if err := a.Store.C.COCAccounts.FindOne(ctx, bson.M{"player_tag": playerTag}).Decode(&account); err != nil {
		return nil, err
	}
	return account, nil
}

func reorderUserAccounts(ctx context.Context, a apptypes.Deps, userID string) error {
	cursor, err := a.Store.C.COCAccounts.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return err
	}
	var accounts []map[string]any
	if err := cursor.All(ctx, &accounts); err != nil {
		return err
	}
	slices.SortFunc(accounts, func(left, right map[string]any) int {
		return int(asInt64(left["order_index"]) - asInt64(right["order_index"]))
	})
	models := make([]mongo.WriteModel, 0, len(accounts))
	for index, account := range accounts {
		models = append(models, mongo.NewUpdateOneModel().SetFilter(bson.M{"_id": account["_id"]}).SetUpdate(bson.M{"$set": bson.M{"order_index": index}}))
	}
	if len(models) == 0 {
		return nil
	}
	_, err = a.Store.C.COCAccounts.BulkWrite(ctx, models)
	return err
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
