package v1

import (
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// clanBasic godoc
// @Summary Basic Clan Object
// @Description Returns the cached clan object for a clan tag.
// @Tags Clan Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/basic [get]
func clanBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var row bson.M
		err := a.Store.DB.Looper.Collection("clan_tags").FindOne(c.UserContext(), bson.M{"tag": clanFixTag(c.Params("clan_tag"))}).Decode(&row)
		if err != nil {
			return apptypes.JSON(c, fiber.StatusOK, nil)
		}
		return apptypes.JSON(c, fiber.StatusOK, clanWithoutID(row))
	}
}

// clanJoinLeave godoc
// @Summary Join leaves in a season
// @Description Returns join and leave history for a clan tag.
// @Tags Clan Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/join-leave [get]
func clanJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		filter := bson.M{
			"clan": clanFixTag(c.Params("clan_tag")),
			"time": bson.M{
				"$gte": clanParseInt64Default(c.Query("timestamp_start"), 0),
				"$lte": clanParseInt64Default(c.Query("time_stamp_end"), 9999999999),
			},
		}
		cur, err := a.Store.DB.Looper.Collection("join_leave_history").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": clanStripIDs(rows)})
	}
}

// clanSearch godoc
// @Summary Search clans by filtering
// @Description Returns clans filtered by location, membership, and limit options.
// @Tags Clan Endpoints
// @Produce json
// @Param location_id query int false "Location ID"
// @Param limit query int false "Maximum number of results"
// @Param member_list query bool false "Include member list"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/search [get]
func clanSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		filter := bson.M{}
		if locationID := c.Query("location_id"); locationID != "" {
			filter["location.id"] = clanParseIntDefault(locationID, 0)
		}
		cur, err := a.Store.DB.Looper.Collection("clan_tags").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		limit := clanParseIntDefault(c.Query("limit"), 100)
		if len(rows) > limit {
			rows = rows[:limit]
		}
		memberList, _ := apptypes.QueryBool(c, "member_list", true)
		items := make([]bson.M, 0, len(rows))
		for _, row := range rows {
			clean := clanWithoutID(row)
			if !memberList {
				delete(clean, "memberList")
			}
			items = append(items, clean)
		}
		resp := map[string]any{"items": items, "before": "", "after": ""}
		if len(rows) > 0 {
			resp["before"] = rows[0]["_id"]
			resp["after"] = rows[len(rows)-1]["_id"]
		}
		return apptypes.JSON(c, fiber.StatusOK, resp)
	}
}

// clanHistorical godoc
// @Summary Historical data for a clan
// @Description Returns historical player data for a clan tag.
// @Tags Clan Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/historical [get]
func clanHistorical(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		filter := bson.M{
			"clan": clanFixTag(c.Params("clan_tag")),
			"time": bson.M{
				"$gte": clanParseInt64Default(c.Query("timestamp_start"), 0),
				"$lte": clanParseInt64Default(c.Query("time_stamp_end"), 9999999999),
			},
		}
		cur, err := a.Store.DB.NewLooper.Collection("player_history").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": clanStripIDs(rows)})
	}
}

func clanParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func clanParseInt64Default(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func clanFixTag(tag string) string {
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func clanStripIDs(rows []bson.M) []bson.M {
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		out = append(out, clanWithoutID(row))
	}
	return out
}

func clanWithoutID(doc bson.M) bson.M {
	clean := bson.M{}
	for key, value := range doc {
		if key == "_id" {
			continue
		}
		clean[key] = value
	}
	return clean
}
