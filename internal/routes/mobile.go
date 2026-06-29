package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
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
			playerWars       []map[string]any
			playerWarsWG     sync.WaitGroup
			playersPreloadCh = make(chan mobilePlayersExtendedPreload, 1)
		)
		playerWarsWG.Add(1)
		go func() {
			defer playerWarsWG.Done()
			playerWars = mobileFindLimitedPlayerWarDocsForTargets(ctx, a, playerTags, playerFilter.TimestampStart, playerFilter.TimestampEnd, playerFilter.Limit)
		}()
		go func() {
			playersPreloadCh <- mobileFetchPlayersExtendedPreload(ctx, a, playerTags)
		}()
		playersBasic := mobileFetchPlayersBasic(ctx, a, playerTags)

		clanTags := mobileExtractClanTags(playersBasic)
		clanFilter := mobileInitializationWarHitsFilter()
		clanFilter.ClanTags = clanTags

		var playersExtended []map[string]any
		var clanBundle map[string]any
		var playerWarStats []any
		var clanWarStats []any
		var wg sync.WaitGroup
		wg.Add(3)
		go func() {
			defer wg.Done()
			playersExtended = mobileFetchPlayersExtended(ctx, a, playerTags, clanTags, playersBasic, <-playersPreloadCh)
		}()
		go func() {
			defer wg.Done()
			clanBundle = mobileFetchClanBundle(ctx, a, clanTags)
		}()
		go func() {
			defer wg.Done()
			clanWars := mobileFindLimitedClanWarDocsForTargets(ctx, a, clanTags, clanFilter.TimestampStart, clanFilter.TimestampEnd, clanFilter.Limit)
			playerWarsWG.Wait()
			playerWarStats, clanWarStats = mobileBuildInitializationWarStatsFromBatches(playerWars, clanWars, playerFilter, clanFilter)
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
	results := make([]map[string]any, len(playerTags))
	sem := make(chan struct{}, 50)
	var wg sync.WaitGroup
	for idx, tag := range playerTags {
		wg.Add(1)
		go func(i int, playerTag string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
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

func mobileFetchPlayersExtendedPreload(ctx context.Context, a apptypes.Deps, playerTags []string) mobilePlayersExtendedPreload {
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

	var setupWG sync.WaitGroup
	setupWG.Add(4)
	go func() {
		defer setupWG.Done()
		localStats := map[string]map[string]any{}
		if rows, err := playerCurrentStatsByTags(ctx, a, playerTags); err == nil {
			for _, row := range rows {
				tag := mobileString(row["tag"])
				if tag != "" {
					localStats[tag] = row
				}
			}
		}
		preload.statsMap = localStats
	}()
	go func() {
		defer setupWG.Done()
		preload.legendRankingsByTag = mobileFetchLegendRankingsBatch(ctx, a, playerTags, 10)
	}()
	go func() {
		defer setupWG.Done()
		preload.rankingsByTag = mobileFetchCurrentRankingsBatch(ctx, a, playerTags)
	}()
	go func() {
		defer setupWG.Done()
		preload.warTimerClansByTag = mobileFetchPlayerWarTimerClansBatch(ctx, a, playerTags)
	}()
	setupWG.Wait()
	return preload
}

func mobileFetchPlayersExtended(ctx context.Context, a apptypes.Deps, playerTags []string, clanTags []string, playersBasic []map[string]any, preload mobilePlayersExtendedPreload) []map[string]any {
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

	setupWG.Add(2)
	go func() {
		defer setupWG.Done()
		raidDataByClan = mobileFetchPlayerRaidDataBatch(ctx, a, clanTags)
	}()
	go func() {
		defer setupWG.Done()
		warDataByTag = mobileBuildPlayerWarContextsFromTimerClans(ctx, a, preload.warTimerClansByTag, basicByTag)
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

	rows := mobileLegendHistoryRows(ctx, a, playerTags, limit)
	return mobileLegendRankingsByTagFromRows(playerTags, rows, limit)
}

func mobileLegendRankingsByTagFromRows(playerTags []string, rows []map[string]any, limit int64) map[string][]any {
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

func mobileLegendHistoryRows(ctx context.Context, a apptypes.Deps, playerTags []string, limit int64) []map[string]any {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, season, rank, trophies, data
		FROM legend_history_snapshots
		WHERE player_tag = ANY($1)
		ORDER BY player_tag, season DESC
	`, playerTags)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, season string
		var rank, trophies int
		var dataRaw []byte
		if err := rows.Scan(&tag, &season, &rank, &trophies, &dataRaw); err != nil {
			continue
		}
		item := mobileMap(mobileDecodeJSONAny(dataRaw))
		item["tag"] = tag
		item["season"] = season
		item["rank"] = rank
		item["trophies"] = trophies
		out = append(out, item)
	}
	return out
}

func mobileFetchCurrentRankingsBatch(ctx context.Context, a apptypes.Deps, playerTags []string) map[string]map[string]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 {
		return map[string]map[string]any{}
	}

	leaderboardRows := mobileCurrentRankingRows(ctx, a, playerTags)

	provisional := mobileCurrentRankingsByTagFromRows(playerTags, leaderboardRows, nil)
	missingGlobalRank := make([]string, 0, len(playerTags))
	for _, tag := range playerTags {
		if provisional[tag]["global_rank"] == nil {
			missingGlobalRank = append(missingGlobalRank, tag)
		}
	}

	var fallbackRows []map[string]any
	if len(missingGlobalRank) > 0 {
		fallbackRows = mobileLegendCurrentRankingRows(ctx, a, missingGlobalRank)
	}

	return mobileCurrentRankingsByTagFromRows(playerTags, leaderboardRows, fallbackRows)
}

func mobileCurrentRankingRows(ctx context.Context, a apptypes.Deps, playerTags []string) []map[string]any {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, country_code, country_name, rank, global_rank, local_rank, data
		FROM player_rankings_current
		WHERE player_tag = ANY($1)
	`, playerTags)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag string
		var countryCode, countryName *string
		var rank, globalRank, localRank *int
		var dataRaw []byte
		if err := rows.Scan(&tag, &countryCode, &countryName, &rank, &globalRank, &localRank, &dataRaw); err != nil {
			continue
		}
		item := mobileMap(mobileDecodeJSONAny(dataRaw))
		item["tag"] = tag
		if countryCode != nil {
			item["country_code"] = *countryCode
		}
		if countryName != nil {
			item["country_name"] = *countryName
		}
		if rank != nil {
			item["rank"] = *rank
		}
		if globalRank != nil {
			item["global_rank"] = *globalRank
		}
		if localRank != nil {
			item["local_rank"] = *localRank
		}
		out = append(out, item)
	}
	return out
}

func mobileLegendCurrentRankingRows(ctx context.Context, a apptypes.Deps, playerTags []string) []map[string]any {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, rank, data
		FROM legend_rankings_current
		WHERE player_tag = ANY($1)
	`, playerTags)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag string
		var rank int
		var dataRaw []byte
		if err := rows.Scan(&tag, &rank, &dataRaw); err != nil {
			continue
		}
		item := mobileMap(mobileDecodeJSONAny(dataRaw))
		item["tag"] = tag
		item["rank"] = rank
		out = append(out, item)
	}
	return out
}

func mobileCurrentRankingsByTagFromRows(playerTags []string, leaderboardRows []map[string]any, fallbackRows []map[string]any) map[string]map[string]any {
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

func mobileRaidWeekendRows(ctx context.Context, a apptypes.Deps, clanTags []string) []map[string]any {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT DISTINCT ON (clan_tag) clan_tag, members, data
		FROM raid_weekends
		WHERE clan_tag = ANY($1)
		ORDER BY clan_tag, start_time DESC
	`, clanTags)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var clanTag string
		var membersRaw, dataRaw []byte
		if err := rows.Scan(&clanTag, &membersRaw, &dataRaw); err != nil {
			continue
		}
		data := mobileMap(mobileDecodeJSONAny(dataRaw))
		if len(data) == 0 {
			data = map[string]any{}
		}
		data["members"] = mobileDecodeJSONAny(membersRaw)
		out = append(out, map[string]any{"clan_tag": clanTag, "data": data})
	}
	return out
}

func mobileFetchPlayerRaidDataBatch(ctx context.Context, a apptypes.Deps, clanTags []string) map[string]map[string]map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	if len(clanTags) == 0 || !mobileIsRaidsWindow() {
		return map[string]map[string]map[string]any{}
	}

	rows := mobileRaidWeekendRows(ctx, a, clanTags)
	return mobilePlayerRaidDataByClanFromRows(clanTags, rows)
}

