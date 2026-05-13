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

type mobilePlayersExtendedPreload struct {
	statsMap            map[string]map[string]any
	legendRankingsByTag map[string][]any
	rankingsByTag       map[string]map[string]any
	warTimerClansByTag  map[string][]string
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
		totalStartedAt := time.Now()
		var body modelsv2.MobilePlayerTagsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerTags := mobileNormalizeUniqueTags(body.PlayerTags)
		if len(playerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}

		ctx := c.UserContext()
		playerFilter := mobileInitializationWarHitsFilter()
		playerFilter.PlayerTags = playerTags
		var (
			playerWars        []map[string]any
			playerWarsWG      sync.WaitGroup
			playerWarsFetchMs int64
			playersPreloadMs  int64
			playersPreloadCh  = make(chan mobilePlayersExtendedPreload, 1)
		)
		playerWarsWG.Add(1)
		go func() {
			defer playerWarsWG.Done()
			startedAt := time.Now()
			playerWars = mobileFindLimitedPlayerWarDocsForTargets(ctx, a, playerTags, playerFilter.TimestampStart, playerFilter.TimestampEnd, playerFilter.Limit)
			playerWarsFetchMs = time.Since(startedAt).Milliseconds()
		}()
		go func() {
			startedAt := time.Now()
			playersPreloadCh <- mobileFetchPlayersExtendedPreload(ctx, a, playerTags)
			playersPreloadMs = time.Since(startedAt).Milliseconds()
		}()
		playersBasicStartedAt := time.Now()
		playersBasic := mobileFetchPlayersBasic(ctx, a, playerTags)
		playersBasicMs := time.Since(playersBasicStartedAt).Milliseconds()

		clanTags := mobileExtractClanTags(playersBasic)
		clanFilter := mobileInitializationWarHitsFilter()
		clanFilter.ClanTags = clanTags

		var playersExtended []map[string]any
		var clanBundle map[string]any
		var playerWarStats []any
		var clanWarStats []any
		var playersExtendedMs int64
		var clanBundleMs int64
		var clanWarsFetchMs int64
		var warStatsBuildMs int64
		var warStatsTotalMs int64
		var wg sync.WaitGroup
		wg.Add(3)
		go func() {
			defer wg.Done()
			startedAt := time.Now()
			playersExtended = mobileFetchPlayersExtended(ctx, a, playerTags, clanTags, playersBasic, <-playersPreloadCh)
			playersExtendedMs = time.Since(startedAt).Milliseconds()
		}()
		go func() {
			defer wg.Done()
			startedAt := time.Now()
			clanBundle = mobileFetchClanBundle(ctx, a, clanTags)
			clanBundleMs = time.Since(startedAt).Milliseconds()
		}()
		go func() {
			defer wg.Done()
			startedAt := time.Now()
			clanWars := mobileFindLimitedClanWarDocsForTargets(ctx, a, clanTags, clanFilter.TimestampStart, clanFilter.TimestampEnd, clanFilter.Limit)
			clanWarsFetchMs = time.Since(startedAt).Milliseconds()
			playerWarsWG.Wait()
			buildStartedAt := time.Now()
			playerWarStats, clanWarStats = mobileBuildInitializationWarStatsFromBatches(playerWars, clanWars, playerFilter, clanFilter)
			warStatsBuildMs = time.Since(buildStartedAt).Milliseconds()
			warStatsTotalMs = time.Since(startedAt).Milliseconds()
		}()
		wg.Wait()
		contractStartedAt := time.Now()
		clanBundle = mobileClanBundleContract(clanBundle)
		clanBundle["clan_war_stats"] = playerWarStatsOrEmpty(clanWarStats)
		contractMs := time.Since(contractStartedAt).Milliseconds()
		apptypes.Logger().Info("mobile_initialization_timing",
			"request_id", apptypes.RequestID(c),
			"user_id", apptypes.UserID(c.UserContext()),
			"player_count", len(playerTags),
			"players_basic_count", len(playersBasic),
			"clan_count", len(clanTags),
			"player_wars_fetch_ms", playerWarsFetchMs,
			"players_preload_ms", playersPreloadMs,
			"players_basic_ms", playersBasicMs,
			"players_extended_ms", playersExtendedMs,
			"clan_bundle_ms", clanBundleMs,
			"clan_wars_fetch_ms", clanWarsFetchMs,
			"war_stats_build_ms", warStatsBuildMs,
			"war_stats_total_ms", warStatsTotalMs,
			"contract_ms", contractMs,
			"total_ms", time.Since(totalStartedAt).Milliseconds(),
		)

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
		"players":       mobilePlayerExtendedListContract(playersExtended),
		"players_basic": playerMapsOrEmpty(playersBasic),
		"clans":         mobileClanBundleContract(clanBundle),
		"war_stats":     mobilePlayerWarStatsListContract(playerWarStatsOrEmpty(playerWarStats)),
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
	source := mobileMap(bundle)
	return map[string]any{
		"clan_details":    mobileMap(source["clan_details"]),
		"clan_stats":      mobileMap(source["clan_stats"]),
		"war_data":        mobileWarSummaryList(mobileList(source["war_data"])),
		"join_leave_data": mobileJoinLeaveByClanContract(source["join_leave_data"]),
		"capital_data":    mobileCapitalDataContract(source["capital_data"]),
		"war_log_data":    mobileWarLogDataContract(source["war_log_data"]),
		"clan_war_stats":  mobileClanWarStatsListContract(mobileList(source["clan_war_stats"])),
		"cwl_data":        mobileList(source["cwl_data"]),
	}
}

func playerMapsOrEmpty(items []map[string]any) []map[string]any {
	if items == nil {
		return []map[string]any{}
	}
	return items
}

func mobileTopDurations(timings map[string]int64, top int) []map[string]any {
	keys := make([]string, 0, len(timings))
	for key := range timings {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if timings[keys[i]] == timings[keys[j]] {
			return keys[i] < keys[j]
		}
		return timings[keys[i]] > timings[keys[j]]
	})
	if top <= 0 || top > len(keys) {
		top = len(keys)
	}
	out := make([]map[string]any, 0, top)
	for _, key := range keys[:top] {
		out = append(out, map[string]any{
			"target": key,
			"ms":     timings[key],
		})
	}
	return out
}

