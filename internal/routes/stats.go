package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	statsDefaultDays      = 30
	statsMaximumDays      = 90
	statsDefaultMinSample = 100
	statsDefaultArmyLimit = 25
	statsMaximumArmyLimit = 100
	statsMaximumItemCount = 25

	townHallCountsQuery = `SELECT level, total_count FROM townhall_counts ORDER BY level`
)

var statsValidHeroes = map[string]string{
	"barbarian king": "Barbarian King",
	"archer queen":   "Archer Queen",
	"grand warden":   "Grand Warden",
	"royal champion": "Royal Champion",
	"minion prince":  "Minion Prince",
}

type statsTimeWindow struct {
	start        time.Time
	endExclusive time.Time
}

func (w statsTimeWindow) response() modelsv2.StatsDateRange {
	return modelsv2.StatsDateRange{Start: w.start, End: w.endExclusive.Add(-time.Nanosecond)}
}

// countsOverview godoc
// @Summary Get global ClashKing counts
// @Description Returns the current materialized global count summary. The legacy /global/counts caller remains supported separately.
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GlobalCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts [get]
func countsOverview(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		counts, err := loadGlobalCounts(c.UserContext(), a.Store.SQL)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, counts)
	}
}

// countsPlayerTownhalls godoc
// @Summary Get player town hall counts
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts/players/town-halls [get]
func countsPlayerTownhalls(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "townhall_level", townHallCountsQuery)
}

// countsPlayerBuilderhalls godoc
// @Summary Get player builder hall counts
// @Description Builder Hall counts are not implemented because no durable Builder Hall count source exists yet.
// @Tags Counts
// @Produce json
// @Failure 501 {object} modelsv2.ErrorResponse
// @Router /v2/counts/players/builder-halls [get]
func countsPlayerBuilderhalls(_ apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusNotImplemented, modelsv2.ErrorResponse{
			Code:      modelsv2.ErrorCodeNotImplemented,
			Message:   "Builder Hall counts are not implemented",
			RequestID: apptypes.RequestID(c),
		})
	}
}

// countsPlayerLeagueTiers godoc
// @Summary Get player league tier counts
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts/players/league-tiers [get]
func countsPlayerLeagueTiers(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "league_tier_id", `SELECT league_tier_id, player_count FROM api_league_tier_counts ORDER BY league_tier_id`)
}

// countsClanLocations godoc
// @Summary Get clan location counts
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts/clans/locations [get]
func countsClanLocations(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "location_id", `SELECT location_id, count(*) FROM basic_clan GROUP BY location_id ORDER BY location_id NULLS LAST`)
}

// countsClanCWLLeagues godoc
// @Summary Get clan CWL league counts
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts/clans/cwl-leagues [get]
func countsClanCWLLeagues(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "cwl_league_id", `SELECT cwl_league_id, clan_count FROM war_league_counts ORDER BY cwl_league_id`)
}

// countsClanCapitalLeagues godoc
// @Summary Get clan capital league counts
// @Tags Counts
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/counts/clans/capital-leagues [get]
func countsClanCapitalLeagues(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "capital_league_id", `SELECT capital_league_id, count(*) FROM basic_clan GROUP BY capital_league_id ORDER BY capital_league_id NULLS LAST`)
}

// statsOverview godoc
// @Summary Get battle intelligence overview
// @Description Returns global counts plus ranked, regular-war, and CWL KPIs. A source with no rows has available=false, sample_size=0, zero rates, and an empty daily series.
// @Tags Stats
// @Produce json
// @Param start_date query string false "Inclusive start date YYYY-MM-DD"
// @Param end_date query string false "Inclusive end date YYYY-MM-DD"
// @Success 200 {object} modelsv2.StatsOverviewResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/stats/overview [get]
func statsOverview(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		window, err := statsParseWindow(modelsv2.StatsDateFilter{
			StartDate: c.Query("start_date"),
			EndDate:   c.Query("end_date"),
		}, time.Now().UTC())
		if err != nil {
			return err
		}
		counts, err := loadGlobalCounts(c.UserContext(), a.Store.SQL)
		if err != nil {
			return err
		}
		ranked, err := loadStatsPerformance(c.UserContext(), a.Store.SQL, statsRankedSourceSQL, []string{
			"event_time >= $1", "event_time < $2",
		}, []any{window.start, window.endExclusive})
		if err != nil {
			return err
		}
		war, _, err := loadWarArchiveStats(c.UserContext(), a, "random", window, nil, nil, true, nil, nil)
		if err != nil {
			return err
		}
		cwl, _, err := loadWarArchiveStats(c.UserContext(), a, "cwl", window, nil, nil, true, nil, nil)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsOverviewResponse{
			DateRange: window.response(), Counts: counts, Ranked: ranked, War: war, CWL: cwl,
		})
	}
}

// statsArmies godoc
// @Summary Query ranked army intelligence
// @Description Uses exact army_share_code + army_items + army_counts identity.
// @Tags Stats
// @Accept json
// @Produce json
// @Param body body modelsv2.StatsArmiesQuery true "Army filters"
// @Success 200 {object} modelsv2.StatsArmiesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @x-http-method "QUERY"
// @Router /v2/stats/armies [post]
func statsArmies(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.StatsArmiesQuery
		if err := decodeStatsQueryJSON(c, &request); err != nil {
			return err
		}
		window, err := statsParseWindow(request.Dates, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := validateStatsBattleFilters(request.StatsBattleFilters); err != nil {
			return err
		}
		items, err := loadStatsArmies(c.UserContext(), a.Store.SQL, request, window)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsArmiesResponse{DateRange: window.response(), Items: items, Count: len(items)})
	}
}

