package routes

import (
	"crypto/subtle"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
)

const (
	authPrincipalLocalKey = "ck_auth_principal"
	authPrincipalBot      = "bot"
	serverAccessCacheTTL  = 60 * time.Second
)

var dashboardSections = []string{"settings", "family_settings", "logs", "clans", "rosters", "links", "moderation", "roles", "reminders", "autoboards", "giveaways", "panels", "tickets", "embeds", "wars", "leaderboards"}

type serverAccessCacheEntry struct {
	manager   bool
	sections  map[string]string
	expiresAt time.Time
}

var serverAccessCache = struct {
	sync.Mutex
	values map[string]serverAccessCacheEntry
}{values: map[string]serverAccessCacheEntry{}}

var serverAccessRequests singleflight.Group

func authUserOrBot(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if hasAPIBotToken(c, a) {
			c.Locals(authPrincipalLocalKey, authPrincipalBot)
			return next(c)
		}
		return wrap(next)(c)
	}
}

func authBot(a apptypes.Deps, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !hasAPIBotToken(c, a) {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}
		c.Locals(authPrincipalLocalKey, authPrincipalBot)
		return next(c)
	}
}

func authServerRead(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDashboardAccess(a, false, false, next))
}

func authServerWrite(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDashboardAccess(a, true, false, next))
}

func authServerManager(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, live bool, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDashboardAccess(a, live, true, next))
}

func authServerQueryRead(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDiscordServerQueryAccess(a, false, next))
}

func authServerQueryWrite(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDiscordServerQueryAccess(a, true, next))
}

func authServerParamRead(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, param string, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, requireDiscordServerParamAccess(a, false, param, next))
}

func requireDiscordServerAccess(a apptypes.Deps, live bool, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params("server_id"))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
		}
		if err := authorizeDiscordServerAccess(c, a, serverID, live); err != nil {
			return err
		}
		return next(c)
	}
}

func requireDiscordServerQueryAccess(a apptypes.Deps, live bool, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Query("server_id"))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "server_id is required")
		}
		if err := authorizeDashboardAccess(c, a, serverID, "rosters", c.Method() != fiber.MethodGet, live, false); err != nil {
			return err
		}
		return next(c)
	}
}

func requireDiscordServerParamAccess(a apptypes.Deps, live bool, param string, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params(param))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid "+param)
		}
		if err := authorizeDashboardAccess(c, a, serverID, "moderation", c.Method() != fiber.MethodGet, live, false); err != nil {
			return err
		}
		return next(c)
	}
}

func authorizeDiscordServerAccess(c *fiber.Ctx, a apptypes.Deps, serverID string, live bool) error {
	return authorizeDashboardAccess(c, a, serverID, "", false, live, true)
}

func requireDashboardAccess(a apptypes.Deps, live, managerOnly bool, next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params("server_id"))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
		}
		section, shared := dashboardSectionForPath(c.Path())
		if err := authorizeDashboardAccess(c, a, serverID, section, c.Method() != fiber.MethodGet, live, managerOnly || shared && section == ""); err != nil {
			return err
		}
		return next(c)
	}
}

func authorizeDashboardAccess(c *fiber.Ctx, a apptypes.Deps, serverID, section string, manage, live, managerOnly bool) error {
	if isBotPrincipal(c) {
		return nil
	}

	userID := apptypes.UserID(c.UserContext())
	if userID == "" {
		return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
	}

	if a.Config.Local && userID == a.Config.DevUserID {
		return nil
	}

	if !live {
		if entry, ok := cachedServerAccess(userID, serverID); ok {
			if dashboardEntryAllows(entry, section, manage, managerOnly) {
				return nil
			}
			return apptypes.Error(fiber.StatusForbidden, "You do not have access to this dashboard section")
		}
	}

	var entry serverAccessCacheEntry
	var err error
	if live {
		entry, err = resolveDashboardAccess(c, a, userID, serverID)
	} else {
		entry, err = resolveDashboardAccessOnce(c, a, userID, serverID)
	}
	if err != nil {
		return err
	}
	setCachedServerAccess(userID, serverID, entry)
	if !dashboardEntryAllows(entry, section, manage, managerOnly) {
		return apptypes.Error(fiber.StatusForbidden, "You do not have access to this dashboard section")
	}
	return nil
}

func resolveDashboardAccessOnce(c *fiber.Ctx, a apptypes.Deps, userID, serverID string) (serverAccessCacheEntry, error) {
	key := serverAccessCacheKey(userID, serverID)
	value, err, _ := serverAccessRequests.Do(key, func() (any, error) {
		if entry, ok := cachedServerAccess(userID, serverID); ok {
			return entry, nil
		}
		entry, err := resolveDashboardAccess(c, a, userID, serverID)
		if err == nil {
			setCachedServerAccess(userID, serverID, entry)
		}
		return entry, err
	})
	if err != nil {
		return serverAccessCacheEntry{}, err
	}
	return value.(serverAccessCacheEntry), nil
}

func dashboardEntryAllows(entry serverAccessCacheEntry, section string, manage, managerOnly bool) bool {
	if entry.manager {
		return true
	}
	if managerOnly {
		return false
	}
	if section == "" {
		return len(entry.sections) > 0
	}
	level := entry.sections[section]
	return level == "manage" || !manage && level == "view"
}

