package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

// getServerClanSettings godoc
// @Summary Get clan settings
// @Description Returns detailed settings for a specific clan on a server.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} modelsv2.ClanSettingsDetail
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan/{clan_tag}/settings [get]
func getServerClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		doc, err := sqlServerClanDoc(c, rt, serverID, tag)
		if err != nil {
			return notFoundErr(err, "Server or clan not found")
		}
		return apptypes.JSON(c, http.StatusOK, clanSettingsDetailFromDoc(doc))
	}
}

// getServerClansBasic godoc
// @Summary List server clans (basic)
// @Description Returns a basic list of clans (tag+name) for a server.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {array} modelsv2.ClanReference
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clans-basic [get]
// @Router /v2/link/server/{server_id}/clan/list [get]
func getServerClansBasic(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := sqlServerClanDocs(c, rt, serverID)
		if err != nil {
			return err
		}
		items := make([]map[string]any, 0, len(clans))
		for _, clanDoc := range clans {
			items = append(items, map[string]any{"tag": clanDoc["tag"], "name": clanDoc["name"]})
		}
		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// getServerClans godoc
// @Summary List server clans (full)
// @Description Returns the full clan list for a server from Timescale basic_clan data.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {array} modelsv2.ClanListItem
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clans [get]
func getServerClans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		var serverExists bool
		if err := rt.Store.SQL.QueryRow(c.UserContext(), `SELECT EXISTS(SELECT 1 FROM servers WHERE id = $1)`, strconv.Itoa(serverID)).Scan(&serverExists); err != nil {
			return err
		}
		if !serverExists {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}

		items, err := sqlServerClanListItems(c, rt, serverID)
		if err != nil {
			return err
		}

		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// patchClanSettings godoc
// @Summary Update clan settings
// @Description Partially updates the settings for a specific clan on a server.
// @Tags Server Clans
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} modelsv2.ClanSettingsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan/{clan_tag}/settings [patch]
func patchClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		var body modelsv2.ClanSettingsUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		update := clanUpdateMap(body)
		if len(update) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		if err := updateNormalizedClanSettings(c, rt, serverID, tag, body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanSettingsResponse{Message: "Clan settings updated successfully", ServerID: serverID, ClanTag: tag, UpdatedFields: len(update)})
	}
}

// addServerClan godoc
// @Summary Add a clan to the server
// @Description Adds a CoC clan to the Discord server tracking list.
// @Tags Server Clans
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.AddClanResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clans [post]
func addServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.AddClanRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag := serverNormalizeTag(body.Tag)
		if !validClanTag(tag) {
			return apptypes.Error(http.StatusBadRequest, "The clan tag is invalid. Check the tag and try again.")
		}
		if rt.Clash == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "Clash of Clans API is unavailable")
		}
		clan, err := rt.Clash.GetClan(c.UserContext(), tag)
		if err != nil {
			var notFound *clashy.NotFound
			if errors.As(err, &notFound) {
				return apptypes.Error(http.StatusNotFound, "Clan not found. The tag is invalid, or the clan was deleted.")
			}
			return apptypes.Error(http.StatusBadGateway, "Could not check the clan because the Clash of Clans API is unavailable.")
		}
		if clan == nil {
			return apptypes.Error(http.StatusNotFound, "Clan not found. The tag is invalid, or the clan was deleted.")
		}
		if clan.MemberCount == 0 {
			return apptypes.Error(http.StatusBadRequest, "The clan is empty and cannot be added.")
		}
		members := make([]serverClanMemberSnapshot, 0, len(clan.Members))
		troopsDonated := 0
		troopsReceived := 0
		for _, member := range clan.Members {
			if member.Tag != "" {
				members = append(members, serverClanMemberSnapshot{Tag: member.Tag, Name: member.Name})
			}
			troopsDonated += member.Donations
			troopsReceived += member.Received
		}
		sort.Slice(members, func(i, j int) bool { return members[i].Tag < members[j].Tag })
		membersJSON, err := json.Marshal(members)
		if err != nil {
			return err
		}
		cwlLeagueID := 48000000
		if clan.WarLeague != nil {
			cwlLeagueID = clan.WarLeague.ID
		}
		var locationID, capitalLeagueID any
		if clan.Location != nil {
			locationID = clan.Location.ID
		}
		if clan.CapitalLeague != nil {
			capitalLeagueID = clan.CapitalLeague.ID
		}
		badgeToken := serverClanBadgeToken(firstNonEmpty(clan.Badge.Large, clan.Badge.Medium, clan.Badge.Small, clan.Badge.URL))

		tx, err := rt.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		if _, err := tx.Exec(c.UserContext(), `
			INSERT INTO basic_clan (
				tag, name, description, clan_level, location_id, cwl_league_id,
				capital_league_id, public_war_log, war_wins, war_win_streak,
				clan_points, member_count, badge_token, troops_donated,
				troops_received, members, last_active
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
				$11, $12, $13, $14, $15, $16::jsonb, now()
			)
			ON CONFLICT (tag) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				clan_level = EXCLUDED.clan_level,
				location_id = EXCLUDED.location_id,
				cwl_league_id = EXCLUDED.cwl_league_id,
				capital_league_id = EXCLUDED.capital_league_id,
				public_war_log = EXCLUDED.public_war_log,
				war_wins = EXCLUDED.war_wins,
				war_win_streak = EXCLUDED.war_win_streak,
				clan_points = EXCLUDED.clan_points,
				member_count = EXCLUDED.member_count,
				badge_token = EXCLUDED.badge_token,
				troops_donated = EXCLUDED.troops_donated,
				troops_received = EXCLUDED.troops_received,
				members = EXCLUDED.members,
				last_active = now()
		`, clan.Tag, clan.Name, clan.Description, clan.Level, locationID, cwlLeagueID,
			capitalLeagueID, clan.PublicWarLog, clan.WarWins, clan.WarWinStreak,
			clan.Points, clan.MemberCount, badgeToken, troopsDonated, troopsReceived, membersJSON); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `
			INSERT INTO server_clans (tag, server_id, name, updated_at)
			VALUES ($1, $2, $3, now())
			ON CONFLICT (tag, server_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
		`, clan.Tag, strconv.Itoa(serverID), clan.Name); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AddClanResponse{Message: "Clan added successfully", ServerID: serverID, ClanTag: clan.Tag, ClanName: clan.Name})
	}
}