// statsItems godoc
// @Summary Query ranked item intelligence
// @Description Item analysis is available for ranked battlelogs. War/CWL attack rows do not store army items, so those dimensions are intentionally absent.
// @Tags Stats
// @Accept json
// @Produce json
// @Param body body modelsv2.StatsItemsQuery true "Item filters"
// @Success 200 {object} modelsv2.StatsItemsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @x-http-method "QUERY"
// @Router /v2/stats/items [post]
func statsItems(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.StatsItemsQuery
		if err := decodeStatsQueryJSON(c, &request); err != nil {
			return err
		}
		window, err := statsParseWindow(request.Dates, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := validateStatsBattleFilters(request.StatsBattleFilters); err != nil {
			return err
		}
		selectors, err := validateStatsItemSelectors(request.Items)
		if err != nil {
			return err
		}
		items := make([]modelsv2.StatsItemResult, 0, len(selectors))
		for _, selector := range selectors {
			item, err := loadStatsItem(c.UserContext(), a.Store.SQL, request.StatsBattleFilters, selector, window)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsItemsResponse{DateRange: window.response(), Items: items, Count: len(items)})
	}
}

// statsRanked godoc
// @Summary Query ranked performance
// @Description Requires one town hall and exactly one ranked tier. Each battle date is joined to the same YYYYMM season_id in ranked_league_group_members; basic_player.league_id is never used.
// @Tags Stats
// @Accept json
// @Produce json
// @Param body body modelsv2.StatsRankedQuery true "Ranked filters"
// @Success 200 {object} modelsv2.StatsPerformanceResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @x-http-method "QUERY"
// @Router /v2/stats/ranked [post]
func statsRanked(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.StatsRankedQuery
		if err := decodeStatsQueryJSON(c, &request); err != nil {
			return err
		}
		if request.TownhallLevel <= 0 || request.RankedLeagueTierID <= 0 {
			return apptypes.Error(http.StatusBadRequest, "townhall_level and exactly one ranked_league_tier_id are required")
		}
		window, err := statsParseWindow(request.Dates, time.Now().UTC())
		if err != nil {
			return err
		}
		metrics, err := loadStatsPerformance(c.UserContext(), a.Store.SQL, statsRankedSourceSQL, []string{
			"event_time >= $1", "event_time < $2", "townhall_level = $3", "ranked_league_tier_id = $4",
		}, []any{window.start, window.endExclusive, request.TownhallLevel, request.RankedLeagueTierID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsPerformanceResponse{DateRange: window.response(), Metrics: metrics})
	}
}

// statsWar godoc
// @Summary Query regular-war performance
// @Description Includes random wars only, excluding friendly and CWL wars. Equal-town-hall attacks are the default.
// @Tags Stats
// @Accept json
// @Produce json
// @Param body body modelsv2.StatsWarQuery true "War filters"
// @Success 200 {object} modelsv2.StatsPerformanceResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @x-http-method "QUERY"
// @Router /v2/stats/war [post]
func statsWar(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.StatsWarQuery
		if err := decodeStatsQueryJSON(c, &request); err != nil {
			return err
		}
		window, err := statsParseWindow(request.Dates, time.Now().UTC())
		if err != nil {
			return err
		}
		equal := request.EqualTownhalls == nil || *request.EqualTownhalls
		metrics, _, err := loadWarArchiveStats(c.UserContext(), a, "random", window, request.TownhallLevel, request.OpponentTownhallLevel, equal, nil, nil)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsPerformanceResponse{DateRange: window.response(), Metrics: metrics})
	}
}

// statsCWL godoc
// @Summary Query CWL performance
// @Description CWL is separate from regular war, defaults to equal-town-hall attacks, and returns season aggregation. League attribution uses the CWL group containing either war clan for the matching YYYY-MM season.
// @Tags Stats
// @Accept json
// @Produce json
// @Param body body modelsv2.StatsCWLQuery true "CWL filters"
// @Success 200 {object} modelsv2.StatsPerformanceResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @x-http-method "QUERY"
// @Router /v2/stats/cwl [post]
func statsCWL(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.StatsCWLQuery
		if err := decodeStatsQueryJSON(c, &request); err != nil {
			return err
		}
		window, err := statsParseWindow(request.Dates, time.Now().UTC())
		if err != nil {
			return err
		}
		equal := request.EqualTownhalls == nil || *request.EqualTownhalls
		if request.CWLLeagueID != nil {
			if *request.CWLLeagueID <= 0 {
				return apptypes.Error(http.StatusBadRequest, "cwl_league_id must be greater than 0")
			}
		}
		if len(request.Seasons) > 0 {
			for _, season := range request.Seasons {
				if _, err := time.Parse("2006-01", season); err != nil {
					return apptypes.Error(http.StatusBadRequest, "seasons must use YYYY-MM")
				}
			}
		}
		metrics, breakdowns, err := loadWarArchiveStats(c.UserContext(), a, "cwl", window, request.TownhallLevel, request.OpponentTownhallLevel, equal, request.CWLLeagueID, request.Seasons)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.StatsPerformanceResponse{DateRange: window.response(), Metrics: metrics, Breakdowns: breakdowns})
	}
}

