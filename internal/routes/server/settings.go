package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

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
		server, err := sqlServerSettingsDoc(c, rt, serverID)
		if err != nil {
			return notFoundErr(err, "Server Not Found")
		}
		includeClans, err := apptypes.QueryBool(c, "clan_settings", false)
		if err != nil {
			return err
		}
		eval := map[string]any{}
		for key := range serverSettingsEvalCollections {
			eval[key] = []any{}
		}
		server["eval"] = eval
		if includeClans {
			clans, _ := sqlServerClanDocs(c, rt, serverID)
			server["clans"] = sanitize(clans)
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(server))
	}
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
			SET embed_color = $2, data = data || $3::jsonb, updated_at = now()
			WHERE id = $1
		`, strconv.Itoa(serverID), strconv.Itoa(hexCode), apptypes.Marshal(map[string]any{"embed_color": hexCode}))
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
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			UPDATE servers
			SET embed_color = COALESCE($2, embed_color),
				data = data || $3::jsonb,
				updated_at = now()
			WHERE id = $1
		`, strconv.Itoa(serverID), optionalString(update["embed_color"]), apptypes.Marshal(update))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerSettingsResponse{Message: "Server settings updated successfully", ServerID: serverID, UpdatedFields: len(update)})
	}
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
	if body.RoleTreatment != nil {
		out["role_treatment"] = body.RoleTreatment
	}
	if body.FullWhitelistRole != nil {
		out["full_whitelist_role"] = body.FullWhitelistRole
	}
	if body.LeadershipEval != nil {
		out["leadership_eval"] = *body.LeadershipEval
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
		out["link_parse"] = linkParse
	}
	return out
}

func sqlServerSettingsDoc(c *fiber.Ctx, rt apptypes.Deps, serverID int) (map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var id, name string
	var embedColor *string
	var logsRaw, statusRaw, countdownsRaw, dataRaw []byte
	if err := rt.Store.SQL.QueryRow(c.UserContext(), `
		SELECT id, name, embed_color, logs_config, status_roles, countdowns, data
		FROM servers
		WHERE id = $1
	`, strconv.Itoa(serverID)).Scan(&id, &name, &embedColor, &logsRaw, &statusRaw, &countdownsRaw, &dataRaw); err != nil {
		return nil, err
	}
	doc := map[string]any{}
	_ = json.Unmarshal(dataRaw, &doc)
	doc["server"] = serverID
	doc["server_id"] = id
	doc["name"] = name
	if embedColor != nil {
		doc["embed_color"] = *embedColor
	}
	doc["logs_config"] = jsonObject(logsRaw)
	doc["logs"] = doc["logs_config"]
	doc["status_roles"] = jsonObject(statusRaw)
	doc["countdowns"] = jsonObject(countdownsRaw)
	return doc, nil
}

func sqlServerClanDocs(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, abbreviation, clan_channel_id, logs_config, countdowns, data
		FROM server_clans
		WHERE server_id = $1
		ORDER BY name ASC, tag ASC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, name, abbreviation string
		var clanChannelID *string
		var logsRaw, countdownsRaw, dataRaw []byte
		if err := rows.Scan(&tag, &name, &abbreviation, &clanChannelID, &logsRaw, &countdownsRaw, &dataRaw); err != nil {
			return nil, err
		}
		doc := map[string]any{}
		_ = json.Unmarshal(dataRaw, &doc)
		doc["tag"] = tag
		doc["server"] = serverID
		doc["server_id"] = strconv.Itoa(serverID)
		doc["name"] = name
		doc["abbreviation"] = abbreviation
		if clanChannelID != nil {
			doc["clan_channel"] = *clanChannelID
		}
		doc["logs_config"] = jsonObject(logsRaw)
		doc["logs"] = doc["logs_config"]
		doc["countdowns"] = jsonObject(countdownsRaw)
		out = append(out, doc)
	}
	return out, rows.Err()
}

func sqlServerClanDoc(c *fiber.Ctx, rt apptypes.Deps, serverID int, tag string) (map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, abbreviation, clan_channel_id, logs_config, countdowns, data
		FROM server_clans
		WHERE server_id = $1 AND tag = $2
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
	var clanTag, name, abbreviation string
	var clanChannelID *string
	var logsRaw, countdownsRaw, dataRaw []byte
	if err := rows.Scan(&clanTag, &name, &abbreviation, &clanChannelID, &logsRaw, &countdownsRaw, &dataRaw); err != nil {
		return nil, err
	}
	doc := map[string]any{}
	_ = json.Unmarshal(dataRaw, &doc)
	doc["tag"] = clanTag
	doc["server"] = serverID
	doc["server_id"] = strconv.Itoa(serverID)
	doc["name"] = name
	doc["abbreviation"] = abbreviation
	if clanChannelID != nil {
		doc["clan_channel"] = *clanChannelID
	}
	doc["logs_config"] = jsonObject(logsRaw)
	doc["logs"] = doc["logs_config"]
	doc["countdowns"] = jsonObject(countdownsRaw)
	return doc, nil
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
