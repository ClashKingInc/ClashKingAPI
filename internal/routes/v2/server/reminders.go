package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// getServerReminders godoc
// @Summary Get server reminders
// @Description Returns all reminders for a server grouped by type.
// @Tags Server Reminders
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/reminders [get]
func getServerReminders(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		reminders, err := sqlReminderRows(c, rt, serverID)
		if err != nil {
			return err
		}
		response := modelsv2.ServerRemindersResponse{
			WarReminders:        []modelsv2.ReminderConfig{},
			CapitalReminders:    []modelsv2.ReminderConfig{},
			ClanGamesReminders:  []modelsv2.ReminderConfig{},
			InactivityReminders: []modelsv2.ReminderConfig{},
			RosterReminders:     []modelsv2.ReminderConfig{},
		}
		for _, reminder := range reminders {
			item := reminderConfigFromDoc(reminder)
			switch serverAsString(reminder["type"]) {
			case "War":
				response.WarReminders = append(response.WarReminders, item)
			case "Clan Capital":
				response.CapitalReminders = append(response.CapitalReminders, item)
			case "Clan Games":
				response.ClanGamesReminders = append(response.ClanGamesReminders, item)
			case "Inactivity":
				response.InactivityReminders = append(response.InactivityReminders, item)
			case "roster":
				response.RosterReminders = append(response.RosterReminders, item)
			}
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// createReminder godoc
// @Summary Create a reminder
// @Description Creates a new reminder (war, capital, clan games, inactivity, or roster).
// @Tags Server Reminders
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/reminders [post]
func createReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if err := sqlEnsureServer(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.CreateReminderRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		doc := map[string]any{
			"type":    body.Type,
			"server":  serverID,
			"channel": body.ChannelID,
			"time":    body.Time,
		}
		if body.ClanTag != "" {
			doc["clan"] = serverNormalizeTag(body.ClanTag)
		}
		if body.CustomText != "" {
			doc["custom_text"] = body.CustomText
		}
		if body.TownhallFilter != nil {
			if body.Type == "Clan Capital" || body.Type == "Clan Games" {
				doc["townhalls"] = body.TownhallFilter
			} else {
				doc["townhall_filter"] = body.TownhallFilter
			}
		}
		if body.Roles != nil {
			doc["roles"] = body.Roles
		}
		if body.WarTypes != nil {
			doc["types"] = body.WarTypes
		}
		if body.PointThreshold != nil {
			doc["point_threshold"] = body.PointThreshold
		}
		if body.AttackThreshold != nil {
			doc["attack_threshold"] = body.AttackThreshold
		}
		if body.RosterID != "" {
			doc["roster"] = body.RosterID
		}
		if body.PingType != "" {
			doc["ping_type"] = body.PingType
		}
		threshold := reminderThreshold(body.PointThreshold, body.AttackThreshold)
		var reminderID string
		err = rt.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO reminders (
				server_id, type, type_name, clan_tag, webhook_token, channel_id, thread_id,
				minutes_remaining, trigger_time, custom_text, townhalls, roles, war_type_names,
				trigger_threshold, point_threshold, attack_threshold, roster_id, ping_type, data,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, '', $5, NULL,
				$6, $7, $8, $9, $10, $11,
				$12, $13::jsonb, $14::jsonb, NULLIF($15, ''), NULLIF($16, ''), $17::jsonb,
				now(), now()
			)
			RETURNING id::text
		`,
			strconv.Itoa(serverID),
			reminderTypeCode(body.Type),
			body.Type,
			serverNormalizeTag(body.ClanTag),
			body.ChannelID,
			reminderMinutes(body.Time),
			body.Time,
			body.CustomText,
			body.TownhallFilter,
			body.Roles,
			body.WarTypes,
			threshold,
			jsonMaybe(body.PointThreshold),
			jsonMaybe(body.AttackThreshold),
			body.RosterID,
			body.PingType,
			apptypes.Marshal(doc),
		).Scan(&reminderID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ReminderOperationResponse{Message: "Reminder created successfully", ReminderID: reminderID, ServerID: serverID})
	}
}

// updateReminder godoc
// @Summary Update a reminder
// @Description Updates an existing reminder by ID.
// @Tags Server Reminders
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param reminder_id path string true "Reminder ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/reminders/{reminder_id} [put]
func updateReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id := c.Params("reminder_id")
		var body modelsv2.UpdateReminderRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		existing, err := sqlReminderRow(c, rt, serverID, id)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		existingType := serverAsString(existing["type"])
		update := reminderUpdateMap(body, existingType)
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			UPDATE reminders
			SET channel_id = COALESCE($3, channel_id),
				trigger_time = COALESCE($4, trigger_time),
				minutes_remaining = COALESCE($5, minutes_remaining),
				custom_text = COALESCE($6, custom_text),
				townhalls = COALESCE($7, townhalls),
				roles = COALESCE($8, roles),
				war_type_names = COALESCE($9, war_type_names),
				point_threshold = COALESCE($10::jsonb, point_threshold),
				attack_threshold = COALESCE($11::jsonb, attack_threshold),
				ping_type = COALESCE($12, ping_type),
				trigger_threshold = COALESCE($13, trigger_threshold),
				data = data || $14::jsonb,
				updated_at = now()
			WHERE server_id = $1 AND id = $2::uuid
		`,
			strconv.Itoa(serverID),
			id,
			updateString(update, "channel"),
			updateString(update, "time"),
			updateReminderMinutes(update),
			updateString(update, "custom_text"),
			updateIntSlice(update, "townhall_filter", "townhalls"),
			updateStringSlice(update, "roles"),
			updateStringSlice(update, "types"),
			updateJSON(update, "point_threshold"),
			updateJSON(update, "attack_threshold"),
			updateString(update, "ping_type"),
			updateThreshold(update),
			apptypes.Marshal(update),
		)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ReminderOperationResponse{Message: "Reminder updated successfully", ReminderID: c.Params("reminder_id"), ServerID: serverID})
	}
}