const statsRankedSourceSQL = `(
	SELECT b."timestamp" AS event_time, b.stars::int AS stars,
		b.destruction_percentage::float8 AS destruction_percentage,
		b.player_th::int AS townhall_level, b.opponent_th::int AS opponent_townhall_level,
		r.league_tier_id AS ranked_league_tier_id
	FROM battlelogs b
	JOIN LATERAL (
		SELECT membership.league_tier_id
		FROM ranked_league_group_members membership
		WHERE membership.player_tag = b.player_tag
			AND membership.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
		ORDER BY membership.group_tag
		LIMIT 1
	) r ON true
	WHERE b.attack = true AND lower(b.battle_type) IN ('ranked', 'legend')
) stats_source`

func decodeStatsQueryJSON(c *fiber.Ctx, out any) error {
	contentType := strings.ToLower(strings.TrimSpace(c.Get(fiber.HeaderContentType)))
	if !strings.HasPrefix(contentType, fiber.MIMEApplicationJSON) {
		return apptypes.Error(http.StatusUnsupportedMediaType, "Content-Type must be application/json")
	}
	return apptypes.DecodeJSON(c, out)
}

type archiveStatsAggregate struct {
	attacks, stars, zero, one, two, three int64
	destruction                           int64
}

func (a *archiveStatsAggregate) add(value wararchive.AttackAggregate) {
	a.attacks += int64(value.Attacks)
	a.stars += int64(value.Stars)
	a.zero += int64(value.ZeroStars)
	a.one += int64(value.OneStars)
	a.two += int64(value.TwoStars)
	a.three += int64(value.Triples)
	a.destruction += value.DestructionPercent
}

func (a archiveStatsAggregate) metrics() modelsv2.StatsMetrics {
	result := modelsv2.StatsMetrics{SampleSize: a.attacks, Daily: []modelsv2.StatsDailyPoint{}, Available: a.attacks > 0}
	if a.attacks == 0 {
		return result
	}
	result.AverageStars = float64(a.stars) / float64(a.attacks)
	result.AverageDestruction = float64(a.destruction) / float64(a.attacks)
	result.ZeroStarRate = float64(a.zero) / float64(a.attacks)
	result.OneStarRate = float64(a.one) / float64(a.attacks)
	result.TwoStarRate = float64(a.two) / float64(a.attacks)
	result.ThreeStarRate = float64(a.three) / float64(a.attacks)
	return result
}

func loadWarArchiveStats(ctx context.Context, a apptypes.Deps, warType string, window statsTimeWindow, townhall, opponentTownhall *int, equal bool, leagueID *int, seasons []string) (modelsv2.StatsMetrics, []modelsv2.StatsBreakdown, error) {
	for name, value := range map[string]*int{"townhall_level": townhall, "opponent_townhall_level": opponentTownhall} {
		if value != nil && *value <= 0 {
			return modelsv2.StatsMetrics{}, nil, apptypes.Error(http.StatusBadRequest, name+" must be greater than 0")
		}
	}
	if leagueID != nil {
		return loadWarArchiveStatsByLeague(ctx, a, warType, window, townhall, opponentTownhall, equal, *leagueID, seasons)
	}
	rows, err := a.Store.SQL.Query(ctx, `SELECT stats #> '{attacks,byDayTypeMatchup}' FROM war_archive_packs WHERE status = 'uploaded' AND last_end_time >= $1 AND first_end_time < $2`, window.start, window.endExclusive)
	if err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	defer rows.Close()
	daily := map[string]*archiveStatsAggregate{}
	seasonSet := map[string]struct{}{}
	for _, season := range seasons {
		seasonSet[season] = struct{}{}
	}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return modelsv2.StatsMetrics{}, nil, err
		}
		var dailyMatchups map[string]wararchive.AttackAggregate
		if err := json.Unmarshal(raw, &dailyMatchups); err != nil {
			return modelsv2.StatsMetrics{}, nil, err
		}
		for key, value := range dailyMatchups {
			parts := strings.Split(key, "|")
			if len(parts) != 4 || parts[1] != warType {
				continue
			}
			day, err := time.Parse("2006-01-02", parts[0])
			if err != nil || day.Before(window.start) || !day.Before(window.endExclusive) {
				continue
			}
			if len(seasonSet) > 0 {
				if _, exists := seasonSet[parts[0][:7]]; !exists {
					continue
				}
			}
			attackerTH, _ := strconv.Atoi(parts[2])
			defenderTH, _ := strconv.Atoi(parts[3])
			if townhall != nil && attackerTH != *townhall {
				continue
			}
			if opponentTownhall != nil && defenderTH != *opponentTownhall {
				continue
			}
			if equal && attackerTH != defenderTH {
				continue
			}
			current := daily[parts[0]]
			if current == nil {
				current = &archiveStatsAggregate{}
				daily[parts[0]] = current
			}
			current.add(value)
		}
	}
	if err := rows.Err(); err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	if err := addPendingWarArchiveStats(ctx, a, daily, warType, window, townhall, opponentTownhall, equal, seasonSet); err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	return archiveStatsResult(daily), archiveStatsSeasonBreakdowns(daily), nil
}

