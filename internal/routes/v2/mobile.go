package v2

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const mobileWarTimestampLayout = "20060102T150405.000Z"

var mobileHTTPClient = &http.Client{Timeout: 20 * time.Second}

type mobileMatchupStats struct {
	count       int
	starTotals  int
	destruction float64
	starsCount  map[string]int
}

type mobileWarHitsFilter struct {
	PlayerTags     []string
	ClanTags       []string
	TimestampStart int64
	TimestampEnd   int64
	Limit          int
	OwnTH          []int
	EnemyTH        []int
	SameTH         bool
	Types          []string
	FreshOnly      *bool
	MinStars       *int
	MaxStars       *int
	Stars          []int
	Season         string
	MinDestruction *float64
	MaxDestruction *float64
	MapPositionMin *int
	MapPositionMax *int
}

// publicMobileConfig returns public mobile app configuration values.
//
// @Summary Get public app configuration
// @Description Returns client-safe configuration values for the mobile app.
// @Tags Mobile App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/public-config [get]
func publicMobileConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"sentry_dsn": a.Config.SentryDSNMobile,
		})
	}
}

// mobileInitialization returns the initial mobile account payload.
//
// @Summary Initialize all account data for mobile app
// @Description Returns a minimal initialization payload for the mobile app based on the supplied player tags.
// @Tags Mobile App
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.MobilePlayerTagsRequest true "Initialization payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/initialization [post]
func mobileInitialization(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.MobilePlayerTagsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerTags := mobileNormalizeUniqueTags(body.PlayerTags)
		if len(playerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}

		ctx := c.UserContext()
		playersBasic := mobileFetchPlayersBasic(ctx, a, playerTags)

		clanTags := mobileExtractClanTags(playersBasic)

		var playersExtended []map[string]any
		var clanBundle map[string]any
		var playerWarStats []any
		var clanWarStats []any
		var wg sync.WaitGroup
		wg.Add(3)
		go func() {
			defer wg.Done()
			playersExtended = mobileFetchPlayersExtended(ctx, a, playerTags, playersBasic)
		}()
		go func() {
			defer wg.Done()
			clanBundle = mobileFetchClanBundle(ctx, a, clanTags)
		}()
		go func() {
			defer wg.Done()
			playerWarStats, clanWarStats = mobileFetchInitializationWarStats(ctx, a, playerTags, clanTags)
		}()
		wg.Wait()
		clanBundle = mobileClanBundleContract(clanBundle)
		clanBundle["clan_war_stats"] = playerWarStatsOrEmpty(clanWarStats)

		return apptypes.JSON(c, fiber.StatusOK, mobileInitializationResponse(
			playerTags,
			clanTags,
			playersExtended,
			playersBasic,
			clanBundle,
			playerWarStats,
			apptypes.UserID(c.UserContext()),
			time.Now().UTC(),
		))
	}
}

func mobileInitializationResponse(
	playerTags []string,
	clanTags []string,
	playersExtended []map[string]any,
	playersBasic []map[string]any,
	clanBundle map[string]any,
	playerWarStats []any,
	userID string,
	fetchTime time.Time,
) map[string]any {
	return map[string]any{
		"players":       playerMapsOrEmpty(playersExtended),
		"players_basic": playerMapsOrEmpty(playersBasic),
		"clans":         mobileClanBundleContract(clanBundle),
		"war_stats":     playerWarStatsOrEmpty(playerWarStats),
		"clan_tags":     playerStringsOrEmpty(clanTags),
		"metadata": map[string]any{
			"total_players": len(playerTags),
			"total_clans":   len(clanTags),
			"fetch_time":    fetchTime.Format(time.RFC3339),
			"user_id":       userID,
		},
	}
}

func mobileClanBundleContract(bundle map[string]any) map[string]any {
	out := map[string]any{
		"clan_details":    map[string]any{},
		"clan_stats":      map[string]any{},
		"war_data":        []any{},
		"join_leave_data": map[string]any{},
		"capital_data":    []any{},
		"war_log_data":    []any{},
		"clan_war_stats":  []any{},
		"cwl_data":        []any{},
	}
	for key, value := range bundle {
		if value != nil {
			out[key] = value
		}
	}
	return out
}

func playerMapsOrEmpty(items []map[string]any) []map[string]any {
	if items == nil {
		return []map[string]any{}
	}
	return items
}

func playerWarStatsOrEmpty(items []any) []any {
	if items == nil {
		return []any{}
	}
	return items
}

func playerStringsOrEmpty(items []string) []string {
	if items == nil {
		return []string{}
	}
	return items
}

func mobileFetchInitializationWarStats(ctx context.Context, a apptypes.Deps, playerTags []string, clanTags []string) ([]any, []any) {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	filter := mobileWarHitsFilter{
		TimestampStart: time.Now().UTC().AddDate(0, -6, 0).Unix(),
		TimestampEnd:   time.Now().UTC().Unix(),
	}
	wars := mobileFindRelevantWarDocs(ctx, a, playerTags, clanTags, filter.TimestampStart, filter.TimestampEnd)
	if len(wars) == 0 {
		return []any{}, []any{}
	}

	selectedPlayers := make(map[string]bool, len(playerTags))
	for _, tag := range playerTags {
		selectedPlayers[tag] = true
	}
	selectedClans := make(map[string]bool, len(clanTags))
	for _, tag := range clanTags {
		selectedClans[tag] = true
	}

	playerAggregates := map[string]*mobilePlayerWarAggregate{}
	clanAggregates := map[string]*mobileClanWarAggregate{}
	for _, war := range wars {
		if !mobileWarMatchesFilter(war, filter) {
			continue
		}
		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulatePlayerWarAggregates(war, cleanWar, freshOrders, selectedPlayers, filter, playerAggregates)
		mobileAccumulateClanWarAggregates(war, cleanWar, freshOrders, selectedClans, filter, clanAggregates)
	}

	return mobileBuildPlayerWarResults(playerAggregates, playerTags, filter.TimestampStart, filter.TimestampEnd),
		mobileBuildClanWarResults(clanAggregates, clanTags, filter.TimestampStart, filter.TimestampEnd)
}

