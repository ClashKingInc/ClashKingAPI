package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// getBans godoc
// @Summary Get server bans
// @Description Returns all banned players for a server.
// @Tags Server Bans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/bans [get]
func getBans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		items, err := sqlBans(c, rt, serverID)
		if err != nil {
			return err
		}

		playerTags := make([]string, 0, len(items))
		for _, item := range items {
			if tag := serverNormalizeTag(serverAsString(item["VillageTag"])); tag != "" {
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
				if editedBy, ok := item["edited_by"].([]any); ok {
					for _, edit := range editedBy {
						if cast, ok := edit.(map[string]any); ok {
							cast["user"] = serverAsString(cast["user"])
						}
					}
				}
				tag := serverNormalizeTag(serverAsString(item["VillageTag"]))
				if tag == "" {
					continue
				}
				snapshot := playerSnapshots[tag]
				if snapshot.Name != nil {
					item["name"] = *snapshot.Name
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
				tag := serverNormalizeTag(serverAsString(item["VillageTag"]))
				if tag == "" {
					continue
				}
				snapshot := playerSnapshots[tag]
				if snapshot.Name != nil {
					item["name"] = *snapshot.Name
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

// addBan godoc
// @Summary Add or update a ban
// @Description Bans a player on the server.
// @Tags Server Bans
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/bans/{player_tag} [post]
func addBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body modelsv2.BanRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerName := tag
		if rt.Clash != nil {
			if player, err := rt.Clash.GetPlayer(c.UserContext(), tag); err == nil && player != nil {
				playerName = player.Name
			}
		}
		existing, err := sqlBan(c, rt, serverID, tag)
		if err == nil && existing != nil {
			editedBy := append(banAnySlice(existing["edited_by"]), map[string]any{"user": body.AddedBy, "previous": map[string]any{"reason": existing["Notes"]}})
			_, err = rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE server_bans
				SET reason = $3,
					edited_by = $4::jsonb,
					data = data || $5::jsonb,
					updated_at = now()
				WHERE server_id = $1 AND player_tag = $2
			`, strconv.Itoa(serverID), tag, body.Reason, apptypes.Marshal(editedBy), apptypes.Marshal(map[string]any{"Notes": body.Reason, "edited_by": editedBy}))
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "updated", "player_tag": tag, "player_name": playerName, "server_id": serverID})
		}
		doc := map[string]any{"VillageTag": tag, "VillageName": playerName, "DateCreated": time.Now().UTC().Format("2006-01-02 15:04:05"), "Notes": body.Reason, "server": serverID, "added_by": body.AddedBy, "image": body.Image}
		if _, err := rt.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO server_bans (server_id, player_tag, player_name, reason, added_by, data, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), now())
		`, strconv.Itoa(serverID), tag, playerName, body.Reason, body.AddedBy, apptypes.Marshal(doc)); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "player_tag": tag, "player_name": playerName, "server_id": serverID})
	}
}

// removeBan godoc
// @Summary Remove a ban
// @Description Removes a player ban from the server.
// @Tags Server Bans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/bans/{player_tag} [delete]
func removeBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM server_bans WHERE server_id = $1 AND player_tag = $2`, strconv.Itoa(serverID), tag)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, fmt.Sprintf("Player %s is not banned on server %d.", tag, serverID))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "player_tag": tag, "server_id": serverID})
	}
}

func sqlBans(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, player_name, reason, added_by, edited_by, created_at, data
		FROM server_bans
		WHERE server_id = $1
		ORDER BY created_at DESC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		item, err := scanSQLBan(rows, serverID)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func sqlBan(c *fiber.Ctx, rt apptypes.Deps, serverID int, tag string) (map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, player_name, reason, added_by, edited_by, created_at, data
		FROM server_bans
		WHERE server_id = $1 AND player_tag = $2
		LIMIT 1
	`, strconv.Itoa(serverID), tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	return scanSQLBan(rows, serverID)
}

type banScanner interface {
	Scan(dest ...any) error
}

func scanSQLBan(row banScanner, serverID int) (map[string]any, error) {
	var tag, playerName, reason, addedBy string
	var editedRaw, dataRaw []byte
	var createdAt time.Time
	if err := row.Scan(&tag, &playerName, &reason, &addedBy, &editedRaw, &createdAt, &dataRaw); err != nil {
		return nil, err
	}
	item := map[string]any{}
	_ = json.Unmarshal(dataRaw, &item)
	item["VillageTag"] = tag
	item["VillageName"] = playerName
	item["Notes"] = reason
	item["server"] = serverID
	item["added_by"] = addedBy
	item["DateCreated"] = createdAt.UTC().Format("2006-01-02 15:04:05")
	var edited []any
	_ = json.Unmarshal(editedRaw, &edited)
	item["edited_by"] = edited
	return item, nil
}

func banAnySlice(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	default:
		return []any{}
	}
}
