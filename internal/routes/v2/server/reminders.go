package server

import (
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

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
			"type":       body.Type,
			"server":     serverID,
			"channel_id": body.ChannelID,
			"time":       body.Time,
		}
		if body.ClanTag != "" {
			doc["clan_tag"] = serverNormalizeTag(body.ClanTag)
		}
		if body.CustomText != "" {
			doc["custom_text"] = body.CustomText
		}
		if body.TownhallFilter != nil {
			doc["townhall_filter"] = body.TownhallFilter
		}
		if body.Roles != nil {
			doc["roles"] = body.Roles
		}
		if body.WarTypes != nil {
			doc["war_types"] = body.WarTypes
		}
		if body.PointThreshold != nil {
			doc["point_threshold"] = body.PointThreshold
		}
		if body.AttackThreshold != nil {
			doc["attack_threshold"] = body.AttackThreshold
		}
		if body.RosterID != "" {
			doc["roster_id"] = body.RosterID
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
		update := reminderUpdateMap(body)
		result, err := rt.Store.C.Reminders.UpdateOne(c.UserContext(), bson.M{"_id": id, "server": serverID}, bson.M{"$set": update})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ReminderOperationResponse{Message: "Reminder updated successfully", ReminderID: c.Params("reminder_id"), ServerID: serverID})
	}
}

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
	return modelsv2.ReminderConfig{
		ID:              serverAsString(reminder["_id"]),
		Type:            serverAsString(reminder["type"]),
		ClanTag:         stringPtrMaybe(reminder["clan_tag"]),
		ChannelID:       stringPtrMaybe(reminder["channel_id"]),
		Time:            serverAsString(reminder["time"]),
		CustomText:      stringPtrMaybe(reminder["custom_text"]),
		TownhallFilter:  intSlice(reminder["townhall_filter"]),
		Roles:           stringSlice(reminder["roles"]),
		WarTypes:        stringSlice(reminder["war_types"]),
		PointThreshold:  reminder["point_threshold"],
		AttackThreshold: reminder["attack_threshold"],
		RosterID:        stringPtrMaybe(reminder["roster_id"]),
		PingType:        stringPtrMaybe(reminder["ping_type"]),
	}
}

func reminderUpdateMap(body modelsv2.UpdateReminderRequest) bson.M {
	update := bson.M{}
	if body.ChannelID != nil {
		update["channel_id"] = *body.ChannelID
	}
	if body.Time != nil {
		update["time"] = *body.Time
	}
	if body.CustomText != nil {
		update["custom_text"] = *body.CustomText
	}
	if body.TownhallFilter != nil {
		update["townhall_filter"] = body.TownhallFilter
	}
	if body.Roles != nil {
		update["roles"] = body.Roles
	}
	if body.WarTypes != nil {
		update["war_types"] = body.WarTypes
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
