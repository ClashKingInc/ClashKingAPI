package v2

import (
	"context"
	"encoding/json"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// previousWars godoc
// @Summary Previous wars for a clan
// @Description Returns previous wars for a clan tag, optionally filtered to CWL.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param timestamp_end query int false "End timestamp"
// @Param include_cwl query bool false "Include CWL wars"
// @Param limit query int false "Maximum number of results"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/{clan_tag}/previous [get]
func previousWars(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		start := timestampString(c.Query("timestamp_start"), 0)
		end := timestampString(c.Query("timestamp_end"), 9999999999)
		includeCWL, err := apptypes.QueryBool(c, "include_cwl", false)
		if err != nil {
			return err
		}
		limit := warParseIntDefault(c.Query("limit"), 50)
		filter := bson.M{
			"$and": bson.A{
				bson.M{"$or": bson.A{bson.M{"data.clan.tag": clanTag}, bson.M{"data.opponent.tag": clanTag}}},
				bson.M{"data.preparationStartTime": bson.M{"$gte": start}},
				bson.M{"data.preparationStartTime": bson.M{"$lte": end}},
			},
		}
		if !includeCWL {
			filter["$and"] = append(filter["$and"].(bson.A), bson.M{"data.season": bson.M{"$eq": nil}})
		}
		cur, err := a.Store.DB.Looper.Collection("clan_war").Find(c.UserContext(), filter,
			options.Find().SetSort(bson.D{{Key: "data.endTime", Value: -1}}))
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		seen := map[string]struct{}{}
		items := make([]any, 0, warMin(limit, len(rows)))
		for _, row := range rows {
			data, _ := sanitize(row["data"]).(map[string]any)
			prep := warAsString(data["preparationStartTime"])
			if prep == "" {
				prep = warAsString(row["preparationStartTime"])
			}
			if _, ok := seen[prep]; ok {
				continue
			}
			seen[prep] = struct{}{}
			items = append(items, warWithoutID(bson.M(data)))
			if len(items) == limit {
				break
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// cwlRankingHistory godoc
// @Summary CWL ranking history for a clan
// @Description Returns CWL ranking history rows for a clan tag.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/cwl/{clan_tag}/ranking-history [get]
func cwlRankingHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		cur, err := a.Store.DB.Looper.Collection("cwl_group").Find(c.UserContext(), bson.M{"data.clans.tag": clanTag})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		if len(rows) == 0 {
			return apptypes.Error(fiber.StatusNotFound, "No CWL Data Found")
		}
		items := make([]modelsv2.CWLRankingHistoryItem, 0, len(rows))
		for _, row := range rows {
			data, _ := row["data"].(bson.M)
			season, _ := data["season"].(string)
			items = append(items, modelsv2.CWLRankingHistoryItem{
				Season: season,
				League: nestedString(data, "clans", "0", "warLeague", "name"),
				Rounds: len(asArray(data["rounds"])),
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// cwlThresholds godoc
// @Summary Promo and demotion thresholds for CWL leagues
// @Description Returns the static CWL promotion and demotion thresholds list.
// @Tags War
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/cwl/league-thresholds [get]
func cwlThresholds(c *fiber.Ctx) error {
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []modelsv2.CWLThresholdItem{
		{ID: 48000001, Name: "Bronze League III", Promo: 3, Demote: 9},
		{ID: 48000004, Name: "Silver League III", Promo: 2, Demote: 8},
		{ID: 48000007, Name: "Gold League III", Promo: 2, Demote: 7},
		{ID: 48000010, Name: "Crystal League III", Promo: 2, Demote: 7},
		{ID: 48000013, Name: "Master League III", Promo: 2, Demote: 6},
		{ID: 48000016, Name: "Champion League III", Promo: 2, Demote: 6},
		{ID: 48000019, Name: "Titan League III", Promo: 2, Demote: 5},
		{ID: 48000022, Name: "Legend League", Promo: 0, Demote: 5},
	}})
}

// clanStats godoc
// @Summary Clan war stats
// @Description Returns the number of wars for the requested clan tags.
// @Tags War
// @Produce json
// @Param clan_tags query []string false "Clan tags"
// @Param clan_tag query string false "Single clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/clan/stats [get]
func clanStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTags := splitCSV(apptypes.QueryValues(c, "clan_tags"), c.Query("clan_tag"))
		filter := bson.M{}
		if len(clanTags) > 0 {
			filter = bson.M{"$or": bson.A{bson.M{"data.clan.tag": bson.M{"$in": clanTags}}, bson.M{"data.opponent.tag": bson.M{"$in": clanTags}}}}
		}
		total, err := a.Store.DB.Looper.Collection("clan_war").CountDocuments(c.UserContext(), filter)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []modelsv2.WarStatsItem{{WarCount: int(total), ClanTags: clanTags}}})
	}
}

// warSummaryBulk godoc
// @Summary Get full war summary for multiple clans
// @Description Returns current war summary data for multiple clan tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/war-summary [post]
func warSummaryBulk(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.WarClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		ctx := c.UserContext()
		results := make([]map[string]any, len(body.ClanTags))
		var wg sync.WaitGroup
		for i, tag := range body.ClanTags {
			wg.Add(1)
			go func(idx int, t string) {
				defer wg.Done()
				results[idx] = currentWarSummary(ctx, a, t)
			}(i, tag)
		}
		wg.Wait()
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": results})
	}
}