func addPendingWarArchiveStats(ctx context.Context, a apptypes.Deps, daily map[string]*archiveStatsAggregate, warType string, window statsTimeWindow, townhall, opponentTownhall *int, equal bool, seasons map[string]struct{}) error {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT payload FROM war_archive_pending
		WHERE end_time >= $1 AND end_time < $2
	`, window.start, window.endExclusive)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		var war wararchive.War
		if err := json.Unmarshal(raw, &war); err != nil {
			return err
		}
		if war.Type != warType {
			continue
		}
		day := war.EndTime.UTC().Format("2006-01-02")
		if len(seasons) > 0 {
			if _, exists := seasons[day[:7]]; !exists {
				continue
			}
		}
		for _, attack := range wararchive.Attacks("", war) {
			if townhall != nil && attack.AttackerTownhall != *townhall {
				continue
			}
			if opponentTownhall != nil && attack.DefenderTownhall != *opponentTownhall {
				continue
			}
			if equal && attack.AttackerTownhall != attack.DefenderTownhall {
				continue
			}
			value := wararchive.AttackAggregate{Attacks: 1, Stars: attack.Stars, DestructionPercent: int64(attack.DestructionPercentage), DurationSeconds: int64(attack.Duration)}
			switch attack.Stars {
			case 3:
				value.Triples = 1
			case 2:
				value.TwoStars = 1
			case 1:
				value.OneStars = 1
			default:
				value.ZeroStars = 1
			}
			current := daily[day]
			if current == nil {
				current = &archiveStatsAggregate{}
				daily[day] = current
			}
			current.add(value)
		}
	}
	return rows.Err()
}

func loadWarArchiveStatsByLeague(ctx context.Context, a apptypes.Deps, warType string, window statsTimeWindow, townhall, opponentTownhall *int, equal bool, leagueID int, seasons []string) (modelsv2.StatsMetrics, []modelsv2.StatsBreakdown, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT DISTINCT w.war_id::text
		FROM wars AS w
		WHERE w.war_type = $1 AND w.end_time >= $2 AND w.end_time < $3
		  AND (cardinality($5::text[]) = 0 OR to_char(w.end_time AT TIME ZONE 'UTC', 'YYYY-MM') = ANY($5))
		  AND EXISTS (
			SELECT 1 FROM cwl_groups AS g JOIN cwl_group_clans AS gc ON gc.cwl_id = g.cwl_id
			WHERE g.cwl_league_id = $4 AND g.season = to_char(w.end_time AT TIME ZONE 'UTC', 'YYYY-MM')
			  AND gc.clan_tag IN (w.clan_tag, w.opponent_tag)
		  )
	`, warType, window.start, window.endExclusive, leagueID, seasons)
	if err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return modelsv2.StatsMetrics{}, nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	wars, err := a.Store.WarArchive.LoadIDs(ctx, a.Store.SQL, ids)
	if err != nil {
		return modelsv2.StatsMetrics{}, nil, err
	}
	daily := map[string]*archiveStatsAggregate{}
	for id, war := range wars {
		for _, attack := range wararchive.Attacks(id, war) {
			if townhall != nil && attack.AttackerTownhall != *townhall {
				continue
			}
			if opponentTownhall != nil && attack.DefenderTownhall != *opponentTownhall {
				continue
			}
			if equal && attack.AttackerTownhall != attack.DefenderTownhall {
				continue
			}
			value := wararchive.AttackAggregate{Attacks: 1, Stars: attack.Stars, DestructionPercent: int64(attack.DestructionPercentage)}
			switch attack.Stars {
			case 3:
				value.Triples = 1
			case 2:
				value.TwoStars = 1
			case 1:
				value.OneStars = 1
			default:
				value.ZeroStars = 1
			}
			day := attack.WarEndTime.UTC().Format("2006-01-02")
			current := daily[day]
			if current == nil {
				current = &archiveStatsAggregate{}
				daily[day] = current
			}
			current.add(value)
		}
	}
	return archiveStatsResult(daily), archiveStatsSeasonBreakdowns(daily), nil
}

func archiveStatsResult(daily map[string]*archiveStatsAggregate) modelsv2.StatsMetrics {
	var total archiveStatsAggregate
	keys := make([]string, 0, len(daily))
	for key := range daily {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := daily[key]
		total.attacks += value.attacks
		total.stars += value.stars
		total.zero += value.zero
		total.one += value.one
		total.two += value.two
		total.three += value.three
		total.destruction += value.destruction
	}
	result := total.metrics()
	for _, key := range keys {
		value := daily[key].metrics()
		result.Daily = append(result.Daily, modelsv2.StatsDailyPoint{Date: key, SampleSize: value.SampleSize, AverageStars: value.AverageStars, AverageDestruction: value.AverageDestruction, ZeroStarRate: value.ZeroStarRate, OneStarRate: value.OneStarRate, TwoStarRate: value.TwoStarRate, ThreeStarRate: value.ThreeStarRate})
	}
	return result
}

func archiveStatsSeasonBreakdowns(daily map[string]*archiveStatsAggregate) []modelsv2.StatsBreakdown {
	bySeason := map[string]*archiveStatsAggregate{}
	for day, value := range daily {
		season := day[:7]
		current := bySeason[season]
		if current == nil {
			current = &archiveStatsAggregate{}
			bySeason[season] = current
		}
		current.attacks += value.attacks
		current.stars += value.stars
		current.zero += value.zero
		current.one += value.one
		current.two += value.two
		current.three += value.three
		current.destruction += value.destruction
	}
	keys := make([]string, 0, len(bySeason))
	for key := range bySeason {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]modelsv2.StatsBreakdown, 0, len(keys))
	for _, key := range keys {
		result = append(result, modelsv2.StatsBreakdown{Key: key, Metrics: bySeason[key].metrics()})
	}
	return result
}

