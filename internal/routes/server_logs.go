package routes

import (
	"net/http"
	"slices"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		aggregated := map[string]map[string]any{}
		for _, clanDoc := range clans {
			logs, _ := clanDoc["logs"].(map[string]any)
			for dbName, apiName := range logMapping {
				raw, _ := logs[dbName].(map[string]any)
				webhook := serverAsString(raw["webhook"])
				if webhook == "" {
					continue
				}
				if _, ok := aggregated[apiName]; !ok {
					aggregated[apiName] = map[string]any{"enabled": true, "channel": nil, "thread": raw["thread"], "webhook": webhook, "clans": []string{}}
				}
				existing := aggregated[apiName]["clans"].([]string)
				tag := serverAsString(clanDoc["tag"])
				if !slices.Contains(existing, tag) {
					aggregated[apiName]["clans"] = append(existing, tag)
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, aggregated)
	}
}

func updateServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No log settings provided")
		}
		for apiName, config := range body {
			dbNames := apiToDBLogMapping[apiName]
			if len(dbNames) == 0 {
				continue
			}
			var clans []string
			switch raw := config["clans"].(type) {
			case []any:
				for _, item := range raw {
					if tag := serverNormalizeTag(serverAsString(item)); tag != "" {
						clans = append(clans, tag)
					}
				}
			case []string:
				for _, item := range raw {
					clans = append(clans, serverNormalizeTag(item))
				}
			}
			for _, clanTag := range clans {
				set := bson.M{}
				for _, dbName := range dbNames {
					set["logs."+dbName] = bson.M{"webhook": config["webhook"], "thread": config["thread"]}
				}
				_, _ = rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": clanTag}, bson.M{"$set": set})
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Server logs updated successfully", "server_id": serverID})
	}
}

func patchServerLogType(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		logType := c.Params("log_type")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if _, ok := apiToDBLogMapping[logType]; !ok {
			return apptypes.Error(http.StatusBadRequest, "Unknown log type")
		}
		_, err = rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{"logs_config." + logType: body}})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Log type updated", "server_id": serverID, "log_type": logType})
	}
}

func getAllClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(clans)})
	}
}

func putClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
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
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{"logs": body}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan logs updated successfully", "server_id": serverID, "clan_tag": tag})
	}
}

func deleteClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{"logs": bson.M{}}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan logs deleted successfully", "server_id": serverID, "clan_tag": tag})
	}
}