func mobileTopDurationsWithCounts(timings map[string]int64, counts map[string]int, top int) []map[string]any {
	keys := make([]string, 0, len(timings))
	for key := range timings {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if timings[keys[i]] == timings[keys[j]] {
			return keys[i] < keys[j]
		}
		return timings[keys[i]] > timings[keys[j]]
	})
	if top <= 0 || top > len(keys) {
		top = len(keys)
	}
	out := make([]map[string]any, 0, top)
	for _, key := range keys[:top] {
		item := map[string]any{
			"target": key,
			"ms":     timings[key],
		}
		if counts != nil {
			item["count"] = counts[key]
		}
		out = append(out, item)
	}
	return out
}

func mobilePlayerExtendedListContract(items []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, mobilePlayerExtendedContract(item))
	}
	return out
}

func mobilePlayerExtendedContract(item map[string]any) map[string]any {
	out := mobileMap(item)
	tag := mobileString(out["tag"])
	out["tag"] = tag
	out["legends_by_season"] = mobileMap(out["legends_by_season"])
	out["legend_eos_ranking"] = mobileList(out["legend_eos_ranking"])
	out["rankings"] = mobilePlayerRankingsContract(out["rankings"], tag)
	out["raid_data"] = mobilePlayerRaidDataContract(out["raid_data"])
	out["war_data"] = mobilePlayerWarDataContract(out["war_data"])
	return out
}

func mobilePlayerRankingsContract(value any, playerTag string) map[string]any {
	out := map[string]any{
		"tag":                 playerTag,
		"country_code":        nil,
		"country_name":        nil,
		"local_rank":          nil,
		"global_rank":         nil,
		"builder_global_rank": nil,
		"builder_local_rank":  nil,
	}
	for key, value := range mobileMap(value) {
		out[key] = value
	}
	return out
}

func mobilePlayerRaidDataContract(value any) map[string]any {
	data := mobileMap(value)
	if len(data) == 0 {
		return map[string]any{}
	}
	return map[string]any{
		"attack_limit": mobileInt(data["attack_limit"]),
		"attacks_done": mobileInt(data["attacks_done"]),
	}
}

func mobilePlayerWarDataContract(value any) map[string]any {
	out := mobileMap(value)
	if len(out) == 0 {
		return map[string]any{}
	}
	if currentWarInfo := mobileMap(out["currentWarInfo"]); len(currentWarInfo) > 0 {
		out["currentWarInfo"] = currentWarInfo
		return out
	}
	warInfo := mobileMap(out["war_info"])
	if currentWarInfo := mobileMap(warInfo["currentWarInfo"]); len(currentWarInfo) > 0 {
		out["currentWarInfo"] = currentWarInfo
	} else {
		delete(out, "currentWarInfo")
	}
	return out
}

func mobilePlayerWarStatsListContract(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		data := mobileMap(item)
		out = append(out, map[string]any{
			"name":          mobileString(data["name"]),
			"tag":           mobileString(data["tag"]),
			"townhallLevel": mobileInt(data["townhallLevel"]),
			"stats":         mobileMap(data["stats"]),
			"timeRange":     mobileMap(data["timeRange"]),
			"wars":          mobileList(data["wars"]),
		})
	}
	return out
}

func mobileJoinLeaveByClanContract(value any) map[string]any {
	out := map[string]any{}
	for clanTag, item := range mobileMap(value) {
		out[clanTag] = mobileJoinLeaveContract(item)
	}
	return out
}

func mobileJoinLeaveContract(value any) map[string]any {
	data := mobileMap(value)
	return map[string]any{
		"clan_tag":        mobileString(data["clan_tag"]),
		"timestamp_start": mobileInt(data["timestamp_start"]),
		"timestamp_end":   mobileInt(data["timestamp_end"]),
		"stats":           mobileJoinLeaveStatsContract(data["stats"]),
		"join_leave_list": mobileList(data["join_leave_list"]),
	}
}

func mobileJoinLeaveStatsContract(value any) map[string]any {
	data := mobileMap(value)
	return map[string]any{
		"total_events":                mobileInt(data["total_events"]),
		"total_joins":                 mobileInt(data["total_joins"]),
		"total_leaves":                mobileInt(data["total_leaves"]),
		"unique_players":              mobileInt(data["unique_players"]),
		"moving_players":              mobileInt(data["moving_players"]),
		"rejoined_players":            mobileInt(data["rejoined_players"]),
		"first_event":                 data["first_event"],
		"last_event":                  data["last_event"],
		"most_moving_hour":            data["most_moving_hour"],
		"avg_time_between_join_leave": data["avg_time_between_join_leave"],
		"players_still_in_clan":       mobileInt(data["players_still_in_clan"]),
		"players_left_forever":        mobileInt(data["players_left_forever"]),
		"most_moving_players":         mobileList(data["most_moving_players"]),
	}
}

func mobileCapitalDataContract(value any) []any {
	items := mobileList(value)
	out := make([]any, 0, len(items))
	for _, item := range items {
		data := mobileMap(item)
		entry := map[string]any{
			"clan_tag": mobileString(data["clan_tag"]),
			"history":  mobileList(data["history"]),
		}
		if stats := mobileMap(data["stats"]); len(stats) > 0 {
			entry["stats"] = stats
		}
		out = append(out, entry)
	}
	return out
}

func mobileWarLogDataContract(value any) []any {
	items := mobileList(value)
	out := make([]any, 0, len(items))
	for _, item := range items {
		data := mobileMap(item)
		out = append(out, map[string]any{
			"clan_tag": mobileString(data["clan_tag"]),
			"items":    mobileList(data["items"]),
		})
	}
	return out
}

func mobileClanWarStatsListContract(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		data := mobileMap(item)
		out = append(out, map[string]any{
			"clan_tag": mobileString(data["clan_tag"]),
			"players":  mobilePlayerWarStatsListContract(mobileList(data["players"])),
			"wars":     mobileList(data["wars"]),
		})
	}
	return out
}

