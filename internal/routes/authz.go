package routes

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"sync"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

const (
	authPrincipalLocalKey = "ck_auth_principal"
	authPrincipalBot      = "bot"
	serverAccessCacheTTL  = 15 * time.Minute
)

type serverAccessCacheEntry struct {
	allowed   bool
	expiresAt time.Time
}

var serverAccessCache = struct {
	sync.Mutex
	values map[string]serverAccessCacheEntry
}{values: map[string]serverAccessCacheEntry{}}

func authUserOrBot(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if hasAPIBotToken(c, a) {
			c.Locals(authPrincipalLocalKey, authPrincipalBot)
			return next(c)
		}
		return wrap(next)(c)
	}
}

func authServerRead(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDiscordServerAccess(a, false, next))
}

func authServerWrite(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDiscordServerAccess(a, true, next))
}

func requireDiscordServerAccess(a apptypes.Deps, live bool, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if isBotPrincipal(c) {
			return next(c)
		}

		serverID := strings.TrimSpace(c.Params("server_id"))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
		}

		userID := apptypes.UserID(c.UserContext())
		if userID == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}

		if a.Config.Local && userID == a.Config.DevUserID {
			return next(c)
		}

		if !live {
			if allowed, ok := cachedServerAccess(userID, serverID); ok {
				if allowed {
					return next(c)
				}
				return apptypes.Error(fiber.StatusForbidden, "You do not manage this Discord server")
			}
		}

		allowed, err := checkDiscordServerAccess(c, a, userID, serverID)
		if err != nil {
			return err
		}
		setCachedServerAccess(userID, serverID, allowed)
		if !allowed {
			return apptypes.Error(fiber.StatusForbidden, "You do not manage this Discord server")
		}
		return next(c)
	}
}

func checkDiscordServerAccess(c *fiber.Ctx, a apptypes.Deps, userID, serverID string) (bool, error) {
	accessToken, err := getDiscordAccessTokenForDevice(c, a, userID)
	if err != nil {
		return false, err
	}

	guilds, err := a.Discord.GetUserGuilds(c.UserContext(), accessToken)
	if err != nil {
		return false, apptypes.Error(http.StatusInternalServerError, "Failed to fetch guilds from Discord: "+err.Error())
	}

	for _, guild := range guilds {
		if guild.ID.String() == serverID && hasManageGuild(guild) {
			return true, nil
		}
	}
	return false, nil
}

func cachedServerAccess(userID, serverID string) (bool, bool) {
	key := serverAccessCacheKey(userID, serverID)
	now := time.Now().UTC()

	serverAccessCache.Lock()
	defer serverAccessCache.Unlock()

	entry, ok := serverAccessCache.values[key]
	if !ok {
		return false, false
	}
	if now.After(entry.expiresAt) {
		delete(serverAccessCache.values, key)
		return false, false
	}
	return entry.allowed, true
}

func setCachedServerAccess(userID, serverID string, allowed bool) {
	key := serverAccessCacheKey(userID, serverID)

	serverAccessCache.Lock()
	defer serverAccessCache.Unlock()

	serverAccessCache.values[key] = serverAccessCacheEntry{
		allowed:   allowed,
		expiresAt: time.Now().UTC().Add(serverAccessCacheTTL),
	}
}

func serverAccessCacheKey(userID, serverID string) string {
	return userID + ":" + serverID
}

func isBotPrincipal(c *fiber.Ctx) bool {
	value, _ := c.Locals(authPrincipalLocalKey).(string)
	return value == authPrincipalBot
}

func hasAPIBotToken(c *fiber.Ctx, a apptypes.Deps) bool {
	expected := strings.TrimSpace(a.Config.APIBotToken)
	if expected == "" {
		return false
	}
	actual := authzBearerToken(c.Get("Authorization"))
	if actual == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) == 1
}

func authzBearerToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parts := strings.Split(raw, " ")
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return raw
}
