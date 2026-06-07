package v2

import (
	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// addTrackingPlayers godoc
// @Summary Add players to tracking
// @Description Normalizes tags and inserts any not yet tracked into the database.
// @Tags Tracking Endpoints
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.TrackingPlayerListRequest true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/tracking/players/add [post]
func addTrackingPlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.TrackingPlayerListRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		tags := make([]string, 0, len(body.Tags))
		for _, tag := range body.Tags {
			tags = append(tags, accountsNormalizeTag(tag))
		}

		if a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT tag FROM tracked_player_targets WHERE tag = ANY($1) AND enabled = true
		`, tags)
		if err != nil {
			return err
		}
		defer rows.Close()
		existingTags := []string{}
		for rows.Next() {
			var tag string
			if err := rows.Scan(&tag); err != nil {
				return err
			}
			existingTags = append(existingTags, tag)
		}

		existingSet := make(map[string]struct{}, len(existingTags))
		for _, s := range existingTags {
			existingSet[s] = struct{}{}
		}

		newTags := make([]string, 0)
		for _, tag := range tags {
			if _, exists := existingSet[tag]; !exists {
				newTags = append(newTags, tag)
			}
		}
		if len(newTags) > 0 {
			for _, tag := range newTags {
				if _, err := a.Store.SQL.Exec(c.UserContext(), `
					INSERT INTO tracked_player_targets (tag, enabled, source, created_at, updated_at)
					VALUES ($1, true, 'api', now(), now())
					ON CONFLICT (tag) DO UPDATE SET enabled = true, source = 'api', updated_at = now()
				`, tag); err != nil {
					return err
				}
			}
			if _, err := a.Store.SQL.Exec(c.UserContext(), `
				INSERT INTO basic_player (tag, name, townhall_level)
				SELECT unnest($1::text[]), '', 0
				ON CONFLICT (tag) DO NOTHING
			`, newTags); err != nil {
				return err
			}
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"status":                  "success",
			"players_added":           newTags,
			"players_already_tracked": existingTags,
		})
	}
}

// removeTrackingPlayers godoc
// @Summary Remove players from tracking
// @Description Deletes the given player tags from the tracking database.
// @Tags Tracking Endpoints
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.TrackingPlayerListRequest true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/tracking/players/remove [post]
func removeTrackingPlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.TrackingPlayerListRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := make([]string, 0, len(body.Tags))
		for _, tag := range body.Tags {
			tags = append(tags, accountsNormalizeTag(tag))
		}
		if a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE tracked_player_targets
			SET enabled = false, updated_at = now()
			WHERE tag = ANY($1)
		`, tags); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"status":          "success",
			"players_removed": tags,
		})
	}
}
