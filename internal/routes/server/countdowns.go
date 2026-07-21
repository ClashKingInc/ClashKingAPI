package server

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	disgorest "github.com/disgoorg/disgo/rest"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// getServerCountdowns godoc
// @Summary Get server countdowns
// @Description Returns all server countdown types and their channel state.
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
		items, found, err := queryCountdowns(c, rt, serverID, nil, "server")
		if err != nil {
			return err
		}
		if !found {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerCountdownsResponse{
			ServerID:   strconv.Itoa(serverID),
			Countdowns: items,
		})
	}
}

// getClanCountdowns godoc
// @Summary Get clan countdowns
// @Description Returns all clan countdown types and their channel state.
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
		items, found, err := queryCountdowns(c, rt, serverID, &tag, "clan")
		if err != nil {
			return err
		}
		if !found {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCountdownsResponse{
			ServerID:   strconv.Itoa(serverID),
			ClanTag:    tag,
			Countdowns: items,
		})
	}
}

func queryCountdowns(c *fiber.Ctx, rt apptypes.Deps, serverID int, clanTag *string, scope string) ([]modelsv2.CountdownStatus, bool, error) {
	serverIDText := strconv.Itoa(serverID)
	var found bool
	var err error
	if clanTag == nil {
		err = rt.Store.SQL.QueryRow(c.UserContext(), `SELECT EXISTS (SELECT 1 FROM servers WHERE id = $1)`, serverIDText).Scan(&found)
	} else {
		err = rt.Store.SQL.QueryRow(c.UserContext(), `SELECT EXISTS (SELECT 1 FROM server_clans WHERE server_id = $1 AND tag = $2)`, serverIDText, *clanTag).Scan(&found)
	}
	if err != nil || !found {
		return nil, found, err
	}

	channels := map[string]string{}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT type, channel_id
		FROM countdowns
		WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2
	`, serverIDText, clanTag)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var countdownType string
		var channelID string
		if err := rows.Scan(&countdownType, &channelID); err != nil {
			return nil, false, err
		}
		channels[countdownType] = channelID
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	items := make([]modelsv2.CountdownStatus, 0)
	for _, value := range modelsv2.CountdownTypeEnums {
		if value.Scope != scope {
			continue
		}
		channelID, enabled := channels[value.Value]
		var channelIDPointer *string
		if enabled {
			channelIDPointer = &channelID
		}
		items = append(items, modelsv2.CountdownStatus{
			Type:      value.Value,
			Name:      value.Description,
			Enabled:   enabled,
			ChannelID: channelIDPointer,
		})
	}
	return items, true, nil
}

// enableCountdown godoc
// @Summary Enable a countdown
// @Description Creates a Discord channel and stores one countdown rule.
// @Tags Server Countdowns
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.EnableCountdownRequest true "Countdown"
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
		scope := modelsv2.EnumScope(modelsv2.CountdownTypeEnums, body.CountdownType)
		if scope == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}

		serverIDText := strconv.Itoa(serverID)
		var clanTag *string
		clanName := ""
		if scope == "clan" {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s", body.CountdownType))
			}
			if err := rt.Store.SQL.QueryRow(c.UserContext(), `SELECT name FROM server_clans WHERE server_id = $1 AND tag = $2`, serverIDText, tag).Scan(&clanName); err != nil {
				return notFoundErr(err, "Clan not found on this server")
			}
			clanTag = &tag
		} else {
			var found bool
			if err := rt.Store.SQL.QueryRow(c.UserContext(), `SELECT EXISTS (SELECT 1 FROM servers WHERE id = $1)`, serverIDText).Scan(&found); err != nil {
				return err
			}
			if !found {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}

		var existing string
		err = rt.Store.SQL.QueryRow(c.UserContext(), `
			SELECT channel_id FROM countdowns
			WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = $3
		`, serverIDText, clanTag, body.CountdownType).Scan(&existing)
		if err == nil {
			return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
				Message:       body.CountdownType + " already enabled",
				CountdownType: body.CountdownType,
				ChannelID:     existing,
				ChannelName:   countdownChannelName(body.CountdownType, clanName),
			})
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if rt.Discord == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "Discord client is unavailable")
		}

		channelName := countdownChannelName(body.CountdownType, clanName)
		channel, err := rt.Discord.CreateCountdownChannel(c.UserContext(), int64(serverID), channelName)
		if err != nil {
			return fmt.Errorf("create Discord countdown channel: %w", err)
		}
		channelID := channel.ID()
		channelIDString := channelID.String()
		_, err = rt.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO countdowns (server_id, clan_tag, type, channel_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (server_id, clan_tag, type) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = now()
		`, serverIDText, clanTag, body.CountdownType, channelIDString)
		if err != nil {
			_ = rt.Discord.DeleteChannel(c.UserContext(), int64(channelID))
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.EnableCountdownResponse{
			Message:       body.CountdownType + " enabled",
			CountdownType: body.CountdownType,
			ChannelID:     channelIDString,
			ChannelName:   channelName,
		})
	}
}

// disableCountdown godoc
// @Summary Disable a countdown
// @Description Deletes the Discord channel and its countdown rule.
// @Tags Server Countdowns
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.DisableCountdownRequest true "Countdown"
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
		scope := modelsv2.EnumScope(modelsv2.CountdownTypeEnums, body.CountdownType)
		if scope == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}
		var clanTag *string
		if scope == "clan" {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s", body.CountdownType))
			}
			clanTag = &tag
		}
		var channelID string
		err = rt.Store.SQL.QueryRow(c.UserContext(), `
			SELECT channel_id FROM countdowns
			WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = $3
		`, strconv.Itoa(serverID), clanTag, body.CountdownType).Scan(&channelID)
		if err != nil {
			return notFoundErr(err, "Countdown not found")
		}
		if err := deleteCountdownChannel(c, rt, channelID); err != nil {
			return err
		}
		if _, err := rt.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM countdowns
			WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = $3
		`, strconv.Itoa(serverID), clanTag, body.CountdownType); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.DisableCountdownResponse{
			Message:       body.CountdownType + " disabled",
			CountdownType: body.CountdownType,
		})
	}
}

func countdownChannelName(countdownType, clanName string) string {
	if modelsv2.EnumScope(modelsv2.CountdownTypeEnums, countdownType) == "clan" {
		if clanName == "" {
			clanName = "Clan"
		}
		return clanName + ": Loading..."
	}
	names := map[string]string{
		"cwl_timer":          "CWL Loading...",
		"clan_games_timer":   "CG Loading...",
		"raid_weekend_timer": "Raids Loading...",
		"season_end_timer":   "EOS Loading...",
		"season_day_timer":   "Day 0",
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
	return errors.As(err, &discordErr) && discordErr.Response != nil && discordErr.Response.StatusCode == http.StatusNotFound
}
