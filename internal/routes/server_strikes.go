package routes

import (
	"net/http"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getStrikes(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		query := bson.M{"server": serverID}
		if playerTag := strings.TrimSpace(c.Query("player_tag")); playerTag != "" {
			query["tag"] = serverNormalizeTag(playerTag)
		}
		viewExpired, err := apptypes.QueryBool(c, "view_expired", false)
		if err != nil {
			return err
		}
		if !viewExpired {
			now := time.Now().UTC().Unix()
			query["$or"] = []bson.M{{"rollover_date": nil}, {"rollover_date": bson.M{"$gte": now}}}
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.StrikeList, query)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

func addStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body struct {
			Reason       string `json:"reason"`
			AddedBy      any    `json:"added_by"`
			StrikeWeight int    `json:"strike_weight"`
			RolloverDays int    `json:"rollover_days"`
			Image        string `json:"image"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerName := ""
		if rt.Clash != nil {
			if player, err := rt.Clash.GetPlayer(c.UserContext(), tag); err == nil && player != nil {
				playerName = player.Name
			}
		}
		if playerName == "" {
			playerName = tag
		}
		strikeID := strings.ToUpper(randomID(tag, 5))
		doc := bson.M{
			"tag":           tag,
			"date_created":  time.Now().UTC().Format("2006-01-02 15:04:05"),
			"reason":        body.Reason,
			"server":        serverID,
			"added_by":      body.AddedBy,
			"strike_weight": max(1, body.StrikeWeight),
			"strike_id":     strikeID,
		}
		if body.RolloverDays > 0 {
			doc["rollover_date"] = time.Now().UTC().Add(time.Duration(body.RolloverDays) * 24 * time.Hour).Unix()
		}
		if body.Image != "" {
			doc["image"] = body.Image
		}
		if _, err := rt.Store.C.StrikeList.InsertOne(c.UserContext(), doc); err != nil {
			return err
		}
		activeQuery := bson.M{"tag": tag, "server": serverID, "$or": []bson.M{{"rollover_date": nil}, {"rollover_date": bson.M{"$gte": time.Now().UTC().Unix()}}}}
		total, _ := rt.Store.C.StrikeList.CountDocuments(c.UserContext(), activeQuery)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "strike_id": strikeID, "player_tag": tag, "player_name": playerName, "server_id": serverID, "total_strikes": total})
	}
}

func deleteStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		strikeID := c.Params("strike_id")
		result, err := rt.Store.C.StrikeList.DeleteOne(c.UserContext(), bson.M{"server": serverID, "strike_id": strikeID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Strike not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "strike_id": strikeID, "server_id": serverID})
	}
}

func strikeSummary(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		items, err := findManyMaps(c.UserContext(), rt.Store.C.StrikeList, bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return err
		}
		totalWeight := 0
		for _, item := range items {
			totalWeight += asIntWithDefault(item["strike_weight"], 1)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"player_tag": tag, "count": len(items), "total_weight": totalWeight, "items": sanitize(items)})
	}
}