func mobileNormalizeUniqueTags(tags []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := playerNormalizeTag(raw)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func mobileNormalizeUniqueClanTags(tags []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := warFixTag(raw)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func mobileDefaultPlayerWarHitsFilter(playerTags []string) mobileWarHitsFilter {
	return mobileWarHitsFilter{
		PlayerTags:     mobileNormalizeUniqueTags(playerTags),
		TimestampStart: time.Now().UTC().AddDate(0, -6, 0).Unix(),
		TimestampEnd:   time.Now().UTC().Unix(),
	}
}

func mobileDefaultClanWarHitsFilter(clanTags []string) mobileWarHitsFilter {
	return mobileWarHitsFilter{
		ClanTags:       mobileNormalizeUniqueClanTags(clanTags),
		TimestampStart: time.Now().UTC().AddDate(0, -6, 0).Unix(),
		TimestampEnd:   time.Now().UTC().Unix(),
	}
}

func mobileDecodeWarHitsFilter(c *fiber.Ctx) (mobileWarHitsFilter, error) {
	var raw map[string]any
	if err := apptypes.DecodeJSON(c, &raw); err != nil {
		return mobileWarHitsFilter{}, err
	}

	filter := mobileWarHitsFilter{
		PlayerTags:     mobileNormalizeUniqueTags(append(mobileStringSliceFlexible(raw["player_tags"]), mobileStringSliceFlexible(raw["players"])...)),
		ClanTags:       mobileNormalizeUniqueClanTags(mobileStringSliceFlexible(raw["clan_tags"])),
		TimestampStart: 0,
		TimestampEnd:   2527625513,
	}
	if value, ok := mobileOptionalInt64(raw, "timestamp_start"); ok {
		filter.TimestampStart = value
	}
	if value, ok := mobileOptionalInt64(raw, "timestamp_end"); ok {
		filter.TimestampEnd = value
	}
	if value, ok := mobileOptionalInt(raw, "limit"); ok && value > 0 {
		filter.Limit = value
	}
	filter.OwnTH = mobileIntSliceFlexible(raw["own_th"])
	filter.EnemyTH = mobileIntSliceFlexible(raw["enemy_th"])
	if value, ok := raw["same_th"]; ok {
		filter.SameTH = mobileBool(value)
	}
	filter.Types = mobileNormalizeWarTypes(mobileStringSliceFlexible(raw["type"]))
	filter.Stars = mobileIntSliceFlexible(raw["stars"])
	if value, ok := mobileOptionalBool(raw, "fresh_only"); ok {
		filter.FreshOnly = &value
	}
	if value, ok := mobileOptionalInt(raw, "min_stars"); ok {
		filter.MinStars = &value
	}
	if value, ok := mobileOptionalInt(raw, "max_stars"); ok {
		filter.MaxStars = &value
	}
	if value, ok := mobileOptionalFloat(raw, "min_destruction"); ok {
		filter.MinDestruction = &value
	}
	if value, ok := mobileOptionalFloat(raw, "max_destruction"); ok {
		filter.MaxDestruction = &value
	}
	if value, ok := mobileOptionalInt(raw, "map_position_min"); ok {
		filter.MapPositionMin = &value
	}
	if value, ok := mobileOptionalInt(raw, "map_position_max"); ok {
		filter.MapPositionMax = &value
	}
	if season, ok := raw["season"].(string); ok {
		filter.Season = strings.TrimSpace(season)
	}
	return filter, nil
}

func mobileFetchPlayersBasic(ctx context.Context, a apptypes.Deps, playerTags []string) []map[string]any {
	results := make([]map[string]any, len(playerTags))
	var wg sync.WaitGroup
	for idx, tag := range playerTags {
		wg.Add(1)
		go func(i int, playerTag string) {
			defer wg.Done()
			player, err := a.Clash.GetPlayer(ctx, playerTag)
			if err != nil || player == nil {
				return
			}
			results[i] = playerStructToMap(player)
		}(idx, tag)
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

func mobileFetchPlayersExtended(ctx context.Context, a apptypes.Deps, playerTags []string, playersBasic []map[string]any) []map[string]any {
	basicByTag := map[string]map[string]any{}
	for _, player := range playersBasic {
		tag := mobileString(player["tag"])
		if tag != "" {
			basicByTag[tag] = player
		}
	}

	proj := options.Find().SetProjection(bson.M{
		"_id": 0, "tag": 1, "donations": 1, "clan_games": 1,
		"season_pass": 1, "activity": 1, "last_online": 1, "last_online_time": 1,
		"attack_wins": 1, "dark_elixir": 1, "gold": 1, "capital_gold": 1,
		"season_trophies": 1, "last_updated": 1,
	})

	statsMap := map[string]map[string]any{}
	if cur, err := a.Store.C.PlayerStats.Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}}, proj); err == nil {
		var rows []bson.M
		if err := cur.All(ctx, &rows); err == nil {
			for _, row := range rows {
				clean := mobileMap(row)
				tag := mobileString(clean["tag"])
				if tag != "" {
					statsMap[tag] = clean
				}
			}
		}
	}

	raidDataByClan := mobileFetchPlayerRaidDataBatch(ctx, a, mobileExtractClanTags(playersBasic))

	results := make([]map[string]any, len(playerTags))
	var wg sync.WaitGroup
	for idx, tag := range playerTags {
		wg.Add(1)
		go func(i int, playerTag string) {
			defer wg.Done()
			item := map[string]any{
				"tag":                playerTag,
				"legends_by_season":  map[string]any{},
				"legend_eos_ranking": []any{},
				"rankings": map[string]any{
					"tag":                 playerTag,
					"country_code":        nil,
					"country_name":        nil,
					"local_rank":          nil,
					"global_rank":         nil,
					"builder_global_rank": nil,
					"builder_local_rank":  nil,
				},
				"raid_data": map[string]any{},
				"war_data":  map[string]any{},
			}

			if stats := statsMap[playerTag]; stats != nil {
				for key, value := range stats {
					if key == "tag" {
						continue
					}
					item[key] = value
				}
			}

			clanTag := ""
			if basic := basicByTag[playerTag]; basic != nil {
				clanTag = mobileString(mobileMap(basic["clan"])["tag"])
			}

			var legendRankings []any
			var rankings map[string]any
			var raidData map[string]any
			var warData map[string]any
			var itemWG sync.WaitGroup
			itemWG.Add(4)
			go func() {
				defer itemWG.Done()
				legendRankings = mobileFetchLegendRankings(ctx, a, playerTag, 10)
			}()
			go func() {
				defer itemWG.Done()
				rankings = mobileFetchCurrentRankings(ctx, a, playerTag)
			}()
			go func() {
				defer itemWG.Done()
				raidData = mobileLookupPlayerRaidData(raidDataByClan, playerTag, clanTag)
			}()
			go func() {
				defer itemWG.Done()
				warData = mobileFetchPlayerWarContext(ctx, a, playerTag, clanTag)
			}()
			itemWG.Wait()

			if legendRankings != nil {
				item["legend_eos_ranking"] = legendRankings
			}
			if rankings != nil {
				item["rankings"] = rankings
			}
			if raidData != nil {
				item["raid_data"] = raidData
			}
			if warData != nil {
				item["war_data"] = warData
			}
			results[i] = item
		}(idx, tag)
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

func mobileFetchLegendRankings(ctx context.Context, a apptypes.Deps, tag string, limit int64) []any {
	findOpts := options.Find().SetSort(bson.M{"season": -1}).SetLimit(limit).SetProjection(bson.M{"_id": 0})
	cur, err := a.Store.DB.RankingHistory.Collection("history_db").Find(ctx, bson.M{"tag": tag}, findOpts)
	if err != nil {
		return []any{}
	}
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		return []any{}
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, mobileMap(row))
	}
	return out
}

func mobileFetchCurrentRankings(ctx context.Context, a apptypes.Deps, tag string) map[string]any {
	result := map[string]any{
		"tag":                 tag,
		"country_code":        nil,
		"country_name":        nil,
		"local_rank":          nil,
		"global_rank":         nil,
		"builder_global_rank": nil,
		"builder_local_rank":  nil,
	}

	var leaderboard bson.M
	if err := a.Store.C.LeaderboardDB.FindOne(ctx, bson.M{"tag": tag}, options.FindOne().SetProjection(bson.M{"_id": 0})).Decode(&leaderboard); err == nil {
		clean := mobileMap(leaderboard)
		for key, value := range clean {
			result[key] = value
		}
	}

	if result["global_rank"] == nil {
		var fallback bson.M
		if err := a.Store.C.LegendRankings.FindOne(ctx, bson.M{"tag": tag}, options.FindOne().SetProjection(bson.M{"_id": 0, "rank": 1})).Decode(&fallback); err == nil {
			result["global_rank"] = fallback["rank"]
		}
	}

	return result
}

func mobileFetchPlayerRaidDataBatch(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]map[string]map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	if len(clanTags) == 0 {
		return map[string]map[string]map[string]any{}
	}

	out := make(map[string]map[string]map[string]any, len(clanTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, clanTag := range clanTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			var row bson.M
			err := a.Store.C.RaidWeekendDB.FindOne(
				ctx,
				bson.M{"clan_tag": tag},
				options.FindOne().SetSort(bson.M{"data.endTime": -1}).SetProjection(bson.M{"_id": 0, "data.members": 1}),
			).Decode(&row)
			if err != nil {
				return
			}

			members := make(map[string]map[string]any)
			for _, rawMember := range mobileList(mobileMap(mobileMap(row)["data"])["members"]) {
				member := mobileMap(rawMember)
				playerTag := mobileString(member["tag"])
				if playerTag == "" {
					continue
				}
				members[playerTag] = map[string]any{
					"attacks_done": mobileInt(member["attackCount"]),
					"attack_limit": mobileInt(member["attackLimit"]) + mobileInt(member["bonusAttackLimit"]),
				}
			}

			mu.Lock()
			out[tag] = members
			mu.Unlock()
		}(clanTag)
	}
	wg.Wait()
	return out
}