func mobilePlayerRaidDataByClanFromRows(clanTags []string, rows []map[string]any) map[string]map[string]map[string]any {
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
	clansByTag := mobileFetchPlayerWarTimerClansBatch(ctx, a, []string{playerTag})
	targetClan := mobilePlayerWarContextTargetClan(clansByTag[playerTag], currentClanTag)
	if targetClan == "" {
		return map[string]any{}
	}
	return currentWarSummary(ctx, a, targetClan)
}

func mobileFetchPlayerWarTimerClansBatch(ctx context.Context, a apptypes.Deps, playerTags []string) map[string][]string {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	if len(playerTags) == 0 {
		return map[string][]string{}
	}

	out := make(map[string][]string, len(playerTags))
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT attacker_tag, attacking_clan_tag
		FROM war_attack_events
		WHERE attacker_tag = ANY($1)
		GROUP BY attacker_tag, attacking_clan_tag
	`, playerTags)
	if err != nil {
		return out
	}
	defer rows.Close()
	seen := map[string]map[string]bool{}
	for rows.Next() {
		var tag, clanTag string
		if err := rows.Scan(&tag, &clanTag); err != nil {
			continue
		}
		if seen[tag] == nil {
			seen[tag] = map[string]bool{}
		}
		if !seen[tag][clanTag] {
			out[tag] = append(out[tag], clanTag)
			seen[tag][clanTag] = true
		}
	}
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
	sem := make(chan struct{}, 20)
	var wg sync.WaitGroup
	for _, clanTag := range clanTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
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
	icons := leagueIconLookup(a)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, tag := range clanTags {
		wg.Add(1)
		go func(clanTag string) {
			defer wg.Done()
			url := "https://proxy.clashk.ing/v1/clans/" + url.PathEscape(clanTag)
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
	seasonDateRaw, ok := genSeasonDate(0, false).(string)
	if !ok {
		return map[string]any{}
	}
	seasonStart, seasonEnd, err := joinLeaveSeasonBounds(seasonDateRaw)
	if err != nil {
		return map[string]any{}
	}
	rowsSQL, err := a.Store.SQL.Query(ctx, `
		SELECT "time", "type", clan_tag, player_tag, player_name, townhall_level
		FROM join_leave_history
		WHERE clan_tag = ANY($1)
		  AND "time" >= $2
		  AND "time" <= $3
		ORDER BY "time" DESC
	`, clanTags, seasonStart, seasonEnd)
	if err != nil {
		return map[string]any{}
	}
	defer rowsSQL.Close()

	groupedDocs := map[string][]map[string]any{}
	groupedStats := map[string][]mobileJoinLeaveEvent{}
	for rowsSQL.Next() {
		var eventTime time.Time
		var eventType, clanTag, playerTag string
		var playerName *string
		var townhall int
		if err := rowsSQL.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall); err != nil {
			continue
		}
		clean := map[string]any{}
		clean["clan"] = clanTag
		clean["type"] = eventType
		clean["tag"] = playerTag
		clean["time"] = eventTime
		clean["th"] = townhall
		if playerName != nil {
			clean["name"] = *playerName
		}
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
			url := "https://proxy.clashk.ing/v1/clans/" + url.PathEscape(clanTag) + "/capitalraidseasons?limit=" + strconv.Itoa(limit)
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
			url := "https://proxy.clashk.ing/v1/clans/" + url.PathEscape(clanTag) + "/warlog"
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

type mobileWarQuery struct {
	PlayerTags []string
	ClanTags   []string
	StartUnix  int64
	EndUnix    int64
	Limit      int
}

func mobileFindWarDocs(ctx context.Context, a apptypes.Deps, query mobileWarQuery) []map[string]any {
	where := []string{"prep_time >= $1", "prep_time <= $2"}
	args := []any{time.Unix(query.StartUnix, 0).UTC(), time.Unix(query.EndUnix, 0).UTC()}
	if len(query.ClanTags) > 0 {
		args = append(args, query.ClanTags)
		where = append(where, "(clan_tag = ANY($"+strconv.Itoa(len(args))+") OR opponent_tag = ANY($"+strconv.Itoa(len(args))+"))")
	}
	if len(query.PlayerTags) > 0 {
		args = append(args, query.PlayerTags)
		where = append(where, `war_id IN (
			SELECT DISTINCT war_id FROM war_attack_events
			WHERE attacker_tag = ANY($`+strconv.Itoa(len(args))+`) OR defender_tag = ANY($`+strconv.Itoa(len(args))+`)
		)`)
	}
	limitSQL := ""
	if query.Limit > 0 {
		args = append(args, query.Limit)
		limitSQL = " LIMIT $" + strconv.Itoa(len(args))
	}
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT war_id, clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state, battle_modifier, cwl_war_tag, r2_key
		FROM war_log_index
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY prep_time DESC
	`+limitSQL, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	seen := map[string]bool{}
	out := []map[string]any{}
	for rows.Next() {
		var warID, clanTag, opponentTag, warType, state, modifier string
		var prepTime, endTime time.Time
		var startTime *time.Time
		var size int
		var cwlWarTag, r2Key *string
		if err := rows.Scan(&warID, &clanTag, &opponentTag, &prepTime, &startTime, &endTime, &size, &warType, &state, &modifier, &cwlWarTag, &r2Key); err != nil {
			continue
		}
		data := map[string]any{
			"war_id":               warID,
			"clan":                 map[string]any{"tag": clanTag},
			"opponent":             map[string]any{"tag": opponentTag},
			"preparationStartTime": prepTime.UTC().Format(time.RFC3339),
			"endTime":              endTime.UTC().Format(time.RFC3339),
			"teamSize":             size,
			"type":                 warType,
			"state":                state,
			"battleModifier":       modifier,
		}
		if startTime != nil {
			data["startTime"] = startTime.UTC().Format(time.RFC3339)
		}
		if cwlWarTag != nil {
			data["cwlWarTag"] = *cwlWarTag
		}
		if r2Key != nil {
			data["r2_key"] = *r2Key
		}
		computedID := mobileWarID(data)
		if computedID == "" || seen[computedID] {
			continue
		}
		seen[computedID] = true
		out = append(out, data)
	}
	return out
}

