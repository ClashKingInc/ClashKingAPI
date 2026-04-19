package server

import (
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
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
		reminders, err := findManyMaps(c.UserContext(), rt.Store.C.Reminders, bson.M{"server": serverID})
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
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.CreateReminderRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		doc := bson.M{
			"type":    body.Type,
			"server":  serverID,
			"channel": numericMaybe(body.ChannelID),
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
			id, err := objectID(body.RosterID)
			if err == nil {
				doc["roster"] = id
			}
		}
		if body.PingType != "" {
			doc["ping_type"] = body.PingType
		}
		result, err := rt.Store.C.Reminders.InsertOne(c.UserContext(), doc)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ReminderOperationResponse{Message: "Reminder created successfully", ReminderID: serverAsString(sanitizeObjectID(result.InsertedID)), ServerID: serverID})
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
		id, err := objectID(c.Params("reminder_id"))
		if err != nil {
			return err
		}
		var body modelsv2.UpdateReminderRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		existing, err := findOneMap(c.UserContext(), rt.Store.C.Reminders, bson.M{"_id": id, "server": serverID})
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		existingType := serverAsString(existing["type"])
		update := reminderUpdateMap(body, existingType)
		result, err := rt.Store.C.Reminders.UpdateOne(c.UserContext(), bson.M{"_id": id}, bson.M{"$set": update})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
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
		id, err := objectID(c.Params("reminder_id"))
		if err != nil {
			return err
		}
		result, err := rt.Store.C.Reminders.DeleteOne(c.UserContext(), bson.M{"_id": id, "server": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
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

func reminderUpdateMap(body modelsv2.UpdateReminderRequest, existingType string) bson.M {
	update := bson.M{}
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