func mobileLookupPlayerRaidData(raidDataByClan map[string]map[string]map[string]any, playerTag string, clanTag string) map[string]any {
	if clanTag == "" {
		return map[string]any{}
	}
	if members := raidDataByClan[clanTag]; members != nil {
		if playerData := members[playerTag]; playerData != nil {
			return playerData
		}
	}
	return map[string]any{}
}

func mobileFetchPlayerWarContext(ctx context.Context, a apptypes.Deps, playerTag string, currentClanTag string) map[string]any {
	var warTimer bson.M
	err := a.Store.C.WarTimer.FindOne(ctx, bson.M{"_id": playerTag}, options.FindOne().SetProjection(bson.M{"_id": 0, "clans": 1})).Decode(&warTimer)
	if err != nil {
		return map[string]any{}
	}

	clans := mobileStringList(mobileMap(warTimer)["clans"])
	if currentClanTag != "" && mobileContains(clans, currentClanTag) {
		return map[string]any{}
	}
	if len(clans) == 0 {
		return map[string]any{}
	}
	return currentWarSummary(ctx, a, clans[0])
}

func mobileExtractClanTags(playersBasic []map[string]any) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(playersBasic))
	for _, player := range playersBasic {
		clanTag := mobileString(mobileMap(player["clan"])["tag"])
		if clanTag == "" || seen[clanTag] {
			continue
		}
		seen[clanTag] = true
		out = append(out, clanTag)
	}
	return out
}