func mobileWarSummaryList(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		summary := mobileMap(item)
		if len(summary) == 0 {
			continue
		}
		out = append(out, warSummaryResponse(
			mobileString(summary["clan_tag"]),
			mobileBool(summary["isInWar"]),
			mobileBool(summary["isInCwl"]),
			summary["war_info"],
			summary["league_info"],
			mobileList(summary["war_league_infos"]),
		))
	}
	return out
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

func mobileBuildInitializationWarStatsFromBatches(playerWars []map[string]any, clanWars []map[string]any, playerFilter mobileWarHitsFilter, clanFilter mobileWarHitsFilter) ([]any, []any) {
	return mobileBuildInitializationWarStatsFromDocs(
		mobileMergeWarDocBatches([][]map[string]any{playerWars, clanWars}),
		playerFilter,
		clanFilter,
	)
}

func mobileBuildInitializationWarStatsFromDocs(wars []map[string]any, playerFilter mobileWarHitsFilter, clanFilter mobileWarHitsFilter) ([]any, []any) {
	playerOrder := mobileNormalizeUniqueTags(playerFilter.PlayerTags)
	clanOrder := mobileNormalizeUniqueClanTags(clanFilter.ClanTags)
	playerAggregates := map[string]*mobilePlayerWarAggregate{}
	clanAggregates := map[string]*mobileClanWarAggregate{}
	for _, clanTag := range clanOrder {
		mobileGetOrCreateClanAggregate(clanAggregates, clanTag)
	}

	remainingPlayers := mobileBuildWarTargetSet(playerOrder)
	remainingClans := mobileBuildWarTargetSet(clanOrder)
	playerProcessed := make(map[string]int, len(playerOrder))
	clanProcessed := make(map[string]int, len(clanOrder))

	for _, war := range wars {
		if len(remainingPlayers) == 0 && len(remainingClans) == 0 {
			break
		}

		playerSelected := map[string]bool{}
		if len(remainingPlayers) > 0 && mobileWarMatchesFilter(war, playerFilter) {
			playerSelected = mobileSelectedPlayersInWar(war, remainingPlayers)
		}

		clanSelected := map[string]bool{}
		if len(remainingClans) > 0 && mobileWarMatchesFilter(war, clanFilter) {
			clanSelected = mobileSelectedClansInWar(war, remainingClans)
		}

		if len(playerSelected) == 0 && len(clanSelected) == 0 {
			continue
		}

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)

		if len(playerSelected) > 0 {
			mobileAccumulatePlayerWarAggregates(war, cleanWar, freshOrders, playerSelected, playerFilter, playerAggregates)
			mobileUpdateProcessedWarTargets(remainingPlayers, playerProcessed, playerSelected, playerFilter.Limit)
		}
		if len(clanSelected) > 0 {
			mobileAccumulateClanWarAggregates(war, cleanWar, freshOrders, clanSelected, clanFilter, clanAggregates)
			mobileUpdateProcessedWarTargets(remainingClans, clanProcessed, clanSelected, clanFilter.Limit)
		}
	}

	return mobileBuildPlayerWarResults(playerAggregates, playerOrder, playerFilter.TimestampStart, playerFilter.TimestampEnd),
		mobileBuildClanWarResults(clanAggregates, clanOrder, clanFilter.TimestampStart, clanFilter.TimestampEnd)
}

func mobileInitializationWarHitsFilter() mobileWarHitsFilter {
	return mobileWarHitsFilter{
		TimestampStart: time.Now().UTC().AddDate(0, -6, 0).Unix(),
		TimestampEnd:   time.Now().UTC().Unix(),
		Limit:          50,
	}
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
		Limit:          50,
	}
}

