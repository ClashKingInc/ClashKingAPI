package routes

import (
	"fmt"
	"net/http"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getAutoboards(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.Autoboards, bson.M{"server_id": serverID})
		if err != nil {
			return err
		}
		postCount := 0
		refreshCount := 0
		for _, item := range items {
			if serverAsString(item["type"]) == "post" {
				postCount++
			} else {
				refreshCount++
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"autoboards":    sanitize(items),
			"total":         len(items),
			"post_count":    postCount,
			"refresh_count": refreshCount,
			"limit":         asIntWithDefault(serverDoc["autoboard_limit"], 10),
		})
	}
}

func createAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		limit := asIntWithDefault(serverDoc["autoboard_limit"], 10)
		existingCount, _ := rt.Store.C.Autoboards.CountDocuments(c.UserContext(), bson.M{"server_id": serverID})
		if int(existingCount) >= limit {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("Autoboard limit reached (%d/%d). Please upgrade or delete existing autoboards.", existingCount, limit))
		}
		body["server_id"] = serverID
		body["created_at"] = time.Now().UTC()
		result, err := rt.Store.C.Autoboards.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard created successfully", "autoboard_id": sanitizeObjectID(result.InsertedID), "server_id": serverID, "type": body["type"]})
	}
}

func updateAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.Autoboards.UpdateOne(c.UserContext(), bson.M{"_id": id, "server_id": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard updated successfully", "autoboard_id": c.Params("autoboard_id"), "updated_fields": len(body)})
	}
}

func deleteAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		result, err := rt.Store.C.Autoboards.DeleteOne(c.UserContext(), bson.M{"_id": id, "server_id": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard deleted successfully", "autoboard_id": c.Params("autoboard_id")})
	}
}
