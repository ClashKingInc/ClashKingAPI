package routes

import (
	"net/http"
	"strconv"
	"strings"

	serverroutes "github.com/ClashKingInc/ClashKingAPI/internal/routes/server"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// serverSettingsLegacy godoc
// @Summary Get legacy server settings
// @Description Returns server settings for a Discord server.
// @Tags Legacy Server
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func serverSettingsLegacy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := strconv.ParseInt(c.Params("server_id"), 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		if err := verifyServerToken(c, a, serverID, false); err != nil {
			return err
		}
		doc, err := v1ServerSettings(c, a, strconv.FormatInt(serverID, 10))
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Server Not Found")
		}
		return apptypes.JSON(c, http.StatusOK, doc)
	}
}

// guildLinks godoc
// @Summary Get guild links
// @Description Returns linked player data for a Discord guild.
// @Produce json
// @Param guild_id path int true "Discord guild ID"
// @Success 200 {object} map[string]interface{}
func guildLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{})
	}
}

// shortener godoc
// @Summary Create short link
// @Description Creates a ClashKing short link for the supplied URL.
// @Produce json
// @Param url query string true "Destination URL"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func shortener(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		url := c.Query("url")
		if strings.TrimSpace(url) == "" {
			return apptypes.Error(http.StatusBadRequest, "url is required")
		}
		linkID := uuid.NewString()
		if _, err := a.Store.SQL.Exec(c.UserContext(), `INSERT INTO short_links (id, url) VALUES ($1, $2)`, linkID, url); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"url": "https://api.clashk.ing/shortlink?id=" + linkID})
	}
}

// shortlink godoc
// @Summary Resolve short link
// @Description Redirects a ClashKing short link to its destination URL.
// @Param id query string false "Short link ID"
// @Param link_id query string false "Short link ID"
// @Success 307
// @Failure 404 {object} modelsv2.ErrorResponse
func shortlink(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		linkID := legacyFirstNonEmpty(c.Query("id"), c.Query("link_id"))
		var url string
		if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT url FROM short_links WHERE id = $1`, linkID).Scan(&url); err != nil {
			return apptypes.Error(http.StatusNotFound, "short link not found")
		}
		return c.Redirect(url, http.StatusTemporaryRedirect)
	}
}

// warStatsLegacy godoc
// @Summary Get legacy war stats
// @Description Returns scoped war hit-rate stats for players.
// @Tags War
// @Produce json
// @Param player_tags query []string false "Player tags"
// @Param clan_tags query []string false "Clan tags"
// @Param server query int false "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func warStatsLegacy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, names, err := scopedPlayerTags(c, a)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT attacker_tag, count(*)::int, sum(stars)::int, sum(destruction_percentage)::float8
			FROM war_attacks
			WHERE attacker_tag = ANY($1)
			GROUP BY attacker_tag
		`, tags)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var tag string
			var attacks, stars int
			var destruction float64
			if err := rows.Scan(&tag, &attacks, &stars, &destruction); err != nil {
				return err
			}
			items = append(items, map[string]any{
				"name": names[tag],
				"tag":  tag,
				"hit_rates": []map[string]any{{
					"type": "All", "value": "All", "total_attacks": attacks,
					"total_stars": stars, "total_destruction": destruction, "three_stars": 0, "hitrate": 0,
				}},
				"defense_rates": []map[string]any{},
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "totals": map[string]any{}, "clan_totals": []any{}, "metadata": map[string]any{}})
	}
}

func scopedPlayerTags(c *fiber.Ctx, a apptypes.Deps) ([]string, map[string]string, error) {
	playerTags := collectQueryValues(c, "players")
	clans := collectQueryValues(c, "clans")
	serverRaw := c.Query("server")
	tagSet := map[string]bool{}
	names := map[string]string{}
	for _, tag := range playerTags {
		tag = fixTag(tag)
		tagSet[tag] = true
	}
	if len(clans) > 0 {
		fixed := make([]string, 0, len(clans))
		for _, clan := range clans {
			fixed = append(fixed, fixTag(clan))
		}
		if err := addScopedPlayersFromClans(c, a, fixed, tagSet, names); err != nil {
			return nil, nil, err
		}
	}
	if serverRaw != "" {
		serverID, err := strconv.ParseInt(serverRaw, 10, 64)
		if err != nil {
			return nil, nil, apptypes.Error(http.StatusBadRequest, "invalid server")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT tag FROM server_clans WHERE server_id = $1`, strconv.FormatInt(serverID, 10))
		if err != nil {
			return nil, nil, err
		}
		serverClans := []string{}
		for rows.Next() {
			var tag string
			if rows.Scan(&tag) == nil {
				serverClans = append(serverClans, tag)
			}
		}
		rows.Close()
		if err := addScopedPlayersFromClans(c, a, serverClans, tagSet, names); err != nil {
			return nil, nil, err
		}
	}
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	if len(tags) == 0 {
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT tag, name FROM basic_player ORDER BY tag LIMIT 200`)
		if err != nil {
			return nil, nil, err
		}
		for rows.Next() {
			var tag, name string
			if rows.Scan(&tag, &name) == nil {
				tags = append(tags, tag)
				names[tag] = name
			}
		}
		rows.Close()
	}
	if len(names) < len(tags) {
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT tag, name FROM basic_player WHERE tag = ANY($1)`, tags)
		if err == nil {
			for rows.Next() {
				var tag, name string
				if rows.Scan(&tag, &name) == nil {
					names[tag] = name
				}
			}
			rows.Close()
		}
	}
	return tags, names, nil
}

func addScopedPlayersFromClans(c *fiber.Ctx, a apptypes.Deps, clanTags []string, tagSet map[string]bool, names map[string]string) error {
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT tag, name FROM basic_player WHERE clan_tag = ANY($1)`, clanTags)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var tag, name string
		if err := rows.Scan(&tag, &name); err != nil {
			return err
		}
		tagSet[tag] = true
		names[tag] = name
	}
	return rows.Err()
}

func verifyServerToken(c *fiber.Ctx, a apptypes.Deps, serverID int64, onlyAdmin bool) error {
	apiToken := c.Query("api_token")
	if apiToken == "" {
		return apptypes.Error(http.StatusForbidden, "API Token is required")
	}
	lookup := []string{"1103679645439754335"}
	if !onlyAdmin {
		lookup = append(lookup, strconv.FormatInt(serverID, 10))
	}
	var exists bool
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT EXISTS (
			SELECT 1 FROM servers
			WHERE id = ANY($1) AND (data->>'ck_api_token' = $2 OR data->>'api_token' = $2)
		)
	`, lookup, apiToken).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return apptypes.Error(http.StatusForbidden, "Invalid API token or cannot access this resource")
}

func stringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			out = append(out, stringValue(item))
		}
		return out
	default:
		return nil
	}
}

func asAnySlice(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return nil
}

func floatValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	default:
		return 0
	}
}

func sanitizeAny(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, v := range typed {
			if k == "_id" {
				continue
			}
			out[k] = sanitizeAny(v)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, v := range typed {
			out = append(out, sanitizeAny(v))
		}
		return out
	default:
		return typed
	}
}

func v1ServerSettings(c *fiber.Ctx, a apptypes.Deps, serverID string) (map[string]any, error) {
	id, err := strconv.Atoi(serverID)
	if err != nil {
		return nil, err
	}
	return serverroutes.LoadServerSettingsDocument(c, a, id, true)
}

func legacyFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