func mobileDefaultClanWarHitsFilter(clanTags []string) mobileWarHitsFilter {
	return mobileWarHitsFilter{
		ClanTags:       mobileNormalizeUniqueClanTags(clanTags),
		TimestampStart: time.Now().UTC().AddDate(0, -6, 0).Unix(),
		TimestampEnd:   time.Now().UTC().Unix(),
		Limit:          100,
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
	if filter.Limit == 0 {
		if len(filter.PlayerTags) > 0 {
			filter.Limit = 50
		} else if len(filter.ClanTags) > 0 {
			filter.Limit = 100
		}
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
	startedAt := time.Now()
	results := make([]map[string]any, len(playerTags))
	perTagMs := make(map[string]int64, len(playerTags))
	failedTags := make([]string, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for idx, tag := range playerTags {
		wg.Add(1)
		go func(i int, playerTag string) {
			defer wg.Done()
			tagStartedAt := time.Now()
			player, err := a.Clash.GetPlayer(ctx, playerTag)
			durationMs := time.Since(tagStartedAt).Milliseconds()
			mu.Lock()
			perTagMs[playerTag] = durationMs
			if err != nil || player == nil {
				failedTags = append(failedTags, playerTag)
				mu.Unlock()
				return
			}
			mu.Unlock()
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
	apptypes.Logger().Info("mobile_players_basic_timing",
		"player_count", len(playerTags),
		"returned_count", len(out),
		"failed_count", len(failedTags),
		"failed_tags", failedTags,
		"top_targets", mobileTopDurations(perTagMs, 10),
		"total_ms", time.Since(startedAt).Milliseconds(),
	)
	return out
}

func mobileFetchPlayersExtendedPreload(ctx context.Context, a apptypes.Deps, playerTags []string) mobilePlayersExtendedPreload {
	totalStartedAt := time.Now()
	playerTags = mobileNormalizeUniqueTags(playerTags)
	preload := mobilePlayersExtendedPreload{
		statsMap:            map[string]map[string]any{},
		legendRankingsByTag: map[string][]any{},
		rankingsByTag:       map[string]map[string]any{},
		warTimerClansByTag:  map[string][]string{},
	}
	if len(playerTags) == 0 {
		return preload
	}

	proj := options.Find().SetProjection(bson.M{
		"_id": 0, "tag": 1, "donations": 1, "clan_games": 1,
		"season_pass": 1, "activity": 1, "last_online": 1, "last_online_time": 1,
		"attack_wins": 1, "dark_elixir": 1, "gold": 1, "capital_gold": 1,
		"season_trophies": 1, "last_updated": 1,
	})

	var setupWG sync.WaitGroup
	var statsFetchMs int64
	var legendRankingsMs int64
	var currentRankingsMs int64
	var warTimerMs int64
	setupWG.Add(4)
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		localStats := map[string]map[string]any{}
		if cur, err := a.Store.C.PlayerStats.Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}}, proj); err == nil {
			var rows []bson.M
			if err := cur.All(ctx, &rows); err == nil {
				for _, row := range rows {
					clean := mobileMap(row)
					tag := mobileString(clean["tag"])
					if tag != "" {
						localStats[tag] = clean
					}
				}
			}
		}
		preload.statsMap = localStats
		statsFetchMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		preload.legendRankingsByTag = mobileFetchLegendRankingsBatch(ctx, a, playerTags, 10)
		legendRankingsMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		preload.rankingsByTag = mobileFetchCurrentRankingsBatch(ctx, a, playerTags)
		currentRankingsMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		preload.warTimerClansByTag = mobileFetchPlayerWarTimerClansBatch(ctx, a, playerTags)
		warTimerMs = time.Since(startedAt).Milliseconds()
	}()
	setupWG.Wait()
	apptypes.Logger().Info("mobile_players_extended_preload_timing",
		"player_count", len(playerTags),
		"stats_fetch_ms", statsFetchMs,
		"legend_rankings_ms", legendRankingsMs,
		"current_rankings_ms", currentRankingsMs,
		"war_timer_ms", warTimerMs,
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
	return preload
}

func mobileFetchPlayersExtended(ctx context.Context, a apptypes.Deps, playerTags []string, clanTags []string, playersBasic []map[string]any, preload mobilePlayersExtendedPreload) []map[string]any {
	totalStartedAt := time.Now()
	basicByTag := map[string]map[string]any{}
	for _, player := range playersBasic {
		tag := mobileString(player["tag"])
		if tag != "" {
			basicByTag[tag] = player
		}
	}

	var (
		raidDataByClan map[string]map[string]map[string]any
		warDataByTag   map[string]map[string]any
		setupWG        sync.WaitGroup
	)

	var raidBatchMs int64
	var warContextBuildMs int64
	setupWG.Add(2)
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		raidDataByClan = mobileFetchPlayerRaidDataBatch(ctx, a, clanTags)
		raidBatchMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer setupWG.Done()
		startedAt := time.Now()
		warDataByTag = mobileBuildPlayerWarContextsFromTimerClans(ctx, a, preload.warTimerClansByTag, basicByTag)
		warContextBuildMs = time.Since(startedAt).Milliseconds()
	}()
	setupWG.Wait()

	out := make([]map[string]any, 0, len(playerTags))
	for _, playerTag := range playerTags {
		item := map[string]any{
			"tag":                playerTag,
			"legends_by_season":  map[string]any{},
			"legend_eos_ranking": []any{},
			"rankings":           mobilePlayerRankingsContract(nil, playerTag),
			"raid_data":          map[string]any{},
			"war_data":           map[string]any{},
		}

		if stats := preload.statsMap[playerTag]; stats != nil {
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

		if legendRankings := preload.legendRankingsByTag[playerTag]; legendRankings != nil {
			item["legend_eos_ranking"] = legendRankings
		}
		if rankings := preload.rankingsByTag[playerTag]; rankings != nil {
			item["rankings"] = rankings
		}
		if raidData := mobileLookupPlayerRaidData(raidDataByClan, playerTag, clanTag); raidData != nil {
			item["raid_data"] = raidData
		}
		if warData := warDataByTag[playerTag]; warData != nil {
			item["war_data"] = warData
		}
		out = append(out, item)
	}
	apptypes.Logger().Info("mobile_players_extended_timing",
		"player_count", len(playerTags),
		"players_basic_count", len(playersBasic),
		"clan_count", len(clanTags),
		"raid_batch_ms", raidBatchMs,
		"war_context_build_ms", warContextBuildMs,
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
	return out
}

func mobileFetchLegendRankings(ctx context.Context, a apptypes.Deps, tag string, limit int64) []any {
	tag = playerNormalizeTag(tag)
	if tag == "" {
		return []any{}
	}
	if items := mobileFetchLegendRankingsBatch(ctx, a, []string{tag}, limit)[tag]; items != nil {
		return items
	}
	return []any{}
}

func mobileFetchCurrentRankings(ctx context.Context, a apptypes.Deps, tag string) map[string]any {
	tag = playerNormalizeTag(tag)
	if tag == "" {
		return map[string]any{}
	}
	return mobileFetchCurrentRankingsBatch(ctx, a, []string{tag})[tag]
}

func mobileFetchLegendRankingsBatch(ctx context.Context, a apptypes.Deps, playerTags []string, limit int64) map[string][]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 || limit <= 0 {
		return map[string][]any{}
	}

	var rows []bson.M
	findOpts := options.Find().
		SetSort(bson.D{{Key: "tag", Value: 1}, {Key: "season", Value: -1}}).
		SetProjection(bson.M{"_id": 0})
	if cur, err := a.Store.DB.RankingHistory.Collection("history_db").Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}}, findOpts); err == nil {
		_ = cur.All(ctx, &rows)
	}
	return mobileLegendRankingsByTagFromRows(playerTags, rows, limit)
}

func mobileLegendRankingsByTagFromRows(playerTags []string, rows []bson.M, limit int64) map[string][]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 || limit <= 0 {
		return map[string][]any{}
	}

	allowed := make(map[string]bool, len(playerTags))
	for _, tag := range playerTags {
		allowed[tag] = true
	}

	out := make(map[string][]any, len(playerTags))
	counts := make(map[string]int64, len(playerTags))
	for _, row := range rows {
		clean := mobileMap(row)
		tag := mobileString(clean["tag"])
		if !allowed[tag] || counts[tag] >= limit {
			continue
		}
		out[tag] = append(out[tag], clean)
		counts[tag]++
	}
	return out
}

