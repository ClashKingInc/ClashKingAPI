package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// getServerSettings godoc
// @Summary Get server settings
// @Description Returns the full settings document for a Discord server.
// @Tags Server Settings
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_settings query bool false "Include clan settings"
// @Success 200 {object} modelsv2.ServerSettingsDocument
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/settings [get]
func getServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		includeClans, err := apptypes.QueryBool(c, "clan_settings", false)
		if err != nil {
			return err
		}
		server, err := LoadServerSettingsDocument(c, rt, serverID, includeClans)
		if err != nil {
			return notFoundErr(err, "Server Not Found")
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(server))
	}
}

// LoadServerSettingsDocument reconstructs the settings document from normalized tables.
func LoadServerSettingsDocument(c *fiber.Ctx, rt apptypes.Deps, serverID int, includeClans bool) (map[string]any, error) {
	server, err := sqlServerSettingsDoc(c, rt, serverID)
	if err != nil {
		return nil, err
	}
	roles, err := queryServerRoles(c, rt, serverID, "", "")
	if err != nil {
		return nil, err
	}
	server["server_roles"] = roles
	if includeClans {
		clans, clanErr := sqlServerClanDocs(c, rt, serverID)
		if clanErr != nil {
			return nil, clanErr
		}
		server["clans"] = clans
	}
	return server, nil
}

