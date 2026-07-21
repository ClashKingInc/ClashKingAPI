package routes

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
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
)

// warTownhallWeeklyHitrate godoc
// @Summary Get weekly town hall war hitrate
// @Description Returns weekly hitrate and average attack quality for a town hall level.
// @Tags War
// @Produce json
// @Param townhall_level path int true "Town hall level"
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to 90 days ago."
// @Param timestamp_end query int false "End Unix timestamp"
// @Param war_type query string false "War type filter. Repeatable. Values: random, friendly, all. CWL is not included for this endpoint."
// @Param war_types query string false "Comma-separated war type filter. Values: random,friendly."
// @Param same_townhall query bool false "Only include same town hall attacks"
// @Success 200 {object} modelsv2.WarWeeklyHitrateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func warTownhallWeeklyHitrate(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		townhall := warParseIntDefault(c.Params("townhall_level"), 0)
		if townhall <= 0 {
			return apptypes.Error(http.StatusBadRequest, "invalid townhall_level")
		}
		start := time.Unix(queryInt64(c, "timestamp_start", time.Now().UTC().AddDate(0, 0, -90).Unix()), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		types := warTypesFromQuery(c, false)
		sameTownhall, err := apptypes.QueryBool(c, "same_townhall", false)
		if err != nil {
			return err
		}
		query := `
			SELECT date_trunc('week', war_end_time)::date AS week, war_type,
				count(*)::int AS attacks,
				count(*) FILTER (WHERE stars = 3)::int AS triples,
				avg(stars)::float8 AS avg_stars,
				avg(destruction_percentage)::float8 AS avg_destruction
			FROM war_attacks
			WHERE attacker_townhall = $1
				AND war_end_time >= $2
				AND war_end_time <= $3
				AND war_type = ANY($4)
		`
		args := []any{townhall, start, end, types}
		if sameTownhall {
			query += ` AND defender_townhall = attacker_townhall`
		}
		query += ` GROUP BY week, war_type ORDER BY week, war_type`
		rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var week time.Time
			var warType string
			var attacks, triples int
			var avgStars, avgDestruction float64
			if err := rows.Scan(&week, &warType, &attacks, &triples, &avgStars, &avgDestruction); err != nil {
				return err
			}
			items = append(items, map[string]any{
				"week":               week.Format("2006-01-02"),
				"warType":            warType,
				"townhallLevel":      townhall,
				"attacks":            attacks,
				"triples":            triples,
				"hitrate":            rate(triples, attacks),
				"averageStars":       round2(avgStars),
				"averageDestruction": round2(avgDestruction),
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// warCompletedDaily godoc
// @Summary Get daily completed war counts
// @Description Returns completed war counts per day and war type.
// @Tags War
// @Produce json
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to 90 days ago."
// @Param timestamp_end query int false "End Unix timestamp"
// @Param war_type query string false "War type filter. Repeatable. Values: random, friendly, cwl, all."
// @Param war_types query string false "Comma-separated war type filter. Values: random,friendly,cwl."
// @Success 200 {object} modelsv2.WarCompletedDailyResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func warCompletedDaily(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Unix(queryInt64(c, "timestamp_start", time.Now().UTC().AddDate(0, 0, -90).Unix()), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		types := warTypesFromQuery(c, true)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT end_time::date AS day, war_type, count(*)::int
			FROM wars
			WHERE end_time >= $1 AND end_time <= $2 AND war_type = ANY($3)
			GROUP BY day, war_type
			ORDER BY day, war_type
		`, start, end, types)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var day time.Time
			var warType string
			var count int
			if err := rows.Scan(&day, &warType, &count); err != nil {
				return err
			}
			items = append(items, map[string]any{"day": day.Format("2006-01-02"), "warType": warType, "warsCompleted": count})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

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
// @Success 200 {object} modelsv2.WarListResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
		types := []string{"random", "friendly"}
		if includeCWL {
			types = []string{"random", "friendly", "cwl"}
		}
		rows, err := sqlClanWars(c, a, clanTag, warTimestampToTime(start), warTimestampToTime(end), types, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": rows})
	}
}

// cwlRankingHistory godoc
// @Summary CWL ranking history for a clan
// @Description Returns CWL ranking history rows for a clan tag.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.CWLRankingHistoryResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/{clan_tag}/ranking-history [get]
func cwlRankingHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		rows, err := sqlCWLGroups(c, a, clanTag)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return apptypes.Error(fiber.StatusNotFound, "No CWL Data Found")
		}
		items := make([]modelsv2.CWLRankingHistoryItem, 0, len(rows))
		for _, row := range rows {
			data := warMap(row["data"])
			season, _ := row["season"].(string)
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
// @Success 200 {object} modelsv2.CWLThresholdResponse
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
// @Success 200 {object} modelsv2.WarStatsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/war/clan/stats [get]
// @Router /v2/war/stats [get]
func clanStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTags := splitCSV(apptypes.QueryValues(c, "clan_tags"), c.Query("clan_tag"))
		total, err := sqlWarCount(c, a, clanTags)
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
// @Success 200 {object} modelsv2.WarSummaryListResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/war/war-summary [post]
func warSummaryBulk(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.WarClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := make([]string, 0, len(body.ClanTags))
		seen := make(map[string]struct{}, len(body.ClanTags))
		for _, rawTag := range body.ClanTags {
			tag := warFixTag(rawTag)
			if tag == "" {
				continue
			}
			if _, exists := seen[tag]; exists {
				continue
			}
			seen[tag] = struct{}{}
			tags = append(tags, tag)
		}
		if len(tags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		if len(tags) > 100 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot contain more than 100 unique tags")
		}
		ctx := c.UserContext()
		results := make([]map[string]any, len(tags))
		sem := make(chan struct{}, 10)
		var wg sync.WaitGroup
		for i, tag := range tags {
			wg.Add(1)
			go func(idx int, t string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				defer func() {
					if r := recover(); r != nil {
						results[idx] = warSummaryResponse(t, false, false, map[string]any{"state": "notInWar"}, nil, nil)
					}
				}()
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
// @Success 200 {object} modelsv2.WarSummaryResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
// @Success 200 {object} modelsv2.PlayerWarHitsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
// @Success 200 {object} modelsv2.ClanWarHitsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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

func sqlCWLGroups(c *fiber.Ctx, a apptypes.Deps, clanTag string) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT season, cwl_league_id, rounds, data
		FROM cwl_groups
		WHERE $1 = ANY(clan_tags)
		ORDER BY season DESC
	`, clanTag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var season string
		var leagueID int
		var roundsRaw, dataRaw []byte
		if err := rows.Scan(&season, &leagueID, &roundsRaw, &dataRaw); err != nil {
			return nil, err
		}
		data := map[string]any{}
		_ = json.Unmarshal(dataRaw, &data)
		var rounds any
		_ = json.Unmarshal(roundsRaw, &rounds)
		data["rounds"] = rounds
		out = append(out, map[string]any{"season": season, "cwl_league_id": leagueID, "data": data})
	}
	return out, rows.Err()
}

func sqlWarCount(c *fiber.Ctx, a apptypes.Deps, clanTags []string) (int64, error) {
	query := `SELECT count(*) FROM wars`
	args := []any{}
	if len(clanTags) > 0 {
		query += ` WHERE clan_tag = ANY($1) OR opponent_tag = ANY($1)`
		args = append(args, clanTags)
	}
	var total int64
	err := a.Store.SQL.QueryRow(c.UserContext(), query, args...).Scan(&total)
	return total, err
}

func warTimestampToTime(value string) time.Time {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err == nil {
		return time.Unix(parsed, 0).UTC()
	}
	if parsedTime, err := time.Parse("20060102T150405.000Z", value); err == nil {
		return parsedTime.UTC()
	}
	return time.Unix(0, 0).UTC()
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
		currentWarInfo := mobileHTTPGetJSON("https://proxy.clashk.ing/v1/clans/" + url.PathEscape(tag) + "/currentwar")
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
		lg := fetchLeagueGroupProxy(tag)
		if lg != nil && warAsString(lg["state"]) != "notInWar" && warAsString(lg["state"]) != "" {
			leagueWars := fetchLeagueWarsProxy(extractLeagueWarTags(lg))
			leagueInfo = enrichLeagueInfoIcons(enrichLeagueInfo(lg, leagueWars), leagueIconLookup(a))
			warLeagueInfos = mobileMapsToAny(leagueWars)

			if !isInWar {
				isInCwl = true
			}
		}
	}

	return warSummaryResponse(tag, isInWar, isInCwl, warInfo, leagueInfo, warLeagueInfos)
}