// deleteReminder godoc
// @Summary Delete a reminder
// @Description Deletes a reminder by ID.
// @Tags Server Reminders
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param reminder_id path string true "Reminder ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/reminders/{reminder_id} [delete]
func deleteReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id := c.Params("reminder_id")
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM reminders WHERE server_id = $1 AND id = $2::uuid`, strconv.Itoa(serverID), id)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ReminderOperationResponse{Message: "Reminder deleted successfully", ReminderID: c.Params("reminder_id"), ServerID: serverID})
	}
}

func reminderConfigFromDoc(reminder map[string]any) modelsv2.ReminderConfig {
	reminderType := serverAsString(reminder["type"])
	var thFilter []int
	if reminderType == "Clan Capital" || reminderType == "Clan Games" {
		thFilter = intSlice(reminder["townhalls"])
	} else {
		thFilter = intSlice(reminder["townhall_filter"])
	}
	return modelsv2.ReminderConfig{
		ID:              serverAsString(reminder["_id"]),
		Type:            reminderType,
		ClanTag:         stringPtrMaybe(reminder["clan"]),
		ChannelID:       stringPtrMaybe(reminder["channel"]),
		Time:            serverAsString(reminder["time"]),
		CustomText:      stringPtrMaybe(reminder["custom_text"]),
		TownhallFilter:  thFilter,
		Roles:           stringSlice(reminder["roles"]),
		WarTypes:        stringSlice(reminder["types"]),
		PointThreshold:  reminder["point_threshold"],
		AttackThreshold: reminder["attack_threshold"],
		RosterID:        stringPtrMaybe(reminder["roster"]),
		PingType:        stringPtrMaybe(reminder["ping_type"]),
	}
}

func reminderUpdateMap(body modelsv2.UpdateReminderRequest, existingType string) map[string]any {
	update := map[string]any{}
	if body.ChannelID != nil {
		update["channel"] = numericMaybe(*body.ChannelID)
	}
	if body.Time != nil {
		update["time"] = *body.Time
	}
	if body.CustomText != nil {
		update["custom_text"] = *body.CustomText
	}
	if body.TownhallFilter != nil {
		if existingType == "Clan Capital" || existingType == "Clan Games" {
			update["townhalls"] = body.TownhallFilter
		} else {
			update["townhall_filter"] = body.TownhallFilter
		}
	}
	if body.Roles != nil {
		update["roles"] = body.Roles
	}
	if body.WarTypes != nil {
		update["types"] = body.WarTypes
	}
	if body.PointThreshold != nil {
		update["point_threshold"] = body.PointThreshold
	}
	if body.AttackThreshold != nil {
		update["attack_threshold"] = body.AttackThreshold
	}
	if body.PingType != nil {
		update["ping_type"] = *body.PingType
	}
	return update
}

func sqlReminderRows(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT id::text, type_name, clan_tag, channel_id, trigger_time, custom_text, townhalls,
			roles, war_type_names, point_threshold, attack_threshold, roster_id, ping_type
		FROM reminders
		WHERE server_id = $1
		ORDER BY created_at ASC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		item, err := scanReminderRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func sqlReminderRow(c *fiber.Ctx, rt apptypes.Deps, serverID int, reminderID string) (map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT id::text, type_name, clan_tag, channel_id, trigger_time, custom_text, townhalls,
			roles, war_type_names, point_threshold, attack_threshold, roster_id, ping_type
		FROM reminders
		WHERE server_id = $1 AND id = $2::uuid
		LIMIT 1
	`, strconv.Itoa(serverID), reminderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, pgx.ErrNoRows
	}
	return scanReminderRows(rows)
}

