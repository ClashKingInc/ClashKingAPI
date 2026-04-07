package routes

import (
	"net/http"

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
		response := map[string]any{
			"war_reminders":        []any{},
			"capital_reminders":    []any{},
			"clan_games_reminders": []any{},
			"inactivity_reminders": []any{},
			"roster_reminders":     []any{},
		}
		for _, reminder := range reminders {
			item := sanitize(reminder)
			switch serverAsString(reminder["type"]) {
			case "War":
				response["war_reminders"] = append(response["war_reminders"].([]any), item)
			case "Clan Capital":
				response["capital_reminders"] = append(response["capital_reminders"].([]any), item)
			case "Clan Games":
				response["clan_games_reminders"] = append(response["clan_games_reminders"].([]any), item)
			case "Inactivity":
				response["inactivity_reminders"] = append(response["inactivity_reminders"].([]any), item)
			case "roster":
				response["roster_reminders"] = append(response["roster_reminders"].([]any), item)
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
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server"] = serverID
		result, err := rt.Store.C.Reminders.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder created successfully", "reminder_id": sanitizeObjectID(result.InsertedID), "server_id": serverID})
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
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.Reminders.UpdateOne(c.UserContext(), bson.M{"_id": id, "server": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder updated successfully", "reminder_id": c.Params("reminder_id"), "server_id": serverID})
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
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder deleted successfully", "reminder_id": c.Params("reminder_id"), "server_id": serverID})
	}
}