// warSummarySingle godoc
// @Summary Get war summary for a clan
// @Description Returns current war summary data for a single clan tag.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/{clan_tag}/war-summary [get]
func warSummarySingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusOK, currentWarSummary(c.UserContext(), a, c.Params("clan_tag")))
	}
}

// playerWarhits godoc
// @Summary Player warhits stats
// @Description Returns war hit rows for the requested player tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarPlayersBody true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/players/warhits [post]
func playerWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		filter, err := mobileDecodeWarHitsFilter(c)
		if err != nil {
			return err
		}
		if len(filter.PlayerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": mobileFetchPlayerWarStatsWithFilter(c.UserContext(), a, filter)})
	}
}

// clanWarhits godoc
// @Summary Clan warhits stats
// @Description Returns war hit rows for the requested clan tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/clans/warhits [post]
func clanWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		filter, err := mobileDecodeWarHitsFilter(c)
		if err != nil {
			return err
		}
		if len(filter.ClanTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": mobileFetchClanWarStatsWithFilter(c.UserContext(), a, filter)})
	}
}

func currentWarSummary(ctx context.Context, a apptypes.Deps, tag string) map[string]any {
	tag = warFixTag(tag)

	war, err := a.Clash.Client().GetCurrentWar(ctx, tag)

	isInWar := false
	var warInfo any
	if err != nil || war == nil || war.State == "" || war.State == clashy.WarStateNotInWar {
		warInfo = map[string]any{"state": "notInWar"}
	} else {
		isInWar = true
		currentWarInfo := mobileHTTPGetJSON("https://proxy.clashk.ing/v1/clans/" + strings.ReplaceAll(tag, "#", "%23") + "/currentwar")
		if currentWarInfo == nil {
			currentWarInfo = playerStructToMap(war)
		}
		warInfo = map[string]any{
			"state":          "war",
			"currentWarInfo": currentWarInfo,
			"bypass":         false,
		}
	}

	isInCwl := false
	var leagueInfo any
	warLeagueInfos := []any{}

	if isCWLWindow() {
		lg, lgErr := a.Clash.Client().GetLeagueGroup(ctx, tag)
		if lgErr == nil && lg != nil && lg.State != "notInWar" && lg.State != "" {
			var warTags []string
			for _, round := range lg.Rounds {
				for _, wt := range round.WarTags {
					if wt != "#0" && wt != "" {
						warTags = append(warTags, wt)
					}
				}
			}

			var leagueWars []clashy.ClanWar
			if len(warTags) > 0 {
				leagueWars, _ = a.Clash.Client().GetLeagueWars(ctx, warTags)
			}

			leagueInfo = enrichLeagueInfo(lg, leagueWars)
			for i := range leagueWars {
				warLeagueInfos = append(warLeagueInfos, playerStructToMap(&leagueWars[i]))
			}

			if !isInWar {
				isInCwl = true
			}
		}
	}

	result := map[string]any{
		"clan_tag":         tag,
		"isInWar":          isInWar,
		"isInCwl":          isInCwl,
		"war_info":         warInfo,
		"league_info":      leagueInfo,
		"war_league_infos": warLeagueInfos,
	}
	return result
}

