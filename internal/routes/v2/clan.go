package v2

import (
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// clanRanking godoc
// @Summary Get ranking of a clan
// @Description Returns the cached ranking document for a clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/ranking [get]
func clanRanking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var row bson.M
		err := a.Store.DB.NewLooper.Collection("clan_leaderboard_db").FindOne(c.UserContext(), bson.M{"tag": clanFixTag(c.Params("clan_tag"))}).Decode(&row)
		if err != nil {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanRankingResponse{Tag: clanFixTag(c.Params("clan_tag"))})
		}
		return apptypes.JSON(c, fiber.StatusOK, clanWithoutID(row))
	}
}

// boardTotals godoc
// @Summary Get aggregated board totals for a clan
// @Description Returns aggregate board totals for one or more player tags.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param body body modelsv2.ClanPlayerTagsBody false "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/board/totals [get]
func boardTotals(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanPlayerTagsBody
		if len(c.Body()) > 0 {
			_ = apptypes.DecodeJSON(c, &body)
		}
		if len(body.PlayerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}
		filter := bson.M{"tag": bson.M{"$in": clanFixTags(body.PlayerTags)}}
		cur, err := a.Store.DB.NewLooper.Collection("player_stats").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BoardTotalsResponse{
			Tag:                clanFixTag(c.Params("clan_tag")),
			TrackedPlayerCount: len(rows),
			Activity:           len(rows),
		})
	}
}

// clanDonationsSingle godoc
// @Summary Get clan donations
// @Description Returns donation totals for a single clan and season.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/donations/{season} [get]
func clanDonationsSingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := clanFixTag(c.Params("clan_tag"))
		season := c.Params("season")
		var row bson.M
		if err := a.Store.DB.NewLooper.Collection("clan_stats").FindOne(c.UserContext(), bson.M{"tag": clanTag}).Decode(&row); err != nil {
			return err
		}
		seasonData, _ := row[season].(bson.M)
		items := make([]modelsv2.DonationEntry, 0, len(seasonData))
		for tag, raw := range seasonData {
			doc, _ := raw.(bson.M)
			items = append(items, modelsv2.DonationEntry{Tag: tag, Donated: doc["donated"], Received: doc["received"]})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// clanComposition godoc
// @Summary Get composition of a clan or clans
// @Description Returns town hall, role, and league composition for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param clan_tags query []string false "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/compo [get]
func clanComposition(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags := clanFixTags(apptypes.QueryValues(c, "clan_tags"))
		if len(tags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags is required")
		}
		buckets := map[string]map[string]int{
			"townhall": {},
			"role":     {},
			"league":   {},
		}
		totalMembers := 0
		for _, tag := range tags {
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || clan == nil {
				continue
			}
			totalMembers += len(clan.Members)
			for _, member := range clan.Members {
				buckets["townhall"]["unknown"]++
				buckets["role"][string(member.Role)]++
				league := "Unranked"
				if member.League != nil && member.League.Name != "" {
					league = member.League.Name
				}
				buckets["league"][league]++
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanCompositionResponse{
			Townhall:     buckets["townhall"],
			Role:         buckets["role"],
			League:       buckets["league"],
			TotalMembers: totalMembers,
			ClanCount:    len(tags),
		})
	}
}

// clanDonationsMany godoc
// @Summary Get donations for many clans
// @Description Returns donation totals for multiple clans in a season.
// @Tags Clan
// @Produce json
// @Param season path string true "Season"
// @Param clan_tags query []string false "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/donations/{season} [get]
func clanDonationsMany(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := c.Params("season")
		tags := clanFixTags(apptypes.QueryValues(c, "clan_tags"))
		cur, err := a.Store.DB.Looper.Collection("player_stats").Find(c.UserContext(), bson.M{"clan_tag": bson.M{"$in": tags}, "season": season})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, clanStripIDs(rows))
	}
}

// clansDetails godoc
// @Summary Get full stats for a list of clans
// @Description Returns detailed clan objects for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/details [post]
func clansDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.ClanTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		items := make([]any, 0, len(body.ClanTags))
		for _, tag := range body.ClanTags {
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil {
				items = append(items, nil)
				continue
			}
			items = append(items, clan)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// clanDetails godoc
// @Summary Get full stats for a single clan
// @Description Returns the live clan object for a clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/details [get]
func clanDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clan, err := a.Clash.GetClan(c.UserContext(), c.Params("clan_tag"))
		if err != nil || clan == nil {
			return apptypes.Error(fiber.StatusNotFound, "Clan not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, clan)
	}
}

// clanJoinLeaveSingle godoc
// @Summary Join Leaves in a season
// @Description Returns join and leave history for a single clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param limit query int false "Maximum number of results"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/join-leave [get]
func clanJoinLeaveSingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return joinLeaveResponse(c, a, []string{clanFixTag(c.Params("clan_tag"))})
	}
}

// clansJoinLeave godoc
// @Summary Join leaves for many clans
// @Description Returns join and leave history for multiple clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Param limit query int false "Maximum number of results"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/join-leave [post]
func clansJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		return joinLeaveResponse(c, a, clanFixTags(body.ClanTags))
	}
}

func joinLeaveResponse(c *fiber.Ctx, a apptypes.Deps, clanTags []string) error {
	limit := clanParseIntDefault(c.Query("limit"), 250)
	after := clanParseInt64Default(c.Query("timestamp_start"), 0)
	before := clanParseInt64Default(c.Query("time_stamp_end"), 9999999999)
	filter := bson.M{
		"clan": bson.M{"$in": clanTags},
		"time": bson.M{"$gte": after, "$lte": before},
	}
	cur, err := a.Store.DB.Looper.Collection("join_leave_history").Find(c.UserContext(), filter)
	if err != nil {
		return err
	}
	var rows []bson.M
	if err := cur.All(c.UserContext(), &rows); err != nil {
		return err
	}
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": clanStripIDs(rows)})
}

// clansCapitalRaids godoc
// @Summary Get capital raids for a list of clans
// @Description Returns raid weekend documents for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/capital-raids [post]
func clansCapitalRaids(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		cur, err := a.Store.DB.Looper.Collection("raid_weekends").Find(c.UserContext(), bson.M{"clan_tag": bson.M{"$in": clanFixTags(body.ClanTags)}})
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

func clanFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, clanFixTag(tag))
	}
	return out
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
