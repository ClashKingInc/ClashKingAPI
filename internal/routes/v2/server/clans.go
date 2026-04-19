package server

import (
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// getServerClanSettings godoc
// @Summary Get clan settings
// @Description Returns detailed settings for a specific clan on a server.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clan/{clan_tag}/settings [get]
func getServerClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		doc, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, bson.M{"tag": tag, "server": serverID})
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
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clans-basic [get]
func getServerClansBasic(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
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
// @Description Returns the full clan list for a server with live CoC API data.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clans [get]
func getServerClans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil || serverDoc == nil {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}

		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}

		items := make([]modelsv2.ClanListItem, 0, len(clans))
		for _, clanDoc := range clans {
			item := buildServerClanListItem(clanDoc)
			if rt.Clash != nil {
				if liveClan, err := rt.Clash.GetClan(c.UserContext(), serverAsString(clanDoc["tag"])); err == nil && liveClan != nil {
					if liveClan.Name != "" {
						item.Name = liveClan.Name
					}
					if liveClan.Badge.Medium != "" {
						item.BadgeURL = &liveClan.Badge.Medium
					} else if liveClan.Badge.URL != "" {
						item.BadgeURL = &liveClan.Badge.URL
					}
					if liveClan.Level > 0 {
						item.Level = liveClan.Level
					}
					if liveClan.MemberCount > 0 {
						item.MemberCount = liveClan.MemberCount
					}
				}
			}
			items = append(items, item)
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": update})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server or clan not found")
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag is required")
		}
		clanName := body.Name
		doc := bson.M{"tag": tag, "server": serverID}
		if clanName != "" {
			doc["name"] = clanName
		}
		if clanName == "" && rt.Clash != nil {
			if clanDoc, err := rt.Clash.GetClan(c.UserContext(), tag); err == nil && clanDoc != nil {
				clanName = clanDoc.Name
				doc["name"] = clanName
			}
		}
		_, err = rt.Store.C.ClanDB.InsertOne(c.UserContext(), doc)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AddClanResponse{Message: "Clan added successfully", ServerID: serverID, ClanTag: tag, ClanName: clanName})
	}
}

// removeServerClan godoc
// @Summary Remove a clan from the server
// @Description Removes a clan from the Discord server tracking list.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clans/{clan_tag} [delete]
func removeServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.C.ClanDB.DeleteOne(c.UserContext(), bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RemoveClanResponse{Message: "Clan removed successfully", ServerID: serverID, ClanTag: tag, DeletedCount: result.DeletedCount})
	}
}

func buildServerClanListItem(clanDoc map[string]any) modelsv2.ClanListItem {
	logs, _ := clanDoc["logs"].(map[string]any)
	joinLog, _ := logs["join_log"].(map[string]any)
	leaveLog, _ := logs["leave_log"].(map[string]any)

	return modelsv2.ClanListItem{
		Tag:         serverAsString(clanDoc["tag"]),
		Name:        serverAsString(clanDoc["name"]),
		BadgeURL:    nil,
		Level:       nil,
		MemberCount: nil,
		Settings: modelsv2.ClanSettings{
			GeneralRole:       stringPtrMaybe(clanDoc["generalRole"]),
			LeaderRole:        stringPtrMaybe(clanDoc["leaderRole"]),
			ClanChannel:       stringPtrMaybe(clanDoc["clanChannel"]),
			Category:          clanDoc["category"],
			Abbreviation:      clanDoc["abbreviation"],
			Greeting:          clanDoc["greeting"],
			AutoGreetOption:   clanDoc["auto_greet_option"],
			LeadershipEval:    clanDoc["leadership_eval"],
			WarCountdown:      stringPtrMaybe(clanDoc["warCountdown"]),
			WarTimerCountdown: stringPtrMaybe(clanDoc["warTimerCountdown"]),
			BanAlertChannel:   stringPtrMaybe(clanDoc["ban_alert_channel"]),
			MemberCountWarning: &modelsv2.MemberCountWarning{
				Channel: stringPtrMaybe(valueAtPath(clanDoc, "member_count_warning.channel")),
				Above:   valueAtPath(clanDoc, "member_count_warning.above"),
				Below:   valueAtPath(clanDoc, "member_count_warning.below"),
				Role:    stringPtrMaybe(valueAtPath(clanDoc, "member_count_warning.role")),
			},
			Logs: &modelsv2.ClanLogSettings{
				JoinLog: &modelsv2.LogButtonSettings{
					ProfileButton: boolPtrMaybe(joinLog["profile_button"]),
				},
				LeaveLog: &modelsv2.LogButtonSettings{
					StrikeButton: boolPtrMaybe(leaveLog["strike_button"]),
					BanButton:    boolPtrMaybe(leaveLog["ban_button"]),
				},
			},
		},
	}
}