func loadGlobalCounts(ctx context.Context, pool *pgxpool.Pool) (modelsv2.GlobalCountsResponse, error) {
	var out modelsv2.GlobalCountsResponse
	err := pool.QueryRow(ctx, `
		SELECT players_in_war, clans_in_war, total_join_leaves, players_in_legends,
			player_count, clan_count, wars_stored
		FROM api_global_counts
		WHERE id = 1
	`).Scan(&out.PlayersInWar, &out.ClansInWar, &out.TotalJoinLeaves, &out.PlayersInLegends, &out.PlayerCount, &out.ClanCount, &out.WarsStored)
	return out, err
}

func statsParseWindow(filter modelsv2.StatsDateFilter, now time.Time) (statsTimeWindow, error) {
	today := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	end := today
	var err error
	if strings.TrimSpace(filter.EndDate) != "" {
		end, err = time.Parse("2006-01-02", filter.EndDate)
		if err != nil {
			return statsTimeWindow{}, apptypes.Error(http.StatusBadRequest, "end_date must use YYYY-MM-DD")
		}
	}
	start := end.AddDate(0, 0, -(statsDefaultDays - 1))
	if strings.TrimSpace(filter.StartDate) != "" {
		start, err = time.Parse("2006-01-02", filter.StartDate)
		if err != nil {
			return statsTimeWindow{}, apptypes.Error(http.StatusBadRequest, "start_date must use YYYY-MM-DD")
		}
	}
	endExclusive := end.AddDate(0, 0, 1)
	if !start.Before(endExclusive) {
		return statsTimeWindow{}, apptypes.Error(http.StatusBadRequest, "start_date must be on or before end_date")
	}
	if endExclusive.Sub(start) > statsMaximumDays*24*time.Hour {
		return statsTimeWindow{}, apptypes.Error(http.StatusBadRequest, "date range cannot exceed 90 days")
	}
	return statsTimeWindow{start: start, endExclusive: endExclusive}, nil
}

func validateStatsBattleFilters(filters modelsv2.StatsBattleFilters) error {
	for name, value := range map[string]*int{
		"townhall_level":          filters.TownhallLevel,
		"opponent_townhall_level": filters.OpponentTownhallLevel,
		"ranked_league_tier_id":   filters.RankedLeagueTierID,
		"minimum_sample_size":     filters.MinimumSampleSize,
	} {
		if value != nil && *value <= 0 {
			return apptypes.Error(http.StatusBadRequest, name+" must be greater than 0")
		}
	}
	for _, filter := range filters.IncludeItems {
		if strings.TrimSpace(filter.Item) == "" {
			return apptypes.Error(http.StatusBadRequest, "include_items item is required")
		}
		if filter.MinQuantity != nil && *filter.MinQuantity <= 0 || filter.MaxQuantity != nil && *filter.MaxQuantity <= 0 {
			return apptypes.Error(http.StatusBadRequest, "item quantities must be greater than 0")
		}
		if filter.MinQuantity != nil && filter.MaxQuantity != nil && *filter.MinQuantity > *filter.MaxQuantity {
			return apptypes.Error(http.StatusBadRequest, "min_quantity cannot exceed max_quantity")
		}
	}
	return nil
}

func validateStatsItemSelectors(items []modelsv2.StatsItemSelector) ([]modelsv2.StatsItemSelector, error) {
	if len(items) == 0 || len(items) > statsMaximumItemCount {
		return nil, apptypes.Error(http.StatusBadRequest, "items must contain between 1 and 25 entries")
	}
	out := make([]modelsv2.StatsItemSelector, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		item.Item = strings.TrimSpace(item.Item)
		item.Type = strings.ToLower(strings.TrimSpace(item.Type))
		if item.Item == "" {
			return nil, apptypes.Error(http.StatusBadRequest, "item is required")
		}
		switch item.Type {
		case "troop", "spell", "hero", "pet":
			if item.Hero != nil {
				return nil, apptypes.Error(http.StatusBadRequest, "hero is only valid for equipment")
			}
		case "equipment":
			if item.Hero == nil {
				return nil, apptypes.Error(http.StatusBadRequest, "equipment must include its hero")
			}
			hero, ok := statsValidHeroes[strings.ToLower(strings.TrimSpace(*item.Hero))]
			if !ok {
				return nil, apptypes.Error(http.StatusBadRequest, "equipment hero is not a valid Clash hero")
			}
			item.Hero = &hero
		default:
			return nil, apptypes.Error(http.StatusBadRequest, "item type must be troop, spell, hero, pet, or equipment")
		}
		key := item.Type + "\x00" + item.Item + "\x00"
		if item.Hero != nil {
			key += *item.Hero
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, item)
	}
	return out, nil
}

func statsWarWhere(townhall, opponentTownhall *int, equalTownhalls *bool, window statsTimeWindow) ([]string, []any, error) {
	where := []string{"event_time >= $1", "event_time < $2"}
	args := []any{window.start, window.endExclusive}
	for name, value := range map[string]*int{"townhall_level": townhall, "opponent_townhall_level": opponentTownhall} {
		if value != nil && *value <= 0 {
			return nil, nil, apptypes.Error(http.StatusBadRequest, name+" must be greater than 0")
		}
	}
	if townhall != nil {
		args = append(args, *townhall)
		where = append(where, fmt.Sprintf("townhall_level = $%d", len(args)))
	}
	if opponentTownhall != nil {
		args = append(args, *opponentTownhall)
		where = append(where, fmt.Sprintf("opponent_townhall_level = $%d", len(args)))
	}
	if equalTownhalls == nil || *equalTownhalls {
		where = append(where, "townhall_level = opponent_townhall_level")
	}
	return where, args, nil
}