func mobileFetchCurrentRankingsBatch(ctx context.Context, a apptypes.Deps, playerTags []string) map[string]map[string]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 {
		return map[string]map[string]any{}
	}

	var leaderboardRows []bson.M
	if cur, err := a.Store.C.LeaderboardDB.Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}}, options.Find().SetProjection(bson.M{"_id": 0})); err == nil {
		_ = cur.All(ctx, &leaderboardRows)
	}

	provisional := mobileCurrentRankingsByTagFromRows(playerTags, leaderboardRows, nil)
	missingGlobalRank := make([]string, 0, len(playerTags))
	for _, tag := range playerTags {
		if provisional[tag]["global_rank"] == nil {
			missingGlobalRank = append(missingGlobalRank, tag)
		}
	}

	var fallbackRows []bson.M
	if len(missingGlobalRank) > 0 {
		if cur, err := a.Store.C.LegendRankings.Find(ctx, bson.M{"tag": bson.M{"$in": missingGlobalRank}}, options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "rank": 1})); err == nil {
			_ = cur.All(ctx, &fallbackRows)
		}
	}

	return mobileCurrentRankingsByTagFromRows(playerTags, leaderboardRows, fallbackRows)
}

func mobileCurrentRankingsByTagFromRows(playerTags []string, leaderboardRows []bson.M, fallbackRows []bson.M) map[string]map[string]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	out := make(map[string]map[string]any, len(playerTags))
	allowed := make(map[string]bool, len(playerTags))
	for _, tag := range playerTags {
		allowed[tag] = true
		out[tag] = mobilePlayerRankingsContract(nil, tag)
	}

	for _, row := range leaderboardRows {
		clean := mobileMap(row)
		tag := mobileString(clean["tag"])
		if !allowed[tag] {
			continue
		}
		out[tag] = mobilePlayerRankingsContract(clean, tag)
	}

	for _, row := range fallbackRows {
		clean := mobileMap(row)
		tag := mobileString(clean["tag"])
		if !allowed[tag] || out[tag]["global_rank"] != nil {
			continue
		}
		out[tag]["global_rank"] = clean["rank"]
	}
	return out
}

func mobileFetchPlayerRaidDataBatch(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]map[string]map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	if len(clanTags) == 0 || !mobileIsRaidsWindow() {
		return map[string]map[string]map[string]any{}
	}

	pipeline := bson.A{
		bson.M{"$match": bson.M{"clan_tag": bson.M{"$in": clanTags}}},
		bson.M{"$sort": bson.D{{Key: "clan_tag", Value: 1}, {Key: "data.endTime", Value: -1}}},
		bson.M{"$group": bson.M{
			"_id":  "$clan_tag",
			"data": bson.M{"$first": "$data"},
		}},
		bson.M{"$project": bson.M{"_id": 0, "clan_tag": "$_id", "data": 1}},
	}

	var rows []bson.M
	if cur, err := a.Store.C.RaidWeekendDB.Aggregate(ctx, pipeline); err == nil {
		_ = cur.All(ctx, &rows)
	}
	return mobilePlayerRaidDataByClanFromRows(clanTags, rows)
}

func mobilePlayerRaidDataByClanFromRows(clanTags []string, rows []bson.M) map[string]map[string]map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	if len(clanTags) == 0 {
		return map[string]map[string]map[string]any{}
	}

	allowed := make(map[string]bool, len(clanTags))
	for _, clanTag := range clanTags {
		allowed[clanTag] = true
	}

	out := make(map[string]map[string]map[string]any, len(clanTags))
	for _, row := range rows {
		clean := mobileMap(row)
		clanTag := clanFixTag(mobileString(clean["clan_tag"]))
		if clanTag == "" || !allowed[clanTag] || out[clanTag] != nil {
			continue
		}

		members := make(map[string]map[string]any)
		for _, rawMember := range mobileList(mobileMap(clean["data"])["members"]) {
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
		out[clanTag] = members
	}
	return out
}

func mobileIsRaidsWindow() bool {
	return mobileIsRaidsWindowAt(time.Now().UTC())
}

func mobileIsRaidsWindowAt(now time.Time) bool {
	now = now.UTC()
	switch now.Weekday() {
	case time.Friday:
		return now.Hour() >= 7
	case time.Saturday, time.Sunday:
		return true
	case time.Monday:
		return now.Hour() < 7
	default:
		return false
	}
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

	targetClan := mobilePlayerWarContextTargetClan(mobileStringList(mobileMap(warTimer)["clans"]), currentClanTag)
	if targetClan == "" {
		return map[string]any{}
	}
	return currentWarSummary(ctx, a, targetClan)
}

func mobileFetchPlayerWarTimerClansBatch(ctx context.Context, a apptypes.Deps, playerTags []string) map[string][]string {
	totalStartedAt := time.Now()
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 {
		return map[string][]string{}
	}

	out := make(map[string][]string, len(playerTags))
	perTargetMs := make(map[string]int64, len(playerTags))
	failedTags := make([]string, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, playerTag := range playerTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			startedAt := time.Now()
			var row bson.M
			err := a.Store.C.WarTimer.FindOne(ctx, bson.M{"_id": tag}, options.FindOne().SetProjection(bson.M{"_id": 1, "clans": 1})).Decode(&row)
			durationMs := time.Since(startedAt).Milliseconds()
			mu.Lock()
			perTargetMs[tag] = durationMs
			if err != nil {
				failedTags = append(failedTags, tag)
				mu.Unlock()
				return
			}
			clean := mobileMap(row)
			out[tag] = mobileStringList(clean["clans"])
			mu.Unlock()
		}(playerTag)
	}
	wg.Wait()
	apptypes.Logger().Info("mobile_war_timer_batch_timing",
		"player_count", len(playerTags),
		"row_count", len(out),
		"failed_count", len(failedTags),
		"failed_tags", failedTags,
		"top_targets", mobileTopDurations(perTargetMs, 10),
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
	return out
}

