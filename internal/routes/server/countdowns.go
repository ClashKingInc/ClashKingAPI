package server

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	disgorest "github.com/disgoorg/disgo/rest"
	"github.com/gofiber/fiber/v2"
)

// getServerCountdowns godoc
// @Summary Get server countdowns
// @Description Returns all server-level countdown types with enabled status and channel.
// @Tags Server Countdowns
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.ServerCountdownsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
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
// @Success 200 {object} modelsv2.ClanCountdownsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
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
// @Success 200 {object} modelsv2.EnableCountdownResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
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
		if rt.Discord == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "Discord client is unavailable")
		}

		channelName := countdownChannelName(body.CountdownType, "")
		var clanTag string
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			clanTag = serverNormalizeTag(body.ClanTag)
			if clanTag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			clanDoc, err := sqlServerClanDoc(c, rt, serverID, clanTag)
			if err != nil {
				return notFoundErr(err, "Clan not found on this server")
			}
			if existing := serverAsString(mapMaybe(clanDoc["countdowns"])[field]); existing != "" {
				return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
					Message:       body.CountdownType + " countdown already enabled",
					CountdownType: body.CountdownType,
					ChannelID:     existing,
					ChannelName:   countdownChannelName(body.CountdownType, serverAsString(clanDoc["name"])),
				})
			}
			channelName = countdownChannelName(body.CountdownType, serverAsString(clanDoc["name"]))
		} else {
			serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
			if err != nil {
				return notFoundErr(err, "Server not found")
			}
			if existing := serverAsString(mapMaybe(serverDoc["countdowns"])[field]); existing != "" {
				return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
					Message:       body.CountdownType + " countdown already enabled",
					CountdownType: body.CountdownType,
					ChannelID:     existing,
					ChannelName:   channelName,
				})
			}
		}

		channel, err := rt.Discord.CreateCountdownChannel(c.UserContext(), int64(serverID), channelName)
		if err != nil {
			return fmt.Errorf("create Discord countdown channel: %w", err)
		}
		channelID := channel.ID()
		channelIDString := channelID.String()
		cleanupChannel := func() {
			_ = rt.Discord.DeleteChannel(c.UserContext(), int64(channelID))
		}

		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE server_clans
				SET countdowns = jsonb_set(countdowns, ARRAY[$3], to_jsonb($4::text), true),
					data = data || $5::jsonb,
					updated_at = now()
				WHERE server_id = $1 AND tag = $2
			`, strconv.Itoa(serverID), clanTag, field, channelIDString, apptypes.Marshal(map[string]any{field: channelIDString}))
			if err != nil {
				cleanupChannel()
				return err
			}
			if result.RowsAffected() == 0 {
				cleanupChannel()
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.SQL.Exec(c.UserContext(), `
				UPDATE servers
				SET countdowns = jsonb_set(countdowns, ARRAY[$2], to_jsonb($3::text), true),
					data = data || $4::jsonb,
					updated_at = now()
				WHERE id = $1
			`, strconv.Itoa(serverID), field, channelIDString, apptypes.Marshal(map[string]any{field: channelIDString}))
			if err != nil {
				cleanupChannel()
				return err
			}
			if result.RowsAffected() == 0 {
				cleanupChannel()
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
			Message:       body.CountdownType + " countdown enabled successfully",
			CountdownType: body.CountdownType,
			ChannelID:     channelIDString,
			ChannelName:   channelName,
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
// @Success 200 {object} modelsv2.DisableCountdownResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
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
		var channelIDString string
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			clanDoc, err := sqlServerClanDoc(c, rt, serverID, tag)
			if err != nil {
				return notFoundErr(err, "Clan not found on this server")
			}
			channelIDString = serverAsString(mapMaybe(clanDoc["countdowns"])[field])
			if err := deleteCountdownChannel(c, rt, channelIDString); err != nil {
				return err
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
			serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
			if err != nil {
				return notFoundErr(err, "Server not found")
			}
			channelIDString = serverAsString(mapMaybe(serverDoc["countdowns"])[field])
			if err := deleteCountdownChannel(c, rt, channelIDString); err != nil {
				return err
			}
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

func countdownChannelName(countdownType, clanName string) string {
	if slices.Contains(clanCountdownTypes, countdownType) {
		if clanName == "" {
			clanName = "Clan"
		}
		return clanName + ": Loading..."
	}
	names := map[string]string{
		"cwl":          "CWL Loading...",
		"clan_games":   "CG Loading...",
		"raid_weekend": "Raids Loading...",
		"eos":          "EOS Loading...",
		"member_count": "0 Clan Members",
		"season_day":   "Day 0",
	}
	return names[countdownType]
}

func deleteCountdownChannel(c *fiber.Ctx, rt apptypes.Deps, channelIDString string) error {
	if channelIDString == "" {
		return nil
	}
	if rt.Discord == nil {
		return apptypes.Error(http.StatusServiceUnavailable, "Discord client is unavailable")
	}
	channelID, err := strconv.ParseInt(channelIDString, 10, 64)
	if err != nil {
		return apptypes.Error(http.StatusConflict, "Stored countdown channel ID is invalid")
	}
	if err := rt.Discord.DeleteChannel(c.UserContext(), channelID); err != nil && !isMissingCountdownChannel(err) {
		return fmt.Errorf("delete Discord countdown channel: %w", err)
	}
	return nil
}

func isMissingCountdownChannel(err error) bool {
	if disgorest.IsJSONErrorCode(err, disgorest.JSONErrorCodeUnknownChannel) {
		return true
	}
	var discordErr *disgorest.Error
	return errors.As(err, &discordErr) &&
		discordErr.Response != nil &&
		discordErr.Response.StatusCode == http.StatusNotFound
}