func statsMetricSelect() string {
	return `count(*)::bigint,
		COALESCE(avg(stars), 0)::float8,
		COALESCE(avg(destruction_percentage), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 0)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 1)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 2)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 3)::float8 / NULLIF(count(*), 0), 0)::float8`
}

func loadStatsPerformance(ctx context.Context, pool *pgxpool.Pool, source string, where []string, args []any) (modelsv2.StatsMetrics, error) {
	metrics := modelsv2.StatsMetrics{Daily: []modelsv2.StatsDailyPoint{}}
	query := "SELECT " + statsMetricSelect() + " FROM " + source + " WHERE " + strings.Join(where, " AND ")
	if err := pool.QueryRow(ctx, query, args...).Scan(
		&metrics.SampleSize, &metrics.AverageStars, &metrics.AverageDestruction,
		&metrics.ZeroStarRate, &metrics.OneStarRate, &metrics.TwoStarRate, &metrics.ThreeStarRate,
	); err != nil {
		return metrics, err
	}
	metrics.Available = metrics.SampleSize > 0
	dailyQuery := "SELECT event_time::date, " + statsMetricSelect() + " FROM " + source + " WHERE " + strings.Join(where, " AND ") + " GROUP BY event_time::date ORDER BY event_time::date"
	rows, err := pool.Query(ctx, dailyQuery, args...)
	if err != nil {
		return metrics, err
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var point modelsv2.StatsDailyPoint
		if err := rows.Scan(&day, &point.SampleSize, &point.AverageStars, &point.AverageDestruction, &point.ZeroStarRate, &point.OneStarRate, &point.TwoStarRate, &point.ThreeStarRate); err != nil {
			return metrics, err
		}
		point.Date = day.Format("2006-01-02")
		metrics.Daily = append(metrics.Daily, point)
	}
	return metrics, rows.Err()
}

func loadStatsBreakdowns(ctx context.Context, pool *pgxpool.Pool, source string, where []string, args []any, dimension string) ([]modelsv2.StatsBreakdown, error) {
	query := "SELECT " + dimension + ", " + statsMetricSelect() + " FROM " + source + " WHERE " + strings.Join(where, " AND ") + " GROUP BY " + dimension + " ORDER BY " + dimension
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []modelsv2.StatsBreakdown{}
	for rows.Next() {
		var item modelsv2.StatsBreakdown
		item.Metrics.Daily = []modelsv2.StatsDailyPoint{}
		if err := rows.Scan(&item.Key, &item.Metrics.SampleSize, &item.Metrics.AverageStars, &item.Metrics.AverageDestruction, &item.Metrics.ZeroStarRate, &item.Metrics.OneStarRate, &item.Metrics.TwoStarRate, &item.Metrics.ThreeStarRate); err != nil {
			return nil, err
		}
		item.Metrics.Available = item.Metrics.SampleSize > 0
		out = append(out, item)
	}
	return out, rows.Err()
}

func statsBattlelogFilterSQL(filters modelsv2.StatsBattleFilters, window statsTimeWindow) (string, []string, []any) {
	from := "battlelogs b"
	where := []string{
		"b.attack = true",
		"lower(b.battle_type) IN ('ranked', 'legend')",
		"b.\"timestamp\" >= $1",
		"b.\"timestamp\" < $2",
	}
	args := []any{window.start, window.endExclusive}
	if filters.TownhallLevel != nil {
		args = append(args, *filters.TownhallLevel)
		where = append(where, fmt.Sprintf("b.player_th = $%d", len(args)))
	}
	if filters.OpponentTownhallLevel != nil {
		args = append(args, *filters.OpponentTownhallLevel)
		where = append(where, fmt.Sprintf("b.opponent_th = $%d", len(args)))
	}
	if filters.EqualTownhalls != nil && *filters.EqualTownhalls {
		where = append(where, "b.player_th = b.opponent_th")
	}
	if filters.RankedLeagueTierID != nil {
		from += ` JOIN LATERAL (
			SELECT membership.league_tier_id
			FROM ranked_league_group_members membership
			WHERE membership.player_tag = b.player_tag
				AND membership.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
			ORDER BY membership.group_tag
			LIMIT 1
		) ranked_membership ON true`
		args = append(args, *filters.RankedLeagueTierID)
		where = append(where, fmt.Sprintf("ranked_membership.league_tier_id = $%d", len(args)))
	}
	for _, item := range filters.IncludeItems {
		args = append(args, item.Item)
		placeholder := len(args)
		where = append(where, fmt.Sprintf("b.army_counts ? $%d", placeholder))
		if item.MinQuantity != nil {
			args = append(args, *item.MinQuantity)
			where = append(where, fmt.Sprintf("(b.army_counts ->> $%d)::int >= $%d", placeholder, len(args)))
		}
		if item.MaxQuantity != nil {
			args = append(args, *item.MaxQuantity)
			where = append(where, fmt.Sprintf("(b.army_counts ->> $%d)::int <= $%d", placeholder, len(args)))
		}
	}
	for _, item := range filters.ExcludeItems {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		args = append(args, item)
		where = append(where, fmt.Sprintf("NOT (b.army_counts ? $%d)", len(args)))
	}
	return from, where, args
}