func mobileBuildPlayerWarContextsFromTimerClans(ctx context.Context, a apptypes.Deps, warTimerClansByTag map[string][]string, basicByTag map[string]map[string]any) map[string]map[string]any {
	uniqueTargetClans := map[string]bool{}
	targetClanByPlayer := make(map[string]string, len(warTimerClansByTag))
	for playerTag, clans := range warTimerClansByTag {
		currentClanTag := ""
		if basic := basicByTag[playerTag]; basic != nil {
			currentClanTag = mobileString(mobileMap(basic["clan"])["tag"])
		}

		targetClan := mobilePlayerWarContextTargetClan(clans, currentClanTag)
		if targetClan == "" {
			continue
		}

		targetClanByPlayer[playerTag] = targetClan
		uniqueTargetClans[targetClan] = true
	}

	targetClans := make([]string, 0, len(uniqueTargetClans))
	for clanTag := range uniqueTargetClans {
		targetClans = append(targetClans, clanTag)
	}
	summaryByClan := mobileFetchWarSummariesByClan(ctx, a, targetClans)

	out := make(map[string]map[string]any, len(targetClanByPlayer))
	for playerTag, clanTag := range targetClanByPlayer {
		if summary := summaryByClan[clanTag]; summary != nil {
			out[playerTag] = summary
		}
	}
	return out
}

func mobileFetchWarSummariesByClan(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	if len(clanTags) == 0 {
		return map[string]map[string]any{}
	}

	out := make(map[string]map[string]any, len(clanTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, clanTag := range clanTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			summary := currentWarSummary(ctx, a, tag)
			mu.Lock()
			out[tag] = summary
			mu.Unlock()
		}(clanTag)
	}
	wg.Wait()
	return out
}

func mobilePlayerWarContextTargetClan(clans []string, currentClanTag string) string {
	clans = mobileNormalizeUniqueClanTags(clans)
	currentClanTag = clanFixTag(currentClanTag)
	if currentClanTag != "" && mobileContains(clans, currentClanTag) {
		return ""
	}
	if len(clans) == 0 {
		return ""
	}
	return clans[0]
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
	totalStartedAt := time.Now()
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
	var clanDetailsMs int64
	var joinLeaveMs int64
	var capitalMs int64
	var warLogsMs int64
	var warSummariesMs int64
	set := func(key string, value any) {
		mu.Lock()
		defer mu.Unlock()
		bundle[key] = value
	}

	wg.Add(5)
	go func() {
		defer wg.Done()
		startedAt := time.Now()
		set("clan_details", mobileFetchClanDetails(ctx, a, clanTags))
		clanDetailsMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer wg.Done()
		startedAt := time.Now()
		set("join_leave_data", mobileFetchJoinLeaveData(ctx, a, clanTags))
		joinLeaveMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer wg.Done()
		startedAt := time.Now()
		set("capital_data", mobileFetchCapitalData(clanTags, 10))
		capitalMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer wg.Done()
		startedAt := time.Now()
		set("war_log_data", mobileFetchClanWarLogs(clanTags))
		warLogsMs = time.Since(startedAt).Milliseconds()
	}()
	go func() {
		defer wg.Done()
		startedAt := time.Now()
		set("war_data", mobileFetchClanWarSummaries(ctx, a, clanTags))
		warSummariesMs = time.Since(startedAt).Milliseconds()
	}()
	wg.Wait()
	apptypes.Logger().Info("mobile_clan_bundle_timing",
		"clan_count", len(clanTags),
		"clan_details_ms", clanDetailsMs,
		"join_leave_ms", joinLeaveMs,
		"capital_ms", capitalMs,
		"war_logs_ms", warLogsMs,
		"war_summaries_ms", warSummariesMs,
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)

	return bundle
}

func mobileFetchClanDetails(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]any {
	out := make(map[string]any, len(clanTags))
	icons := leagueIconLookup(a)
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
			clan = enrichClanPayloadLeagueIcons(clan, icons)
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
	totalStartedAt := time.Now()
	seasonStart, seasonEnd, err := joinLeaveSeasonBounds(genSeasonDate(0, false).(string))
	if err != nil {
		return map[string]any{}
	}
	filter := bson.M{
		"clan": bson.M{"$in": clanTags},
		"time": bson.M{"$gte": seasonStart, "$lte": seasonEnd},
	}

	findOpts := options.Find().SetSort(bson.M{"time": -1})
	queryStartedAt := time.Now()
	cur, err := a.Store.C.JoinLeaveHistory.Find(ctx, filter, findOpts)
	if err != nil {
		return map[string]any{}
	}
	queryMs := time.Since(queryStartedAt).Milliseconds()

	var rows []bson.M
	decodeStartedAt := time.Now()
	if err := cur.All(ctx, &rows); err != nil {
		return map[string]any{}
	}
	decodeMs := time.Since(decodeStartedAt).Milliseconds()

	groupStartedAt := time.Now()
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
	groupMs := time.Since(groupStartedAt).Milliseconds()

	out := map[string]any{}
	startUnix := seasonStart.Unix()
	endUnix := seasonEnd.Unix()
	statsStartedAt := time.Now()
	eventCounts := make(map[string]int, len(clanTags))
	for _, clanTag := range clanTags {
		events := groupedStats[clanTag]
		eventCounts[clanTag] = len(events)
		out[clanTag] = map[string]any{
			"clan_tag":        clanTag,
			"timestamp_start": startUnix,
			"timestamp_end":   endUnix,
			"stats":           mobileBuildJoinLeaveStats(events),
			"join_leave_list": mobileMapsToAny(groupedDocs[clanTag]),
		}
	}
	statsMs := time.Since(statsStartedAt).Milliseconds()
	apptypes.Logger().Info("mobile_join_leave_timing",
		"clan_count", len(clanTags),
		"row_count", len(rows),
		"query_ms", queryMs,
		"decode_ms", decodeMs,
		"group_ms", groupMs,
		"stats_ms", statsMs,
		"event_counts", eventCounts,
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
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
	wars := mobileFindRelevantWarDocs(ctx, a, playerTags, nil, filter.TimestampStart, filter.TimestampEnd)
	return mobileBuildPlayerWarStatsFromDocs(playerTags, wars, filter)
}

func mobileBuildPlayerWarStatsFromDocs(playerTags []string, wars []map[string]any, filter mobileWarHitsFilter) []any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	aggregates := map[string]*mobilePlayerWarAggregate{}
	remaining := mobileBuildWarTargetSet(playerTags)
	processed := make(map[string]int, len(playerTags))

	for _, war := range wars {
		if len(remaining) == 0 {
			break
		}
		selected := mobileSelectedPlayersInWar(war, remaining)
		if len(selected) == 0 || !mobileWarMatchesFilter(war, filter) {
			continue
		}

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulatePlayerWarAggregates(war, cleanWar, freshOrders, selected, filter, aggregates)
		mobileUpdateProcessedWarTargets(remaining, processed, selected, filter.Limit)
	}

	return mobileBuildPlayerWarResults(aggregates, playerTags, filter.TimestampStart, filter.TimestampEnd)
}