func warSummaryResponse(tag string, isInWar bool, isInCwl bool, warInfo any, leagueInfo any, warLeagueInfos []any) map[string]any {
	return map[string]any{
		"clan_tag":         warFixTag(tag),
		"isInWar":          isInWar,
		"isInCwl":          isInCwl,
		"war_info":         warSummaryInfoMap(warInfo),
		"league_info":      warSummaryMapOrNil(leagueInfo),
		"war_league_infos": warSummarySlice(warLeagueInfos),
	}
}

func warSummaryInfoMap(warInfo any) map[string]any {
	info := warSummaryMapOrNil(warInfo)
	if info == nil {
		return map[string]any{"state": "notInWar"}
	}
	if strings.TrimSpace(warAsString(info["state"])) == "" {
		info["state"] = "unknown"
	}
	if currentWarInfo := warSummaryMapOrNil(info["currentWarInfo"]); currentWarInfo != nil {
		info["currentWarInfo"] = currentWarInfo
	} else {
		delete(info, "currentWarInfo")
	}
	return info
}

func warSummarySlice(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		if mapped := warSummaryMapOrNil(item); mapped != nil {
			out = append(out, mapped)
		}
	}
	return out
}

func warSummaryMapOrNil(value any) map[string]any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return mapsClone(typed)
	case map[string]string:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = item
		}
		return out
	}
	return nil
}

