package routes

import (
	"net/http"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getLinks(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		links, err := findManyMaps(c.UserContext(), rt.Store.C.Links, bson.M{"server_id": serverID})
		if err != nil {
			links, _ = findManyMaps(c.UserContext(), rt.Store.C.Links, bson.M{"server": serverID})
		}
		grouped := map[string][]map[string]any{}
		for _, link := range links {
			userID := serverAsString(link["user_id"])
			if userID == "" {
				userID = serverAsString(link["discord_user"])
			}
			grouped[userID] = append(grouped[userID], map[string]any{"player_tag": link["player_tag"], "order_index": link["order_index"]})
		}
		items := make([]map[string]any, 0, len(grouped))
		for userID, userLinks := range grouped {
			items = append(items, map[string]any{"user_discord_id": userID, "links": userLinks})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

func deleteLink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		userID := c.Params("user_discord_id")
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.C.Links.DeleteOne(c.UserContext(), bson.M{"server_id": serverID, "user_id": userID, "player_tag": tag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			result, err = rt.Store.C.Links.DeleteOne(c.UserContext(), bson.M{"server": serverID, "user_id": userID, "player_tag": tag})
			if err != nil {
				return err
			}
			if result.DeletedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Link not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Link removed successfully", "player_tag": tag, "user_id": userID})
	}
}

func bulkUnlink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			UserDiscordID string   `json:"user_discord_id"`
			PlayerTags    []string `json:"player_tags"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := make([]string, 0, len(body.PlayerTags))
		for _, tag := range body.PlayerTags {
			tags = append(tags, serverNormalizeTag(tag))
		}
		result, err := rt.Store.C.Links.DeleteMany(c.UserContext(), bson.M{"server_id": serverID, "user_id": body.UserDiscordID, "player_tag": bson.M{"$in": tags}})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Links removed successfully", "deleted_count": result.DeletedCount})
	}
}
