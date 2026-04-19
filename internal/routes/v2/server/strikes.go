package server

import (
	"net/http"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// getStrikes godoc
// @Summary Get server strikes
// @Description Returns all strikes for a server, optionally filtered by player tag or including expired.
// @Tags Server Strikes
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param player_tag query string false "Filter by player tag"
// @Param view_expired query bool false "Include expired strikes (default false)"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/strikes [get]
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
		playerTags := make([]string, 0, len(items))
		for _, item := range items {
			if tag := serverNormalizeTag(serverAsString(item["tag"])); tag != "" {
				playerTags = append(playerTags, tag)
			}
		}
		playerSnapshots := fetchPlayerSnapshots(c.UserContext(), rt.Store.C.PlayerStats, rt.Store.C.ClanDB, playerTags)
		if members, err := fetchAllServerMembers(c, rt, int64(serverID)); err == nil {
			for _, item := range items {
				if addedBy := serverAsString(item["added_by"]); addedBy != "" {
					item["added_by"] = addedBy
					if member, ok := members[addedBy]; ok {
						item["added_by_username"] = member.EffectiveName()
						item["added_by_avatar_url"] = member.EffectiveAvatarURL()
					}
				}
				tag := serverNormalizeTag(serverAsString(item["tag"]))
				if tag == "" {
					continue
				}
				snapshot := playerSnapshots[tag]
				if snapshot.Name != nil {
					item["player_name"] = *snapshot.Name
				}
				if snapshot.TownHall != nil {
					item["town_hall"] = *snapshot.TownHall
				}
				if snapshot.ClanTag != nil {
					item["clan_tag"] = *snapshot.ClanTag
				}
				if snapshot.ClanName != nil {
					item["clan_name"] = *snapshot.ClanName
				}
				if snapshot.ClanRole != nil {
					item["current_role"] = *snapshot.ClanRole
				}
				if snapshot.Trophies != nil {
					item["trophies"] = *snapshot.Trophies
				}
			}
		} else {
			for _, item := range items {
				tag := serverNormalizeTag(serverAsString(item["tag"]))
				if tag == "" {
					continue
				}
				snapshot := playerSnapshots[tag]
				if snapshot.Name != nil {
					item["player_name"] = *snapshot.Name
				}
				if snapshot.TownHall != nil {
					item["town_hall"] = *snapshot.TownHall
				}
				if snapshot.ClanTag != nil {
					item["clan_tag"] = *snapshot.ClanTag
				}
				if snapshot.ClanName != nil {
					item["clan_name"] = *snapshot.ClanName
				}
				if snapshot.ClanRole != nil {
					item["current_role"] = *snapshot.ClanRole
				}
				if snapshot.Trophies != nil {
					item["trophies"] = *snapshot.Trophies
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

// addStrike godoc
// @Summary Add a strike
// @Description Adds a strike to a player on the server.
// @Tags Server Strikes
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/strikes/{player_tag} [post]
func addStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body modelsv2.StrikeRequest
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
		activeItems, _ := findManyMaps(c.UserContext(), rt.Store.C.StrikeList, activeQuery)
		totalWeight := 0
		for _, item := range activeItems {
			totalWeight += asIntWithDefault(item["strike_weight"], 1)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "strike_id": strikeID, "player_tag": tag, "player_name": playerName, "server_id": serverID, "total_strikes": total, "total_weight": totalWeight})
	}
}

// deleteStrike godoc
// @Summary Delete a strike
// @Description Deletes a strike by its ID.
// @Tags Server Strikes
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param strike_id path string true "Strike ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/strikes/{strike_id} [delete]
func deleteStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		strikeID := c.Params("strike_id")
		existing, err := findOneMap(c.UserContext(), rt.Store.C.StrikeList, bson.M{"server": serverID, "strike_id": strikeID})
		if err != nil {
			return notFoundErr(err, "Strike not found")
		}
		result, err := rt.Store.C.StrikeList.DeleteOne(c.UserContext(), bson.M{"server": serverID, "strike_id": strikeID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Strike not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "strike_id": strikeID, "player_tag": serverAsString(existing["tag"]), "server_id": serverID})
	}
}

// strikeSummary godoc
// @Summary Get player strike summary
// @Description Returns all strikes and total weight for a player on the server.
// @Tags Server Strikes
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/strikes/player/{player_tag}/summary [get]
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.StrikeSummaryResponse{
			PlayerTag:    tag,
			ServerID:     serverID,
			TotalStrikes: len(items),
			TotalWeight:  totalWeight,
			Strikes:      sanitize(items).([]map[string]any),
		})
	}
}
