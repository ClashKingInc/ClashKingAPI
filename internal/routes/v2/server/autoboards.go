package server

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
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
		responseItems := make([]modelsv2.AutoBoardConfig, 0, len(items))
		for _, item := range items {
			responseItems = append(responseItems, autoBoardConfigFromDoc(item))
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerAutoBoardsResponse{
			Autoboards:   responseItems,
			Total:        len(items),
			PostCount:    postCount,
			RefreshCount: refreshCount,
			Limit:        asIntWithDefault(serverDoc["autoboard_limit"], 10),
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
		var body modelsv2.CreateAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		limit := asIntWithDefault(serverDoc["autoboard_limit"], 10)
		existingCount, _ := rt.Store.C.Autoboards.CountDocuments(c.UserContext(), bson.M{"server_id": serverID})
		if int(existingCount) >= limit {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("Autoboard limit reached (%d/%d). Please upgrade or delete existing autoboards.", existingCount, limit))
		}
		doc := bson.M{
			"type":       body.Type,
			"board_type": body.BoardType,
			"button_id":  body.ButtonID,
			"webhook_id": body.WebhookID,
			"server_id":  serverID,
			"created_at": time.Now().UTC(),
		}
		if body.ThreadID != nil {
			doc["thread_id"] = *body.ThreadID
		}
		if body.ChannelID != nil {
			doc["channel_id"] = *body.ChannelID
		}
		if body.Days != nil {
			doc["days"] = body.Days
		}
		if body.Locale != "" {
			doc["locale"] = body.Locale
		}
		result, err := rt.Store.C.Autoboards.InsertOne(c.UserContext(), doc)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard created successfully", AutoboardID: serverAsString(sanitizeObjectID(result.InsertedID)), ServerID: serverID, Type: body.Type})
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
		var body modelsv2.UpdateAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		updateBody := map[string]any{}
		if body.Type != nil {
			updateBody["type"] = *body.Type
		}
		if body.Days != nil {
			updateBody["days"] = body.Days
		}
		if body.WebhookID != nil {
			updateBody["webhook_id"] = *body.WebhookID
		}
		if body.ThreadID != nil {
			updateBody["thread_id"] = *body.ThreadID
		}
		if len(updateBody) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.Autoboards.UpdateOne(c.UserContext(), bson.M{"_id": id, "server_id": serverID}, bson.M{"$set": updateBody})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard updated successfully", AutoboardID: c.Params("autoboard_id"), UpdatedFields: len(updateBody)})
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard deleted successfully", AutoboardID: c.Params("autoboard_id")})
	}
}

func autoBoardConfigFromDoc(item map[string]any) modelsv2.AutoBoardConfig {
	id := serverAsString(item["_id"])
	if oid, ok := item["_id"].(bson.ObjectID); ok {
		id = oid.Hex()
	}
	// board_type may not be stored (bot-created docs); extract from button_id like the Python API
	boardType := serverAsString(item["board_type"])
	if boardType == "" {
		if buttonID := serverAsString(item["button_id"]); strings.Contains(buttonID, ":") {
			boardType = strings.SplitN(buttonID, ":", 2)[0]
		}
	}
	return modelsv2.AutoBoardConfig{
		ID:        id,
		Type:      serverAsString(item["type"]),
		BoardType: boardType,
		ButtonID:  serverAsString(item["button_id"]),
		WebhookID: serverAsString(item["webhook_id"]),
		ThreadID:  stringPtrMaybe(item["thread_id"]),
		ChannelID: stringPtrMaybe(item["channel_id"]),
		Days:      stringSlice(item["days"]),
		Locale:    serverAsString(item["locale"]),
		CreatedAt: stringPtrMaybe(stringifyTimeLike(item["created_at"])),
	}
}

func stringPtrMaybe(value any) *string {
	if value == nil {
		return nil
	}
	out := serverAsString(value)
	if out == "" {
		return nil
	}
	return &out
}
