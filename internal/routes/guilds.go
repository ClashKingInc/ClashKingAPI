package routes

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/errgroup"
)

// getUserGuilds returns the authenticated user's guilds where they have Manage Guild permission.
//
// @Summary Get user guilds with bot status
// @Description Returns the authenticated user's guilds and whether the bot is present. Only guilds where the user has MANAGE_GUILD permission or is owner are returned.
// @Tags Other
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {array} modelsv2.GuildInfo
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/guilds [get]
func getUserGuilds(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		if userID == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}

		accessToken, err := getDiscordAccessTokenForDevice(c, a, userID)
		if err != nil {
			return err
		}

		allGuilds, err := a.Discord.GetUserGuilds(c.UserContext(), accessToken)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to fetch guilds from Discord: "+err.Error())
		}

		guildIDs := make([]string, 0, len(allGuilds))
		for _, guild := range allGuilds {
			guildIDs = append(guildIDs, guild.ID.String())
		}
		delegated, err := delegatedDashboardGuilds(c, a, userID, guildIDs)
		if err != nil {
			return err
		}

		var accessibleGuilds []discord.OAuth2Guild
		for _, g := range allGuilds {
			serverID := g.ID.String()
			manager := hasManageGuild(g)
			sections := delegated[serverID]
			if manager || len(sections) > 0 {
				accessibleGuilds = append(accessibleGuilds, g)
				setCachedServerAccess(userID, serverID, serverAccessCacheEntry{manager: manager, sections: sections})
			}
		}

		hasBotFlags, err := resolveBotPresence(c.UserContext(), a.Discord, accessibleGuilds)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to verify bot guild access with Discord: "+err.Error())
		}

		result := make([]modelsv2.GuildInfo, 0, len(accessibleGuilds))
		for i, g := range accessibleGuilds {
			hasBot := hasBotFlags[i]
			info := buildGuildInfo(g, hasBot)
			info.Delegated = !hasManageGuild(g)
			result = append(result, info)
		}

		return apptypes.JSON(c, http.StatusOK, result)
	}
}

func resolveBotPresence(ctx context.Context, discordAdapter *apptypes.DiscordAdapter, guilds []discord.OAuth2Guild) ([]bool, error) {
	flags := make([]bool, len(guilds))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(8)

	for i, guild := range guilds {
		i := i
		guild := guild
		group.Go(func() error {
			hasBot, err := discordAdapter.IsInGuild(groupCtx, int64(guild.ID))
			if err != nil {
				return err
			}
			flags[i] = hasBot
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return nil, err
	}
	return flags, nil
}

// getGuildDetails returns metadata for a single guild.
//
// @Summary Get guild details by ID
// @Description Returns guild metadata for the requested server. The authenticated user must be a member of the guild.
// @Tags Other
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 200 {object} modelsv2.GuildDetails
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/guild/{server_id} [get]
func getGuildDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		if userID == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}

		serverID, err := parseServerID(c)
		if err != nil {
			return err
		}

		// Fetch guild using bot token
		guild, err := a.Discord.GetGuild(c.UserContext(), serverID)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Guild not found or bot does not have access")
		}

		ownerID := guild.OwnerID.String()
		mc := guild.ApproximateMemberCount
		result := modelsv2.GuildDetails{
			ID:          guild.ID.String(),
			Name:        guild.Name,
			Icon:        guild.IconURL(),
			OwnerID:     &ownerID,
			Features:    featureStrings(guild.Features),
			MemberCount: &mc,
			Description: guild.Description,
			Banner:      guild.BannerURL(),
			PremiumTier: int(guild.PremiumTier),
			BoostCount:  guild.PremiumSubscriptionCount,
		}

		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// --- helpers ---