func validClanTag(tag string) bool {
	value := strings.TrimPrefix(tag, "#")
	if len(value) < 3 || len(value) > 15 {
		return false
	}
	for _, character := range value {
		if !strings.ContainsRune("0289PYLQGRJCUV", character) {
			return false
		}
	}
	return true
}

func updateNormalizedClanSettings(c *fiber.Ctx, rt apptypes.Deps, serverID int, clanTag string, body modelsv2.ClanSettingsUpdate) error {
	tx, err := rt.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.UserContext())
	serverIDText := strconv.Itoa(serverID)
	result, err := tx.Exec(c.UserContext(), `UPDATE server_clans SET updated_at = now() WHERE server_id = $1 AND tag = $2`, serverIDText, clanTag)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return apptypes.Error(http.StatusNotFound, "Server or clan not found")
	}
	if _, err := tx.Exec(c.UserContext(), `
		INSERT INTO server_clan_settings (server_id, clan_tag)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, serverIDText, clanTag); err != nil {
		return err
	}
	set := func(column string, value any) error {
		_, err := tx.Exec(c.UserContext(), fmt.Sprintf(`UPDATE server_clan_settings SET %s = $3, updated_at = now() WHERE server_id = $1 AND clan_tag = $2`, column), serverIDText, clanTag, value)
		return err
	}
	if body.Abbreviation != nil {
		if _, err := tx.Exec(c.UserContext(), `UPDATE server_clans SET abbreviation = $3 WHERE server_id = $1 AND tag = $2`, serverIDText, clanTag, *body.Abbreviation); err != nil {
			return err
		}
	}
	if body.ClanChannel != nil {
		if _, err := tx.Exec(c.UserContext(), `UPDATE server_clans SET clan_channel_id = NULLIF($3, '') WHERE server_id = $1 AND tag = $2`, serverIDText, clanTag, *body.ClanChannel); err != nil {
			return err
		}
	}
	if body.Category != nil {
		category := strings.TrimSpace(*body.Category)
		if category == "" {
			if _, err := tx.Exec(c.UserContext(), `UPDATE server_clans SET category_id = NULL WHERE server_id = $1 AND tag = $2`, serverIDText, clanTag); err != nil {
				return err
			}
		} else if _, err := tx.Exec(c.UserContext(), `
			WITH selected AS (
				INSERT INTO clan_categories (server_id, name) VALUES ($1, $3)
				ON CONFLICT (server_id, name) DO UPDATE SET name = EXCLUDED.name
				RETURNING id
			)
			UPDATE server_clans SET category_id = (SELECT id FROM selected)
			WHERE server_id = $1 AND tag = $2
		`, serverIDText, clanTag, category); err != nil {
			return err
		}
	}
	values := []struct {
		column string
		value  any
	}{
		{"greeting", body.Greeting},
		{"auto_greet_option", body.AutoGreetOption},
		{"ban_alert_channel_id", body.BanAlertChannel},
	}
	for _, item := range values {
		if item.value != nil {
			if err := set(item.column, item.value); err != nil {
				return err
			}
		}
	}
	return tx.Commit(c.UserContext())
}

// removeServerClan godoc
// @Summary Remove a clan from the server
// @Description Removes a clan from the Discord server tracking list.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} modelsv2.RemoveClanResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clans/{clan_tag} [delete]
// @Router /v2/server/{server_id}/clan/{clan_tag} [delete]
func removeServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM server_clans WHERE server_id = $1 AND tag = $2`, strconv.Itoa(serverID), tag)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RemoveClanResponse{Message: "Clan removed successfully", ServerID: serverID, ClanTag: tag, DeletedCount: result.RowsAffected()})
	}
}

