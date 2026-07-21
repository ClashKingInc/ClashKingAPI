package server

import (
	"net/http"
	"sort"
	"strconv"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
)

// getServerChannels godoc
// @Summary Get Discord channels
// @Description Returns category, text, and news channels for the Discord server, sorted by category.
// @Tags Server Discord
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {array} modelsv2.DiscordChannel
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/channels [get]
func getServerChannels(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		channels, err := a.Discord.GetGuildChannels(c.UserContext(), int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord channels")
		}

		parentNames := make(map[string]string, len(channels))
		for _, channel := range channels {
			parentNames[channel.ID().String()] = channel.Name()
		}

		items := make([]map[string]any, 0, len(channels))
		for _, channel := range channels {
			item := map[string]any{
				"id":   channel.ID().String(),
				"name": channel.Name(),
			}
			switch channel.Type() {
			case discord.ChannelTypeGuildCategory:
				item["type"] = "category"
			case discord.ChannelTypeGuildNews:
				item["type"] = "news"
			case discord.ChannelTypeGuildText:
				item["type"] = "text"
			default:
				continue
			}
			if parentID := channel.ParentID(); parentID != nil {
				item["parent_id"] = parentID.String()
				item["parent_name"] = parentNames[parentID.String()]
			}
			items = append(items, item)
		}

		sort.SliceStable(items, func(i, j int) bool {
			leftParent, _ := items[i]["parent_name"].(string)
			rightParent, _ := items[j]["parent_name"].(string)
			if leftParent != rightParent {
				return leftParent < rightParent
			}
			leftName, _ := items[i]["name"].(string)
			rightName, _ := items[j]["name"].(string)
			return leftName < rightName
		})

		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// getServerThreads godoc
// @Summary Get Discord threads
// @Description Returns all active threads for the Discord server.
// @Tags Server Discord
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {array} modelsv2.DiscordThread
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/threads [get]
func getServerThreads(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		channels, err := a.Discord.GetGuildChannels(c.UserContext(), int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord channels")
		}
		parentNames := make(map[string]string, len(channels))
		for _, channel := range channels {
			parentNames[channel.ID().String()] = channel.Name()
		}

		activeThreads, err := a.Discord.GetActiveGuildThreads(c.UserContext(), int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord threads")
		}

		items := make([]map[string]any, 0, len(activeThreads.Threads))
		for _, thread := range activeThreads.Threads {
			parentID := ""
			parentName := ""
			if thread.ParentID() != nil {
				parentID = thread.ParentID().String()
				parentName = parentNames[parentID]
			}
			items = append(items, map[string]any{
				"id":                  thread.ID().String(),
				"name":                thread.Name(),
				"parent_channel_id":   parentID,
				"parent_channel_name": parentName,
				"archived":            thread.ThreadMetadata.Archived,
			})
		}

		sort.SliceStable(items, func(i, j int) bool {
			leftParent, _ := items[i]["parent_channel_name"].(string)
			rightParent, _ := items[j]["parent_channel_name"].(string)
			if leftParent != rightParent {
				return leftParent < rightParent
			}
			leftName, _ := items[i]["name"].(string)
			rightName, _ := items[j]["name"].(string)
			return leftName < rightName
		})

		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// getDiscordRoles godoc
// @Summary Get Discord roles
// @Description Returns assignable roles for the Discord server sorted by position. Excludes @everyone and Discord-managed roles, including bot roles.
// @Tags Server Discord
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.DiscordRolesResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/discord-roles [get]
func getDiscordRoles(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		roles, err := a.Discord.GetRoles(c.UserContext(), int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord roles")
		}
		roles = selectableDiscordRoles(roles, serverID)

		sort.SliceStable(roles, func(i, j int) bool {
			return roles[i].Position > roles[j].Position
		})

		items := make([]map[string]any, 0, len(roles))
		for _, role := range roles {
			items = append(items, map[string]any{
				"id":          role.ID.String(),
				"name":        role.Name,
				"color":       role.Color,
				"position":    role.Position,
				"managed":     role.Managed,
				"mentionable": role.Mentionable,
			})
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id": serverID,
			"roles":     items,
			"count":     len(items),
		})
	}
}

func selectableDiscordRoles(roles []discord.Role, serverID int) []discord.Role {
	available := make([]discord.Role, 0, len(roles))
	for _, role := range roles {
		if role.Managed || role.ID.String() == strconv.Itoa(serverID) {
			continue
		}
		available = append(available, role)
	}
	return available
}

// getServerDiscordChannels godoc
// @Summary Get Discord channels
// @Description Returns category, text, and news channels for the Discord server, sorted by category.
// @Tags Server Discord
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {array} modelsv2.DiscordChannel
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/discord-channels [get]
func getServerDiscordChannels(a apptypes.Deps) apptypes.HandlerFunc {
	return getServerChannels(a)
}

// testDiscordAPIStatus godoc
// @Summary Test Discord API access
// @Description Tests whether the bot has access to the Discord server via the API.
// @Tags Server Discord
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.DiscordStatusResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/discord-test [get]
func testDiscordAPIStatus(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		if a.Config.BotToken == "" {
			return apptypes.JSON(c, http.StatusOK, map[string]any{
				"status":            "error",
				"message":           "Bot token not configured",
				"bot_token_present": false,
			})
		}

		guild, err := a.Discord.GetGuild(c.UserContext(), int64(serverID))
		if err != nil {
			return apptypes.JSON(c, http.StatusOK, map[string]any{
				"status":            "error",
				"message":           "Discord API error: " + err.Error(),
				"bot_token_present": true,
			})
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"status":            "success",
			"message":           "Discord API access working",
			"bot_token_present": true,
			"guild_name":        guild.Name,
			"status_code":       strconv.Itoa(http.StatusOK),
		})
	}
}
