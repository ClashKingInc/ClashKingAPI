package v2

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/errgroup"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// getUserGuilds returns the authenticated user's guilds where they have Manage Guild permission.
//
// @Summary Get user guilds with bot status
// @Description Returns the authenticated user's guilds and whether the bot is present. Only guilds where the user has MANAGE_GUILD permission or is owner are returned.
// @Tags Guilds
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {array} modelsv2.GuildInfo
// @Failure 401 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
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

		// Filter: only guilds where user has MANAGE_GUILD or is owner
		var adminGuilds []discord.OAuth2Guild
		for _, g := range allGuilds {
			if hasManageGuild(g) {
				adminGuilds = append(adminGuilds, g)
			}
		}

		hasBotFlags, err := resolveBotPresence(c.UserContext(), a.Discord, adminGuilds)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to verify bot guild access with Discord: "+err.Error())
		}

		result := make([]modelsv2.GuildInfo, 0, len(adminGuilds))
		for i, g := range adminGuilds {
			hasBot := hasBotFlags[i]
			result = append(result, buildGuildInfo(g, hasBot))
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
// @Tags Guild
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 200 {object} modelsv2.GuildDetails
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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

		// Parse userID as int64 for member check
		userIDInt, err := strconv.ParseInt(userID, 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid user ID format")
		}

		// Fetch guild using bot token
		guild, err := a.Discord.GetGuild(c.UserContext(), serverID)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Guild not found or bot does not have access")
		}

		// Verify user is a member
		if !a.Discord.IsMember(c.UserContext(), serverID, userIDInt) {
			return apptypes.Error(fiber.StatusForbidden, "You are not a member of this guild")
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
	var doc struct {
		AccessToken  string    `bson:"discord_access_token"`
		RefreshToken string    `bson:"discord_refresh_token"`
		ExpiresAt    time.Time `bson:"expires_at"`
	}

	deviceID := apptypes.DeviceID(c.UserContext())
	query := discordTokenQuery(userID, deviceID)

	if err := a.Store.C.DiscordTokens.FindOne(c.UserContext(), query).Decode(&doc); err != nil {
		if deviceID == "" {
			return "", apptypes.Error(http.StatusUnauthorized, "Missing Discord token - please link your Discord account")
		}
		query = discordTokenQuery(userID, "")
		if fallbackErr := a.Store.C.DiscordTokens.FindOne(c.UserContext(), query).Decode(&doc); fallbackErr != nil {
			return "", apptypes.Error(http.StatusUnauthorized, "Missing Discord token - please link your Discord account")
		}
	}

	if doc.AccessToken == "" || doc.RefreshToken == "" {
		return "", apptypes.Error(http.StatusUnauthorized, "Invalid stored Discord tokens")
	}

	accessToken, err := apptypes.DecryptString(doc.AccessToken)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Failed to decrypt Discord access token")
	}

	if time.Now().UTC().Before(doc.ExpiresAt.Add(-60 * time.Second)) {
		return accessToken, nil
	}

	refreshToken, err := apptypes.DecryptString(doc.RefreshToken)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Failed to decrypt Discord refresh token")
	}

	newAuth, err := a.Discord.RefreshToken(c.UserContext(), refreshToken)
	if err != nil {
		return "", apptypes.Error(http.StatusUnauthorized, "Discord token expired - please re-authenticate with Discord")
	}

	newEncryptedAccess := apptypes.EncryptToString(newAuth.AccessToken)
	_, _ = a.Store.C.DiscordTokens.UpdateOne(c.UserContext(),
		query,
		bson.M{"$set": bson.M{
			"discord_access_token": newEncryptedAccess,
			"expires_at":           time.Now().UTC().Add(newAuth.ExpiresIn),
		}},
	)

	return newAuth.AccessToken, nil
}

func discordTokenQuery(userID, deviceID string) bson.M {
	userClauses := []bson.M{{"user_id": userID}}
	if parsed, err := strconv.ParseInt(userID, 10, 64); err == nil {
		userClauses = append(userClauses, bson.M{"user_id": parsed})
	}

	if deviceID == "" {
		return bson.M{"$or": userClauses}
	}

	deviceClauses := make([]bson.M, 0, len(userClauses))
	for _, clause := range userClauses {
		deviceClauses = append(deviceClauses, bson.M{
			"$and": []bson.M{
				clause,
				{"device_id": deviceID},
			},
		})
	}
	return bson.M{"$or": deviceClauses}
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