func mobileFetchClanBundle(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]any {
	bundle := map[string]any{
		"clan_details":    map[string]any{},
		"clan_stats":      map[string]any{},
		"war_data":        []any{},
		"join_leave_data": map[string]any{},
		"capital_data":    []any{},
		"war_log_data":    []any{},
		"clan_war_stats":  []any{},
		"cwl_data":        []any{},
	}
	if len(clanTags) == 0 {
		return bundle
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	set := func(key string, value any) {
		mu.Lock()
		defer mu.Unlock()
		bundle[key] = value
	}

	wg.Add(5)
	go func() {
		defer wg.Done()
		set("clan_details", mobileFetchClanDetails(ctx, a, clanTags))
	}()
	go func() {
		defer wg.Done()
		set("join_leave_data", mobileFetchJoinLeaveData(ctx, a, clanTags))
	}()
	go func() {
		defer wg.Done()
		set("capital_data", mobileFetchCapitalData(clanTags, 10))
	}()
	go func() {
		defer wg.Done()
		set("war_log_data", mobileFetchClanWarLogs(clanTags))
	}()
	go func() {
		defer wg.Done()
		set("war_data", mobileFetchClanWarSummaries(ctx, a, clanTags))
	}()
	wg.Wait()

	return bundle
}

func mobileFetchClanDetails(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]any {
	out := make(map[string]any, len(clanTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, tag := range clanTags {
		wg.Add(1)
		go func(clanTag string) {
			defer wg.Done()
			url := "https://proxy.clashk.ing/v1/clans/" + strings.ReplaceAll(clanTag, "#", "%23")
			clan := mobileHTTPGetJSON(url)
			if clan == nil {
				return
			}
			mu.Lock()
			out[clanTag] = clan
			mu.Unlock()
		}(tag)
	}
	wg.Wait()
	return out
}

type mobileJoinLeaveEvent struct {
	Tag  string
	Name string
	Type string
	Time time.Time
}

func mobileFetchJoinLeaveData(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]any {
	seasonStart, seasonEnd := mobileCurrentMonthBounds()
	filter := bson.M{
		"clan": bson.M{"$in": clanTags},
		"time": bson.M{"$gte": seasonStart, "$lte": seasonEnd},
	}

	findOpts := options.Find().SetSort(bson.M{"time": -1})
	cur, err := a.Store.C.JoinLeaveHistory.Find(ctx, filter, findOpts)
	if err != nil {
		return map[string]any{}
	}

	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		return map[string]any{}
	}

	groupedDocs := map[string][]map[string]any{}
	groupedStats := map[string][]mobileJoinLeaveEvent{}
	for _, row := range rows {
		cleanAny := sanitize(row)
		clean, ok := cleanAny.(map[string]any)
		if !ok {
			continue
		}
		clanTag := mobileString(clean["clan"])
		if clanTag == "" {
			continue
		}
		eventTime, ok := mobileTime(clean["time"])
		if !ok {
			continue
		}
		groupedStats[clanTag] = append(groupedStats[clanTag], mobileJoinLeaveEvent{
			Tag:  mobileString(clean["tag"]),
			Name: mobileString(clean["name"]),
			Type: mobileString(clean["type"]),
			Time: eventTime,
		})
		clean["time"] = eventTime.UTC().Format(time.RFC3339)
		groupedDocs[clanTag] = append(groupedDocs[clanTag], clean)
	}

	out := map[string]any{}
	startUnix := seasonStart.Unix()
	endUnix := seasonEnd.Unix()
	for _, clanTag := range clanTags {
		events := groupedStats[clanTag]
		out[clanTag] = map[string]any{
			"clan_tag":        clanTag,
			"timestamp_start": startUnix,
			"timestamp_end":   endUnix,
			"stats":           mobileBuildJoinLeaveStats(events),
			"join_leave_list": mobileMapsToAny(groupedDocs[clanTag]),
		}
	}
	return out
}

func mobileBuildJoinLeaveStats(events []mobileJoinLeaveEvent) map[string]any {
	if len(events) == 0 {
		return map[string]any{
			"total_events":                0,
			"total_joins":                 0,
			"total_leaves":                0,
			"unique_players":              0,
			"moving_players":              0,
			"rejoined_players":            0,
			"first_event":                 nil,
			"last_event":                  nil,
			"most_moving_hour":            nil,
			"avg_time_between_join_leave": nil,
			"players_still_in_clan":       0,
			"players_left_forever":        0,
			"most_moving_players":         []any{},
		}
	}

	joinCount := 0
	leaveCount := 0
	byTag := map[string][]mobileJoinLeaveEvent{}
	tagCounts := map[string]int{}
	tagNames := map[string]string{}
	activePlayers := map[string]bool{}
	seenPlayers := map[string]bool{}
	hourCounts := map[int]int{}

	sortedAsc := append([]mobileJoinLeaveEvent(nil), events...)
	sort.Slice(sortedAsc, func(i, j int) bool {
		return sortedAsc[i].Time.Before(sortedAsc[j].Time)
	})

	for _, event := range sortedAsc {
		if event.Type == "join" {
			joinCount++
			activePlayers[event.Tag] = true
		} else if event.Type == "leave" {
			leaveCount++
			delete(activePlayers, event.Tag)
		}
		byTag[event.Tag] = append(byTag[event.Tag], event)
		tagCounts[event.Tag]++
		if tagNames[event.Tag] == "" {
			tagNames[event.Tag] = event.Name
		}
		seenPlayers[event.Tag] = true
		hourCounts[event.Time.UTC().Hour()]++
	}

	var (
		firstEvent time.Time
		lastEvent  time.Time
	)
	for idx, event := range sortedAsc {
		if idx == 0 || event.Time.Before(firstEvent) {
			firstEvent = event.Time
		}
		if idx == 0 || event.Time.After(lastEvent) {
			lastEvent = event.Time
		}
	}

	var totalDelta float64
	var deltaCount int
	stillInClan := 0
	leftForever := 0
	rejoinedPlayers := 0
	for _, tagEvents := range byTag {
		sort.Slice(tagEvents, func(i, j int) bool {
			return tagEvents[i].Time.Before(tagEvents[j].Time)
		})
		if len(tagEvents) > 1 {
			rejoinedPlayers++
		}
		for idx := 0; idx < len(tagEvents)-1; idx++ {
			if tagEvents[idx].Type == "join" && tagEvents[idx+1].Type == "leave" {
				totalDelta += tagEvents[idx+1].Time.Sub(tagEvents[idx].Time).Seconds()
				deltaCount++
			}
		}
		if tagEvents[len(tagEvents)-1].Type == "join" {
			stillInClan++
		} else if tagEvents[len(tagEvents)-1].Type == "leave" {
			leftForever++
		}
	}

	mostMovingHour := any(nil)
	mostMovingHourCount := -1
	for hour, count := range hourCounts {
		if count > mostMovingHourCount {
			mostMovingHour = hour
			mostMovingHourCount = count
		}
	}

	type pair struct {
		tag   string
		count int
	}
	topPairs := make([]pair, 0, len(tagCounts))
	for tag, count := range tagCounts {
		topPairs = append(topPairs, pair{tag: tag, count: count})
	}
	sort.Slice(topPairs, func(i, j int) bool {
		if topPairs[i].count == topPairs[j].count {
			return topPairs[i].tag < topPairs[j].tag
		}
		return topPairs[i].count > topPairs[j].count
	})

	topUsers := make([]any, 0, 3)
	for idx, item := range topPairs {
		if idx >= 3 {
			break
		}
		topUsers = append(topUsers, map[string]any{
			"tag":   item.tag,
			"name":  tagNames[item.tag],
			"count": item.count,
		})
	}

	var avgDelta any
	if deltaCount > 0 {
		avgDelta = mobileRound(totalDelta/float64(deltaCount), 2)
	}

	return map[string]any{
		"total_events":                len(events),
		"total_joins":                 joinCount,
		"total_leaves":                leaveCount,
		"unique_players":              len(seenPlayers),
		"moving_players":              len(activePlayers),
		"rejoined_players":            rejoinedPlayers,
		"first_event":                 firstEvent.UTC().Format(time.RFC3339),
		"last_event":                  lastEvent.UTC().Format(time.RFC3339),
		"most_moving_hour":            mostMovingHour,
		"avg_time_between_join_leave": avgDelta,
		"players_still_in_clan":       stillInClan,
		"players_left_forever":        leftForever,
		"most_moving_players":         topUsers,
	}
}

func mobileFetchCapitalData(clanTags []string, limit int) []any {
	results := make([]any, len(clanTags))
	var wg sync.WaitGroup
	for idx, tag := range clanTags {
		wg.Add(1)
		go func(i int, clanTag string) {
			defer wg.Done()
			url := "https://proxy.clashk.ing/v1/clans/" + strings.ReplaceAll(clanTag, "#", "%23") + "/capitalraidseasons?limit=" + strconv.Itoa(limit)
			data := mobileHTTPGetJSON(url)
			if data == nil {
				results[i] = map[string]any{"clan_tag": clanTag, "history": []any{}}
				return
			}
			results[i] = map[string]any{
				"clan_tag": clanTag,
				"history":  mobileList(data["items"]),
			}
		}(idx, tag)
	}
	wg.Wait()

	out := make([]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

func mobileFetchClanWarLogs(clanTags []string) []any {
	results := make([]any, len(clanTags))
	var wg sync.WaitGroup
	for idx, tag := range clanTags {
		wg.Add(1)
		go func(i int, clanTag string) {
			defer wg.Done()
			url := "https://proxy.clashk.ing/v1/clans/" + strings.ReplaceAll(clanTag, "#", "%23") + "/warlog"
			data := mobileHTTPGetJSON(url)
			items := []any{}
			if data != nil {
				items = mobileList(data["items"])
			}
			results[i] = map[string]any{
				"clan_tag": clanTag,
				"items":    items,
			}
		}(idx, tag)
	}
	wg.Wait()

	out := make([]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

func mobileFetchClanWarSummaries(ctx context.Context, a apptypes.Deps, clanTags []string) []any {
	results := make([]any, len(clanTags))
	var wg sync.WaitGroup
	for idx, tag := range clanTags {
		wg.Add(1)
		go func(i int, clanTag string) {
			defer wg.Done()
			results[i] = currentWarSummary(ctx, a, clanTag)
		}(idx, tag)
	}
	wg.Wait()

	out := make([]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

type mobilePlayerWarAggregate struct {
	Name     string
	Tag      string
	TownHall int
	Attacks  []map[string]any
	Defenses []map[string]any
	Wars     []map[string]any
}

type mobileClanWarAggregate struct {
	ClanTag string
	Players map[string]*mobilePlayerWarAggregate
	Wars    []map[string]any
}

func mobileFetchPlayerWarStats(ctx context.Context, a apptypes.Deps, playerTags []string) []any {
	return mobileFetchPlayerWarStatsWithFilter(ctx, a, mobileDefaultPlayerWarHitsFilter(playerTags))
}

func mobileFetchPlayerWarStatsWithFilter(ctx context.Context, a apptypes.Deps, filter mobileWarHitsFilter) []any {
	playerTags := mobileNormalizeUniqueTags(filter.PlayerTags)
	results := make([]any, len(playerTags))
	var wg sync.WaitGroup
	for idx, tag := range playerTags {
		wg.Add(1)
		go func(i int, playerTag string) {
			defer wg.Done()
			results[i] = mobileFetchSinglePlayerWarStats(ctx, a, playerTag, filter)
		}(idx, tag)
	}
	wg.Wait()

	out := make([]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

func mobileFetchClanWarStats(ctx context.Context, a apptypes.Deps, clanTags []string) []any {
	return mobileFetchClanWarStatsWithFilter(ctx, a, mobileDefaultClanWarHitsFilter(clanTags))
}

func mobileFetchClanWarStatsWithFilter(ctx context.Context, a apptypes.Deps, filter mobileWarHitsFilter) []any {
	clanTags := mobileNormalizeUniqueClanTags(filter.ClanTags)
	results := make([]any, len(clanTags))
	var wg sync.WaitGroup
	for idx, tag := range clanTags {
		wg.Add(1)
		go func(i int, clanTag string) {
			defer wg.Done()
			results[i] = mobileFetchSingleClanWarStats(ctx, a, clanTag, filter)
		}(idx, tag)
	}
	wg.Wait()

	out := make([]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

func mobileFetchSinglePlayerWarStats(ctx context.Context, a apptypes.Deps, playerTag string, filter mobileWarHitsFilter) any {
	playerTag = playerNormalizeTag(playerTag)
	if playerTag == "" {
		return nil
	}

	wars := mobileFindWarDocs(ctx, a, bson.A{
		bson.M{"$match": bson.M{"$and": bson.A{
			bson.M{"$or": bson.A{
				bson.M{"data.clan.members.tag": playerTag},
				bson.M{"data.opponent.members.tag": playerTag},
			}},
			bson.M{"data.preparationStartTime": bson.M{"$gte": mobileTimestampString(filter.TimestampStart)}},
			bson.M{"data.preparationStartTime": bson.M{"$lte": mobileTimestampString(filter.TimestampEnd)}},
		}}},
		bson.M{"$project": bson.M{"_id": 0, "data": "$data"}},
		bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
	})

	aggregates := map[string]*mobilePlayerWarAggregate{}
	selected := map[string]bool{playerTag: true}
	processedWars := 0

	for _, war := range wars {
		if filter.Limit > 0 && processedWars >= filter.Limit {
			break
		}
		if !mobileWarMatchesFilter(war, filter) {
			continue
		}
		processedWars++

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulatePlayerWarAggregates(war, cleanWar, freshOrders, selected, filter, aggregates)
	}

	results := mobileBuildPlayerWarResults(aggregates, []string{playerTag}, filter.TimestampStart, filter.TimestampEnd)
	if len(results) == 0 {
		return nil
	}
	return results[0]
}

func mobileFetchSingleClanWarStats(ctx context.Context, a apptypes.Deps, clanTag string, filter mobileWarHitsFilter) any {
	clanTag = warFixTag(clanTag)
	if clanTag == "" {
		return map[string]any{"clan_tag": "", "players": []any{}, "wars": []any{}}
	}

	wars := mobileFindWarDocs(ctx, a, bson.A{
		bson.M{"$match": bson.M{"$and": bson.A{
			bson.M{"$or": bson.A{
				bson.M{"data.clan.tag": clanTag},
				bson.M{"data.opponent.tag": clanTag},
			}},
			bson.M{"data.preparationStartTime": bson.M{"$gte": mobileTimestampString(filter.TimestampStart)}},
			bson.M{"data.preparationStartTime": bson.M{"$lte": mobileTimestampString(filter.TimestampEnd)}},
		}}},
		bson.M{"$project": bson.M{"_id": 0, "data": "$data"}},
		bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
	})

	agg := mobileGetOrCreateClanAggregate(map[string]*mobileClanWarAggregate{}, clanTag)
	processedWars := 0

	for _, war := range wars {
		if filter.Limit > 0 && processedWars >= filter.Limit {
			break
		}
		if !mobileWarMatchesFilter(war, filter) {
			continue
		}
		processedWars++

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulateClanWarAggregates(war, cleanWar, freshOrders, map[string]bool{clanTag: true}, filter, map[string]*mobileClanWarAggregate{clanTag: agg})
	}

	results := mobileBuildClanWarResults(map[string]*mobileClanWarAggregate{clanTag: agg}, []string{clanTag}, filter.TimestampStart, filter.TimestampEnd)
	if len(results) == 0 {
		return map[string]any{"clan_tag": clanTag, "players": []any{}, "wars": []any{}}
	}
	return results[0]
}

func mobileFindWarDocs(ctx context.Context, a apptypes.Deps, pipeline bson.A) []map[string]any {
	cur, err := a.Store.C.ClanWars.Aggregate(ctx, pipeline)
	if err != nil {
		return nil
	}

	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return nil
	}

	seen := map[string]bool{}
	out := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		data := mobileMap(doc["data"])
		if len(data) == 0 {
			continue
		}
		warID := mobileWarID(data)
		if warID == "" || seen[warID] {
			continue
		}
		seen[warID] = true
		out = append(out, data)
	}
	return out
}

func mobileFindRelevantWarDocs(ctx context.Context, a apptypes.Deps, playerTags []string, clanTags []string, startUnix int64, endUnix int64) []map[string]any {
	matchers := bson.A{}
	if len(playerTags) > 0 {
		matchers = append(matchers,
			bson.M{"data.clan.members.tag": bson.M{"$in": playerTags}},
			bson.M{"data.opponent.members.tag": bson.M{"$in": playerTags}},
		)
	}
	if len(clanTags) > 0 {
		matchers = append(matchers,
			bson.M{"data.clan.tag": bson.M{"$in": clanTags}},
			bson.M{"data.opponent.tag": bson.M{"$in": clanTags}},
		)
	}
	if len(matchers) == 0 {
		return nil
	}

	return mobileFindWarDocs(ctx, a, bson.A{
		bson.M{"$match": bson.M{"$and": bson.A{
			bson.M{"$or": matchers},
			bson.M{"data.preparationStartTime": bson.M{"$gte": mobileTimestampString(startUnix)}},
			bson.M{"data.preparationStartTime": bson.M{"$lte": mobileTimestampString(endUnix)}},
		}}},
		bson.M{"$project": bson.M{"_id": 0, "data": "$data"}},
		bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
	})
}

func mobileFreshAttackOrders(war map[string]any) map[string]int {
	out := map[string]int{}
	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			member := mobileMap(rawMember)
			for _, rawAttack := range mobileList(member["attacks"]) {
				attack := mobileMap(rawAttack)
				defenderTag := mobileString(attack["defenderTag"])
				order := mobileInt(attack["order"])
				if defenderTag == "" || order == 0 {
					continue
				}
				if current, ok := out[defenderTag]; !ok || order < current {
					out[defenderTag] = order
				}
			}
		}
	}
	return out
}

func mobileIsFreshAttack(attack map[string]any, freshOrders map[string]int) bool {
	defenderTag := mobileString(attack["defenderTag"])
	order := mobileInt(attack["order"])
	if defenderTag == "" || order == 0 {
		return false
	}
	freshOrder, ok := freshOrders[defenderTag]
	return ok && order == freshOrder
}

func mobileWarMatchesFilter(war map[string]any, filter mobileWarHitsFilter) bool {
	warType := strings.ToLower(mobileWarType(war))
	if len(filter.Types) > 0 && !mobileContains(filter.Types, warType) {
		return false
	}
	if filter.Season != "" {
		prep, ok := mobileTime(war["preparationStartTime"])
		if !ok {
			return false
		}
		yearMonth := prep.UTC().Format("2006-01")
		if yearMonth != filter.Season {
			return false
		}
	}
	return true
}

func mobileAttackMatchesFilter(attack map[string]any, filter mobileWarHitsFilter) bool {
	if filter.FreshOnly != nil && *filter.FreshOnly && !mobileBool(attack["fresh"]) {
		return false
	}
	attacker := mobileMap(attack["attacker"])
	defender := mobileMap(attack["defender"])
	if filter.SameTH && mobileInt(attacker["townhallLevel"]) != mobileInt(defender["townhallLevel"]) {
		return false
	}
	return mobileHitMatchesCommonFilters(
		mobileInt(attacker["townhallLevel"]),
		mobileInt(defender["townhallLevel"]),
		mobileInt(attack["stars"]),
		mobileFloat(attack["destructionPercentage"]),
		mobileInt(defender["mapPosition"]),
		filter,
	)
}

func mobileDefenseMatchesFilter(defense map[string]any, filter mobileWarHitsFilter) bool {
	if filter.FreshOnly != nil && *filter.FreshOnly && !mobileBool(defense["fresh"]) {
		return false
	}
	attacker := mobileMap(defense["attacker"])
	defender := mobileMap(defense["defender"])
	if filter.SameTH && mobileInt(attacker["townhallLevel"]) != mobileInt(defender["townhallLevel"]) {
		return false
	}
	return mobileHitMatchesCommonFilters(
		mobileInt(defender["townhallLevel"]),
		mobileInt(attacker["townhallLevel"]),
		mobileInt(defense["stars"]),
		mobileFloat(defense["destructionPercentage"]),
		mobileInt(attacker["mapPosition"]),
		filter,
	)
}

func mobileHitMatchesCommonFilters(ownTH int, enemyTH int, stars int, destruction float64, enemyPosition int, filter mobileWarHitsFilter) bool {
	if !mobileIntMatchesFilter(ownTH, filter.OwnTH) {
		return false
	}
	if !mobileIntMatchesFilter(enemyTH, filter.EnemyTH) {
		return false
	}
	if filter.MinStars != nil && stars < *filter.MinStars {
		return false
	}
	if filter.MaxStars != nil && stars > *filter.MaxStars {
		return false
	}
	if len(filter.Stars) > 0 && !mobileIntSliceContains(filter.Stars, stars) {
		return false
	}
	if filter.MinDestruction != nil && destruction < *filter.MinDestruction {
		return false
	}
	if filter.MaxDestruction != nil && destruction > *filter.MaxDestruction {
		return false
	}
	if filter.MapPositionMin != nil && enemyPosition < *filter.MapPositionMin {
		return false
	}
	if filter.MapPositionMax != nil && enemyPosition > *filter.MapPositionMax {
		return false
	}
	return true
}

func mobileWarID(war map[string]any) string {
	clanTag := mobileString(mobileMap(war["clan"])["tag"])
	opponentTag := mobileString(mobileMap(war["opponent"])["tag"])
	prepTime := mobileString(war["preparationStartTime"])
	if clanTag == "" && opponentTag == "" && prepTime == "" {
		return ""
	}
	if clanTag > opponentTag {
		clanTag, opponentTag = opponentTag, clanTag
	}
	return clanTag + "|" + opponentTag + "|" + prepTime
}

func mobileCleanWarData(war map[string]any) map[string]any {
	out := mobileCloneMap(war)
	clan := mobileCloneMap(mobileMap(out["clan"]))
	delete(clan, "members")
	out["clan"] = clan
	opponent := mobileCloneMap(mobileMap(out["opponent"]))
	delete(opponent, "members")
	out["opponent"] = opponent
	return out
}

func mobileGetOrCreatePlayerAggregate(store map[string]*mobilePlayerWarAggregate, tag string, member map[string]any) *mobilePlayerWarAggregate {
	if agg := store[tag]; agg != nil {
		if agg.Name == "" {
			agg.Name = mobileString(member["name"])
		}
		if th := mobileInt(member["townhallLevel"]); th > agg.TownHall {
			agg.TownHall = th
		}
		return agg
	}
	agg := &mobilePlayerWarAggregate{
		Name:     mobileString(member["name"]),
		Tag:      tag,
		TownHall: mobileInt(member["townhallLevel"]),
	}
	store[tag] = agg
	return agg
}

func mobileGetOrCreateClanAggregate(store map[string]*mobileClanWarAggregate, clanTag string) *mobileClanWarAggregate {
	if agg := store[clanTag]; agg != nil {
		return agg
	}
	agg := &mobileClanWarAggregate{
		ClanTag: clanTag,
		Players: map[string]*mobilePlayerWarAggregate{},
	}
	store[clanTag] = agg
	return agg
}

func mobileAccumulatePlayerWarAggregates(war map[string]any, cleanWar map[string]any, freshOrders map[string]int, selected map[string]bool, filter mobileWarHitsFilter, aggregates map[string]*mobilePlayerWarAggregate) {
	if len(selected) == 0 {
		return
	}

	memberDataByTag := map[string]map[string]any{}
	originalByTag := map[string]map[string]any{}
	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			member := mobileMap(rawMember)
			tag := mobileString(member["tag"])
			if !selected[tag] {
				continue
			}

			agg := mobileGetOrCreatePlayerAggregate(aggregates, tag, member)
			memberData := mobileBuildWarMemberData(member)
			for _, rawAttack := range mobileList(member["attacks"]) {
				attack := mobileBuildAttackData(mobileMap(rawAttack), member, war, freshOrders)
				if !mobileAttackMatchesFilter(attack, filter) {
					continue
				}
				memberData["attacks"] = append(memberData["attacks"].([]any), attack)
				agg.Attacks = append(agg.Attacks, attack)
			}
			memberDataByTag[tag] = memberData
			originalByTag[tag] = member
		}
	}
	if len(memberDataByTag) == 0 {
		return
	}

	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			member := mobileMap(rawMember)
			for _, rawAttack := range mobileList(member["attacks"]) {
				attack := mobileMap(rawAttack)
				defenderTag := mobileString(attack["defenderTag"])
				memberData := memberDataByTag[defenderTag]
				if memberData == nil {
					continue
				}
				defense := mobileBuildDefenseData(attack, member, originalByTag[defenderTag], mobileWarType(war), freshOrders)
				if !mobileDefenseMatchesFilter(defense, filter) {
					continue
				}
				memberData["defenses"] = append(memberData["defenses"].([]any), defense)
				aggregates[defenderTag].Defenses = append(aggregates[defenderTag].Defenses, defense)
			}
		}
	}

	for tag, memberData := range memberDataByTag {
		original := originalByTag[tag]
		missedAttacks := mobileMax(mobileInt(cleanWar["attacksPerMember"])-len(mobileList(original["attacks"])), 0)
		missedDefenses := 1
		if original["bestOpponentAttack"] != nil {
			missedDefenses = 0
		}
		aggregates[tag].Wars = append(aggregates[tag].Wars, map[string]any{
			"war_data":       cleanWar,
			"members":        []any{memberData},
			"missedAttacks":  missedAttacks,
			"missedDefenses": missedDefenses,
		})
	}
}

func mobileAccumulateClanWarAggregates(war map[string]any, cleanWar map[string]any, freshOrders map[string]int, selected map[string]bool, filter mobileWarHitsFilter, aggregates map[string]*mobileClanWarAggregate) {
	if len(selected) == 0 {
		return
	}

	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		clanTag := mobileString(side["tag"])
		if !selected[clanTag] {
			continue
		}

		agg := mobileGetOrCreateClanAggregate(aggregates, clanTag)
		memberDataByTag := map[string]map[string]any{}
		originalByTag := map[string]map[string]any{}
		membersList := make([]any, 0, len(mobileList(side["members"])))

		for _, rawMember := range mobileList(side["members"]) {
			member := mobileMap(rawMember)
			tag := mobileString(member["tag"])
			playerAgg := mobileGetOrCreatePlayerAggregate(agg.Players, tag, member)
			memberData := mobileBuildWarMemberData(member)
			for _, rawAttack := range mobileList(member["attacks"]) {
				attack := mobileBuildAttackData(mobileMap(rawAttack), member, war, freshOrders)
				if !mobileAttackMatchesFilter(attack, filter) {
					continue
				}
				memberData["attacks"] = append(memberData["attacks"].([]any), attack)
				playerAgg.Attacks = append(playerAgg.Attacks, attack)
			}
			memberDataByTag[tag] = memberData
			originalByTag[tag] = member
			membersList = append(membersList, memberData)
		}

		for _, warSideKey := range []string{"clan", "opponent"} {
			warSide := mobileMap(war[warSideKey])
			for _, rawMember := range mobileList(warSide["members"]) {
				member := mobileMap(rawMember)
				for _, rawAttack := range mobileList(member["attacks"]) {
					attack := mobileMap(rawAttack)
					defenderTag := mobileString(attack["defenderTag"])
					memberData := memberDataByTag[defenderTag]
					if memberData == nil {
						continue
					}
					defense := mobileBuildDefenseData(attack, member, originalByTag[defenderTag], mobileWarType(war), freshOrders)
					if !mobileDefenseMatchesFilter(defense, filter) {
						continue
					}
					memberData["defenses"] = append(memberData["defenses"].([]any), defense)
					agg.Players[defenderTag].Defenses = append(agg.Players[defenderTag].Defenses, defense)
				}
			}
		}

		for tag, memberData := range memberDataByTag {
			original := originalByTag[tag]
			missedAttacks := mobileMax(mobileInt(cleanWar["attacksPerMember"])-len(mobileList(original["attacks"])), 0)
			missedDefenses := 1
			if original["bestOpponentAttack"] != nil {
				missedDefenses = 0
			}
			agg.Players[tag].Wars = append(agg.Players[tag].Wars, map[string]any{
				"war_data":       cleanWar,
				"members":        []any{memberData},
				"missedAttacks":  missedAttacks,
				"missedDefenses": missedDefenses,
			})
		}

		agg.Wars = append(agg.Wars, map[string]any{
			"war_data": cleanWar,
			"members":  membersList,
		})
	}
}

func mobileBuildWarMemberData(member map[string]any) map[string]any {
	return map[string]any{
		"tag":             mobileString(member["tag"]),
		"name":            mobileString(member["name"]),
		"townhallLevel":   mobileInt(member["townhallLevel"]),
		"mapPosition":     mobileInt(member["mapPosition"]),
		"opponentAttacks": mobileInt(member["opponentAttacks"]),
		"attacks":         []any{},
		"defenses":        []any{},
	}
}

func mobileBuildMiniWarMember(member map[string]any) map[string]any {
	return map[string]any{
		"tag":             mobileString(member["tag"]),
		"name":            mobileString(member["name"]),
		"townhallLevel":   mobileInt(member["townhallLevel"]),
		"mapPosition":     mobileInt(member["mapPosition"]),
		"opponentAttacks": mobileInt(member["opponentAttacks"]),
	}
}

func mobileBuildAttackData(attack map[string]any, attackerMember map[string]any, war map[string]any, freshOrders map[string]int) map[string]any {
	out := mobileCloneMap(attack)
	out["attacker"] = mobileBuildMiniWarMember(attackerMember)
	if defender := mobileFindWarMember(war, mobileString(attack["defenderTag"])); defender != nil {
		out["defender"] = mobileBuildMiniWarMember(defender)
	}
	out["attack_order"] = mobileInt(attack["order"])
	out["fresh"] = mobileIsFreshAttack(attack, freshOrders)
	out["war_type"] = strings.ToLower(mobileWarType(war))
	return out
}

func mobileBuildDefenseData(attack map[string]any, attackerMember map[string]any, defenderMember map[string]any, warType string, freshOrders map[string]int) map[string]any {
	out := mobileCloneMap(attack)
	out["attacker"] = mobileBuildMiniWarMember(attackerMember)
	out["defender"] = mobileBuildMiniWarMember(defenderMember)
	out["attack_order"] = mobileInt(attack["order"])
	out["fresh"] = mobileIsFreshAttack(attack, freshOrders)
	out["war_type"] = strings.ToLower(warType)
	if out["war_type"] == "" {
		out["war_type"] = "all"
	}
	return out
}

func mobileFindWarMember(war map[string]any, tag string) map[string]any {
	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			member := mobileMap(rawMember)
			if mobileString(member["tag"]) == tag {
				return member
			}
		}
	}
	return nil
}

func mobileBuildPlayerWarResults(aggregates map[string]*mobilePlayerWarAggregate, order []string, startUnix int64, endUnix int64) []any {
	results := make([]any, 0, len(order))
	for _, tag := range order {
		agg := aggregates[tag]
		if agg == nil {
			continue
		}
		results = append(results, map[string]any{
			"name":          agg.Name,
			"tag":           agg.Tag,
			"townhallLevel": agg.TownHall,
			"stats":         mobileComputeWarStatsByType(agg.Attacks, agg.Defenses, agg.Wars),
			"timeRange": map[string]any{
				"start": startUnix,
				"end":   endUnix,
			},
			"wars": agg.Wars,
		})
	}
	return results
}

func mobileBuildClanWarResults(aggregates map[string]*mobileClanWarAggregate, order []string, startUnix int64, endUnix int64) []any {
	results := make([]any, 0, len(order))
	for _, clanTag := range order {
		agg := aggregates[clanTag]
		if agg == nil {
			continue
		}

		playerTags := make([]string, 0, len(agg.Players))
		for tag := range agg.Players {
			playerTags = append(playerTags, tag)
		}
		sort.Strings(playerTags)
		results = append(results, map[string]any{
			"clan_tag": clanTag,
			"players":  mobileBuildPlayerWarResults(agg.Players, playerTags, startUnix, endUnix),
			"wars":     agg.Wars,
		})
	}
	return results
}

func mobileComputeWarStatsByType(attacks []map[string]any, defenses []map[string]any, wars []map[string]any) map[string]any {
	type warBucket struct {
		attacks        []map[string]any
		defenses       []map[string]any
		missedAttacks  int
		missedDefenses int
		warsCount      int
	}

	buckets := map[string]*warBucket{
		"all":      &warBucket{},
		"random":   &warBucket{},
		"cwl":      &warBucket{},
		"friendly": &warBucket{},
	}

	for _, war := range wars {
		warType := strings.ToLower(mobileWarType(mobileMap(war["war_data"])))
		buckets["all"].missedAttacks += mobileInt(war["missedAttacks"])
		buckets["all"].missedDefenses += mobileInt(war["missedDefenses"])
		buckets["all"].warsCount++
		if bucket := buckets[warType]; bucket != nil {
			bucket.missedAttacks += mobileInt(war["missedAttacks"])
			bucket.missedDefenses += mobileInt(war["missedDefenses"])
			bucket.warsCount++
		}
	}

	for _, attack := range attacks {
		warType := strings.ToLower(mobileString(attack["war_type"]))
		buckets["all"].attacks = append(buckets["all"].attacks, attack)
		if bucket := buckets[warType]; bucket != nil {
			bucket.attacks = append(bucket.attacks, attack)
		}
	}

	for _, defense := range defenses {
		warType := strings.ToLower(mobileString(defense["war_type"]))
		buckets["all"].defenses = append(buckets["all"].defenses, defense)
		if bucket := buckets[warType]; bucket != nil {
			bucket.defenses = append(bucket.defenses, defense)
		}
	}

	out := map[string]any{}
	for key, bucket := range buckets {
		out[key] = mobileComputeWarBucket(bucket.attacks, bucket.defenses, bucket.missedAttacks, bucket.missedDefenses, bucket.warsCount)
	}
	return out
}

func mobileComputeWarBucket(attacks []map[string]any, defenses []map[string]any, missedAttacks int, missedDefenses int, warsCount int) map[string]any {
	starsCount := mobileStarsTemplate()
	starsCountDef := mobileStarsTemplate()
	attackMatchups := map[string]*mobileMatchupStats{}
	defenseMatchups := map[string]*mobileMatchupStats{}

	for _, attack := range attacks {
		stars := mobileInt(attack["stars"])
		starsCount[strconv.Itoa(stars)]++
		attacker := mobileMap(attack["attacker"])
		defender := mobileMap(attack["defender"])
		key := strconv.Itoa(mobileInt(attacker["townhallLevel"])) + "vs" + strconv.Itoa(mobileInt(defender["townhallLevel"]))
		stat := attackMatchups[key]
		if stat == nil {
			stat = &mobileMatchupStats{starsCount: mobileStarsTemplate()}
			attackMatchups[key] = stat
		}
		stat.count++
		stat.starTotals += stars
		stat.destruction += mobileFloat(attack["destructionPercentage"])
		stat.starsCount[strconv.Itoa(stars)]++
	}

	for _, defense := range defenses {
		stars := mobileInt(defense["stars"])
		starsCountDef[strconv.Itoa(stars)]++
		attacker := mobileMap(defense["attacker"])
		defender := mobileMap(defense["defender"])
		key := strconv.Itoa(mobileInt(defender["townhallLevel"])) + "vs" + strconv.Itoa(mobileInt(attacker["townhallLevel"]))
		stat := defenseMatchups[key]
		if stat == nil {
			stat = &mobileMatchupStats{starsCount: mobileStarsTemplate()}
			defenseMatchups[key] = stat
		}
		stat.count++
		stat.starTotals += stars
		stat.destruction += mobileFloat(defense["destructionPercentage"])
		stat.starsCount[strconv.Itoa(stars)]++
	}

	return map[string]any{
		"warsCounts":         warsCount,
		"totalAttacks":       len(attacks),
		"totalDefenses":      len(defenses),
		"missedAttacks":      missedAttacks,
		"missedDefenses":     missedDefenses,
		"starsCount":         starsCount,
		"starsCountDef":      starsCountDef,
		"byEnemyTownhall":    mobileBuildMatchupMap(attackMatchups),
		"byEnemyTownhallDef": mobileBuildMatchupMap(defenseMatchups),
	}
}

func mobileBuildMatchupMap(input map[string]*mobileMatchupStats) map[string]any {
	out := map[string]any{}
	for key, stat := range input {
		if stat == nil || stat.count == 0 {
			continue
		}
		out[key] = map[string]any{
			"averageStars":       mobileRound(float64(stat.starTotals)/float64(stat.count), 2),
			"averageDestruction": mobileRound(stat.destruction/float64(stat.count), 2),
			"count":              stat.count,
			"starsCount":         stat.starsCount,
		}
	}
	return out
}

func mobileStarsTemplate() map[string]int {
	return map[string]int{
		"0": 0,
		"1": 0,
		"2": 0,
		"3": 0,
	}
}

func mobileHTTPGetJSON(url string) map[string]any {
	resp, err := mobileHTTPClient.Get(url)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}
	return data
}