func mobileFetchClanWarStats(ctx context.Context, a apptypes.Deps, clanTags []string) []any {
	return mobileFetchClanWarStatsWithFilter(ctx, a, mobileDefaultClanWarHitsFilter(clanTags))
}

func mobileFetchClanWarStatsWithFilter(ctx context.Context, a apptypes.Deps, filter mobileWarHitsFilter) []any {
	clanTags := mobileNormalizeUniqueClanTags(filter.ClanTags)
	wars := mobileFindLimitedClanWarDocsForTargets(ctx, a, clanTags, filter.TimestampStart, filter.TimestampEnd, filter.Limit)
	return mobileBuildClanWarStatsFromDocs(clanTags, wars, filter)
}

func mobileBuildClanWarStatsFromDocs(clanTags []string, wars []map[string]any, filter mobileWarHitsFilter) []any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	aggregates := make(map[string]*mobileClanWarAggregate, len(clanTags))
	for _, clanTag := range clanTags {
		mobileGetOrCreateClanAggregate(aggregates, clanTag)
	}
	remaining := mobileBuildWarTargetSet(clanTags)
	processed := make(map[string]int, len(clanTags))

	for _, war := range wars {
		if len(remaining) == 0 {
			break
		}
		selected := mobileSelectedClansInWar(war, remaining)
		if len(selected) == 0 || !mobileWarMatchesFilter(war, filter) {
			continue
		}

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulateClanWarAggregates(war, cleanWar, freshOrders, selected, filter, aggregates)
		mobileUpdateProcessedWarTargets(remaining, processed, selected, filter.Limit)
	}

	return mobileBuildClanWarResults(aggregates, clanTags, filter.TimestampStart, filter.TimestampEnd)
}

