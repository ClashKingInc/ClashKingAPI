package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
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
// @Success 200 {object} modelsv2.StrikeListResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/strikes [get]
func getStrikes(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		playerTag := strings.TrimSpace(c.Query("player_tag"))
		if playerTag != "" {
			playerTag = serverNormalizeTag(playerTag)
		}
		viewExpired, err := apptypes.QueryBool(c, "view_expired", false)
		if err != nil {
			return err
		}
		items, err := sqlStrikes(c, rt, serverID, playerTag, viewExpired)
		if err != nil {
			return err
		}
		playerTags := make([]string, 0, len(items))
		for _, item := range items {
			if tag := serverNormalizeTag(serverAsString(item["tag"])); tag != "" {
				playerTags = append(playerTags, tag)
			}
		}
		playerSnapshots := fetchPlayerSnapshots(c.UserContext(), rt.Store.SQL, playerTags)
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
// @Success 200 {object} modelsv2.StrikeMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
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
		now := time.Now().UTC()
		doc := map[string]any{
			"tag":           tag,
			"date_created":  now.Format("2006-01-02 15:04:05"),
			"reason":        body.Reason,
			"server":        serverID,
			"added_by":      body.AddedBy,
			"strike_weight": max(1, body.StrikeWeight),
			"strike_id":     strikeID,
		}
		var rolloverAt *time.Time
		if body.RolloverDays > 0 {
			value := now.Add(time.Duration(body.RolloverDays) * 24 * time.Hour)
			rolloverAt = &value
			doc["rollover_date"] = value.Unix()
		}
		if body.Image != "" {
			doc["image"] = body.Image
		}
		if _, err := rt.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO strikes (id, server_id, tag, date_created, reason, added_by, strike_weight, rollover_date, image, data)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
		`, strikeID, strconv.Itoa(serverID), tag, now, body.Reason, body.AddedBy, max(1, body.StrikeWeight), rolloverAt, body.Image, apptypes.Marshal(doc)); err != nil {
			return err
		}
		activeItems, _ := sqlStrikes(c, rt, serverID, tag, false)
		totalWeight := 0
		for _, item := range activeItems {
			totalWeight += asIntWithDefault(item["strike_weight"], 1)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "strike_id": strikeID, "player_tag": tag, "player_name": playerName, "server_id": serverID, "total_strikes": len(activeItems), "total_weight": totalWeight})
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
// @Success 200 {object} modelsv2.StrikeMutationResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/strikes/{strike_id} [delete]
func deleteStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		strikeID := c.Params("strike_id")
		existing, err := sqlStrike(c, rt, serverID, strikeID)
		if err != nil {
			return notFoundErr(err, "Strike not found")
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM strikes WHERE server_id = $1 AND id = $2`, strconv.Itoa(serverID), strikeID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
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
// @Success 200 {object} modelsv2.StrikeSummaryResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/strikes/player/{player_tag}/summary [get]
func strikeSummary(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		items, err := sqlStrikes(c, rt, serverID, tag, true)
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
			Strikes:      strikeItemsFromMaps(items),
		})
	}
}

func strikeItemsFromMaps(items []map[string]any) []modelsv2.StrikeItem {
	out := make([]modelsv2.StrikeItem, 0, len(items))
	for _, item := range items {
		var rolloverDate *int64
		if value := asInt64(item["rollover_date"]); value > 0 {
			rolloverDate = &value
		}
		out = append(out, modelsv2.StrikeItem{
			StrikeID:         serverAsString(item["strike_id"]),
			Tag:              serverAsString(item["tag"]),
			Server:           asIntWithDefault(item["server"], 0),
			Reason:           serverAsString(item["reason"]),
			AddedBy:          serverAsString(item["added_by"]),
			AddedByUsername:  stringPtrMaybe(item["added_by_username"]),
			AddedByAvatarURL: stringPtrMaybe(item["added_by_avatar_url"]),
			StrikeWeight:     asIntWithDefault(item["strike_weight"], 1),
			Image:            stringPtrMaybe(item["image"]),
			DateCreated:      serverAsString(item["date_created"]),
			RolloverDate:     rolloverDate,
			PlayerName:       stringPtrMaybe(item["player_name"]),
			TownHall:         intPtrMaybe(item["town_hall"]),
			ClanTag:          stringPtrMaybe(item["clan_tag"]),
			ClanName:         stringPtrMaybe(item["clan_name"]),
			CurrentRole:      stringPtrMaybe(item["current_role"]),
			Trophies:         intPtrMaybe(item["trophies"]),
		})
	}
	return out
}

func sqlStrikes(c *fiber.Ctx, rt apptypes.Deps, serverID int, playerTag string, includeExpired bool) ([]map[string]any, error) {
	query := `
		SELECT id, tag, date_created, reason, added_by, strike_weight, rollover_date, image, data
		FROM strikes
		WHERE server_id = $1
	`
	args := []any{strconv.Itoa(serverID)}
	if playerTag != "" {
		query += ` AND tag = $` + strconv.Itoa(len(args)+1)
		args = append(args, playerTag)
	}
	if !includeExpired {
		query += ` AND (rollover_date IS NULL OR rollover_date >= now())`
	}
	query += ` ORDER BY date_created DESC`
	rows, err := rt.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		item, err := scanSQLStrike(rows, serverID)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func sqlStrike(c *fiber.Ctx, rt apptypes.Deps, serverID int, strikeID string) (map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT id, tag, date_created, reason, added_by, strike_weight, rollover_date, image, data
		FROM strikes
		WHERE server_id = $1 AND id = $2
		LIMIT 1
	`, strconv.Itoa(serverID), strikeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("strike not found")
	}
	return scanSQLStrike(rows, serverID)
}

type strikeScanner interface {
	Scan(dest ...any) error
}

func scanSQLStrike(row strikeScanner, serverID int) (map[string]any, error) {
	var id, tag, reason, addedBy string
	var weight int
	var createdAt time.Time
	var rolloverAt *time.Time
	var image *string
	var raw []byte
	if err := row.Scan(&id, &tag, &createdAt, &reason, &addedBy, &weight, &rolloverAt, &image, &raw); err != nil {
		return nil, err
	}
	item := map[string]any{}
	_ = json.Unmarshal(raw, &item)
	item["strike_id"] = id
	item["tag"] = tag
	item["server"] = serverID
	item["date_created"] = createdAt.UTC().Format("2006-01-02 15:04:05")
	item["reason"] = reason
	item["added_by"] = addedBy
	item["strike_weight"] = weight
	if rolloverAt != nil {
		item["rollover_date"] = rolloverAt.Unix()
	}
	if image != nil {
		item["image"] = *image
	}
	return item, nil
}
