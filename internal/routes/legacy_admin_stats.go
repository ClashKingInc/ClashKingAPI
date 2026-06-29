package routes

import (
	"io"
	"net/http"
	"slices"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// botConfig godoc
// @Summary Get bot configuration
// @Description Returns ClashKing bot configuration for authorized bot tokens.
// @Tags Legacy Bot
// @Produce json
// @Param bot_token header string false "Bot token"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /bot/config [get]
func botConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		botToken := legacyFirstNonEmpty(c.Get("bot_token"), c.Get("Bot-Token"))
		var raw []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT data FROM bot_settings WHERE type = 'bot'`).Scan(&raw)
		if err != nil {
			return err
		}
		configData := jsonObject(raw)
		isMain := botToken == stringValue(configData["prod_token"])
		isBeta := slices.Contains(stringSlice(configData["beta_tokens"]), botToken)
		if !isMain && !isBeta {
			return apptypes.Error(http.StatusUnauthorized, "Invalid or missing token")
		}
		configData["is_main"] = isMain
		configData["is_beta"] = isBeta
		configData["is_custom"] = false
		return apptypes.JSON(c, http.StatusOK, configData)
	}
}

// clanBadge godoc
// @Summary Get clan badge image
// @Description Returns the clan badge image as a PNG.
// @Tags Clan
// @Produce png
// @Param clan_tag path string true "Clan tag"
// @Success 200 {file} binary
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/badge [get]
func clanBadge(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := clanFixTag(c.Params("clan_tag"))
		var badgeToken string
		_ = a.Store.SQL.QueryRow(c.UserContext(), `SELECT badge_token FROM basic_clan WHERE tag = $1`, clanTag).Scan(&badgeToken)
		imageLink := badgeURL(badgeToken, 512)
		if badgeToken == "" {
			if a.Clash == nil {
				return apptypes.Error(http.StatusNotFound, "Clan badge not found")
			}
			liveClan, err := a.Clash.GetClan(c.UserContext(), clanTag)
			if err != nil || liveClan == nil || liveClan.Badge.Large == "" {
				return apptypes.Error(http.StatusNotFound, "Clan badge not found")
			}
			imageLink = liveClan.Badge.Large
		}
		resp, err := http.Get(imageLink)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		c.Set("Content-Type", "image/png")
		return c.Send(data)
	}
}

// serverSettingsLegacy godoc
// @Summary Get legacy server settings
// @Description Returns server settings for a Discord server.
// @Tags Legacy Server
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /server-settings/{server_id} [get]
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
// @Tags Legacy Links
// @Produce json
// @Param guild_id path int true "Discord guild ID"
// @Success 200 {object} map[string]interface{}
// @Router /guild_links/{guild_id} [get]
func guildLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{})
	}
}

// shortener godoc
// @Summary Create short link
// @Description Creates a ClashKing short link for the supplied URL.
// @Tags Legacy Links
// @Produce json
// @Param url query string true "Destination URL"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /shortner [get]
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
// @Tags Legacy Links
// @Param id query string false "Short link ID"
// @Param link_id query string false "Short link ID"
// @Success 307
// @Failure 404 {object} map[string]interface{}
// @Router /shortlink [get]
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

// discordLinks godoc
// @Summary Get Discord links for player tags
// @Description Returns Discord user IDs linked to the provided player tags.
// @Tags Legacy Links
// @Accept json
// @Produce json
// @Param body body []string true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /discord_links [post]
func discordLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var playerTags []string
		if err := apptypes.DecodeJSON(c, &playerTags); err != nil {
			return err
		}
		filtered := make([]string, 0, len(playerTags))
		for _, tag := range playerTags {
			filtered = append(filtered, fixTag(tag))
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT tag, COALESCE(discord_id, user_id, '')
			FROM player_links
			WHERE tag = ANY($1)
		`, filtered)
		if err != nil {
			return err
		}
		defer rows.Close()
		result := map[string]any{}
		for rows.Next() {
			var tag, userID string
			if err := rows.Scan(&tag, &userID); err != nil {
				return err
			}
			result[tag] = userID
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// capitalLegacy godoc
// @Summary Get legacy capital stats
// @Description Returns scoped clan capital stats for players.
// @Tags Legacy Capital
// @Produce json
// @Param player_tags query []string false "Player tags"
// @Param clan_tags query []string false "Clan tags"
// @Param server query int false "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
func capitalLegacy(a apptypes.Deps) fiber.Handler {
	return statsFromPlayerDocs(a, "raided", func(doc map[string]any, season string) map[string]any {
		return map[string]any{"donated": intValue(doc["capital_gold_donos"]), "raided": intValue(doc["capital_resources_looted"]), "attacks": intValue(doc["attack_count"]), "medals": intValue(doc["medals"])}
	}, map[string]any{"donated": 0, "raided": 0, "attacks": 0, "medals": 0})
}

// warStatsLegacy godoc
// @Summary Get legacy war stats
// @Description Returns scoped war hit-rate stats for players.
// @Tags Legacy War
// @Produce json
// @Param player_tags query []string false "Player tags"
// @Param clan_tags query []string false "Clan tags"
// @Param server query int false "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /war-stats [get]
func warStatsLegacy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, names, err := scopedPlayerTags(c, a)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT attacker_tag, count(*)::int, sum(stars)::int, sum(destruction_percentage)::float8
			FROM war_attack_events
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

func statsFromPlayerDocs(a apptypes.Deps, defaultSort string, extractor func(map[string]any, string) map[string]any, totalsSeed map[string]any) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, names, err := scopedPlayerTags(c, a)
		if err != nil {
			return err
		}
		sortField := c.Query("sort_field", defaultSort)
		descending := c.Query("descending", "true") != "false"
		limit := clamp(queryInt(c, "limit", 50), 1, 500)
		season := legacyFirstNonEmpty(c.Query("season"), currentGamesSeason())
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT s.player_tag, s.clan_tag, s.name, s.townhall_level, s.donated, s.received, s.capital_gold_donos, s.activity_score,
				s.donations, s.clan_games, s.activity, s.data,
				COALESCE(cm.attack_count, 0), COALESCE(cm.capital_resources_looted, 0)
			FROM player_season_stats s
			LEFT JOIN LATERAL (
				SELECT sum(attack_count)::int AS attack_count, sum(capital_resources_looted)::int AS capital_resources_looted
				FROM capital_raid_members
				WHERE player_tag = s.player_tag AND to_char(start_time, 'YYYY-MM') = s.season
			) cm ON true
			WHERE s.season = $1 AND s.player_tag = ANY($2)
		`, season, tags)
		if err != nil {
			return err
		}
		defer rows.Close()
		clanTotals := map[string]map[string]any{}
		items := []map[string]any{}
		totals := cloneMap(totalsSeed)
		for rows.Next() {
			var tag, clanTag, name string
			var townhall pgtype.Int4
			var donated, received, capitalGold, activityScore, raidAttacks, raidLoot int
			var donationsRaw, gamesRaw, activityRaw, dataRaw []byte
			if err := rows.Scan(&tag, &clanTag, &name, &townhall, &donated, &received, &capitalGold, &activityScore, &donationsRaw, &gamesRaw, &activityRaw, &dataRaw, &raidAttacks, &raidLoot); err != nil {
				return err
			}
			doc := jsonObject(dataRaw)
			doc["tag"] = tag
			doc["name"] = legacyFirstNonEmpty(name, names[tag])
			doc["clan_tag"] = clanTag
			doc["townhall"] = townhall.Int32
			doc["donated"] = donated
			doc["received"] = received
			doc["capital_gold_donos"] = capitalGold
			doc["activity_score"] = activityScore
			doc["attack_count"] = raidAttacks
			doc["capital_resources_looted"] = raidLoot
			doc["donations"] = jsonObject(donationsRaw)
			doc["clan_games"] = jsonObject(gamesRaw)
			doc["activity"] = jsonObject(activityRaw)
			for k, v := range extractor(doc, season) {
				doc[k] = v
				if _, ok := totals[k]; ok {
					totals[k] = intValue(totals[k]) + intValue(v)
				}
			}
			if clanTag != "" {
				if clanTotals[clanTag] == nil {
					clanTotals[clanTag] = map[string]any{"tag": clanTag}
				}
				for k, v := range extractor(doc, season) {
					clanTotals[clanTag][k] = intValue(clanTotals[clanTag][k]) + intValue(v)
				}
			}
			items = append(items, doc)
		}
		sortMapsByNumeric(items, sortField, descending)
		if len(items) > limit {
			items = items[:limit]
		}
		for i := range items {
			items[i]["rank"] = i + 1
		}
		byClan := make([]map[string]any, 0, len(clanTotals))
		for _, v := range clanTotals {
			byClan = append(byClan, v)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"items": items, "totals": totals, "clan_totals": byClan,
			"metadata": map[string]any{"sort_order": cond(descending, "descending", "ascending"), "sort_field": sortField, "season": season},
		})
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
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT player_tag, name FROM player_current_stats ORDER BY updated_at DESC LIMIT 200`)
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
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT player_tag, name FROM player_current_stats WHERE player_tag = ANY($1)`, tags)
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
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT player_tag, name FROM player_current_stats WHERE clan_tag = ANY($1)`, clanTags)
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