func mapsClone(value map[string]any) map[string]any {
	out := make(map[string]any, len(value))
	for key, item := range value {
		out[key] = item
	}
	return out
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
	totalStars                int
	attackCount               int
	missedAttacks             int
	missedDefenses            int
	totalDestruction          float64
	totalDestructionInflicted float64
	warsPlayed                int
	members                   map[string]*cwlMemberStats
}

type cwlMemberStats struct {
	name                       string
	avgTownHallLevel           float64
	mapPositionList            []float64
	opponentPositionList       []float64
	attackOrderList            []float64
	opponentTHLevelList        []float64
	attackerPositionList       []float64
	defenseOrderList           []float64
	attackerTHLevelList        []float64
	ownTHLevelListAttack       []int
	opponentTHLevelListAttack  []int
	ownTHLevelListDefense      []int
	attackerTHLevelListDefense []int
	stars                      int
	starsByTH                  map[int]map[int]int
	totalDestruction           float64
	attackCount                int
	missedAttacks              int
	defenseStarsTaken          int
	defenseStarsByTH           map[int]map[int]int
	defenseTotalDestruction    float64
	defenseCount               int
	missedDefenses             int
}

func initCWLClanStats(leagueInfo map[string]any) map[string]*cwlClanStats {
	statsMap := make(map[string]*cwlClanStats)
	for _, rawClan := range mobileList(leagueInfo["clans"]) {
		clan := mobileMap(rawClan)
		tag := warAsString(clan["tag"])
		if tag == "" {
			continue
		}
		summary := &cwlClanStats{
			members: make(map[string]*cwlMemberStats),
		}
		for _, rawMember := range mobileList(clan["members"]) {
			member := mobileMap(rawMember)
			memberTag := warAsString(member["tag"])
			if memberTag == "" {
				continue
			}
			summary.members[memberTag] = newCWLMemberStats(member)
		}
		statsMap[tag] = summary
	}
	return statsMap
}

