package v2

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var reSeasonPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)

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

		clanTag := clanFixTag(c.Params("clan_tag"))
		playerTags := clanFixTags(body.PlayerTags)
		ctx := c.UserContext()

		// Current and previous season identifiers
		seasonSlice := genSeasonDate(2, false).([]string)
		currentSeason, prevSeason := seasonSlice[0], seasonSlice[1]

		// Last 4 raid week start dates
		raidDates := genRaidDate(3).([]string)

		// Clan stats: clan_games, donated, received per player per season
		var clanStats bson.M
		_ = a.Store.DB.NewLooper.Collection("clan_stats").
			FindOne(ctx, bson.M{"tag": clanTag}).Decode(&clanStats)

		// Player stats: capital_gold donations + last_online_times for activity
		cur, err := a.Store.DB.NewLooper.Collection("player_stats").Find(
			ctx,
			bson.M{"tag": bson.M{"$in": playerTags}},
			options.Find().SetProjection(bson.M{"tag": 1, "capital_gold": 1, "last_online_times": 1}),
		)
		if err != nil {
			return err
		}
		var playerStats []bson.M
		if err := cur.All(ctx, &playerStats); err != nil {
			return err
		}

		// Clan games: current season first, fallback to previous
		clanGamesPoints := 0
		for _, s := range []string{currentSeason, prevSeason} {
			if clanStats != nil {
				if seasonData, ok := clanStats[s].(bson.M); ok {
					for _, raw := range seasonData {
						if doc, ok := raw.(bson.M); ok {
							clanGamesPoints += asIntWithDefault(doc["clan_games"], 0)
						}
					}
				}
			}
			if clanGamesPoints > 0 {
				break
			}
		}

		// Donations: current season only
		troopsDonated, troopsReceived := 0, 0
		if clanStats != nil {
			if seasonData, ok := clanStats[currentSeason].(bson.M); ok {
				for _, raw := range seasonData {
					if doc, ok := raw.(bson.M); ok {
						troopsDonated += asIntWithDefault(doc["donated"], 0)
						troopsReceived += asIntWithDefault(doc["received"], 0)
					}
				}
			}
		}

		// Capital gold donated: sum over last 4 raid weeks from player_stats
		capitalDonated := 0
		for _, player := range playerStats {
			if capitalGold, ok := player["capital_gold"].(bson.M); ok {
				for _, date := range raidDates {
					if dateData, ok := capitalGold[date].(bson.M); ok {
						if donates, ok := dateData["donate"].(bson.A); ok {
							for _, v := range donates {
								capitalDonated += asIntWithDefault(v, 0)
							}
						}
					}
				}
			}
		}

		// Activity: avg active players per day over last 30 days.
		// Count unique (player, day) pairs then divide by 30.
		now := time.Now().UTC()
		thirtyDaysAgo := now.AddDate(0, 0, -30).Unix()
		dayPlayers := map[string]map[string]struct{}{}
		for _, player := range playerStats {
			tag, _ := player["tag"].(string)
			if tag == "" {
				continue
			}
			if lastOnline, ok := player["last_online_times"].(bson.M); ok {
				for _, s := range []string{currentSeason, prevSeason} {
					if timestamps, ok := lastOnline[s].(bson.A); ok {
						for _, ts := range timestamps {
							t := int64(asIntWithDefault(ts, 0))
							if t < thirtyDaysAgo {
								continue
							}
							day := time.Unix(t, 0).UTC().Format("2006-01-02")
							if dayPlayers[day] == nil {
								dayPlayers[day] = map[string]struct{}{}
							}
							dayPlayers[day][tag] = struct{}{}
						}
					}
				}
			}
		}
		totalPlayerDays := 0
		for _, players := range dayPlayers {
			totalPlayerDays += len(players)
		}

		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BoardTotalsResponse{
			Tag:                clanTag,
			TrackedPlayerCount: len(playerStats),
			ClanGamesPoints:    clanGamesPoints,
			TroopsDonated:      troopsDonated,
			TroopsReceived:     troopsReceived,
			ClanCapitalDonated: capitalDonated,
			Activity:           float64(totalPlayerDays) / 30.0,
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
		icons := leagueIconLookup(a)
		items := make([]any, 0, len(body.ClanTags))
		for _, tag := range body.ClanTags {
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil {
				items = append(items, nil)
				continue
			}
			items = append(items, enrichClanLeagueIcons(clan, icons))
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
		tag := c.Params("clan_tag")
		clan, err := a.Clash.GetClan(c.UserContext(), tag)
		if err != nil || clan == nil {
			slog.Error("clanDetails failed", slog.String("tag", tag), slog.Any("err", err))
			return apptypes.Error(fiber.StatusNotFound, "Clan not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, enrichClanLeagueIcons(clan, leagueIconLookup(a)))
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
		item, err := joinLeaveSingleResponse(c, a, clanFixTag(c.Params("clan_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
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
		if len(body.ClanTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		items, err := joinLeaveManyResponse(c, a, clanFixTags(body.ClanTags))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": mobileMapsToAny(items)})
	}
}

type joinLeaveWindow struct {
	start       time.Time
	end         time.Time
	startUnix   int64
	endUnix     int64
	limitEvents bool
}

func joinLeaveSingleResponse(c *fiber.Ctx, a apptypes.Deps, clanTag string) (map[string]any, error) {
	items, err := joinLeaveManyResponse(c, a, []string{clanTag})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return map[string]any{}, nil
	}
	return items[0], nil
}

func joinLeaveManyResponse(c *fiber.Ctx, a apptypes.Deps, clanTags []string) ([]map[string]any, error) {
	window, err := joinLeaveWindowFromQuery(c)
	if err != nil {
		return nil, err
	}
	limit := clanParseIntDefault(c.Query("limit"), 50)
	if limit <= 0 {
		limit = 50
	}
	filter := bson.M{
		"clan": bson.M{"$in": clanTags},
		"time": bson.M{"$gte": window.start, "$lte": window.end},
	}
	if joinLeaveType := strings.TrimSpace(c.Query("type")); joinLeaveType != "" {
		filter["type"] = joinLeaveType
	}
	cur, err := a.Store.C.JoinLeaveHistory.Find(
		c.UserContext(),
		filter,
		options.Find().SetSort(bson.M{"time": -1}),
	)
	if err != nil {
		return nil, err
	}
	var rows []bson.M
	if err := cur.All(c.UserContext(), &rows); err != nil {
		return nil, err
	}
	return joinLeaveItemsFromRows(rows, clanTags, window, limit), nil
}

func joinLeaveWindowFromQuery(c *fiber.Ctx) (joinLeaveWindow, error) {
	season := strings.TrimSpace(c.Query("season"))
	currentSeason := strings.EqualFold(strings.TrimSpace(c.Query("current_season")), "true")
	if season == "" && currentSeason {
		season = genSeasonDate(0, false).(string)
	}
	if season != "" {
		start, end, err := joinLeaveSeasonBounds(season)
		if err != nil {
			return joinLeaveWindow{}, err
		}
		return joinLeaveWindow{
			start:       start,
			end:         end,
			startUnix:   start.Unix(),
			endUnix:     end.Unix(),
			limitEvents: false,
		}, nil
	}
	startUnix := clanParseInt64Default(c.Query("timestamp_start"), 0)
	endUnix := clanParseInt64Default(c.Query("time_stamp_end"), 9999999999)
	return joinLeaveWindow{
		start:       time.Unix(startUnix, 0).UTC(),
		end:         time.Unix(endUnix, 0).UTC(),
		startUnix:   startUnix,
		endUnix:     endUnix,
		limitEvents: true,
	}, nil
}

func joinLeaveSeasonBounds(season string) (time.Time, time.Time, error) {
	startRaw, endRaw, err := resolveSeasonBounds(season, false)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start, err := time.Parse(time.RFC3339, startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := time.Parse(time.RFC3339, endRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start.UTC(), end.UTC(), nil
}

func joinLeaveItemsFromRows(rows []bson.M, clanTags []string, window joinLeaveWindow, limit int) []map[string]any {
	groupedDocs := map[string][]map[string]any{}
	groupedStats := map[string][]mobileJoinLeaveEvent{}
	for _, row := range rows {
		clean, ok := sanitize(row).(map[string]any)
		if !ok {
			continue
		}
		clanTag := mobileString(clean["clan"])
		if clanTag == "" {
			continue
		}
		if window.limitEvents && len(groupedDocs[clanTag]) >= limit {
			continue
		}
		eventTime, ok := mobileTime(clean["time"])
		if !ok {
			continue
		}
		clean["time"] = eventTime.UTC().Format(time.RFC3339)
		groupedDocs[clanTag] = append(groupedDocs[clanTag], clean)
		groupedStats[clanTag] = append(groupedStats[clanTag], mobileJoinLeaveEvent{
			Tag:  mobileString(clean["tag"]),
			Name: mobileString(clean["name"]),
			Type: mobileString(clean["type"]),
			Time: eventTime,
		})
	}

	items := make([]map[string]any, 0, len(clanTags))
	for _, clanTag := range clanTags {
		items = append(items, map[string]any{
			"clan_tag":        clanTag,
			"timestamp_start": window.startUnix,
			"timestamp_end":   window.endUnix,
			"stats":           mobileBuildJoinLeaveStats(groupedStats[clanTag]),
			"join_leave_list": mobileMapsToAny(groupedDocs[clanTag]),
		})
	}
	return items
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

// clanGamesLeaderboard godoc
// @Summary Get clan games leaderboard
// @Description Returns a sorted player leaderboard for clan games in a given season.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season (e.g. 2025-05)"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/games/{season} [get]
func clanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		season := strings.TrimSpace(c.Params("season"))
		if !reSeasonPattern.MatchString(season) {
			return apptypes.Error(fiber.StatusBadRequest, "invalid season format, expected YYYY-MM")
		}

		var row bson.M
		err := a.Store.DB.NewLooper.Collection("clan_stats").FindOne(c.UserContext(), bson.M{"tag": tag}).Decode(&row)
		if err != nil {
			return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []any{}, "season": season, "tracked": false})
		}

		seasonData, _ := row[season].(bson.M)
		if len(seasonData) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []any{}, "season": season, "tracked": true})
		}

		type gamesEntry struct {
			Tag    string `json:"tag"`
			Points int    `json:"points"`
		}
		entries := make([]gamesEntry, 0, len(seasonData))
		for playerTag, raw := range seasonData {
			doc, _ := raw.(bson.M)
			pts := clanParseIntDefault(fmt.Sprintf("%v", doc["clan_games"]), 0)
			entries = append(entries, gamesEntry{Tag: "#" + strings.TrimPrefix(playerTag, "#"), Points: pts})
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Points > entries[j].Points })

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": entries, "season": season, "tracked": true})
	}
}

