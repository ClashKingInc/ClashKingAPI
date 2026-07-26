package routes

import (
	"net/http"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

// warPrevious godoc
// @Summary Get previous wars
// @Description Returns stored previous wars for a clan.
// @Tags War
// @Produce json
// @Param clanTag path string true "Clan tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param timestamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of wars"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func warPrevious(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clanTag"))
		start := time.Unix(queryInt64(c, "timestamp_start", 0), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		limit := queryInt(c, "limit", 50)
		result, err := sqlClanWars(c, a, tag, start, end, []string{"random", "friendly", "cwl"}, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// warPreviousAtTime godoc
// @Summary Get previous war by end time
// @Description Returns the stored previous war near the supplied Clash API end time.
// @Tags War
// @Produce json
// @Param clanTag path string true "Clan tag"
// @Param endTime query string true "War end time in Clash format"
// @Success 200 {object} modelsv2.WarResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /war/{clanTag}/previous [get]
func warPreviousAtTime(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clanTag"))
		t, err := time.Parse("20060102T150405.000Z", c.Query("endTime"))
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid endTime format")
		}
		items, err := sqlClanWars(c, a, tag, t.Add(-5*time.Minute), t.Add(5*time.Minute), []string{"random", "friendly", "cwl"}, 1)
		if err != nil || len(items) == 0 {
			return apptypes.Error(http.StatusNotFound, "War Not Found")
		}
		return apptypes.JSON(c, http.StatusOK, items[0])
	}
}

// warBasic godoc
// @Summary Get current or recent war
// @Description Returns the current or most recent non-CWL war for a clan.
// @Tags War
// @Produce json
// @Param clanTag path string true "Clan tag"
// @Success 200 {object} modelsv2.WarResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /war/{clanTag}/basic [get]
func warBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clanTag"))
		items, err := sqlClanWars(c, a, tag, time.Now().UTC().Add(-51*time.Hour), time.Now().UTC().Add(24*time.Hour), []string{"random", "friendly"}, 1)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		return apptypes.JSON(c, http.StatusOK, items[0])
	}
}

// cwlGroup godoc
// @Summary Get current CWL group
// @Description Returns the current season CWL group for a clan.
// @Tags War
// @Produce json
// @Param clanTag path string true "Clan tag"
// @Success 200 {object} modelsv2.CWLGroupResponse
// @Router /cwl/{clanTag}/group [get]
func cwlGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		group, err := v1CWLGroup(c, a, fixTag(c.Params("clanTag")), currentSeason())
		if err != nil {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		delete(group, "_cwl_id")
		return apptypes.JSON(c, http.StatusOK, group)
	}
}

// cwlSeason godoc
// @Summary Get CWL group by season
// @Description Returns the CWL group for a clan and season.
// @Tags War
// @Produce json
// @Param clanTag path string true "Clan tag"
// @Param season path string true "Season YYYY-MM"
// @Success 200 {object} modelsv2.CWLGroupResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /cwl/{clanTag}/{season} [get]
func cwlSeason(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		data, err := v1CWLGroup(c, a, fixTag(c.Params("clanTag")), c.Params("season"))
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "No CWL Data Found")
		}
		data["clan_rankings"] = cwlRankingsFromSQL(c, a, stringValue(data["_cwl_id"]))
		delete(data, "_cwl_id")
		return apptypes.JSON(c, http.StatusOK, data)
	}
}

func cwlRankingsFromSQL(c *fiber.Ctx, a apptypes.Deps, cwlID string) []modelsv1.CWLRankingEntry {
	if cwlID == "" {
		return []modelsv1.CWLRankingEntry{}
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT gc.name, s.clan_tag, s.stars, s.destruction::float8, s.wins, s.ties, s.losses
		FROM cwl_standings AS s
		JOIN cwl_group_clans AS gc ON gc.cwl_id = s.cwl_id AND gc.clan_tag = s.clan_tag
		WHERE s.cwl_id = $1
		ORDER BY s.group_rank NULLS LAST, s.clan_tag
	`, cwlID)
	if err != nil {
		return []modelsv1.CWLRankingEntry{}
	}
	defer rows.Close()
	entries := []modelsv1.CWLRankingEntry{}
	for rows.Next() {
		var entry modelsv1.CWLRankingEntry
		if rows.Scan(&entry.Name, &entry.Tag, &entry.Stars, &entry.Destruction, &entry.Rounds.Won, &entry.Rounds.Tied, &entry.Rounds.Lost) != nil {
			continue
		}
		entries = append(entries, entry)
	}
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
	var cwlID, state string
	var leagueID pgtype.Int4
	var warSize pgtype.Int2
	var roundsRaw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT g.cwl_id, g.cwl_league_id, g.state, g.war_size, g.rounds
		FROM cwl_groups AS g
		JOIN cwl_group_clans AS gc ON gc.cwl_id = g.cwl_id
		WHERE gc.clan_tag = $1 AND g.season = $2
		ORDER BY g.cwl_id DESC
		LIMIT 1
	`, clanTag, season).Scan(&cwlID, &leagueID, &state, &warSize, &roundsRaw)
	if err != nil {
		return nil, err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT gc.clan_tag, gc.name, gc.clan_level, gc.badge_token,
		       COALESCE((
		           SELECT jsonb_agg(jsonb_build_object(
		               'tag', member.tag,
		               'name', member.name,
		               'townHallLevel', member.town_hall
		           ) ORDER BY member.tag)
		           FROM cwl_group_members AS member
		           WHERE member.cwl_id = gc.cwl_id AND member.clan_tag = gc.clan_tag
		       ), '[]'::jsonb) AS members
		FROM cwl_group_clans AS gc
		WHERE gc.cwl_id = $1
		ORDER BY gc.clan_tag
	`, cwlID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clans := []any{}
	for rows.Next() {
		var tag, name, badgeToken string
		var clanLevel int
		var membersRaw []byte
		if err := rows.Scan(&tag, &name, &clanLevel, &badgeToken, &membersRaw); err != nil {
			return nil, err
		}
		clans = append(clans, map[string]any{"tag": tag, "name": name, "clanLevel": clanLevel, "badgeToken": badgeToken, "members": jsonValue(membersRaw, []any{})})
	}
	data := map[string]any{"_cwl_id": cwlID, "season": season, "state": state, "rounds": jsonValue(roundsRaw, []any{}), "clans": clans}
	if leagueID.Valid {
		data["cwl_league_id"] = leagueID.Int32
	}
	if warSize.Valid {
		data["war_size"] = warSize.Int16
	}
	return data, rows.Err()
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
