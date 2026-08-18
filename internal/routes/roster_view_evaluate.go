package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// queryRosterMetric godoc
// @Summary Query one roster metric recipe
// @Description Executes one allowlisted snapshot, historical, or derived metric with replayable parameters without creating a saved view.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Param body body modelsv2.RosterMetricQueryRequest true "Metric recipe"
// @Success 200 {object} map[string]any
// @Router /v2/roster/metrics/query [post]
func queryRosterMetric(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterMetricQueryRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		serverID := c.Query("server_id")
		if len(body.RosterIDs) == 0 || len(body.RosterIDs) > 25 {
			return apptypes.Error(http.StatusBadRequest, "Metric queries require 1 to 25 rosterIds")
		}
		metric, ok := rosterMetricByID(body.MetricID)
		if !ok {
			return apptypes.Error(http.StatusBadRequest, "Unknown roster metric: "+body.MetricID)
		}
		resolved, err := resolveRosterViewRosterIDs(c, a, serverID, body.RosterIDs)
		if err != nil {
			return err
		}
		rows := []map[string]any{}
		for index, rosterID := range resolved {
			if body.MetricID == "signup.answer" {
				questionID, _ := body.Parameters["questionId"].(string)
				if !rosterQuestionIDPattern.MatchString(questionID) {
					return apptypes.Error(http.StatusBadRequest, "signup.answer requires a valid questionId parameter")
				}
				members, err := queryRosterBuilderMembers(c, a, rosterID, false)
				if err != nil {
					return err
				}
				for _, member := range members {
					answers, _ := member["answers"].(map[string]any)
					rows = append(rows, map[string]any{"rosterId": body.RosterIDs[index], "playerTag": member["playerTag"], "value": answers[questionID]})
				}
				continue
			}
			if key := rosterSnapshotMetricKey(body.MetricID); key != "" {
				members, err := queryRosterBuilderMembers(c, a, rosterID, false)
				if err != nil {
					return err
				}
				for _, member := range members {
					rows = append(rows, map[string]any{"rosterId": body.RosterIDs[index], "playerTag": member["playerTag"], "value": member[key]})
				}
				continue
			}
			values, _, err := evaluateDynamicRosterMetricWithParameters(c, a, serverID, rosterID, metric, body.Parameters, body.Force)
			if err != nil {
				return err
			}
			tags := make([]string, 0, len(values))
			for tag := range values {
				tags = append(tags, tag)
			}
			sort.Strings(tags)
			for _, tag := range tags {
				rows = append(rows, map[string]any{"rosterId": body.RosterIDs[index], "playerTag": tag, "value": values[tag]})
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"metricId": body.MetricID, "parameters": normalizeRosterMetricParameters(body.MetricID, body.Parameters), "rows": rows, "cached": false, "evaluatedAt": time.Now().UTC()})
	}
}