func newCWLMemberStats(member map[string]any) *cwlMemberStats {
	stats := &cwlMemberStats{
		name:             warAsString(member["name"]),
		starsByTH:        make(map[int]map[int]int),
		defenseStarsByTH: make(map[int]map[int]int),
	}
	if townHallLevel := cwlTownHallLevel(member); townHallLevel > 0 {
		stats.avgTownHallLevel = float64(townHallLevel)
	}
	return stats
}

func cwlTownHallLevel(member map[string]any) int {
	if value, ok := member["townHallLevel"]; ok {
		return mobileInt(value)
	}
	return mobileInt(member["townhallLevel"])
}

func cwlMembersByTag(value any) map[string]map[string]any {
	out := make(map[string]map[string]any)
	for _, rawMember := range mobileList(value) {
		member := mobileMap(rawMember)
		tag := warAsString(member["tag"])
		if tag == "" {
			continue
		}
		out[tag] = member
	}
	return out
}

func cwlEnsureMemberStats(summary *cwlClanStats, member map[string]any) *cwlMemberStats {
	tag := warAsString(member["tag"])
	if tag == "" {
		return newCWLMemberStats(member)
	}
	stats, ok := summary.members[tag]
	if !ok {
		stats = newCWLMemberStats(member)
		summary.members[tag] = stats
	}
	if name := warAsString(member["name"]); name != "" {
		stats.name = name
	}
	if townHallLevel := cwlTownHallLevel(member); townHallLevel > 0 {
		stats.avgTownHallLevel = float64(townHallLevel)
	}
	return stats
}

func cwlAppendMemberContext(stats *cwlMemberStats, member map[string]any) {
	if position, ok := member["mapPosition"]; ok {
		stats.mapPositionList = append(stats.mapPositionList, float64(mobileInt(position)))
	}
}

func cwlFirstMap(value any) map[string]any {
	if mapped := mobileMap(value); len(mapped) > 0 {
		return mapped
	}
	items := mobileList(value)
	if len(items) == 0 {
		return nil
	}
	mapped := mobileMap(items[0])
	if len(mapped) == 0 {
		return nil
	}
	return mapped
}

func cwlIncrementTownHallBucket(buckets map[int]map[int]int, stars int, townHallLevel int) {
	if townHallLevel <= 0 {
		return
	}
	if buckets[stars] == nil {
		buckets[stars] = make(map[int]int)
	}
	buckets[stars][townHallLevel]++
}

func cwlProcessMemberAttack(stats *cwlMemberStats, summary *cwlClanStats, member map[string]any, opponentMembers map[string]map[string]any, warState string) {
	attack := cwlFirstMap(member["attacks"])
	if attack == nil {
		if warState == "warEnded" {
			stats.missedAttacks++
			summary.missedAttacks++
		}
		return
	}

	stars := mobileInt(attack["stars"])
	destruction := mobileFloat(attack["destructionPercentage"])
	stats.stars += stars
	stats.totalDestruction += destruction
	stats.attackCount++
	summary.totalDestructionInflicted += destruction
	summary.attackCount++

	if order, ok := attack["order"]; ok {
		stats.attackOrderList = append(stats.attackOrderList, float64(mobileInt(order)))
	}

	defenderTag := warAsString(attack["defenderTag"])
	defender, ok := opponentMembers[defenderTag]
	if !ok {
		return
	}

	if position, ok := defender["mapPosition"]; ok {
		stats.opponentPositionList = append(stats.opponentPositionList, float64(mobileInt(position)))
	}

	ownTownHallLevel := cwlTownHallLevel(member)
	defenderTownHallLevel := cwlTownHallLevel(defender)
	if defenderTownHallLevel <= 0 {
		return
	}

	cwlIncrementTownHallBucket(stats.starsByTH, stars, defenderTownHallLevel)
	if ownTownHallLevel > 0 {
		stats.ownTHLevelListAttack = append(stats.ownTHLevelListAttack, ownTownHallLevel)
	}
	stats.opponentTHLevelListAttack = append(stats.opponentTHLevelListAttack, defenderTownHallLevel)
	stats.opponentTHLevelList = append(stats.opponentTHLevelList, float64(defenderTownHallLevel))
}

