package v2

import (
	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
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

		var existingTags []string
		if err := a.Store.C.PlayerStats.Distinct(c.UserContext(), "tag", bson.M{"tag": bson.M{"$in": tags}}).Decode(&existingTags); err != nil {
			return err
		}

		existingSet := make(map[string]struct{}, len(existingTags))
		for _, s := range existingTags {
			existingSet[s] = struct{}{}
		}

		newTags := make([]string, 0)
		docs := make([]any, 0)
		for _, tag := range tags {
			if _, exists := existingSet[tag]; !exists {
				newTags = append(newTags, tag)
				docs = append(docs, bson.M{"tag": tag})
			}
		}
		if len(docs) > 0 {
			if _, err := a.Store.C.PlayerStats.InsertMany(c.UserContext(), docs); err != nil {
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
		if _, err := a.Store.C.PlayerStats.DeleteMany(c.UserContext(), bson.M{"tag": bson.M{"$in": body.Tags}}); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"status":          "success",
			"players_removed": body.Tags,
		})
	}
}
