package v1

import (
	"strings"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// districtStats godoc
// @Summary Capital district stats
// @Description Returns capital raid weekends for the requested weekend.
// @Tags Clan Capital Endpoints
// @Produce json
// @Param weekend query string false "Weekend"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/stats/district [get]
func districtStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		weekend := c.Query("weekend")
		cur, err := a.Store.DB.Cache.Collection("capital_raids").Find(c.UserContext(), bson.M{"data.startTime": bson.M{"$regex": strings.ReplaceAll(weekend, "-", "")}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, capitalStripIDs(rows))
	}
}

// leagueStats godoc
// @Summary Capital league stats
// @Description Returns capital raid weekends grouped as league stats for the requested weekend.
// @Tags Clan Capital Endpoints
// @Produce json
// @Param weekend query string false "Weekend"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/stats/leagues [get]
func leagueStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		weekend := c.Query("weekend")
		cur, err := a.Store.DB.Cache.Collection("capital_raids").Find(c.UserContext(), bson.M{"data.startTime": bson.M{"$regex": strings.ReplaceAll(weekend, "-", "")}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": capitalStripIDs(rows)})
	}
}

// capitalLog godoc
// @Summary Log of Raid Weekends
// @Description Returns raid weekend logs for a clan tag.
// @Tags Clan Capital Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/{clan_tag} [get]
func capitalLog(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		cur, err := a.Store.DB.Cache.Collection("capital_raids").Find(c.UserContext(), bson.M{"clan_tag": capitalFixTag(c.Params("clan_tag"))})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, capitalStripIDs(rows))
	}
}

// capitalBulk godoc
// @Summary Fetch Raid Weekends in Bulk
// @Description Returns raid weekend documents for up to one hundred clan tags.
// @Tags Clan Capital Endpoints
// @Produce json
// @Param body body modelsv1.V1CapitalClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/bulk [post]
func capitalBulk(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv1.V1CapitalClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		cur, err := a.Store.DB.Cache.Collection("capital_raids").Find(c.UserContext(), bson.M{"clan_tag": bson.M{"$in": capitalFixTags(body.ClanTags[:capitalMin(len(body.ClanTags), 100)])}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		grouped := map[string][]any{}
		for _, row := range rows {
			tag := capitalFixTag(capitalAsString(row["clan_tag"]))
			data, _ := row["data"].(bson.M)
			grouped[tag] = append(grouped[tag], data)
		}
		return apptypes.JSON(c, fiber.StatusOK, grouped)
	}
}

func capitalMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func capitalFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, capitalFixTag(tag))
	}
	return out
}

func capitalFixTag(tag string) string {
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func capitalAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func capitalStripIDs(rows []bson.M) []bson.M {
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		clean := bson.M{}
		for key, value := range row {
			if key == "_id" {
				continue
			}
			clean[key] = value
		}
		out = append(out, clean)
	}
	return out
}
