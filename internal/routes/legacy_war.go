package routes

import (
	"net/http"
	"sort"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// warPrevious godoc
// @Summary Get previous wars
// @Description Returns stored previous wars for a clan.
// @Tags Legacy War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param timestamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of wars"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /war/{clan_tag}/previous [get]
func warPrevious(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		start := time.Unix(queryInt64(c, "timestamp_start", 0), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		limit := queryInt(c, "limit", 50)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT war_id, clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state, battle_modifier, cwl_war_tag, r2_key
			FROM war_log_index
			WHERE (clan_tag = $1 OR opponent_tag = $1) AND prep_time >= $2 AND prep_time <= $3
			ORDER BY end_time DESC
			LIMIT $4
		`, tag, start, end, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		result := []map[string]any{}
		for rows.Next() {
			item, err := scanWarIndexRow(rows)
			if err != nil {
				return err
			}
			result = append(result, item)
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// warPreviousAtTime godoc
// @Summary Get previous war by end time
// @Description Returns the stored previous war near the supplied Clash API end time.
// @Tags Legacy War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param end_time path string true "War end time in Clash format"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /war/{clan_tag}/previous/{end_time} [get]
func warPreviousAtTime(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		t, err := time.Parse("20060102T150405.000Z", c.Params("end_time"))
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid end_time format")
		}
		row := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT war_id, clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state, battle_modifier, cwl_war_tag, r2_key
			FROM war_log_index
			WHERE (clan_tag = $1 OR opponent_tag = $1)
			  AND end_time >= $2 AND end_time <= $3
			ORDER BY end_time DESC
			LIMIT 1
		`, tag, t.Add(-5*time.Minute), t.Add(5*time.Minute))
		item, err := scanWarIndexRow(row)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "War Not Found")
		}
		return apptypes.JSON(c, http.StatusOK, item)
	}
}

// warBasic godoc
// @Summary Get current or recent war
// @Description Returns the current or most recent non-CWL war for a clan.
// @Tags Legacy War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /war/{clan_tag}/basic [get]
func warBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		row := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT war_id, clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state, battle_modifier, cwl_war_tag, r2_key
			FROM war_log_index
			WHERE (clan_tag = $1 OR opponent_tag = $1) AND war_type <> 'cwl' AND end_time >= $2
			ORDER BY end_time DESC
			LIMIT 1
		`, tag, time.Now().UTC().Add(-51*time.Hour))
		item, err := scanWarIndexRow(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.JSON(c, http.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, http.StatusOK, item)
	}
}

// cwlGroup godoc
// @Summary Get current CWL group
// @Description Returns the current season CWL group for a clan.
// @Tags Legacy War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Router /cwl/{clan_tag}/group [get]
func cwlGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		group, err := v1CWLGroup(c, a, fixTag(c.Params("clan_tag")), currentSeason())
		if err != nil {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		return apptypes.JSON(c, http.StatusOK, group)
	}
}

// cwlSeason godoc
// @Summary Get CWL group by season
// @Description Returns the CWL group for a clan and season.
// @Tags Legacy War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season YYYY-MM"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /cwl/{clan_tag}/{season} [get]
func cwlSeason(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		data, err := v1CWLGroup(c, a, fixTag(c.Params("clan_tag")), c.Params("season"))
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "No CWL Data Found")
		}
		data["clan_rankings"] = cwlRankingsFromSQL(c, a, data)
		return apptypes.JSON(c, http.StatusOK, data)
	}
}

func cwlRankingsFromSQL(c *fiber.Ctx, a apptypes.Deps, data map[string]any) []modelsv1.CWLRankingEntry {
	rounds := asAnySlice(data["rounds"])
	warIDs := []string{}
	for _, rawRound := range rounds {
		round := nestedMap(rawRound)
		for _, rawTag := range asAnySlice(round["warTags"]) {
			if tag := stringValue(rawTag); tag != "" {
				warIDs = append(warIDs, tag)
			}
		}
	}
	if len(warIDs) == 0 {
		return nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT attacking_clan_tag, defending_clan_tag, stars, destruction_percentage
		FROM war_attack_events
		WHERE war_id = ANY($1)
	`, warIDs)
	if err != nil {
		return nil
	}
	defer rows.Close()
	stars := map[string]int64{}
	destruction := map[string]float64{}
	for rows.Next() {
		var attacker, defender string
		var star, dest int16
		if rows.Scan(&attacker, &defender, &star, &dest) != nil {
			continue
		}
		_ = defender
		stars[attacker] += int64(star)
		destruction[attacker] += float64(dest)
	}
	entries := make([]modelsv1.CWLRankingEntry, 0, len(stars))
	for tag, starCount := range stars {
		entries = append(entries, modelsv1.CWLRankingEntry{Tag: tag, Stars: starCount, Destruction: destruction[tag]})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Stars != entries[j].Stars {
			return entries[i].Stars > entries[j].Stars
		}
		return entries[i].Destruction > entries[j].Destruction
	})
	return entries
}

type warIndexScanner interface {
	Scan(dest ...any) error
}

func scanWarIndexRow(row warIndexScanner) (map[string]any, error) {
	var warID, clanTag, opponentTag, warType, state, modifier string
	var prep, end time.Time
	var start pgtype.Timestamptz
	var size int
	var cwlWarTag, r2Key pgtype.Text
	if err := row.Scan(&warID, &clanTag, &opponentTag, &prep, &start, &end, &size, &warType, &state, &modifier, &cwlWarTag, &r2Key); err != nil {
		return nil, err
	}
	item := map[string]any{
		"war_id":               warID,
		"clan":                 map[string]any{"tag": clanTag},
		"opponent":             map[string]any{"tag": opponentTag},
		"preparationStartTime": prep.UTC().Format("20060102T150405.000Z"),
		"endTime":              end.UTC().Format("20060102T150405.000Z"),
		"teamSize":             size,
		"type":                 warType,
		"state":                state,
		"battleModifier":       modifier,
	}
	if start.Valid {
		item["startTime"] = start.Time.UTC().Format("20060102T150405.000Z")
	}
	if cwlWarTag.Valid {
		item["tag"] = cwlWarTag.String
	}
	if r2Key.Valid {
		item["r2_key"] = r2Key.String
	}
	return item, nil
}

func v1CWLGroup(c *fiber.Ctx, a apptypes.Deps, clanTag string, season string) (map[string]any, error) {
	var leagueID int
	var roundsRaw, dataRaw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT cwl_league_id, rounds, data
		FROM cwl_groups
		WHERE $1 = ANY(clan_tags) AND season = $2
		ORDER BY updated_at DESC
		LIMIT 1
	`, clanTag, season).Scan(&leagueID, &roundsRaw, &dataRaw)
	if err != nil {
		return nil, err
	}
	data := jsonObject(dataRaw)
	data["season"] = season
	data["cwl_league_id"] = leagueID
	data["rounds"] = jsonValue(roundsRaw, []any{})
	return data, nil
}

func totalWarStars(sideData map[string]any) int64 {
	var total int64
	for _, member := range asMapSlice(sideData["members"]) {
		for _, attack := range asMapSlice(member["attacks"]) {
			total += int64(intValue(attack["stars"]))
		}
	}
	return total
}

func totalWarDestruction(sideData map[string]any) float64 {
	var total float64
	for _, member := range asMapSlice(sideData["members"]) {
		for _, attack := range asMapSlice(member["attacks"]) {
			total += floatValue(attack["destructionPercentage"])
		}
	}
	return total
}

func asBMInt64(v any) int64 {
	return int64(intValue(v))
}

func asBMFloat64(v any) float64 {
	return floatValue(v)
}
