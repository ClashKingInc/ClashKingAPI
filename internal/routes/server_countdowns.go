package routes

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func getServerCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		items := make([]map[string]any, 0, len(serverCountdownTypes))
		for _, countdownType := range serverCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, map[string]any{"type": countdownType, "name": countdownType, "enabled": serverDoc[field] != nil, "channel_id": toStringMaybe(serverDoc[field])})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": strconv.Itoa(serverID), "countdowns": items})
	}
}

func getClanCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		clanDoc, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return notFoundErr(err, "Clan not found on this server")
		}
		items := make([]map[string]any, 0, len(clanCountdownTypes))
		for _, countdownType := range clanCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, map[string]any{"type": countdownType, "name": countdownType, "enabled": clanDoc[field] != nil, "channel_id": toStringMaybe(clanDoc[field])})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": strconv.Itoa(serverID), "clan_tag": tag, "countdowns": items})
	}
}

func enableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			CountdownType string `json:"countdown_type"`
			ClanTag       string `json:"clan_tag"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		field := countdownDBFields[body.CountdownType]
		if field == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}
		channelID := time.Now().UTC().UnixNano()
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{field: channelID}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{field: channelID}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": body.CountdownType + " countdown enabled successfully", "countdown_type": body.CountdownType, "server_id": serverID, "channel_id": strconv.FormatInt(channelID, 10)})
	}
}

func disableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			CountdownType string `json:"countdown_type"`
			ClanTag       string `json:"clan_tag"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		field := countdownDBFields[body.CountdownType]
		if field == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$unset": bson.M{field: ""}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$unset": bson.M{field: ""}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": body.CountdownType + " countdown disabled successfully", "countdown_type": body.CountdownType, "server_id": serverID})
	}
}