func cwlProcessMemberDefense(stats *cwlMemberStats, summary *cwlClanStats, member map[string]any, opponentMembers map[string]map[string]any) {
	defense := mobileMap(member["bestOpponentAttack"])
	if len(defense) == 0 {
		stats.missedDefenses++
		summary.missedDefenses++
		return
	}

	stars := mobileInt(defense["stars"])
	destruction := mobileFloat(defense["destructionPercentage"])
	stats.defenseStarsTaken += stars
	stats.defenseTotalDestruction += destruction
	stats.defenseCount++
	summary.totalDestruction += destruction

	if order, ok := defense["order"]; ok {
		stats.defenseOrderList = append(stats.defenseOrderList, float64(mobileInt(order)))
	}

	attackerTag := warAsString(defense["attackerTag"])
	attacker, ok := opponentMembers[attackerTag]
	if !ok {
		return
	}

	if position, ok := attacker["mapPosition"]; ok {
		stats.attackerPositionList = append(stats.attackerPositionList, float64(mobileInt(position)))
	}

	defenderTownHallLevel := cwlTownHallLevel(member)
	attackerTownHallLevel := cwlTownHallLevel(attacker)
	if attackerTownHallLevel <= 0 {
		return
	}

	cwlIncrementTownHallBucket(stats.defenseStarsByTH, stars, attackerTownHallLevel)
	if defenderTownHallLevel > 0 {
		stats.ownTHLevelListDefense = append(stats.ownTHLevelListDefense, defenderTownHallLevel)
	}
	stats.attackerTHLevelListDefense = append(stats.attackerTHLevelListDefense, attackerTownHallLevel)
	stats.attackerTHLevelList = append(stats.attackerTHLevelList, float64(attackerTownHallLevel))
}

