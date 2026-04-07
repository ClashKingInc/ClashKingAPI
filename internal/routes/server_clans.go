package routes

import (
	"net/http"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getServerClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		doc, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, bson.M{"tag": tag, "server": serverID})
		if err != nil {
			return notFoundErr(err, "Server or clan not found")
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(doc))
	}
}

func getServerClansBasic(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		items := make([]map[string]any, 0, len(clans))
		for _, clanDoc := range clans {
			items = append(items, map[string]any{"tag": clanDoc["tag"], "name": clanDoc["name"]})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

func getServerClans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(clans), "count": len(clans)})
	}
}

func patchClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server or clan not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan settings updated successfully", "server_id": serverID, "clan_tag": tag, "updated_fields": len(body)})
	}
}

func addServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag := serverNormalizeTag(serverAsString(body["tag"]))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag is required")
		}
		body["tag"] = tag
		body["server"] = serverID
		if body["name"] == nil && rt.Clash != nil {
			if clanDoc, err := rt.Clash.GetClan(c.UserContext(), tag); err == nil && clanDoc != nil {
				body["name"] = clanDoc.Name
			}
		}
		_, err = rt.Store.C.ClanDB.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan added successfully", "server_id": serverID, "clan_tag": tag})
	}
}

func removeServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.C.ClanDB.DeleteOne(c.UserContext(), bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan removed successfully", "server_id": serverID, "clan_tag": tag})
	}
}
