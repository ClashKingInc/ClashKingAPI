package routes

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// getBotGuildProfile returns the bot's per-server profile.
// @Summary Get bot server profile
// @Description Returns the bot name, avatar, banner, and bio configured for this Discord server.
// @Tags Bot Profile
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} modelsv2.BotGuildProfile
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bot-profile [get]
func getBotGuildProfile(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := parseServerID(c)
		if err != nil {
			return err
		}
		profile, err := a.Discord.GetBotGuildProfile(c.UserContext(), serverID)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, err.Error())
		}
		return apptypes.JSON(c, http.StatusOK, botProfileResponse(serverID, profile))
	}
}

// patchBotGuildProfile updates the bot's per-server profile.
// @Summary Update bot server profile
// @Description Updates the bot name, avatar, banner, and bio for this Discord server. Images must be data URIs.
// @Tags Bot Profile
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param body body modelsv2.BotGuildProfileUpdate true "Profile fields"
// @Success 200 {object} modelsv2.BotGuildProfile
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bot-profile [patch]
func patchBotGuildProfile(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := parseServerID(c)
		if err != nil {
			return err
		}
		var body modelsv2.BotGuildProfileUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		payload := map[string]any{}
		if body.ClearName {
			payload["nick"] = nil
		} else {
			if err := addProfileName(payload, body.Name); err != nil {
				return err
			}
		}
		if body.ClearBio {
			payload["bio"] = nil
		} else if body.Bio != nil {
			if len(*body.Bio) > 190 {
				return apptypes.Error(fiber.StatusBadRequest, "Bio must be 190 characters or fewer")
			}
			payload["bio"] = *body.Bio
		}
		if err := addProfileImage(payload, "avatar", body.Avatar, body.ClearAvatar); err != nil {
			return err
		}
		if err := addProfileImage(payload, "banner", body.Banner, body.ClearBanner); err != nil {
			return err
		}
		if len(payload) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "At least one profile field is required")
		}
		profile, err := a.Discord.UpdateBotGuildProfile(c.UserContext(), serverID, payload)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, err.Error())
		}
		return apptypes.JSON(c, http.StatusOK, botProfileResponse(serverID, profile))
	}
}

func addProfileName(payload map[string]any, value *string) error {
	if value == nil {
		return nil
	}
	name := strings.TrimSpace(*value)
	if utf8.RuneCountInString(name) > 32 {
		return apptypes.Error(fiber.StatusBadRequest, "Name must be 32 characters or fewer")
	}
	if name == "" {
		payload["nick"] = nil
	} else {
		payload["nick"] = name
	}
	return nil
}

func addProfileImage(payload map[string]any, field string, value *string, clear bool) error {
	if clear {
		payload[field] = nil
		return nil
	}
	if value == nil {
		return nil
	}
	parts := strings.SplitN(*value, ",", 2)
	if len(parts) != 2 || !strings.HasPrefix(parts[0], "data:image/") || !strings.Contains(parts[0], ";base64") {
		return apptypes.Error(fiber.StatusBadRequest, field+" must be a base64 image data URI")
	}
	decoded, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil || len(decoded) == 0 || len(decoded) > 10*1024*1024 {
		return apptypes.Error(fiber.StatusBadRequest, field+" must be a valid image no larger than 10 MB")
	}
	payload[field] = *value
	return nil
}

func botProfileResponse(serverID int64, profile *apptypes.DiscordBotGuildProfile) modelsv2.BotGuildProfile {
	var avatarURL, bannerURL *string
	if profile.Avatar != nil && profile.UserID != "" {
		value := fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.png?size=512", profile.UserID, *profile.Avatar)
		if profile.AvatarGuildProfile {
			value = fmt.Sprintf("https://cdn.discordapp.com/guilds/%d/users/%s/avatars/%s.png?size=512", serverID, profile.UserID, *profile.Avatar)
		}
		avatarURL = &value
	}
	if profile.Banner != nil && profile.UserID != "" {
		value := fmt.Sprintf("https://cdn.discordapp.com/banners/%s/%s.png?size=1024", profile.UserID, *profile.Banner)
		if profile.BannerGuildProfile {
			value = fmt.Sprintf("https://cdn.discordapp.com/guilds/%d/users/%s/banners/%s.png?size=1024", serverID, profile.UserID, *profile.Banner)
		}
		bannerURL = &value
	}
	return modelsv2.BotGuildProfile{
		Name: profile.Name, AvatarURL: avatarURL, BannerURL: bannerURL, Bio: profile.Bio,
		NameInherited: !profile.NameGuildProfile, AvatarInherited: !profile.AvatarGuildProfile,
		BannerInherited: !profile.BannerGuildProfile, BioInherited: !profile.BioGuildProfile,
	}
}
