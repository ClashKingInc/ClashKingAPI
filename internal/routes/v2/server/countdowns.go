package server

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
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
		items := make([]modelsv2.CountdownStatus, 0, len(serverCountdownTypes))
		for _, countdownType := range serverCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, modelsv2.CountdownStatus{
				Type:      countdownType,
				Name:      countdownType,
				Enabled:   serverDoc[field] != nil,
				ChannelID: stringPtrMaybe(serverDoc[field]),
			})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerCountdownsResponse{ServerID: strconv.Itoa(serverID), Countdowns: items})
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
		items := make([]modelsv2.CountdownStatus, 0, len(clanCountdownTypes))
		for _, countdownType := range clanCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, modelsv2.CountdownStatus{
				Type:      countdownType,
				Name:      countdownType,
				Enabled:   clanDoc[field] != nil,
				ChannelID: stringPtrMaybe(clanDoc[field]),
			})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCountdownsResponse{ServerID: strconv.Itoa(serverID), ClanTag: tag, Countdowns: items})
	}
}

func enableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.EnableCountdownRequest
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
			Message:       body.CountdownType + " countdown enabled successfully",
			CountdownType: body.CountdownType,
			ChannelID:     strconv.FormatInt(channelID, 10),
			ChannelName:   "",
		})
	}
}

func disableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.DisableCountdownRequest
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.DisableCountdownResponse{Message: body.CountdownType + " countdown disabled successfully", CountdownType: body.CountdownType})
	}
}
