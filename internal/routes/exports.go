package routes

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
)

// exportCWLSummary generates an Excel file with CWL stats for a clan.
//
// @Summary Export CWL summary to Excel
// @Tags Exports
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Param tag query string true "Clan tag"
// @Success 200 {file} binary
// @Failure 404 {object} map[string]interface{}
// @Router /v2/exports/war/cwl-summary [get]
func exportCWLSummary(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Query("tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag is required")
		}

		cwl, members, err := sqlExportCWLSummary(c, a, tag)
		if err != nil {
			return err
		}
		if cwl == nil {
			return apptypes.Error(http.StatusNotFound, "No CWL data found for this clan")
		}

		f := excelize.NewFile()
		defer f.Close()

		ws := "CWL Summary"
		f.SetSheetName("Sheet1", ws)

		clanName := excelStr(cwl["clan_name"])
		season := excelStr(cwl["season"])

		// Title
		f.SetCellValue(ws, "A1", fmt.Sprintf("CWL Summary for %s - Season %s", clanName, season))
		titleStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 16}})
		f.SetCellStyle(ws, "A1", "I1", titleStyle)
		f.MergeCell(ws, "A1", "I1")

		// Clan Info section
		row := 3
		f.SetCellValue(ws, fmt.Sprintf("A%d", row), "Clan Information")
		headerStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 14}})
		f.SetCellStyle(ws, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), headerStyle)
		row++

		infoFields := []struct{ label, key string }{
			{"Clan Tag", "clan_tag"},
			{"Clan Name", "clan_name"},
			{"Season", "season"},
			{"League", "league"},
			{"Stars", "stars"},
			{"Attacks", "attacks"},
			{"Destruction %", "destruction"},
		}
		boldStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
		for _, field := range infoFields {
			f.SetCellValue(ws, fmt.Sprintf("A%d", row), field.label)
			f.SetCellStyle(ws, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), boldStyle)
			f.SetCellValue(ws, fmt.Sprintf("B%d", row), cwl[field.key])
			row++
		}
		row += 2

		// Members table
		f.SetCellValue(ws, fmt.Sprintf("A%d", row), "Member Performance")
		f.SetCellStyle(ws, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), headerStyle)
		row++

		headers := []string{
			"Player Name", "Player Tag", "Town Hall", "Total Attacks",
			"Total Stars", "Average Stars", "Total Destruction %",
			"Average Destruction %", "Performance Score",
		}
		for col, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			f.SetCellValue(ws, cell, h)
			f.SetCellStyle(ws, cell, cell, boldStyle)
		}
		row++

		for _, member := range members {
			totalAttacks := excelInt(member["total_attacks"])
			totalStars := excelInt(member["total_stars"])
			totalDestruction := excelFloat(member["total_destruction"])

			avgStars := 0.0
			avgDestruction := 0.0
			if totalAttacks > 0 {
				avgStars = float64(totalStars) / float64(totalAttacks)
				avgDestruction = totalDestruction / float64(totalAttacks)
			}
			perfScore := float64(totalStars)*1.0 + avgDestruction/100.0

			rowData := []any{
				excelStr(member["name"]),
				excelStr(member["tag"]),
				excelInt(member["town_hall"]),
				totalAttacks,
				totalStars,
				fmt.Sprintf("%.2f", avgStars),
				fmt.Sprintf("%.1f%%", totalDestruction),
				fmt.Sprintf("%.1f%%", avgDestruction),
				fmt.Sprintf("%.2f", perfScore),
			}
			for col, val := range rowData {
				cell, _ := excelize.CoordinatesToCellName(col+1, row)
				f.SetCellValue(ws, cell, val)
			}
			row++
		}

		// Auto-fit columns
		for i := range headers {
			col, _ := excelize.ColumnNumberToName(i + 1)
			f.SetColWidth(ws, col, col, 18)
		}

		var buf bytes.Buffer
		if err := f.Write(&buf); err != nil {
			return err
		}

		filename := fmt.Sprintf("cwl_%s_%s.xlsx",
			strings.ReplaceAll(clanName, " ", "_"),
			strings.ReplaceAll(season, " ", "_"))
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		return c.Send(buf.Bytes())
	}
}