func loadStatsArmies(ctx context.Context, pool *pgxpool.Pool, request modelsv2.StatsArmiesQuery, window statsTimeWindow) ([]modelsv2.StatsArmyItem, error) {
	from, where, args := statsBattlelogFilterSQL(request.StatsBattleFilters, window)
	minimumSample := statsDefaultMinSample
	if request.MinimumSampleSize != nil {
		minimumSample = *request.MinimumSampleSize
	}
	limit := statsDefaultArmyLimit
	if request.Limit != nil {
		limit = clamp(*request.Limit, 1, statsMaximumArmyLimit)
	}
	orderBy := map[string]string{
		"":                    "usage_rate DESC, sample_size DESC",
		"usage_rate":          "usage_rate DESC, sample_size DESC",
		"three_star_rate":     "three_star_rate DESC, sample_size DESC",
		"average_stars":       "average_stars DESC, sample_size DESC",
		"average_destruction": "average_destruction DESC, sample_size DESC",
	}[request.SortBy]
	if orderBy == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "sort_by must be usage_rate, three_star_rate, average_stars, or average_destruction")
	}
	args = append(args, minimumSample, limit)
	query := `WITH filtered AS (
		SELECT b.army_share_code, b.army_items, b.army_counts, b.stars::int AS stars,
			b.destruction_percentage::float8 AS destruction_percentage, b."timestamp" AS event_time
		FROM ` + from + `
		WHERE ` + strings.Join(where, " AND ") + `
	), totals AS (SELECT count(*)::float8 AS sample_size FROM filtered)
	SELECT army_share_code, army_items, army_counts, count(*)::bigint AS sample_size,
		COALESCE(count(*)::float8 / NULLIF(totals.sample_size, 0), 0)::float8 AS usage_rate,
		COALESCE(avg(stars), 0)::float8, COALESCE(avg(destruction_percentage), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 0)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 1)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 2)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE stars = 3)::float8 / NULLIF(count(*), 0), 0)::float8
	FROM filtered CROSS JOIN totals
	GROUP BY army_share_code, army_items, army_counts, totals.sample_size
	HAVING count(*) >= $` + strconv.Itoa(len(args)-1) + `
	ORDER BY ` + orderBy + `
	LIMIT $` + strconv.Itoa(len(args))
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []modelsv2.StatsArmyItem{}
	for rows.Next() {
		var rawCounts []byte
		var usageRate float64
		var item modelsv2.StatsArmyItem
		item.Daily = []modelsv2.StatsDailyPoint{}
		if err := rows.Scan(&item.ArmyShareCode, &item.ArmyItems, &rawCounts, &item.SampleSize, &usageRate, &item.AverageStars, &item.AverageDestruction, &item.ZeroStarRate, &item.OneStarRate, &item.TwoStarRate, &item.ThreeStarRate); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(rawCounts, &item.ArmyCounts); err != nil {
			return nil, err
		}
		item.Available = true
		item.UsageRate = &usageRate
		items = append(items, item)
	}
	if err := rows.Err(); err != nil || len(items) == 0 {
		return items, err
	}
	if err := loadStatsArmyDaily(ctx, pool, from, where, args[:len(args)-2], items); err != nil {
		return nil, err
	}
	return items, nil
}

func loadStatsArmyDaily(ctx context.Context, pool *pgxpool.Pool, from string, baseWhere []string, baseArgs []any, items []modelsv2.StatsArmyItem) error {
	where := append([]string{}, baseWhere...)
	identityClauses := make([]string, 0, len(items))
	args := append([]any{}, baseArgs...)
	for _, item := range items {
		args = append(args, item.ArmyShareCode, item.ArmyItems, item.ArmyCounts)
		identityClauses = append(identityClauses, fmt.Sprintf("(b.army_share_code = $%d AND b.army_items = $%d AND b.army_counts = $%d::jsonb)", len(args)-2, len(args)-1, len(args)))
	}
	where = append(where, "("+strings.Join(identityClauses, " OR ")+")")
	query := `WITH filtered AS (
		SELECT b.army_share_code, b.army_items, b.army_counts, b.stars::int AS stars,
			b.destruction_percentage::float8 AS destruction_percentage, b."timestamp" AS event_time
		FROM ` + from + ` WHERE ` + strings.Join(where, " AND ") + `
	), total_source AS (
		SELECT b."timestamp" AS event_time
		FROM ` + from + ` WHERE ` + strings.Join(baseWhere, " AND ") + `
	), daily_totals AS (
		SELECT event_time::date AS day, count(*)::float8 AS sample_size
		FROM total_source GROUP BY event_time::date
	)
	SELECT f.army_share_code, f.army_items, f.army_counts, f.event_time::date,
		count(*)::bigint, COALESCE(count(*)::float8 / NULLIF(t.sample_size, 0), 0)::float8,
		COALESCE(avg(f.stars), 0)::float8, COALESCE(avg(f.destruction_percentage), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.stars = 0)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.stars = 1)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.stars = 2)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.stars = 3)::float8 / NULLIF(count(*), 0), 0)::float8
	FROM filtered f JOIN daily_totals t ON t.day = f.event_time::date
	GROUP BY f.army_share_code, f.army_items, f.army_counts, f.event_time::date, t.sample_size
	ORDER BY f.event_time::date`
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	index := make(map[string]*modelsv2.StatsArmyItem, len(items))
	for i := range items {
		index[statsArmyKey(items[i].ArmyShareCode, items[i].ArmyItems, items[i].ArmyCounts)] = &items[i]
	}
	for rows.Next() {
		var share string
		var armyItems []string
		var rawCounts []byte
		var counts map[string]int
		var day time.Time
		var usage float64
		var point modelsv2.StatsDailyPoint
		if err := rows.Scan(&share, &armyItems, &rawCounts, &day, &point.SampleSize, &usage, &point.AverageStars, &point.AverageDestruction, &point.ZeroStarRate, &point.OneStarRate, &point.TwoStarRate, &point.ThreeStarRate); err != nil {
			return err
		}
		if err := json.Unmarshal(rawCounts, &counts); err != nil {
			return err
		}
		point.Date = day.Format("2006-01-02")
		point.UsageRate = &usage
		if item := index[statsArmyKey(share, armyItems, counts)]; item != nil {
			item.Daily = append(item.Daily, point)
		}
	}
	return rows.Err()
}