func mobileMapsToAny(items []map[string]any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

func mobileMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	if clean, ok := sanitize(value).(map[string]any); ok {
		return clean
	}
	return map[string]any{}
}

func mobileList(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	case bson.A:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item))
		}
		return out
	default:
		if clean, ok := sanitize(value).([]any); ok {
			return clean
		}
		return []any{}
	}
}

func mobileStringSliceFlexible(value any) []string {
	switch typed := value.(type) {
	case string:
		if trimmed := strings.TrimSpace(typed); trimmed != "" {
			return []string{trimmed}
		}
		return nil
	case []string:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out
	default:
		raw := mobileList(value)
		out := make([]string, 0, len(raw))
		for _, item := range raw {
			if text := mobileString(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	}
}

func mobileString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func mobileBool(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "true")
	default:
		return false
	}
}

func mobileStringList(value any) []string {
	raw := mobileList(value)
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if text := mobileString(item); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func mobileIntSliceFlexible(value any) []int {
	switch typed := value.(type) {
	case int:
		return []int{typed}
	case int32:
		return []int{int(typed)}
	case int64:
		return []int{int(typed)}
	case float64:
		return []int{int(typed)}
	default:
		raw := mobileList(value)
		out := make([]int, 0, len(raw))
		for _, item := range raw {
			out = append(out, mobileInt(item))
		}
		return out
	}
}

func mobileInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	default:
		return 0
	}
}

