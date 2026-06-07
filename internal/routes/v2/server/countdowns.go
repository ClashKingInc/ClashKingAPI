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
)

// getServerCountdowns godoc
// @Summary Get server countdowns
// @Description Returns all server-level countdown types with enabled status and channel.
// @Tags Server Countdowns
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/countdowns [get]
func getServerCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		countdowns := mapMaybe(serverDoc["countdowns"])
		items := make([]modelsv2.CountdownStatus, 0, len(serverCountdownTypes))
		for _, countdownType := range serverCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, modelsv2.CountdownStatus{
				Type:      countdownType,
				Name:      countdownType,
				Enabled:   countdowns[field] != nil,
				ChannelID: stringPtrMaybe(countdowns[field]),
			})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerCountdownsResponse{ServerID: strconv.Itoa(serverID), Countdowns: items})
	}
}

// getClanCountdowns godoc
// @Summary Get clan countdowns
// @Description Returns all clan-level countdown types with enabled status and channel.
// @Tags Server Countdowns
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clan/{clan_tag}/countdowns [get]
func getClanCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		clanDoc, err := sqlServerClanDoc(c, rt, serverID, tag)
		if err != nil {
			return notFoundErr(err, "Clan not found on this server")
		}
		countdowns := mapMaybe(clanDoc["countdowns"])
		items := make([]modelsv2.CountdownStatus, 0, len(clanCountdownTypes))
		for _, countdownType := range clanCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, modelsv2.CountdownStatus{
				Type:      countdownType,
				Name:      countdownType,
				Enabled:   countdowns[field] != nil,
				ChannelID: stringPtrMaybe(countdowns[field]),
			})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCountdownsResponse{ServerID: strconv.Itoa(serverID), ClanTag: tag, Countdowns: items})
	}
}

// enableCountdown godoc
// @Summary Enable a countdown
// @Description Enables a countdown type for a server or clan.
// @Tags Server Countdowns
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/countdowns [post]
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
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE server_clans
				SET countdowns = jsonb_set(countdowns, ARRAY[$3], to_jsonb($4::text), true),
					data = data || $5::jsonb,
					updated_at = now()
				WHERE server_id = $1 AND tag = $2
			`, strconv.Itoa(serverID), tag, field, strconv.FormatInt(channelID, 10), apptypes.Marshal(map[string]any{field: channelID}))
			if err != nil {
				return err
			}
			if result.RowsAffected() == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE servers
				SET countdowns = jsonb_set(countdowns, ARRAY[$2], to_jsonb($3::text), true),
					data = data || $4::jsonb,
					updated_at = now()
				WHERE id = $1
			`, strconv.Itoa(serverID), field, strconv.FormatInt(channelID, 10), apptypes.Marshal(map[string]any{field: channelID}))
			if err != nil {
				return err
			}
			if result.RowsAffected() == 0 {
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

// disableCountdown godoc
// @Summary Disable a countdown
// @Description Disables a countdown type for a server or clan.
// @Tags Server Countdowns
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/countdowns [delete]
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
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE server_clans
				SET countdowns = countdowns - $3,
					data = data - $3,
					updated_at = now()
				WHERE server_id = $1 AND tag = $2
			`, strconv.Itoa(serverID), tag, field)
			if err != nil {
				return err
			}
			if result.RowsAffected() == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE servers
				SET countdowns = countdowns - $2,
					data = data - $2,
					updated_at = now()
				WHERE id = $1
			`, strconv.Itoa(serverID), field)
			if err != nil {
				return err
			}
			if result.RowsAffected() == 0 {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.DisableCountdownResponse{Message: body.CountdownType + " countdown disabled successfully", CountdownType: body.CountdownType})
	}
}