func clanSettingsDetailFromDoc(doc map[string]any) modelsv2.ClanSettingsDetail {
	item := buildServerClanListItem(doc)
	return modelsv2.ClanSettingsDetail{
		Tag:                item.Tag,
		Name:               item.Name,
		Server:             asIntWithDefault(doc["server"], 0),
		GeneralRole:        item.Settings.GeneralRole,
		LeaderRole:         item.Settings.LeaderRole,
		ClanChannel:        item.Settings.ClanChannel,
		Category:           item.Settings.Category,
		Abbreviation:       item.Settings.Abbreviation,
		Greeting:           item.Settings.Greeting,
		AutoGreetOption:    item.Settings.AutoGreetOption,
		LeadershipEval:     item.Settings.LeadershipEval,
		WarCountdown:       item.Settings.WarCountdown,
		WarTimerCountdown:  item.Settings.WarTimerCountdown,
		BanAlertChannel:    item.Settings.BanAlertChannel,
		MemberCountWarning: item.Settings.MemberCountWarning,
		Logs:               item.Settings.Logs,
	}
}

func clanUpdateMap(body modelsv2.ClanSettingsUpdate) bson.M {
	update := bson.M{}
	if body.GeneralRole != nil {
		update["generalRole"] = body.GeneralRole
	} else if body.MemberRole != nil {
		update["generalRole"] = body.MemberRole
	}
	if body.LeaderRole != nil {
		update["leaderRole"] = body.LeaderRole
	} else if body.LeaderRoleAlias != nil {
		update["leaderRole"] = body.LeaderRoleAlias
	}
	if body.ClanChannel != nil {
		update["clanChannel"] = body.ClanChannel
	} else if body.ClanChannelAlias != nil {
		update["clanChannel"] = body.ClanChannelAlias
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
	if body.LeadershipEval != nil {
		update["leadership_eval"] = *body.LeadershipEval
	}
	if body.WarCountdown != nil {
		update["warCountdown"] = body.WarCountdown
	} else if body.WarCountdownAlias != nil {
		update["warCountdown"] = body.WarCountdownAlias
	}
	if body.WarTimerCountdown != nil {
		update["warTimerCountdown"] = body.WarTimerCountdown
	} else if body.WarTimerCountdownAlt != nil {
		update["warTimerCountdown"] = body.WarTimerCountdownAlt
	}
	if body.BanAlertChannel != nil {
		update["ban_alert_channel"] = body.BanAlertChannel
	}
	if body.MemberCountWarning != nil {
		if body.MemberCountWarning.Channel != nil {
			update["member_count_warning.channel"] = body.MemberCountWarning.Channel
		}
		if body.MemberCountWarning.Above != nil {
			update["member_count_warning.above"] = body.MemberCountWarning.Above
		}
		if body.MemberCountWarning.Below != nil {
			update["member_count_warning.below"] = body.MemberCountWarning.Below
		}
		if body.MemberCountWarning.Role != nil {
			update["member_count_warning.role"] = body.MemberCountWarning.Role
		}
	}
	if body.JoinLogProfileButton != nil {
		update["logs.join_log.profile_button"] = *body.JoinLogProfileButton
	}
	if body.LeaveLogStrikeButton != nil {
		update["logs.leave_log.strike_button"] = *body.LeaveLogStrikeButton
	}
	if body.LeaveLogBanButton != nil {
		update["logs.leave_log.ban_button"] = *body.LeaveLogBanButton
	}
	return update
}

func valueAtPath(doc map[string]any, path string) any {
	current := any(doc)
	for _, key := range []string{"member_count_warning", "channel"} {
		_ = key
	}
	parts := []string{}
	start := 0
	for i := 0; i <= len(path); i++ {
		if i == len(path) || path[i] == '.' {
			parts = append(parts, path[start:i])
			start = i + 1
		}
	}
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = m[part]
	}
	return current
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