func cwlAverage(values []float64) any {
	if len(values) == 0 {
		return nil
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return math.Round((total/float64(len(values)))*10) / 10
}

func cwlCountTownHallMatchups(ownLevels []int, opponentLevels []int, comparator func(int, int) bool) int {
	limit := len(ownLevels)
	if len(opponentLevels) < limit {
		limit = len(opponentLevels)
	}
	total := 0
	for index := 0; index < limit; index++ {
		if comparator(opponentLevels[index], ownLevels[index]) {
			total++
		}
	}
	return total
}

func cwlTownHallBucketJSON(buckets map[int]map[int]int, stars int) map[string]int {
	out := make(map[string]int)
	for townHallLevel, count := range buckets[stars] {
		out[strconv.Itoa(townHallLevel)] = count
	}
	return out
}

func cwlRoundToTwo(value float64) float64 {
	return math.Round(value*100) / 100
}

func cwlBuildMemberEnrichment(stats *cwlMemberStats) map[string]any {
	var avgTownHallLevel any
	if stats.avgTownHallLevel > 0 {
		avgTownHallLevel = stats.avgTownHallLevel
	}

	return map[string]any{
		"avgMapPosition":           cwlAverage(stats.mapPositionList),
		"avgOpponentPosition":      cwlAverage(stats.opponentPositionList),
		"avgAttackOrder":           cwlAverage(stats.attackOrderList),
		"avgTownHallLevel":         avgTownHallLevel,
		"avgOpponentTownHallLevel": cwlAverage(stats.opponentTHLevelList),
		"avgAttackerPosition":      cwlAverage(stats.attackerPositionList),
		"avgDefenseOrder":          cwlAverage(stats.defenseOrderList),
		"avgAttackerTownHallLevel": cwlAverage(stats.attackerTHLevelList),
		"attackLowerTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListAttack,
			stats.opponentTHLevelListAttack,
			func(opponent int, own int) bool { return opponent < own },
		),
		"attackUpperTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListAttack,
			stats.opponentTHLevelListAttack,
			func(opponent int, own int) bool { return opponent > own },
		),
		"defenseLowerTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListDefense,
			stats.attackerTHLevelListDefense,
			func(opponent int, own int) bool { return opponent < own },
		),
		"defenseUpperTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListDefense,
			stats.attackerTHLevelListDefense,
			func(opponent int, own int) bool { return opponent > own },
		),
		"attacks": map[string]any{
			"stars":             stats.stars,
			"3_stars":           cwlTownHallBucketJSON(stats.starsByTH, 3),
			"2_stars":           cwlTownHallBucketJSON(stats.starsByTH, 2),
			"1_star":            cwlTownHallBucketJSON(stats.starsByTH, 1),
			"0_star":            cwlTownHallBucketJSON(stats.starsByTH, 0),
			"total_destruction": cwlRoundToTwo(stats.totalDestruction),
			"attack_count":      stats.attackCount,
			"missed_attacks":    stats.missedAttacks,
		},
		"defense": map[string]any{
			"stars":             stats.defenseStarsTaken,
			"3_stars":           cwlTownHallBucketJSON(stats.defenseStarsByTH, 3),
			"2_stars":           cwlTownHallBucketJSON(stats.defenseStarsByTH, 2),
			"1_star":            cwlTownHallBucketJSON(stats.defenseStarsByTH, 1),
			"0_star":            cwlTownHallBucketJSON(stats.defenseStarsByTH, 0),
			"total_destruction": cwlRoundToTwo(stats.defenseTotalDestruction),
			"defense_count":     stats.defenseCount,
			"missed_defenses":   stats.missedDefenses,
		},
	}
}

func cwlBuildTownHallLevels(members []any) map[string]int {
	out := make(map[string]int)
	for _, rawMember := range members {
		townHallLevel := cwlTownHallLevel(mobileMap(rawMember))
		if townHallLevel <= 0 {
			continue
		}
		out[strconv.Itoa(townHallLevel)]++
	}
	return out
}