type reminderScanner interface {
	Scan(dest ...any) error
}

func scanReminderRows(row reminderScanner) (map[string]any, error) {
	var id, reminderType string
	var clanTag, channelID, triggerTime, customText, rosterID, pingType *string
	var townhalls []int
	var roles, warTypes []string
	var pointRaw, attackRaw []byte
	if err := row.Scan(&id, &reminderType, &clanTag, &channelID, &triggerTime, &customText, &townhalls, &roles, &warTypes, &pointRaw, &attackRaw, &rosterID, &pingType); err != nil {
		return nil, err
	}
	out := map[string]any{
		"_id":              id,
		"type":             reminderType,
		"townhall_filter":  townhalls,
		"townhalls":        townhalls,
		"roles":            roles,
		"types":            warTypes,
		"point_threshold":  decodeJSONAny(pointRaw),
		"attack_threshold": decodeJSONAny(attackRaw),
	}
	setStringIfPresent(out, "clan", clanTag)
	setStringIfPresent(out, "channel", channelID)
	setStringIfPresent(out, "time", triggerTime)
	setStringIfPresent(out, "custom_text", customText)
	setStringIfPresent(out, "roster", rosterID)
	setStringIfPresent(out, "ping_type", pingType)
	return out, nil
}

func sqlEnsureServer(c *fiber.Ctx, rt apptypes.Deps, serverID int) error {
	if rt.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var found int
	return rt.Store.SQL.QueryRow(c.UserContext(), `SELECT 1 FROM servers WHERE id = $1 LIMIT 1`, strconv.Itoa(serverID)).Scan(&found)
}

func reminderTypeCode(value string) int {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "war":
		return 1
	case "clan capital":
		return 2
	case "clan games":
		return 3
	case "inactivity":
		return 4
	case "roster":
		return 5
	default:
		return 0
	}
}

func reminderMinutes(value string) int {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return 0
	}
	multiplier := 1.0
	switch {
	case strings.HasSuffix(value, "hr"):
		multiplier = 60
		value = strings.TrimSuffix(value, "hr")
	case strings.HasSuffix(value, "h"):
		multiplier = 60
		value = strings.TrimSuffix(value, "h")
	case strings.HasSuffix(value, "m"):
		value = strings.TrimSuffix(value, "m")
	case strings.HasSuffix(value, "min"):
		value = strings.TrimSuffix(value, "min")
	}
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil {
		return 0
	}
	return int(parsed * multiplier)
}

func reminderThreshold(values ...any) *int {
	for _, value := range values {
		switch typed := value.(type) {
		case int:
			return &typed
		case float64:
			out := int(typed)
			return &out
		}
	}
	return nil
}

func jsonMaybe(value any) *string {
	if value == nil {
		return nil
	}
	out := apptypes.Marshal(value)
	return &out
}

func updateString(update map[string]any, key string) *string {
	value, ok := update[key]
	if !ok {
		return nil
	}
	out := serverAsString(value)
	return &out
}

func updateStringSlice(update map[string]any, key string) []string {
	value, ok := update[key]
	if !ok {
		return nil
	}
	return stringSlice(value)
}

func updateIntSlice(update map[string]any, keys ...string) []int {
	for _, key := range keys {
		value, ok := update[key]
		if ok {
			return intSlice(value)
		}
	}
	return nil
}

func updateJSON(update map[string]any, key string) *string {
	value, ok := update[key]
	if !ok {
		return nil
	}
	return jsonMaybe(value)
}

func updateReminderMinutes(update map[string]any) *int {
	value, ok := update["time"]
	if !ok {
		return nil
	}
	out := reminderMinutes(serverAsString(value))
	return &out
}

func updateThreshold(update map[string]any) *int {
	if value := reminderThreshold(update["point_threshold"], update["attack_threshold"]); value != nil {
		return value
	}
	return nil
}

func decodeJSONAny(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func setStringIfPresent(out map[string]any, key string, value *string) {
	if value != nil {
		out[key] = *value
	}
}

func intSlice(value any) []int {
	raw, ok := value.([]any)
	if !ok {
		if typed, ok := value.([]int); ok {
			return typed
		}
		return nil
	}
	out := make([]int, 0, len(raw))
	for _, item := range raw {
		out = append(out, asIntWithDefault(item, 0))
	}
	return out
}