// exportPlayerWarStats generates an Excel file with war statistics for a player.
//
// @Summary Export player war statistics to Excel
// @Tags Exports
// @Accept json
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Param body body object true "Player tag and filters"
// @Success 200 {file} binary
// @Failure 404 {object} map[string]interface{}
// @Router /v2/exports/war/player-stats [post]
func exportPlayerWarStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PlayerTag      string  `json:"player_tag"`
			TimestampStart float64 `json:"timestamp_start"`
			TimestampEnd   float64 `json:"timestamp_end"`
			Limit          int     `json:"limit"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag := playerNormalizeTag(body.PlayerTag)
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "player_tag is required")
		}

		hits, err := sqlExportPlayerWarHits(c, a, tag, body.TimestampStart, body.TimestampEnd, body.Limit)
		if err != nil {
			return err
		}
		if len(hits) == 0 {
			return apptypes.Error(http.StatusNotFound, "No war hits found for this player")
		}

		f := excelize.NewFile()
		defer f.Close()

		ws := "War Stats"
		f.SetSheetName("Sheet1", ws)

		playerName := excelStr(hits[0]["name"])

		// Title
		f.SetCellValue(ws, "A1", fmt.Sprintf("War Statistics for %s (%s)", playerName, tag))
		titleStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 16}})
		f.SetCellStyle(ws, "A1", "J1", titleStyle)
		f.MergeCell(ws, "A1", "J1")

		// Headers
		row := 3
		headers := []string{
			"War Date", "Clan Tag", "Attacker Tag", "Attacker Name", "Attacker TH",
			"Defender Tag", "Defender TH", "Stars", "Destruction %", "Attack Order",
		}
		boldStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
		for col, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			f.SetCellValue(ws, cell, h)
			f.SetCellStyle(ws, cell, cell, boldStyle)
		}
		row++

		for _, hit := range hits {
			rowData := []any{
				excelStr(hit["war_date"]),
				excelStr(hit["clan_tag"]),
				excelStr(hit["tag"]),
				excelStr(hit["name"]),
				excelInt(hit["town_hall"]),
				excelStr(hit["defender_tag"]),
				excelInt(hit["defender_town_hall"]),
				excelInt(hit["stars"]),
				fmt.Sprintf("%.1f%%", excelFloat(hit["destruction_percentage"])),
				excelInt(hit["attack_order"]),
			}
			for col, val := range rowData {
				cell, _ := excelize.CoordinatesToCellName(col+1, row)
				f.SetCellValue(ws, cell, val)
			}
			row++
		}

		for i := range headers {
			col, _ := excelize.ColumnNumberToName(i + 1)
			f.SetColWidth(ws, col, col, 18)
		}

		var buf bytes.Buffer
		if err := f.Write(&buf); err != nil {
			return err
		}

		filename := fmt.Sprintf("war_stats_%s.xlsx", strings.ReplaceAll(tag, "#", ""))
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		return c.Send(buf.Bytes())
	}
}

func excelStr(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

func excelInt(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int32:
		return int(x)
	case int64:
		return int(x)
	case float64:
		return int(x)
	case float32:
		return int(x)
	}
	return 0
}

func excelFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}

func sqlExportCWLSummary(c *fiber.Ctx, a apptypes.Deps, clanTag string) (map[string]any, []map[string]any, error) {
	var season, clanName string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT to_char(max(war_end_time), 'YYYY-MM'), COALESCE((SELECT name FROM basic_clan WHERE tag = $1), $1)
		FROM war_attack_events
		WHERE attacking_clan_tag = $1 AND war_type = 'cwl'
	`, clanTag).Scan(&season, &clanName)
	if err != nil || season == "" {
		return nil, nil, err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT attacker_tag,
			COALESCE((SELECT name FROM player_current_stats WHERE player_tag = attacker_tag), attacker_tag) AS name,
			max(attacker_townhall),
			count(*),
			sum(stars),
			sum(destruction_percentage)
		FROM war_attack_events
		WHERE attacking_clan_tag = $1 AND war_type = 'cwl' AND to_char(war_end_time, 'YYYY-MM') = $2
		GROUP BY attacker_tag
		ORDER BY sum(stars) DESC, sum(destruction_percentage) DESC
	`, clanTag, season)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	members := []map[string]any{}
	totalStars := 0
	totalAttacks := 0
	totalDestruction := 0
	for rows.Next() {
		var tag, name string
		var townhall, attacks, stars, destruction int
		if err := rows.Scan(&tag, &name, &townhall, &attacks, &stars, &destruction); err != nil {
			return nil, nil, err
		}
		totalStars += stars
		totalAttacks += attacks
		totalDestruction += destruction
		members = append(members, map[string]any{
			"tag":               tag,
			"name":              name,
			"town_hall":         townhall,
			"total_attacks":     attacks,
			"total_stars":       stars,
			"total_destruction": destruction,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	return map[string]any{
		"clan_tag":    clanTag,
		"clan_name":   clanName,
		"season":      season,
		"league":      "Unknown",
		"stars":       totalStars,
		"attacks":     totalAttacks,
		"destruction": totalDestruction,
	}, members, nil
}

func sqlExportPlayerWarHits(c *fiber.Ctx, a apptypes.Deps, playerTag string, start float64, end float64, limit int) ([]map[string]any, error) {
	query := `
		SELECT e.war_end_time, e.attacking_clan_tag, e.attacker_tag,
			COALESCE(p.name, e.attacker_tag), e.attacker_townhall,
			e.defender_tag, e.defender_townhall, e.stars, e.destruction_percentage, e.attack_order
		FROM war_attack_events e
		LEFT JOIN player_current_stats p ON p.player_tag = e.attacker_tag
		WHERE e.attacker_tag = $1
	`
	args := []any{playerTag}
	if start > 0 {
		query += ` AND e.war_end_time >= to_timestamp($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, start)
	}
	if end > 0 {
		query += ` AND e.war_end_time <= to_timestamp($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, end)
	}
	query += ` ORDER BY e.war_end_time DESC`
	if limit > 0 {
		query += ` LIMIT $` + strconv.Itoa(len(args)+1)
		args = append(args, limit)
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hits := []map[string]any{}
	for rows.Next() {
		var warDate time.Time
		var clanTag, attackerTag, name, defenderTag string
		var attackerTH, defenderTH, stars, destruction, attackOrder int
		if err := rows.Scan(&warDate, &clanTag, &attackerTag, &name, &attackerTH, &defenderTag, &defenderTH, &stars, &destruction, &attackOrder); err != nil {
			return nil, err
		}
		hits = append(hits, map[string]any{
			"war_date":               warDate.Format(time.RFC3339),
			"clan_tag":               clanTag,
			"tag":                    attackerTag,
			"name":                   name,
			"town_hall":              attackerTH,
			"defender_tag":           defenderTag,
			"defender_town_hall":     defenderTH,
			"stars":                  stars,
			"destruction_percentage": destruction,
			"attack_order":           attackOrder,
		})
	}
	return hits, rows.Err()
}