func mobileFloat(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	default:
		return 0
	}
}

func mobileOptionalInt(raw map[string]any, key string) (int, bool) {
	value, ok := raw[key]
	if !ok || value == nil {
		return 0, false
	}
	return mobileInt(value), true
}

func mobileOptionalInt64(raw map[string]any, key string) (int64, bool) {
	value, ok := raw[key]
	if !ok || value == nil {
		return 0, false
	}
	switch typed := value.(type) {
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	case float64:
		return int64(typed), true
	default:
		return 0, false
	}
}

func mobileOptionalFloat(raw map[string]any, key string) (float64, bool) {
	value, ok := raw[key]
	if !ok || value == nil {
		return 0, false
	}
	return mobileFloat(value), true
}

func mobileOptionalBool(raw map[string]any, key string) (bool, bool) {
	value, ok := raw[key]
	if !ok || value == nil {
		return false, false
	}
	return mobileBool(value), true
}

func mobileTime(value any) (time.Time, bool) {
	switch typed := value.(type) {
	case time.Time:
		return typed, true
	case int64:
		return time.Unix(typed, 0).UTC(), true
	case int:
		return time.Unix(int64(typed), 0).UTC(), true
	case float64:
		return time.Unix(int64(typed), 0).UTC(), true
	case string:
		if typed == "" {
			return time.Time{}, false
		}
		if parsed, err := time.Parse(time.RFC3339, typed); err == nil {
			return parsed, true
		}
		if parsed, err := time.Parse(mobileWarTimestampLayout, typed); err == nil {
			return parsed, true
		}
	default:
		return time.Time{}, false
	}
	return time.Time{}, false
}