func resolveDashboardAccess(c *fiber.Ctx, a apptypes.Deps, userID, serverID string) (serverAccessCacheEntry, error) {
	manager, err := checkDiscordServerAccess(c, a, userID, serverID)
	if err != nil {
		return serverAccessCacheEntry{}, err
	}
	entry := serverAccessCacheEntry{manager: manager, sections: map[string]string{}}
	if manager || a.Store.SQL == nil {
		return entry, nil
	}

	var discordUserID string
	if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT COALESCE(discord_user_id, '') FROM auth_users WHERE user_id = $1`, userID).Scan(&discordUserID); err != nil || discordUserID == "" {
		return entry, nil
	}
	guildID, guildErr := strconv.ParseInt(serverID, 10, 64)
	discordID, userErr := strconv.ParseInt(discordUserID, 10, 64)
	if guildErr != nil || userErr != nil {
		return entry, nil
	}
	member := a.Discord.GetMemberDirect(c.UserContext(), guildID, discordID)
	if member == nil || len(member.RoleIDs) == 0 {
		return entry, nil
	}
	roleIDs := make([]string, 0, len(member.RoleIDs))
	for _, roleID := range member.RoleIDs {
		roleIDs = append(roleIDs, roleID.String())
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT section, CASE WHEN bool_or(access_level = 'manage') THEN 'manage' ELSE 'view' END
		FROM dashboard_role_grants
		WHERE server_id = $1 AND role_id = ANY($2)
		GROUP BY section
	`, serverID, roleIDs)
	if err != nil {
		return entry, err
	}
	defer rows.Close()
	for rows.Next() {
		var section, level string
		if err := rows.Scan(&section, &level); err != nil {
			return entry, err
		}
		entry.sections[section] = level
	}
	return entry, rows.Err()
}

func delegatedDashboardGuilds(c *fiber.Ctx, a apptypes.Deps, userID string, guildIDs []string) (map[string]map[string]string, error) {
	out := make(map[string]map[string]string)
	if a.Store.SQL == nil || len(guildIDs) == 0 {
		return out, nil
	}
	var discordUserID string
	if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT COALESCE(discord_user_id, '') FROM auth_users WHERE user_id = $1`, userID).Scan(&discordUserID); err != nil || discordUserID == "" {
		return out, nil
	}
	parsedUserID, err := strconv.ParseInt(discordUserID, 10, 64)
	if err != nil {
		return out, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT DISTINCT server_id FROM dashboard_role_grants WHERE server_id = ANY($1)`, guildIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var serverID string
		if err := rows.Scan(&serverID); err != nil {
			return nil, err
		}
		parsedServerID, err := strconv.ParseInt(serverID, 10, 64)
		if err != nil {
			continue
		}
		member := a.Discord.GetMemberDirect(c.UserContext(), parsedServerID, parsedUserID)
		if member == nil {
			continue
		}
		roleIDs := make([]string, 0, len(member.RoleIDs))
		for _, roleID := range member.RoleIDs {
			roleIDs = append(roleIDs, roleID.String())
		}
		grantRows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT section, CASE WHEN bool_or(access_level = 'manage') THEN 'manage' ELSE 'view' END
			FROM dashboard_role_grants
			WHERE server_id = $1 AND role_id = ANY($2)
			GROUP BY section
		`, serverID, roleIDs)
		if err != nil {
			return nil, err
		}
		sections := make(map[string]string)
		for grantRows.Next() {
			var section, level string
			if err := grantRows.Scan(&section, &level); err != nil {
				grantRows.Close()
				return nil, err
			}
			sections[section] = level
		}
		if err := grantRows.Err(); err != nil {
			grantRows.Close()
			return nil, err
		}
		grantRows.Close()
		if len(sections) > 0 {
			out[serverID] = sections
		}
	}
	return out, rows.Err()
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

func cachedServerAccess(userID, serverID string) (serverAccessCacheEntry, bool) {
	key := serverAccessCacheKey(userID, serverID)
	now := time.Now().UTC()

	serverAccessCache.Lock()
	defer serverAccessCache.Unlock()

	entry, ok := serverAccessCache.values[key]
	if !ok {
		return serverAccessCacheEntry{}, false
	}
	if now.After(entry.expiresAt) {
		delete(serverAccessCache.values, key)
		return serverAccessCacheEntry{}, false
	}
	return entry, true
}

func setCachedServerAccess(userID, serverID string, entry serverAccessCacheEntry) {
	key := serverAccessCacheKey(userID, serverID)

	serverAccessCache.Lock()
	defer serverAccessCache.Unlock()

	entry.expiresAt = time.Now().UTC().Add(serverAccessCacheTTL)
	serverAccessCache.values[key] = entry
}

func invalidateServerAccess(serverID string) {
	serverAccessCache.Lock()
	defer serverAccessCache.Unlock()
	for key := range serverAccessCache.values {
		if strings.HasSuffix(key, ":"+serverID) {
			delete(serverAccessCache.values, key)
		}
	}
}

func dashboardSectionForPath(path string) (string, bool) {
	switch {
	case strings.Contains(path, "/links/server/"):
		return "links", false
	case strings.Contains(path, "/roster"):
		return "rosters", false
	case strings.Contains(path, "/logs"), strings.Contains(path, "/clan-logs"):
		return "logs", false
	case strings.Contains(path, "/reminders"):
		return "reminders", false
	case strings.Contains(path, "/autoboards"):
		return "autoboards", false
	case strings.Contains(path, "/giveaways"):
		return "giveaways", false
	case strings.Contains(path, "/tickets"):
		return "tickets", false
	case strings.Contains(path, "/embeds"):
		return "embeds", false
	case strings.Contains(path, "/panel"):
		return "panels", false
	case strings.Contains(path, "/leaderboards"):
		return "leaderboards", false
	case strings.Contains(path, "/bans"), strings.Contains(path, "/strikes"):
		return "moderation", false
	case strings.Contains(path, "/role"):
		return "roles", false
	case strings.Contains(path, "/clan"):
		return "clans", false
	case strings.Contains(path, "/channels"), strings.Contains(path, "/threads"):
		return "", false
	default:
		return "settings", false
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