func statsArmyKey(share string, items []string, counts map[string]int) string {
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := []string{share, strings.Join(items, ",")}
	for _, key := range keys {
		parts = append(parts, key+"="+strconv.Itoa(counts[key]))
	}
	return strings.Join(parts, "\x00")
}

func loadStatsItem(ctx context.Context, pool *pgxpool.Pool, filters modelsv2.StatsBattleFilters, selector modelsv2.StatsItemSelector, window statsTimeWindow) (modelsv2.StatsItemResult, error) {
	from, where, args := statsBattlelogFilterSQL(filters, window)
	args = append(args, selector.Item)
	itemPlaceholder := len(args)
	query := `WITH filtered AS (
		SELECT b.army_counts, b.stars::int AS stars, b.destruction_percentage::float8 AS destruction_percentage,
			b."timestamp" AS event_time
		FROM ` + from + ` WHERE ` + strings.Join(where, " AND ") + `
	), totals AS (
		SELECT count(*)::bigint AS sample_size,
			COALESCE(sum((SELECT sum(value::int) FROM jsonb_each_text(army_counts))), 0)::float8 AS item_slots
		FROM filtered
	)
	SELECT totals.sample_size, count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `)::bigint AS use_count,
		COALESCE(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `)::float8 / NULLIF(totals.sample_size, 0), 0)::float8,
		COALESCE(avg(f.stars) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0)::float8,
		COALESCE(avg(f.destruction_percentage) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND f.stars = 0)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND f.stars = 1)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND f.stars = 2)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND f.stars = 3)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(sum(CASE WHEN f.army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` THEN (f.army_counts ->> $` + strconv.Itoa(itemPlaceholder) + `)::int ELSE 0 END)::float8 / NULLIF(totals.item_slots, 0), 0)::float8
	FROM filtered f CROSS JOIN totals
	GROUP BY totals.sample_size, totals.item_slots`
	var result modelsv2.StatsItemResult
	result.Item, result.Type, result.Hero = selector.Item, selector.Type, selector.Hero
	result.Daily = []modelsv2.StatsDailyPoint{}
	var usageRate, compositionShare float64
	if err := pool.QueryRow(ctx, query, args...).Scan(&result.SampleSize, &result.UseCount, &usageRate, &result.AverageStars, &result.AverageDestruction, &result.ZeroStarRate, &result.OneStarRate, &result.TwoStarRate, &result.ThreeStarRate, &compositionShare); err != nil {
		return result, err
	}
	result.Available = result.UseCount > 0
	result.UsageRate = &usageRate
	result.HitRate = result.ThreeStarRate
	if selector.Type == "troop" || selector.Type == "spell" {
		result.CompositionShare = &compositionShare
	}
	dailyQuery := `WITH filtered AS (
		SELECT b.army_counts, b.stars::int AS stars, b.destruction_percentage::float8 AS destruction_percentage,
			b."timestamp" AS event_time
		FROM ` + from + ` WHERE ` + strings.Join(where, " AND ") + `
	)
	SELECT event_time::date, count(*)::bigint,
		count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `)::bigint,
		COALESCE(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `)::float8 / NULLIF(count(*), 0), 0)::float8,
		COALESCE(avg(stars) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0)::float8,
		COALESCE(avg(destruction_percentage) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0)::float8,
		COALESCE(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND stars = 0)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND stars = 1)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND stars = 2)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8,
		COALESCE(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + ` AND stars = 3)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? $` + strconv.Itoa(itemPlaceholder) + `), 0), 0)::float8
	FROM filtered GROUP BY event_time::date ORDER BY event_time::date`
	rows, err := pool.Query(ctx, dailyQuery, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var useCount int64
		var dailyUsage float64
		var point modelsv2.StatsDailyPoint
		if err := rows.Scan(&day, &point.SampleSize, &useCount, &dailyUsage, &point.AverageStars, &point.AverageDestruction, &point.ZeroStarRate, &point.OneStarRate, &point.TwoStarRate, &point.ThreeStarRate); err != nil {
			return result, err
		}
		point.Date = day.Format("2006-01-02")
		point.UseCount = &useCount
		point.UsageRate = &dailyUsage
		result.Daily = append(result.Daily, point)
	}
	return result, rows.Err()
}