func mobileFetchSinglePlayerWarStats(ctx context.Context, a apptypes.Deps, playerTag string, filter mobileWarHitsFilter) any {
	playerTag = playerNormalizeTag(playerTag)
	if playerTag == "" {
		return nil
	}

	wars := mobileFindLimitedPlayerWarDocs(ctx, a, playerTag, filter.TimestampStart, filter.TimestampEnd, filter.Limit)

	aggregates := map[string]*mobilePlayerWarAggregate{}
	selected := map[string]bool{playerTag: true}
	processedWars := 0

	for _, war := range wars {
		if !mobileWarContainsSelectedPlayers(war, selected) {
			continue
		}
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

func mobileBuildSinglePlayerWarStatsFromDocs(playerTag string, wars []map[string]any, filter mobileWarHitsFilter) any {
	playerTag = playerNormalizeTag(playerTag)
	if playerTag == "" {
		return nil
	}

	aggregates := map[string]*mobilePlayerWarAggregate{}
	selected := map[string]bool{playerTag: true}
	processedWars := 0

	for _, war := range wars {
		if !mobileWarContainsSelectedPlayers(war, selected) {
			continue
		}
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

	wars := mobileFindLimitedClanWarDocs(ctx, a, clanTag, filter.TimestampStart, filter.TimestampEnd, filter.Limit)

	agg := mobileGetOrCreateClanAggregate(map[string]*mobileClanWarAggregate{}, clanTag)
	processedWars := 0

	for _, war := range wars {
		if !mobileWarContainsSelectedClans(war, map[string]bool{clanTag: true}) {
			continue
		}
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

func mobileBuildSingleClanWarStatsFromDocs(clanTag string, wars []map[string]any, filter mobileWarHitsFilter) any {
	clanTag = warFixTag(clanTag)
	if clanTag == "" {
		return map[string]any{"clan_tag": "", "players": []any{}, "wars": []any{}}
	}

	selected := map[string]bool{clanTag: true}
	agg := mobileGetOrCreateClanAggregate(map[string]*mobileClanWarAggregate{}, clanTag)
	processedWars := 0

	for _, war := range wars {
		if !mobileWarContainsSelectedClans(war, selected) {
			continue
		}
		if filter.Limit > 0 && processedWars >= filter.Limit {
			break
		}
		if !mobileWarMatchesFilter(war, filter) {
			continue
		}
		processedWars++

		cleanWar := mobileCleanWarData(war)
		freshOrders := mobileFreshAttackOrders(war)
		mobileAccumulateClanWarAggregates(war, cleanWar, freshOrders, selected, filter, map[string]*mobileClanWarAggregate{clanTag: agg})
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

func mobileFindLimitedPlayerWarDocs(ctx context.Context, a apptypes.Deps, playerTag string, startUnix int64, endUnix int64, limit int) []map[string]any {
	return mobileFindWarDocs(ctx, a, mobilePlayerWarDocsPipeline(playerTag, startUnix, endUnix, limit))
}

func mobileFindLimitedClanWarDocs(ctx context.Context, a apptypes.Deps, clanTag string, startUnix int64, endUnix int64, limit int) []map[string]any {
	return mobileFindWarDocs(ctx, a, mobileClanWarDocsPipeline(clanTag, startUnix, endUnix, limit))
}

func mobileFindLimitedPlayerWarDocsForTargets(ctx context.Context, a apptypes.Deps, playerTags []string, startUnix int64, endUnix int64, limit int) []map[string]any {
	totalStartedAt := time.Now()
	playerTags = mobileNormalizeUniqueTags(playerTags)
	batches := make([][]map[string]any, 0, len(playerTags))
	perTargetMs := make(map[string]int64, len(playerTags))
	perTargetCounts := make(map[string]int, len(playerTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, playerTag := range playerTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			startedAt := time.Now()
			docs := mobileFindLimitedPlayerWarDocs(ctx, a, tag, startUnix, endUnix, limit)
			durationMs := time.Since(startedAt).Milliseconds()
			mu.Lock()
			perTargetMs[tag] = durationMs
			perTargetCounts[tag] = len(docs)
			if len(docs) == 0 {
				mu.Unlock()
				return
			}
			batches = append(batches, docs)
			mu.Unlock()
		}(playerTag)
	}
	wg.Wait()
	merged := mobileMergeWarDocBatches(batches)
	apptypes.Logger().Info("mobile_player_war_docs_timing",
		"player_count", len(playerTags),
		"merged_doc_count", len(merged),
		"top_targets", mobileTopDurationsWithCounts(perTargetMs, perTargetCounts, 10),
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
	return merged
}

func mobileFindLimitedClanWarDocsForTargets(ctx context.Context, a apptypes.Deps, clanTags []string, startUnix int64, endUnix int64, limit int) []map[string]any {
	totalStartedAt := time.Now()
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	batches := make([][]map[string]any, 0, len(clanTags))
	perTargetMs := make(map[string]int64, len(clanTags))
	perTargetCounts := make(map[string]int, len(clanTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, clanTag := range clanTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			startedAt := time.Now()
			docs := mobileFindLimitedClanWarDocs(ctx, a, tag, startUnix, endUnix, limit)
			durationMs := time.Since(startedAt).Milliseconds()
			mu.Lock()
			perTargetMs[tag] = durationMs
			perTargetCounts[tag] = len(docs)
			if len(docs) == 0 {
				mu.Unlock()
				return
			}
			batches = append(batches, docs)
			mu.Unlock()
		}(clanTag)
	}
	wg.Wait()
	merged := mobileMergeWarDocBatches(batches)
	apptypes.Logger().Info("mobile_clan_war_docs_timing",
		"clan_count", len(clanTags),
		"merged_doc_count", len(merged),
		"top_targets", mobileTopDurationsWithCounts(perTargetMs, perTargetCounts, 10),
		"total_ms", time.Since(totalStartedAt).Milliseconds(),
	)
	return merged
}

func mobilePlayerWarDocsPipeline(playerTag string, startUnix int64, endUnix int64, limit int) bson.A {
	pipeline := bson.A{
		bson.M{"$match": bson.M{"$and": bson.A{
			bson.M{"$or": bson.A{
				bson.M{"data.clan.members.tag": playerTag},
				bson.M{"data.opponent.members.tag": playerTag},
			}},
			bson.M{"data.preparationStartTime": bson.M{"$gte": mobileTimestampString(startUnix)}},
			bson.M{"data.preparationStartTime": bson.M{"$lte": mobileTimestampString(endUnix)}},
		}}},
		bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
	}
	if limit > 0 {
		pipeline = append(pipeline, bson.M{"$limit": limit})
	}
	pipeline = append(pipeline, bson.M{"$project": bson.M{"_id": 0, "data": "$data"}})
	return pipeline
}

func mobileClanWarDocsPipeline(clanTag string, startUnix int64, endUnix int64, limit int) bson.A {
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"data.clan.tag":             clanTag,
			"data.preparationStartTime": bson.M{"$gte": mobileTimestampString(startUnix), "$lte": mobileTimestampString(endUnix)},
		}},
		bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
	}
	if limit > 0 {
		pipeline = append(pipeline, bson.M{"$limit": limit})
	}
	pipeline = append(pipeline, bson.M{"$project": bson.M{"_id": 0, "data": "$data"}})
	return pipeline
}

func mobileMergeWarDocBatches(batches [][]map[string]any) []map[string]any {
	seen := map[string]bool{}
	out := make([]map[string]any, 0)
	for _, docs := range batches {
		for _, doc := range docs {
			warID := mobileWarID(doc)
			if warID == "" || seen[warID] {
				continue
			}
			seen[warID] = true
			out = append(out, doc)
		}
	}

	sort.SliceStable(out, func(i int, j int) bool {
		return mobileString(out[i]["preparationStartTime"]) > mobileString(out[j]["preparationStartTime"])
	})
	return out
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

func mobileWarContainsSelectedPlayers(war map[string]any, selected map[string]bool) bool {
	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			if selected[mobileString(mobileMap(rawMember)["tag"])] {
				return true
			}
		}
	}
	return false
}

func mobileSelectedPlayersInWar(war map[string]any, selected map[string]bool) map[string]bool {
	out := map[string]bool{}
	for _, sideKey := range []string{"clan", "opponent"} {
		side := mobileMap(war[sideKey])
		for _, rawMember := range mobileList(side["members"]) {
			tag := mobileString(mobileMap(rawMember)["tag"])
			if selected[tag] {
				out[tag] = true
			}
		}
	}
	return out
}

func mobileWarContainsSelectedClans(war map[string]any, selected map[string]bool) bool {
	for _, sideKey := range []string{"clan", "opponent"} {
		if selected[mobileString(mobileMap(war[sideKey])["tag"])] {
			return true
		}
	}
	return false
}

func mobileSelectedClansInWar(war map[string]any, selected map[string]bool) map[string]bool {
	out := map[string]bool{}
	for _, sideKey := range []string{"clan", "opponent"} {
		tag := mobileString(mobileMap(war[sideKey])["tag"])
		if selected[tag] {
			out[tag] = true
		}
	}
	return out
}

func mobileBuildWarTargetSet(tags []string) map[string]bool {
	out := make(map[string]bool, len(tags))
	for _, tag := range tags {
		out[tag] = true
	}
	return out
}

func mobileUpdateProcessedWarTargets(remaining map[string]bool, processed map[string]int, selected map[string]bool, limit int) {
	if limit <= 0 {
		return
	}
	for tag := range selected {
		processed[tag]++
		if processed[tag] >= limit {
			delete(remaining, tag)
		}
	}
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
	case bson.DateTime:
		return time.UnixMilli(int64(typed)).UTC(), true
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