type serverClanMemberSnapshot struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

func sqlServerClanListItems(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]modelsv2.ClanListItem, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT sc.tag, clan.name, clan.badge_token, clan.clan_level, clan.member_count,
		       sc.abbreviation, sc.clan_channel_id, categories.name, settings.greeting,
		       settings.auto_greet_option, settings.ban_alert_channel_id
		FROM server_clans sc
		JOIN basic_clan clan ON clan.tag = sc.tag
		LEFT JOIN server_clan_settings settings
		       ON settings.server_id = sc.server_id AND settings.clan_tag = sc.tag
		LEFT JOIN clan_categories categories ON categories.id = sc.category_id
		WHERE sc.server_id = $1
		ORDER BY clan.name ASC, sc.tag ASC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]modelsv2.ClanListItem, 0)
	for rows.Next() {
		var tag, name, badgeToken, abbreviation string
		var level, memberCount int
		var clanChannel, category, greeting, autoGreetOption, banAlertChannel *string
		if err := rows.Scan(
			&tag, &name, &badgeToken, &level, &memberCount,
			&abbreviation, &clanChannel, &category, &greeting,
			&autoGreetOption, &banAlertChannel,
		); err != nil {
			return nil, err
		}
		items = append(items, modelsv2.ClanListItem{
			Tag: tag, Name: name, BadgeURL: serverClanBadgeURL(badgeToken),
			Level: &level, MemberCount: &memberCount,
			Settings: modelsv2.ClanSettings{
				ClanChannel: clanChannel, Category: category, Abbreviation: &abbreviation,
				Greeting: greeting, AutoGreetOption: autoGreetOption, BanAlertChannel: banAlertChannel,
			},
		})
	}
	return items, rows.Err()
}

func serverClanBadgeURL(token string) *string {
	token = strings.TrimSpace(strings.TrimSuffix(token, ".png"))
	if token == "" {
		return nil
	}
	url := "https://api-assets.clashofclans.com/badges/200/" + token + ".png"
	return &url
}

func serverClanBadgeToken(rawURL string) string {
	value := strings.TrimSpace(strings.SplitN(rawURL, "?", 2)[0])
	if index := strings.LastIndex(value, "/"); index >= 0 {
		value = value[index+1:]
	}
	return strings.TrimSuffix(value, ".png")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func buildServerClanListItem(clanDoc map[string]any) modelsv2.ClanListItem {
	return modelsv2.ClanListItem{
		Tag:         serverAsString(clanDoc["tag"]),
		Name:        serverAsString(clanDoc["name"]),
		BadgeURL:    nil,
		Level:       nil,
		MemberCount: nil,
		Settings: modelsv2.ClanSettings{
			ClanChannel:     stringPtrMaybe(clanDoc["clan_channel"]),
			Category:        stringPtrMaybe(clanDoc["category"]),
			Abbreviation:    stringPtrMaybe(clanDoc["abbreviation"]),
			Greeting:        stringPtrMaybe(clanDoc["greeting"]),
			AutoGreetOption: stringPtrMaybe(clanDoc["auto_greet_option"]),
			BanAlertChannel: stringPtrMaybe(clanDoc["ban_alert_channel"]),
		},
	}
}

func clanSettingsDetailFromDoc(doc map[string]any) modelsv2.ClanSettingsDetail {
	item := buildServerClanListItem(doc)
	return modelsv2.ClanSettingsDetail{
		Tag:             item.Tag,
		Name:            item.Name,
		ServerID:        asIntWithDefault(doc["server"], 0),
		ClanChannel:     item.Settings.ClanChannel,
		Category:        item.Settings.Category,
		Abbreviation:    item.Settings.Abbreviation,
		Greeting:        item.Settings.Greeting,
		AutoGreetOption: item.Settings.AutoGreetOption,
		BanAlertChannel: item.Settings.BanAlertChannel,
	}
}

func clanUpdateMap(body modelsv2.ClanSettingsUpdate) map[string]any {
	update := map[string]any{}
	if body.ClanChannel != nil {
		update["clan_channel"] = body.ClanChannel
	}
	if body.Category != nil {
		update["category"] = *body.Category
	}
	if body.Abbreviation != nil {
		update["abbreviation"] = *body.Abbreviation
	}
	if body.Greeting != nil {
		update["greeting"] = *body.Greeting
	}
	if body.AutoGreetOption != nil {
		update["auto_greet_option"] = *body.AutoGreetOption
	}
	if body.BanAlertChannel != nil {
		update["ban_alert_channel"] = body.BanAlertChannel
	}
	return update
}

func boolAt(doc map[string]any, key string) any {
	if doc == nil {
		return false
	}
	if value, ok := doc[key].(bool); ok {
		return value
	}
	return false
}