// putEmbedColor godoc
// @Summary Set embed color
// @Description Sets the embed color (decimal integer) for a Discord server.
// @Tags Server Settings
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param hex_code path int true "Embed color as decimal integer"
// @Success 200 {object} modelsv2.EmbedColorResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/embed-color/{hex_code} [put]
func putEmbedColor(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		hexCode, err := pathInt(c, "hex_code")
		if err != nil {
			return err
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			UPDATE servers
			SET embed_color = $2, updated_at = now()
			WHERE id = $1
		`, strconv.Itoa(serverID), strconv.Itoa(hexCode))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.EmbedColorResponse{Message: "Embed color updated", ServerID: serverID, EmbedColor: hexCode})
	}
}

// patchServerSettings godoc
// @Summary Update server settings
// @Description Partially updates server-level settings (nickname rules, eval config, etc.).
// @Tags Server Settings
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.ServerSettingsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/settings [patch]
func patchServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.ServerSettingsUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		rawBody := structToUpdateMap(body)
		if len(rawBody) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		update := rawBody
		if len(update) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		if err := updateNormalizedServerSettings(c, rt, serverID, body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerSettingsResponse{Message: "Server settings updated successfully", ServerID: serverID, UpdatedFields: len(update)})
	}
}

func updateNormalizedServerSettings(c *fiber.Ctx, rt apptypes.Deps, serverID int, body modelsv2.ServerSettingsUpdate) error {
	tx, err := rt.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.UserContext())
	serverIDText := strconv.Itoa(serverID)
	if _, err := tx.Exec(c.UserContext(), `INSERT INTO server_settings (server_id) VALUES ($1) ON CONFLICT DO NOTHING`, serverIDText); err != nil {
		return err
	}
	set := func(column string, value any) error {
		_, err := tx.Exec(c.UserContext(), fmt.Sprintf(`UPDATE server_settings SET %s = $2, updated_at = now() WHERE server_id = $1`, column), serverIDText, value)
		return err
	}
	if body.EmbedColor != nil {
		if _, err := tx.Exec(c.UserContext(), `UPDATE servers SET embed_color = $2, updated_at = now() WHERE id = $1`, serverIDText, strconv.Itoa(*body.EmbedColor)); err != nil {
			return err
		}
	}
	values := []struct {
		column string
		value  any
	}{
		{"nickname_rule", body.NicknameRule},
		{"non_family_nickname_rule", body.NonFamilyNickname},
		{"change_nickname", body.ChangeNickname},
		{"flair_non_family", body.FlairNonFamily},
		{"auto_eval_nickname", body.AutoEvalNickname},
		{"autoeval_log_channel_id", body.AutoevalLog},
		{"autoeval_enabled", body.Autoeval},
		{"full_whitelist_role_id", body.FullWhitelistRole},
		{"autoboard_limit", body.AutoboardLimit},
		{"use_api_token", body.APIToken},
		{"tied_stats_only", body.Tied},
		{"banlist_channel_id", body.Banlist},
		{"strike_log_channel_id", body.StrikeLog},
		{"reddit_feed_channel_id", body.RedditFeed},
		{"family_label", body.FamilyLabel},
		{"greeting", body.Greeting},
	}
	for _, item := range values {
		if item.value == nil {
			continue
		}
		if err := set(item.column, item.value); err != nil {
			return err
		}
	}
	if body.LinkParse != nil {
		linkValues := []struct {
			column string
			value  *bool
		}{
			{"link_parse_clan", body.LinkParse.Clan},
			{"link_parse_army", body.LinkParse.Army},
			{"link_parse_player", body.LinkParse.Player},
			{"link_parse_base", body.LinkParse.Base},
			{"link_parse_show", body.LinkParse.Show},
		}
		for _, item := range linkValues {
			if item.value != nil {
				if err := set(item.column, *item.value); err != nil {
					return err
				}
			}
		}
		if body.LinkParse.Channels != nil {
			if _, err := tx.Exec(c.UserContext(), `DELETE FROM server_link_parse_channels WHERE server_id = $1`, serverIDText); err != nil {
				return err
			}
			for _, channelID := range body.LinkParse.Channels {
				if channelID = strings.TrimSpace(channelID); channelID != "" {
					if _, err := tx.Exec(c.UserContext(), `INSERT INTO server_link_parse_channels (server_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, serverIDText, channelID); err != nil {
						return err
					}
				}
			}
		}
	}
	if body.AutoevalTriggers != nil {
		if _, err := tx.Exec(c.UserContext(), `DELETE FROM server_autoeval_triggers WHERE server_id = $1`, serverIDText); err != nil {
			return err
		}
		for position, trigger := range body.AutoevalTriggers {
			if _, err := tx.Exec(c.UserContext(), `INSERT INTO server_autoeval_triggers (server_id, trigger, position) VALUES ($1, $2, $3)`, serverIDText, trigger, position); err != nil {
				return err
			}
		}
	}
	if body.BlacklistedRoles != nil {
		if _, err := tx.Exec(c.UserContext(), `DELETE FROM server_blacklisted_roles WHERE server_id = $1`, serverIDText); err != nil {
			return err
		}
		for _, roleID := range body.BlacklistedRoles {
			if _, err := tx.Exec(c.UserContext(), `INSERT INTO server_blacklisted_roles (server_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, serverIDText, roleID); err != nil {
				return err
			}
		}
	}
	return tx.Commit(c.UserContext())
}

func structToUpdateMap(body modelsv2.ServerSettingsUpdate) map[string]any {
	out := map[string]any{}
	if body.EmbedColor != nil {
		out["embed_color"] = *body.EmbedColor
	}
	if body.NicknameRule != nil {
		out["nickname_rule"] = *body.NicknameRule
	}
	if body.NonFamilyNickname != nil {
		out["non_family_nickname_rule"] = *body.NonFamilyNickname
	}
	if body.ChangeNickname != nil {
		out["change_nickname"] = *body.ChangeNickname
	}
	if body.FlairNonFamily != nil {
		out["flair_non_family"] = *body.FlairNonFamily
	}
	if body.AutoEvalNickname != nil {
		out["auto_eval_nickname"] = *body.AutoEvalNickname
	}
	if body.AutoevalTriggers != nil {
		out["autoeval_triggers"] = body.AutoevalTriggers
	}
	if body.AutoevalLog != nil {
		out["autoeval_log"] = body.AutoevalLog
	}
	if body.Autoeval != nil {
		out["autoeval"] = *body.Autoeval
	}
	if body.BlacklistedRoles != nil {
		out["blacklisted_roles"] = body.BlacklistedRoles
	}
	if body.FullWhitelistRole != nil {
		out["full_whitelist_role"] = body.FullWhitelistRole
	}
	if body.AutoboardLimit != nil {
		out["autoboard_limit"] = *body.AutoboardLimit
	}
	if body.APIToken != nil {
		out["api_token"] = *body.APIToken
	}
	if body.Tied != nil {
		out["tied"] = *body.Tied
	}
	if body.Banlist != nil {
		out["banlist"] = body.Banlist
	}
	if body.StrikeLog != nil {
		out["strike_log"] = body.StrikeLog
	}
	if body.RedditFeed != nil {
		out["reddit_feed"] = body.RedditFeed
	}
	if body.FamilyLabel != nil {
		out["family_label"] = *body.FamilyLabel
	}
	if body.Greeting != nil {
		out["greeting"] = *body.Greeting
	}
	if body.LinkParse != nil {
		linkParse := map[string]any{}
		if body.LinkParse.Clan != nil {
			linkParse["clan"] = *body.LinkParse.Clan
		}
		if body.LinkParse.Army != nil {
			linkParse["army"] = *body.LinkParse.Army
		}
		if body.LinkParse.Player != nil {
			linkParse["player"] = *body.LinkParse.Player
		}
		if body.LinkParse.Base != nil {
			linkParse["base"] = *body.LinkParse.Base
		}
		if body.LinkParse.Show != nil {
			linkParse["show"] = *body.LinkParse.Show
		}
		if body.LinkParse.Channels != nil {
			linkParse["channels"] = body.LinkParse.Channels
		}
		out["link_parse"] = linkParse
	}
	return out
}

func sqlServerSettingsDoc(c *fiber.Ctx, rt apptypes.Deps, serverID int) (map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var id, name string
	var embedColor, nicknameRule, nonFamilyNickname, autoevalLog, fullWhitelistRole, banlist, strikeLog, redditFeed, greeting *string
	var changeNickname, flairNonFamily, autoEvalNickname, autoeval, apiToken, tied bool
	var autoboardLimit int
	var familyLabel string
	var linkParseClan, linkParseArmy, linkParsePlayer, linkParseBase, linkParseShow bool
	if err := rt.Store.SQL.QueryRow(c.UserContext(), `
		SELECT s.id, s.name, s.embed_color,
		       ss.nickname_rule, ss.non_family_nickname_rule,
		       COALESCE(ss.change_nickname, true), COALESCE(ss.flair_non_family, true),
		       COALESCE(ss.auto_eval_nickname, false), ss.autoeval_log_channel_id,
		       COALESCE(ss.autoeval_enabled, false), ss.full_whitelist_role_id,
		       COALESCE(ss.autoboard_limit, 0),
		       COALESCE(ss.use_api_token, true), COALESCE(ss.tied_stats_only, true),
		       ss.banlist_channel_id, ss.strike_log_channel_id, ss.reddit_feed_channel_id,
		       COALESCE(ss.family_label, ''), ss.greeting,
		       COALESCE(ss.link_parse_clan, true), COALESCE(ss.link_parse_army, true),
		       COALESCE(ss.link_parse_player, true), COALESCE(ss.link_parse_base, true),
		       COALESCE(ss.link_parse_show, true)
		FROM servers s
		LEFT JOIN server_settings ss ON ss.server_id = s.id
		WHERE s.id = $1
	`, strconv.Itoa(serverID)).Scan(
		&id, &name, &embedColor, &nicknameRule, &nonFamilyNickname,
		&changeNickname, &flairNonFamily, &autoEvalNickname, &autoevalLog,
		&autoeval, &fullWhitelistRole, &autoboardLimit,
		&apiToken, &tied, &banlist, &strikeLog, &redditFeed, &familyLabel, &greeting,
		&linkParseClan, &linkParseArmy, &linkParsePlayer, &linkParseBase, &linkParseShow,
	); err != nil {
		return nil, err
	}
	doc := map[string]any{
		"change_nickname": changeNickname, "flair_non_family": flairNonFamily,
		"auto_eval_nickname": autoEvalNickname, "autoeval": autoeval,
		"autoboard_limit": autoboardLimit,
		"api_token":       apiToken, "tied": tied, "family_label": familyLabel,
		"link_parse": map[string]any{
			"clan": linkParseClan, "army": linkParseArmy, "player": linkParsePlayer,
			"base": linkParseBase, "show": linkParseShow,
			"channels": queryStringColumn(c, rt, `SELECT channel_id FROM server_link_parse_channels WHERE server_id = $1 ORDER BY channel_id`, id),
		},
	}
	doc["server"] = serverID
	doc["server_id"] = id
	doc["name"] = name
	if embedColor != nil {
		doc["embed_color"] = *embedColor
	}
	optionalDocString(doc, "nickname_rule", nicknameRule)
	optionalDocString(doc, "non_family_nickname_rule", nonFamilyNickname)
	optionalDocString(doc, "autoeval_log", autoevalLog)
	optionalDocString(doc, "full_whitelist_role", fullWhitelistRole)
	optionalDocString(doc, "banlist", banlist)
	optionalDocString(doc, "strike_log", strikeLog)
	optionalDocString(doc, "reddit_feed", redditFeed)
	optionalDocString(doc, "greeting", greeting)
	doc["autoeval_triggers"] = queryStringColumn(c, rt, `SELECT trigger FROM server_autoeval_triggers WHERE server_id = $1 ORDER BY position, trigger`, id)
	doc["blacklisted_roles"] = queryStringColumn(c, rt, `SELECT role_id FROM server_blacklisted_roles WHERE server_id = $1 ORDER BY role_id`, id)
	doc["countdowns"] = queryKeyValueMap(c, rt, `SELECT type, channel_id FROM countdowns WHERE server_id = $1 AND clan_tag IS NULL ORDER BY type`, id)
	return doc, nil
}

func sqlServerClanDocs(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT sc.tag, sc.name, sc.abbreviation, sc.clan_channel_id,
		       categories.name, settings.greeting,
		       settings.auto_greet_option, settings.ban_alert_channel_id
		FROM server_clans sc
		LEFT JOIN server_clan_settings settings ON settings.server_id = sc.server_id AND settings.clan_tag = sc.tag
		LEFT JOIN clan_categories categories ON categories.id = sc.category_id
		WHERE sc.server_id = $1
		ORDER BY sc.name ASC, sc.tag ASC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		doc, err := scanServerClanDoc(rows, serverID)
		if err != nil {
			return nil, err
		}
		doc["countdowns"] = queryKeyValueMap(c, rt, `SELECT type, channel_id FROM countdowns WHERE server_id = $1 AND clan_tag = $2 ORDER BY type`, strconv.Itoa(serverID), serverAsString(doc["tag"]))
		out = append(out, doc)
	}
	return out, rows.Err()
}

func sqlServerClanDoc(c *fiber.Ctx, rt apptypes.Deps, serverID int, tag string) (map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT sc.tag, sc.name, sc.abbreviation, sc.clan_channel_id,
		       categories.name, settings.greeting,
		       settings.auto_greet_option, settings.ban_alert_channel_id
		FROM server_clans sc
		LEFT JOIN server_clan_settings settings ON settings.server_id = sc.server_id AND settings.clan_tag = sc.tag
		LEFT JOIN clan_categories categories ON categories.id = sc.category_id
		WHERE sc.server_id = $1 AND sc.tag = $2
		LIMIT 1
	`, strconv.Itoa(serverID), tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("clan not found")
	}
	doc, err := scanServerClanDoc(rows, serverID)
	if err != nil {
		return nil, err
	}
	doc["countdowns"] = queryKeyValueMap(c, rt, `SELECT type, channel_id FROM countdowns WHERE server_id = $1 AND clan_tag = $2 ORDER BY type`, strconv.Itoa(serverID), serverAsString(doc["tag"]))
	return doc, nil
}

type serverRowScanner interface {
	Scan(dest ...any) error
}

func scanServerClanDoc(row serverRowScanner, serverID int) (map[string]any, error) {
	var tag, name, abbreviation string
	var clanChannelID, categoryName, greeting, autoGreetOption, banAlertChannelID *string
	if err := row.Scan(
		&tag, &name, &abbreviation, &clanChannelID,
		&categoryName, &greeting, &autoGreetOption, &banAlertChannelID,
	); err != nil {
		return nil, err
	}
	doc := map[string]any{
		"tag": tag, "server": serverID, "server_id": strconv.Itoa(serverID),
		"name": name, "abbreviation": abbreviation,
		"logs": map[string]any{},
	}
	optionalDocString(doc, "clan_channel", clanChannelID)
	optionalDocString(doc, "category", categoryName)
	optionalDocString(doc, "greeting", greeting)
	optionalDocString(doc, "auto_greet_option", autoGreetOption)
	optionalDocString(doc, "ban_alert_channel", banAlertChannelID)
	return doc, nil
}

func optionalDocString(doc map[string]any, key string, value *string) {
	if value != nil {
		doc[key] = *value
	}
}

func queryStringColumn(c *fiber.Ctx, rt apptypes.Deps, query string, args ...any) []string {
	rows, err := rt.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var value string
		if rows.Scan(&value) == nil {
			out = append(out, value)
		}
	}
	return out
}

func queryKeyValueMap(c *fiber.Ctx, rt apptypes.Deps, query string, args ...any) map[string]any {
	rows, err := rt.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return map[string]any{}
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var key, value string
		if rows.Scan(&key, &value) == nil {
			out[key] = value
		}
	}
	return out
}

func jsonObject(raw []byte) map[string]any {
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return out
}

func optionalString(value any) *string {
	if value == nil {
		return nil
	}
	out := serverAsString(value)
	return &out
}
