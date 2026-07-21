package routes

import (
	"encoding/json"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// @Summary Get player upgrades
// @Description Returns the whole upgrade-data object for a verified player linked to the account.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerUpgradesResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag}/upgrades [get]
func getPlayerUpgrades(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, playerTag, err := upgradeSubject(c, a)
		if err != nil {
			return err
		}
		var rawData []byte
		var updatedAt *time.Time
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT COALESCE(upgrades.data, '{}'::jsonb), upgrades.updated_at
			FROM player_links AS links
			LEFT JOIN player_upgrades AS upgrades ON upgrades.player_tag = links.tag
			WHERE links.user_id = $1 AND links.tag = $2 AND links.is_verified = true
		`, userID, playerTag).Scan(&rawData, &updatedAt)
		if err == pgx.ErrNoRows {
			return verifiedPlayerNotFound()
		}
		if err != nil {
			return err
		}
		data, err := decodeJSONObject(rawData)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerUpgradesResponse{
			PlayerTag: playerTag,
			Data:      data,
			UpdatedAt: updatedAt,
		})
	}
}

// @Summary Replace player upgrades
// @Description Replaces the whole upgrade-data object for a verified player linked to the account and timestamps it on the server.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Param body body modelsv2.PlayerUpgradesReplaceRequest true "Whole upgrade-data object"
// @Success 200 {object} modelsv2.PlayerUpgradesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag}/upgrades [put]
func replacePlayerUpgrades(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, playerTag, err := upgradeSubject(c, a)
		if err != nil {
			return err
		}
		var body modelsv2.PlayerUpgradesReplaceRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.Data == nil {
			return apptypes.Error(fiber.StatusBadRequest, "data must be a JSON object")
		}
		payload, err := json.Marshal(body.Data)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "data must be a JSON object")
		}
		var rawData []byte
		var updatedAt time.Time
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO player_upgrades (player_tag, data, updated_at)
			SELECT links.tag, $3::jsonb, now()
			FROM player_links AS links
			WHERE links.user_id = $1 AND links.tag = $2 AND links.is_verified = true
			ON CONFLICT (player_tag) DO UPDATE SET
				data = EXCLUDED.data,
				updated_at = now()
			RETURNING data, updated_at
		`, userID, playerTag, payload).Scan(&rawData, &updatedAt)
		if err == pgx.ErrNoRows {
			return verifiedPlayerNotFound()
		}
		if err != nil {
			return err
		}
		data, err := decodeJSONObject(rawData)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerUpgradesResponse{
			PlayerTag: playerTag,
			Data:      data,
			UpdatedAt: &updatedAt,
		})
	}
}

// @Summary Get player upgrade preferences
// @Description Returns the preference object for a verified player linked to the account.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerUpgradePreferencesResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag}/upgrade-preferences [get]
func getPlayerUpgradePreferences(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, playerTag, err := upgradeSubject(c, a)
		if err != nil {
			return err
		}
		var rawPreferences []byte
		var updatedAt *time.Time
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT COALESCE(preferences.preferences, '{}'::jsonb), preferences.updated_at
			FROM player_links AS links
			LEFT JOIN player_upgrade_preferences AS preferences ON preferences.player_tag = links.tag
			WHERE links.user_id = $1 AND links.tag = $2 AND links.is_verified = true
		`, userID, playerTag).Scan(&rawPreferences, &updatedAt)
		if err == pgx.ErrNoRows {
			return verifiedPlayerNotFound()
		}
		if err != nil {
			return err
		}
		preferences, err := decodeJSONObject(rawPreferences)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerUpgradePreferencesResponse{
			PlayerTag:   playerTag,
			Preferences: preferences,
			UpdatedAt:   updatedAt,
		})
	}
}

// @Summary Patch player upgrade preferences
// @Description Shallow-merges preference keys for a verified player linked to the account and timestamps the change on the server.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param playerTag path string true "Player tag"
// @Param body body modelsv2.PlayerUpgradePreferencesPatchRequest true "Preference keys to merge"
// @Success 200 {object} modelsv2.PlayerUpgradePreferencesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/links/{id}/{playerTag}/upgrade-preferences [patch]
func patchPlayerUpgradePreferences(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, playerTag, err := upgradeSubject(c, a)
		if err != nil {
			return err
		}
		var body modelsv2.PlayerUpgradePreferencesPatchRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.Preferences == nil {
			return apptypes.Error(fiber.StatusBadRequest, "preferences must be a JSON object")
		}
		payload, err := json.Marshal(body.Preferences)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "preferences must be a JSON object")
		}
		var rawPreferences []byte
		var updatedAt time.Time
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO player_upgrade_preferences (player_tag, preferences, updated_at)
			SELECT links.tag, $3::jsonb, now()
			FROM player_links AS links
			WHERE links.user_id = $1 AND links.tag = $2 AND links.is_verified = true
			ON CONFLICT (player_tag) DO UPDATE SET
				preferences = player_upgrade_preferences.preferences || EXCLUDED.preferences,
				updated_at = now()
			RETURNING preferences, updated_at
		`, userID, playerTag, payload).Scan(&rawPreferences, &updatedAt)
		if err == pgx.ErrNoRows {
			return verifiedPlayerNotFound()
		}
		if err != nil {
			return err
		}
		preferences, err := decodeJSONObject(rawPreferences)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerUpgradePreferencesResponse{
			PlayerTag:   playerTag,
			Preferences: preferences,
			UpdatedAt:   &updatedAt,
		})
	}
}

func upgradeSubject(c *fiber.Ctx, a apptypes.Deps) (string, string, error) {
	userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
	if err != nil {
		return "", "", err
	}
	if a.Store == nil || a.Store.SQL == nil {
		return "", "", apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	playerTag := clashy.CorrectTag(decodeRouteTag(c.Params("playerTag")))
	return userID, playerTag, nil
}

func verifiedPlayerNotFound() error {
	return apptypes.Error(fiber.StatusNotFound, "Verified linked player not found")
}

func decodeJSONObject(raw []byte) (map[string]any, error) {
	value := map[string]any{}
	if len(raw) == 0 {
		return value, nil
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return value, nil
}