func mobileFindRelevantWarDocs(ctx context.Context, a apptypes.Deps, playerTags []string, clanTags []string, startUnix int64, endUnix int64) []map[string]any {
	if len(playerTags) == 0 && len(clanTags) == 0 {
		return nil
	}
	return mobileFindWarDocs(ctx, a, mobileWarQuery{PlayerTags: playerTags, ClanTags: clanTags, StartUnix: startUnix, EndUnix: endUnix})
}

func mobileFindLimitedPlayerWarDocs(ctx context.Context, a apptypes.Deps, playerTag string, startUnix int64, endUnix int64, limit int) []map[string]any {
	return mobileFindWarDocs(ctx, a, mobilePlayerWarDocsPipeline(playerTag, startUnix, endUnix, limit))
}

func mobileFindLimitedClanWarDocs(ctx context.Context, a apptypes.Deps, clanTag string, startUnix int64, endUnix int64, limit int) []map[string]any {
	return mobileFindWarDocs(ctx, a, mobileClanWarDocsPipeline(clanTag, startUnix, endUnix, limit))
}

func mobileFindLimitedPlayerWarDocsForTargets(ctx context.Context, a apptypes.Deps, playerTags []string, startUnix int64, endUnix int64, limit int) []map[string]any {
	playerTags = mobileNormalizeUniqueTags(playerTags)
	batches := make([][]map[string]any, 0, len(playerTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, playerTag := range playerTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			docs := mobileFindLimitedPlayerWarDocs(ctx, a, tag, startUnix, endUnix, limit)
			mu.Lock()
			if len(docs) == 0 {
				mu.Unlock()
				return
			}
			batches = append(batches, docs)
			mu.Unlock()
		}(playerTag)
	}
	wg.Wait()
	return mobileMergeWarDocBatches(batches)
}

