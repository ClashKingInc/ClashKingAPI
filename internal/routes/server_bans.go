package routes

import (
	"fmt"
	"net/http"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getBans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.Banlist, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

func addBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body struct {
			Reason  string `json:"reason"`
			AddedBy any    `json:"added_by"`
			Image   string `json:"image"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerName := tag
		if rt.Clash != nil {
			if player, err := rt.Clash.GetPlayer(c.UserContext(), tag); err == nil && player != nil {
				playerName = player.Name
			}
		}
		filter := bson.M{"VillageTag": tag, "server": serverID}
		existing, err := findOneMap(c.UserContext(), rt.Store.C.Banlist, filter)
		if err == nil && existing != nil {
			_, err = rt.Store.C.Banlist.UpdateOne(c.UserContext(), filter, bson.M{"$set": bson.M{"Notes": body.Reason}, "$push": bson.M{"edited_by": bson.M{"user": body.AddedBy, "previous": bson.M{"reason": existing["Notes"]}}}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "updated", "player_tag": tag, "player_name": playerName, "server_id": serverID})
		}
		doc := bson.M{"VillageTag": tag, "VillageName": playerName, "DateCreated": time.Now().UTC().Format("2006-01-02 15:04:05"), "Notes": body.Reason, "server": serverID, "added_by": body.AddedBy, "image": body.Image}
		if _, err := rt.Store.C.Banlist.InsertOne(c.UserContext(), doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "player_tag": tag, "player_name": playerName, "server_id": serverID})
	}
}

func removeBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.C.Banlist.DeleteOne(c.UserContext(), bson.M{"VillageTag": tag, "server": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, fmt.Sprintf("Player %s is not banned on server %d.", tag, serverID))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "player_tag": tag, "server_id": serverID})
	}
}