func cond[T any](ok bool, a, b T) T {
	if ok {
		return a
	}
	return b
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
	var name, embedColor pgtype.Text
	var logsRaw, statusRaw, countdownsRaw, dataRaw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT name, embed_color, logs_config, status_roles, countdowns, data
		FROM servers
		WHERE id = $1
	`, serverID).Scan(&name, &embedColor, &logsRaw, &statusRaw, &countdownsRaw, &dataRaw)
	if err != nil {
		return nil, err
	}
	doc := jsonObject(dataRaw)
	doc["server"] = serverID
	if name.Valid {
		doc["name"] = name.String
	}
	if embedColor.Valid {
		doc["embed_color"] = embedColor.String
	}
	doc["logs"] = jsonObject(logsRaw)
	doc["status_roles"] = jsonObject(statusRaw)
	doc["countdowns"] = jsonObject(countdownsRaw)
	doc["eval"] = map[string]any{}
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT tag, name, abbreviation, clan_channel_id, logs_config, countdowns, data FROM server_clans WHERE server_id = $1`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clans := []map[string]any{}
	for rows.Next() {
		var tag, clanName, abbrev string
		var channel pgtype.Text
		var clanLogs, clanCountdowns, clanData []byte
		if err := rows.Scan(&tag, &clanName, &abbrev, &channel, &clanLogs, &clanCountdowns, &clanData); err != nil {
			return nil, err
		}
		item := jsonObject(clanData)
		item["tag"] = tag
		item["name"] = clanName
		item["abbreviation"] = abbrev
		if channel.Valid {
			item["clanChannel"] = channel.String
		}
		item["logs"] = jsonObject(clanLogs)
		item["countdowns"] = jsonObject(clanCountdowns)
		clans = append(clans, item)
	}
	doc["clans"] = clans
	return doc, nil
}

func legacyFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