func mobileFindLimitedClanWarDocsForTargets(ctx context.Context, a apptypes.Deps, clanTags []string, startUnix int64, endUnix int64, limit int) []map[string]any {
	clanTags = mobileNormalizeUniqueClanTags(clanTags)
	batches := make([][]map[string]any, 0, len(clanTags))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, clanTag := range clanTags {
		wg.Add(1)
		go func(tag string) {
			defer wg.Done()
			docs := mobileFindLimitedClanWarDocs(ctx, a, tag, startUnix, endUnix, limit)
			mu.Lock()
			if len(docs) == 0 {
				mu.Unlock()
				return
			}
			batches = append(batches, docs)
			mu.Unlock()
		}(clanTag)
	}
	wg.Wait()
	return mobileMergeWarDocBatches(batches)
}

func mobilePlayerWarDocsPipeline(playerTag string, startUnix int64, endUnix int64, limit int) mobileWarQuery {
	return mobileWarQuery{PlayerTags: []string{playerTag}, StartUnix: startUnix, EndUnix: endUnix, Limit: limit}
}

func mobileClanWarDocsPipeline(clanTag string, startUnix int64, endUnix int64, limit int) mobileWarQuery {
	return mobileWarQuery{ClanTags: []string{clanTag}, StartUnix: startUnix, EndUnix: endUnix, Limit: limit}
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
	out["type"] = mobileWarType(war)
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

func mobileDecodeJSONAny(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil
	}
	return value
}

func mobileList(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	case []map[string]any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, item)
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
	if value := strings.ToLower(strings.TrimSpace(mobileString(war["type"]))); value != "" {
		return value
	}
	if value := strings.ToLower(strings.TrimSpace(mobileString(war["warType"]))); value != "" {
		return value
	}
	if mobileString(war["tag"]) != "" || mobileString(war["war_tag"]) != "" || mobileString(war["season"]) != "" {
		return "cwl"
	}
	return "random"
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