func mobileCloneMap(src map[string]any) map[string]any {
	out := make(map[string]any, len(src))
	for key, value := range src {
		switch typed := value.(type) {
		case map[string]any:
			out[key] = mobileCloneMap(typed)
		case []any:
			items := make([]any, len(typed))
			copy(items, typed)
			out[key] = items
		default:
			out[key] = typed
		}
	}
	return out
}

func mobileContains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func mobileCurrentMonthBounds() (time.Time, time.Time) {
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0).Add(-time.Second)
	return start, end
}

func mobileRound(value float64, precision int) float64 {
	pow := 1.0
	for i := 0; i < precision; i++ {
		pow *= 10
	}
	return float64(int(value*pow+0.5)) / pow
}

func mobileMax(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func mobileWarType(war map[string]any) string {
	if value := mobileString(war["type"]); value != "" {
		return value
	}
	if value := mobileString(war["warType"]); value != "" {
		return value
	}
	return "all"
}

func mobileTimestampString(timestamp int64) string {
	return time.Unix(timestamp, 0).UTC().Format(mobileWarTimestampLayout)
}

func mobileNormalizeWarTypes(types []string) []string {
	out := make([]string, 0, len(types))
	seen := map[string]bool{}
	for _, raw := range types {
		warType := strings.ToLower(strings.TrimSpace(raw))
		if warType == "" || warType == "all" || seen[warType] {
			continue
		}
		seen[warType] = true
		out = append(out, warType)
	}
	return out
}

func mobileIntMatchesFilter(value int, allowed []int) bool {
	if len(allowed) == 0 {
		return true
	}
	return mobileIntSliceContains(allowed, value)
}

func mobileIntSliceContains(values []int, target int) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
