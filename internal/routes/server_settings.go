package routes

import (
	"net/http"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		server, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server Not Found")
		}
		includeClans, err := apptypes.QueryBool(c, "clan_settings", false)
		if err != nil {
			return err
		}
		eval := map[string]any{}
		for key, collectionName := range serverSettingsEvalCollections {
			items, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection(collectionName), bson.M{"server": serverID})
			eval[key] = sanitize(items)
		}
		server["eval"] = eval
		if includeClans {
			clans, _ := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
			server["clans"] = sanitize(clans)
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(server))
	}
}

func putEmbedColor(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		hexCode, err := pathInt(c, "hex_code")
		if err != nil {
			return err
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{"embed_color": hexCode}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Embed color updated", "server_id": serverID, "embed_color": hexCode})
	}
}

func patchServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		update := flattenForMongo(body, "")
		if len(update) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": update})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Server settings updated successfully", "server_id": serverID, "updated_fields": len(update)})
	}
}