// clanCapitalLatest godoc
// @Summary Get latest raid weekend for a clan
// @Description Returns the most recent capital raid weekend document for a clan.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/capital/latest [get]
func clanCapitalLatest(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		var row bson.M
		err := a.Store.DB.Looper.Collection("raid_weekends").FindOne(
			c.UserContext(),
			bson.M{"clan_tag": tag},
			options.FindOne().SetSort(bson.D{{Key: "startTime", Value: -1}}),
		).Decode(&row)
		if err != nil {
			return apptypes.Error(fiber.StatusNotFound, "no raid weekend data found")
		}
		return apptypes.JSON(c, fiber.StatusOK, clanWithoutID(row))
	}
}

// clanWarOpt godoc
// @Summary Get member war opt status
// @Description Returns all clan members with their warPreference (in/out).
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/war-opt [get]
func clanWarOpt(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		encoded := strings.ReplaceAll(tag, "#", "%23")

		resp, err := http.Get("https://proxy.clashk.ing/v1/clans/" + encoded)
		if err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "CoC proxy unreachable")
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return apptypes.Error(fiber.StatusNotFound, "clan not found")
		}
		if resp.StatusCode != http.StatusOK {
			return apptypes.Error(fiber.StatusBadGateway, "CoC proxy error")
		}

		type memberOpt struct {
			Tag           string `json:"tag"`
			Name          string `json:"name"`
			Role          string `json:"role"`
			TownHallLevel int    `json:"townHallLevel"`
			Trophies      int    `json:"trophies"`
			WarPreference string `json:"warPreference"`
		}
		var payload struct {
			Members []memberOpt `json:"memberList"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "failed to parse CoC response")
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": payload.Members})
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