func evaluateRosterViewData(c *fiber.Ctx, a apptypes.Deps, view modelsv2.RosterView, spec modelsv2.RosterViewSpec, requestedRosterIDs []string, force bool) (map[string]any, error) {
	rosterIDs, err := resolveRosterViewRosterIDs(c, a, view.ServerID, requestedRosterIDs)
	if err != nil {
		return nil, err
	}
	cachedIDs := []string{}
	rows := []map[string]any{}
	for index, rosterID := range rosterIDs {
		var rosterAlias string
		if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT alias FROM rosters WHERE id = $1`, rosterID).Scan(&rosterAlias); err != nil {
			return nil, err
		}
		members, err := queryRosterBuilderMembers(c, a, rosterID, false)
		if err != nil {
			return nil, err
		}
		dynamic := map[string]map[string]any{}
		for _, column := range spec.Columns {
			metric, _ := rosterMetricByID(column.MetricID)
			if metric.Kind == "snapshot" || metric.Kind == "presentation" {
				continue
			}
			values, cacheHit, err := evaluateDynamicRosterMetricWithParameters(c, a, view.ServerID, rosterID, metric, column.Parameters, force)
			if err != nil {
				return nil, err
			}
			dynamic[column.ID] = values
			if cacheHit {
				cachedIDs = append(cachedIDs, column.ID)
			}
		}
		for _, member := range members {
			tag, _ := member["playerTag"].(string)
			values := map[string]any{}
			for _, column := range spec.Columns {
				if column.MetricID == "roster.name" {
					values[column.ID] = rosterAlias
					continue
				}
				if column.MetricID == "player.league_trophies" {
					values[column.ID] = map[string]any{
						"leagueId": member["leagueId"], "leagueName": member["leagueName"], "trophies": member["trophies"],
					}
					continue
				}
				if column.MetricID == "signup.answer" {
					questionID, _ := column.Parameters["questionId"].(string)
					answers, _ := member["answers"].(map[string]any)
					values[column.ID] = answers[questionID]
					continue
				}
				if key := rosterSnapshotMetricKey(column.MetricID); key != "" {
					values[column.ID] = member[key]
				} else {
					values[column.ID] = dynamic[column.ID][tag]
				}
			}
			rows = append(rows, map[string]any{"rosterId": requestedRosterIDs[index], "playerTag": tag, "values": values})
		}
	}
	rows = applyRosterViewPresentation(rows, spec)
	applyRosterViewRanks(rows, spec)
	return map[string]any{
		"viewId": view.ID, "rosterIds": requestedRosterIDs, "schemaVersion": spec.SchemaVersion,
		"rows": rows, "cachedMetricIds": cachedIDs, "evaluatedAt": time.Now().UTC(),
	}, nil
}

func applyRosterViewRanks(rows []map[string]any, spec modelsv2.RosterViewSpec) {
	rankColumns := []string{}
	for _, column := range spec.Columns {
		if column.MetricID == "view.rank" {
			rankColumns = append(rankColumns, column.ID)
		}
	}
	for index, row := range rows {
		values, _ := row["values"].(map[string]any)
		for _, columnID := range rankColumns {
			values[columnID] = index + 1
		}
	}
}

func applyRosterViewPresentation(rows []map[string]any, spec modelsv2.RosterViewSpec) []map[string]any {
	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		values, _ := row["values"].(map[string]any)
		matches := true
		for _, filter := range spec.Filters {
			if !rosterViewFilterMatches(values[filter.ColumnID], filter.Operator, filter.Value) {
				matches = false
				break
			}
		}
		if matches {
			filtered = append(filtered, row)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		left, _ := filtered[i]["values"].(map[string]any)
		right, _ := filtered[j]["values"].(map[string]any)
		for _, item := range spec.Sort {
			comparison := compareRosterViewValues(left[item.ColumnID], right[item.ColumnID])
			if comparison != 0 {
				if item.Direction == "desc" {
					return comparison > 0
				}
				return comparison < 0
			}
		}
		leftTag, _ := filtered[i]["playerTag"].(string)
		rightTag, _ := filtered[j]["playerTag"].(string)
		return leftTag < rightTag
	})
	if spec.Limit != nil && len(filtered) > *spec.Limit {
		filtered = filtered[:*spec.Limit]
	}
	return filtered
}

func rosterViewFilterMatches(actual any, operator string, expected any) bool {
	comparison := compareRosterViewValues(actual, expected)
	switch operator {
	case "eq":
		return comparison == 0
	case "neq":
		return comparison != 0
	case "gt":
		return comparison > 0
	case "gte":
		return comparison >= 0
	case "lt":
		return comparison < 0
	case "lte":
		return comparison <= 0
	case "contains":
		return strings.Contains(strings.ToLower(fmt.Sprint(actual)), strings.ToLower(fmt.Sprint(expected)))
	case "in":
		values, ok := expected.([]any)
		if !ok {
			return false
		}
		for _, value := range values {
			if compareRosterViewValues(actual, value) == 0 {
				return true
			}
		}
	}
	return false
}

func compareRosterViewValues(left, right any) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return 1
	}
	if right == nil {
		return -1
	}
	leftNumber, leftOK := rosterViewNumber(left)
	rightNumber, rightOK := rosterViewNumber(right)
	if leftOK && rightOK {
		if leftNumber < rightNumber {
			return -1
		}
		if leftNumber > rightNumber {
			return 1
		}
		return 0
	}
	leftText := fmt.Sprint(left)
	rightText := fmt.Sprint(right)
	return strings.Compare(strings.ToLower(leftText), strings.ToLower(rightText))
}

func rosterViewNumber(value any) (float64, bool) {
	switch number := value.(type) {
	case int:
		return float64(number), true
	case int32:
		return float64(number), true
	case int64:
		return float64(number), true
	case float32:
		return float64(number), true
	case float64:
		return number, true
	case json.Number:
		parsed, err := number.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func rosterViewMetricIDs(spec modelsv2.RosterViewSpec) []string {
	seen := map[string]struct{}{}
	byColumn := map[string]string{}
	for _, column := range spec.Columns {
		seen[column.MetricID] = struct{}{}
		byColumn[column.ID] = column.MetricID
	}
	for _, item := range spec.Sort {
		seen[byColumn[item.ColumnID]] = struct{}{}
	}
	for _, item := range spec.Filters {
		seen[byColumn[item.ColumnID]] = struct{}{}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func rosterSnapshotMetricKey(metricID string) string {
	return map[string]string{
		"player.name": "playerName", "player.tag": "playerTag",
		"clan.name": "clanName", "clan.tag": "clanTag",
		"player.townhall": "townhall", "player.trophies": "trophies",
		"player.league": "leagueName", "player.heroes": "heroLevelSum",
		"player.max_percent": "maxPercent", "player.war_preference": "warPreference",
		"discord.username": "discordUsername", "player.last_online": "lastOnline",
	}[metricID]
}

func evaluateDynamicRosterMetric(c *fiber.Ctx, a apptypes.Deps, serverID string, rosterID uuid.UUID, metric modelsv2.RosterMetric, force bool) (map[string]any, bool, error) {
	return evaluateDynamicRosterMetricWithParameters(c, a, serverID, rosterID, metric, nil, force)
}

func evaluateDynamicRosterMetricWithParameters(c *fiber.Ctx, a apptypes.Deps, serverID string, rosterID uuid.UUID, metric modelsv2.RosterMetric, parameters map[string]any, force bool) (map[string]any, bool, error) {
	parameters = normalizeRosterMetricParameters(metric.ID, parameters)
	_ = serverID
	_ = force
	values, err := computeRosterMetricWithParameters(c, a, rosterID, metric.ID, parameters)
	return values, false, err
}

func computeRosterMetric(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID, metricID string) (map[string]any, error) {
	return computeRosterMetricWithParameters(c, a, rosterID, metricID, nil)
}

func normalizeRosterMetricParameters(metricID string, parameters map[string]any) map[string]any {
	normalized := map[string]any{}
	window := 0
	switch metricID {
	case "war.hit_rate", "war.hit_rate.30d", "benchmark.th_hit_rate_delta", "benchmark.th_hit_rate_delta.30d":
		window = 30
	case "trophies.delta", "trophies.delta.7d":
		window = 7
	}
	if value, ok := parameters["windowDays"].(float64); ok && value >= 1 && value <= 365 {
		window = int(value)
	}
	if window > 0 {
		normalized["windowDays"] = window
	}
	if value, ok := parameters["seasonOffset"].(float64); ok && value >= 0 && value <= 24 {
		normalized["seasonOffset"] = int(value)
	}
	return normalized
}

func rosterMetricIntParameter(parameters map[string]any, key string, fallback int) int {
	switch value := parameters[key].(type) {
	case int:
		return value
	case float64:
		return int(value)
	default:
		return fallback
	}
}

func computeRosterMetricWithParameters(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID, metricID string, parameters map[string]any) (map[string]any, error) {
	var query string
	args := []any{rosterID}
	switch metricID {
	case "war.hit_rate", "war.hit_rate.30d":
		query = `
			SELECT m.tag, 100.0 * avg((a.stars = 3)::int)
			FROM roster_members m LEFT JOIN war_attacks a
			  ON a.attacker_tag = m.tag AND a.war_end_time >= now() - $2::int * interval '1 day'
			WHERE m.roster_id = $1 GROUP BY m.tag
		`
		args = append(args, rosterMetricIntParameter(parameters, "windowDays", 30))
	case "cwl.stars", "cwl.stars.current":
		query = `
			SELECT m.tag, COALESCE(sum(a.stars), 0)::double precision
			FROM roster_members m LEFT JOIN war_attacks a
			  ON a.attacker_tag = m.tag AND a.war_type = 'cwl'
			 AND a.war_end_time >= date_trunc('month', now()) - $2::int * interval '1 month'
			 AND a.war_end_time < date_trunc('month', now()) + (1 - $2::int) * interval '1 month'
			WHERE m.roster_id = $1 GROUP BY m.tag
		`
		args = append(args, rosterMetricIntParameter(parameters, "seasonOffset", 0))
	case "trophies.delta", "trophies.delta.7d":
		query = `
			SELECT m.tag,
			       (array_agg(h.value ORDER BY h.event_time DESC))[1]
			       - (array_agg(h.value ORDER BY h.event_time))[1]
			FROM roster_members m LEFT JOIN player_history_events h
			  ON h.player_tag = m.tag AND h.event_type = 'trophies'
			 AND h.event_time >= now() - $2::int * interval '1 day'
			WHERE m.roster_id = $1 GROUP BY m.tag
		`
		args = append(args, rosterMetricIntParameter(parameters, "windowDays", 7))
	case "benchmark.th_hit_rate_delta", "benchmark.th_hit_rate_delta.30d":
		query = `
			WITH rates AS (
				SELECT attacker_tag, attacker_townhall, 100.0 * avg((stars = 3)::int) AS rate
				FROM war_attacks WHERE war_end_time >= now() - $2::int * interval '1 day'
				GROUP BY attacker_tag, attacker_townhall
			), benchmarks AS (
				SELECT attacker_townhall, avg(rate) AS rate FROM rates GROUP BY attacker_townhall
			)
			SELECT m.tag, rates.rate - benchmarks.rate
			FROM roster_members m
			LEFT JOIN rates ON rates.attacker_tag = m.tag
			LEFT JOIN benchmarks ON benchmarks.attacker_townhall = rates.attacker_townhall
			WHERE m.roster_id = $1
		`
		args = append(args, rosterMetricIntParameter(parameters, "windowDays", 30))
	default:
		return map[string]any{}, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := map[string]any{}
	for rows.Next() {
		var tag string
		var value *float64
		if err := rows.Scan(&tag, &value); err != nil {
			return nil, err
		}
		if value == nil {
			values[tag] = nil
		} else {
			values[tag] = *value
		}
	}
	return values, rows.Err()
}