// getDiscordAccessTokenForDevice mirrors the Python migration more closely by
// looking up the Discord OAuth token with the current device ID when available,
// then falling back to the user-wide token for older records.
func getDiscordAccessTokenForDevice(c *fiber.Ctx, a apptypes.Deps, userID string) (string, error) {
	if a.Store.SQL == nil {
		return "", apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}

	deviceID := apptypes.DeviceID(c.UserContext())
	tokenDeviceID := deviceID
	accessCipher, refreshCipher, expiresAt, err := sqlDiscordToken(c, a, userID, tokenDeviceID)
	if err != nil {
		if tokenDeviceID == "" {
			return "", apptypes.Error(http.StatusUnauthorized, "Missing Discord token - please link your Discord account")
		}
		tokenDeviceID = ""
		accessCipher, refreshCipher, expiresAt, err = sqlDiscordToken(c, a, userID, tokenDeviceID)
		if err != nil {
			return "", apptypes.Error(http.StatusUnauthorized, "Missing Discord token - please link your Discord account")
		}
	}

	if accessCipher == "" || refreshCipher == "" {
		return "", apptypes.Error(http.StatusUnauthorized, "Invalid stored Discord tokens")
	}

	accessToken, err := apptypes.DecryptString(accessCipher)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Failed to decrypt Discord access token")
	}

	if expiresAt != nil && time.Now().UTC().Before(expiresAt.Add(-60*time.Second)) {
		return accessToken, nil
	}

	refreshToken, err := apptypes.DecryptString(refreshCipher)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Failed to decrypt Discord refresh token")
	}

	newAuth, err := a.Discord.RefreshToken(c.UserContext(), refreshToken)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Discord token expired - please re-authenticate with Discord")
	}

	newEncryptedAccess := apptypes.EncryptToString(newAuth.AccessToken)
	newEncryptedRefresh := refreshCipher
	if strings.TrimSpace(newAuth.RefreshToken) != "" {
		newEncryptedRefresh = apptypes.EncryptToString(newAuth.RefreshToken)
	}
	_, _ = a.Store.SQL.Exec(c.UserContext(), `
		UPDATE auth_discord_tokens
		SET access_token_ciphertext = $1,
			refresh_token_ciphertext = $2,
			expires_at = $3,
			data = jsonb_set(
				jsonb_set(data, '{discord_access_token}', to_jsonb($1::text), true),
				'{discord_refresh_token}', to_jsonb($2::text), true
			),
			updated_at = now()
		WHERE user_id = $4 AND device_id = $5
	`, newEncryptedAccess, newEncryptedRefresh, time.Now().UTC().Add(newAuth.ExpiresIn), userID, tokenDeviceID)

	return newAuth.AccessToken, nil
}

func sqlDiscordToken(c *fiber.Ctx, a apptypes.Deps, userID, deviceID string) (string, string, *time.Time, error) {
	var accessCipher string
	var refreshCipher *string
	var expiresAt *time.Time
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT access_token_ciphertext, refresh_token_ciphertext, expires_at
		FROM auth_discord_tokens
		WHERE user_id = $1 AND device_id = $2
	`, userID, deviceID).Scan(&accessCipher, &refreshCipher, &expiresAt)
	if refreshCipher == nil {
		return accessCipher, "", expiresAt, err
	}
	return accessCipher, *refreshCipher, expiresAt, err
}

func guildRole(g discord.OAuth2Guild) string {
	if g.Owner {
		return "Owner"
	}
	if g.Permissions.Has(discord.PermissionAdministrator) {
		return "Administrator"
	}
	if g.Permissions.Has(discord.PermissionManageGuild) {
		return "Manager"
	}
	return "Member"
}

func hasManageGuild(g discord.OAuth2Guild) bool {
	return g.Owner || g.Permissions.Has(discord.PermissionManageGuild)
}

func guildIconURL(g discord.OAuth2Guild) *string {
	if g.Icon == nil {
		s := "https://cdn.discordapp.com/embed/avatars/0.png"
		return &s
	}
	url := fmt.Sprintf("https://cdn.discordapp.com/icons/%s/%s.png", g.ID.String(), *g.Icon)
	return &url
}

func featureStrings(features []discord.GuildFeature) []string {
	out := make([]string, len(features))
	for i, f := range features {
		out[i] = string(f)
	}
	return out
}

func intPtr(v int) *int { return &v }

func parseServerID(c *fiber.Ctx) (int64, error) {
	raw := c.Params("server_id")
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
	}
	return v, nil
}

func buildGuildInfo(g discord.OAuth2Guild, hasBot bool) modelsv2.GuildInfo {
	mc := g.ApproximateMemberCount
	return modelsv2.GuildInfo{
		ID:          g.ID.String(),
		Name:        g.Name,
		Icon:        guildIconURL(g),
		Owner:       g.Owner,
		Permissions: strconv.FormatInt(int64(g.Permissions), 10),
		Role:        guildRole(g),
		Features:    featureStrings(g.Features),
		HasBot:      hasBot,
		MemberCount: intPtr(mc),
	}
}