// enrichLeagueInfo adds per-clan CWL stats derived from the individual league wars.
func enrichLeagueInfo(leagueInfo map[string]any, wars []map[string]any) map[string]any {
	result := mapsClone(leagueInfo)

	statsMap := initCWLClanStats(result)

	for _, war := range wars {
		state := warAsString(war["state"])
		if state != "inWar" && state != "warEnded" {
			continue
		}
		for _, sideKey := range []string{"clan", "opponent"} {
			clan := mobileMap(war[sideKey])
			tag := warAsString(clan["tag"])
			summary, ok := statsMap[tag]
			if !ok {
				continue
			}

			summary.totalStars += mobileInt(clan["stars"])
			summary.warsPlayed++

			opponentKey := "opponent"
			if sideKey == "opponent" {
				opponentKey = "clan"
			}
			opponentMembers := cwlMembersByTag(mobileMap(war[opponentKey])["members"])
			for _, rawMember := range mobileList(clan["members"]) {
				member := mobileMap(rawMember)
				stats := cwlEnsureMemberStats(summary, member)
				cwlAppendMemberContext(stats, member)
				cwlProcessMemberAttack(stats, summary, member, opponentMembers, state)
				cwlProcessMemberDefense(stats, summary, member, opponentMembers)
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
		ranking = append(ranking, rankEntry{tag: tag, stars: s.totalStars, destruction: s.totalDestructionInflicted})
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

	clans := mobileList(result["clans"])
	totalStars := 0
	totalDestruction := 0.0
	warLeagueName := warAsString(result["war_league"])
	for _, rawClan := range clans {
		clan := mobileMap(rawClan)
		tag := warAsString(clan["tag"])
		summary, ok := statsMap[tag]
		if !ok {
			continue
		}

		clan["total_stars"] = summary.totalStars
		clan["attack_count"] = summary.attackCount
		clan["missed_attacks"] = summary.missedAttacks
		clan["total_destruction"] = cwlRoundToTwo(summary.totalDestruction)
		clan["total_destruction_inflicted"] = cwlRoundToTwo(summary.totalDestructionInflicted)
		clan["wars_played"] = summary.warsPlayed
		clan["rank"] = rankMap[tag]

		members := mobileList(clan["members"])
		clan["town_hall_levels"] = cwlBuildTownHallLevels(members)
		if warLeagueName == "" {
			warLeagueName = warAsString(mobileMap(clan["warLeague"])["name"])
		}
		for _, rawMember := range members {
			member := mobileMap(rawMember)
			stats, ok := summary.members[warAsString(member["tag"])]
			if !ok {
				continue
			}
			for key, value := range cwlBuildMemberEnrichment(stats) {
				member[key] = value
			}
		}
		totalStars += summary.totalStars
		totalDestruction += summary.totalDestructionInflicted
	}
	result["clans"] = clans
	result["total_stars"] = totalStars
	result["total_destruction"] = cwlRoundToTwo(totalDestruction)
	if warLeagueName != "" {
		result["war_league"] = warLeagueName
	}

	return result
}

func fetchLeagueGroupProxy(tag string) map[string]any {
	url := "https://proxy.clashk.ing/v1/clans/" + url.PathEscape(tag) + "/currentwar/leaguegroup"
	data := mobileHTTPGetJSON(url)
	if len(data) == 0 {
		return nil
	}
	return data
}

func extractLeagueWarTags(leagueInfo map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, rawRound := range mobileList(leagueInfo["rounds"]) {
		round := mobileMap(rawRound)
		for _, rawTag := range mobileList(round["warTags"]) {
			tag := warFixTag(warAsString(rawTag))
			if tag == "" || tag == "#0" || seen[tag] {
				continue
			}
			seen[tag] = true
			out = append(out, tag)
		}
	}
	return out
}

func fetchLeagueWarsProxy(warTags []string) []map[string]any {
	if len(warTags) == 0 {
		return nil
	}

	results := make([]map[string]any, len(warTags))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)

	for idx, warTag := range warTags {
		wg.Add(1)
		go func(i int, tag string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			url := "https://proxy.clashk.ing/v1/clanwarleagues/wars/" + url.PathEscape(tag)
			data := mobileHTTPGetJSON(url)
			if len(data) == 0 || warAsString(data["state"]) == "notInWar" {
				return
			}
			data["war_tag"] = tag
			results[i] = data
		}(idx, warTag)
	}

	wg.Wait()

	out := make([]map[string]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
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

func warAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asArray(v any) []any {
	if arr, ok := v.([]any); ok {
		return arr
	}
	return nil
}

func nestedString(data map[string]any, path ...string) string {
	current := any(data)
	for _, part := range path {
		if idx, err := strconv.Atoi(part); err == nil {
			items := asArray(current)
			if idx < 0 || idx >= len(items) {
				return ""
			}
			current = items[idx]
			continue
		}
		mapped := warMap(current)
		if mapped == nil {
			return ""
		}
		current = mapped[part]
	}
	return warAsString(current)
}

func warFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, warFixTag(tag))
	}
	return out
}

func warMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	default:
		return nil
	}
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