// isCWLWindow returns true during the Clan War League event window.
// CWL runs from the 1st at 08:00 UTC through the 11th at 07:59 UTC each month.
func isCWLWindow() bool {
	now := time.Now().UTC()
	d, h := now.Day(), now.Hour()
	if d < 1 || d > 12 {
		return false
	}
	if d == 1 && h < 8 {
		return false
	}
	if d == 11 && h >= 8 {
		return false
	}
	return true
}

type cwlClanStats struct {
	totalStars       int
	totalDestruction float64
	warsPlayed       int
}

// enrichLeagueInfo converts a ClanWarLeagueGroup to a JSON map and adds per-clan
// stats (total_stars, total_destruction, wars_played, rank) derived from the
// individual CWL war results.
func enrichLeagueInfo(lg *clashy.ClanWarLeagueGroup, wars []clashy.ClanWar) map[string]any {
	b, err := json.Marshal(lg)
	if err != nil {
		return nil
	}
	var result map[string]any
	if err := json.Unmarshal(b, &result); err != nil {
		return nil
	}

	statsMap := make(map[string]*cwlClanStats)
	if clans, ok := result["clans"].([]any); ok {
		for _, c := range clans {
			if clan, ok := c.(map[string]any); ok {
				if tag, ok := clan["tag"].(string); ok && tag != "" {
					statsMap[tag] = &cwlClanStats{}
				}
			}
		}
	}

	for _, war := range wars {
		state := string(war.State)
		if state != "inWar" && state != "warEnded" {
			continue
		}
		if war.Clan != nil {
			if s, ok := statsMap[war.Clan.Tag]; ok {
				s.totalStars += war.Clan.Stars
				s.totalDestruction += war.Clan.Destruction
				s.warsPlayed++
			}
		}
		if war.Opponent != nil {
			if s, ok := statsMap[war.Opponent.Tag]; ok {
				s.totalStars += war.Opponent.Stars
				s.totalDestruction += war.Opponent.Destruction
				s.warsPlayed++
			}
		}
	}

	type rankEntry struct {
		tag         string
		stars       int
		destruction float64
	}
	ranking := make([]rankEntry, 0, len(statsMap))
	for tag, s := range statsMap {
		ranking = append(ranking, rankEntry{tag: tag, stars: s.totalStars, destruction: s.totalDestruction})
	}
	sort.Slice(ranking, func(i, j int) bool {
		if ranking[i].stars != ranking[j].stars {
			return ranking[i].stars > ranking[j].stars
		}
		return ranking[i].destruction > ranking[j].destruction
	})
	rankMap := make(map[string]int, len(ranking))
	for i, r := range ranking {
		rankMap[r.tag] = i + 1
	}

	if clans, ok := result["clans"].([]any); ok {
		for _, c := range clans {
			if clan, ok := c.(map[string]any); ok {
				if tag, ok := clan["tag"].(string); ok {
					if s, ok := statsMap[tag]; ok {
						clan["total_stars"] = s.totalStars
						clan["total_destruction"] = math.Round(s.totalDestruction*100) / 100
						clan["wars_played"] = s.warsPlayed
						clan["rank"] = rankMap[tag]
					}
				}
			}
		}
	}

	return result
}

func timestampString(raw string, fallback int64) string {
	value := fallback
	if raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			value = parsed
		}
	}
	return time.Unix(value, 0).UTC().Format("20060102T150405.000Z")
}

func warParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func warMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitCSV(list []string, single string) []string {
	out := make([]string, 0, len(list)+1)
	for _, raw := range list {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, warFixTag(trimmed))
			}
		}
	}
	if single != "" {
		out = append(out, warFixTag(single))
	}
	return out
}

func warStripIDs(rows []bson.M) []bson.M {
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		out = append(out, warWithoutID(row))
	}
	return out
}

func warWithoutID(doc bson.M) bson.M {
	clean := bson.M{}
	for key, value := range doc {
		if key == "_id" {
			continue
		}
		clean[key] = value
	}
	return clean
}

func warAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asArray(v any) []any {
	if arr, ok := v.(bson.A); ok {
		return arr
	}
	if arr, ok := v.([]any); ok {
		return arr
	}
	return nil
}

func nestedString(_ bson.M, _ ...string) string { return "" }

func warFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, warFixTag(tag))
	}
	return out
}

func warFixTag(tag string) string {
	if decoded, err := url.PathUnescape(tag); err == nil {
		tag = decoded
	}
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimLeft(tag, "#!")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}
