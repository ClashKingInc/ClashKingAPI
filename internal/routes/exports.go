package routes

import (
	"bytes"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
)

// exportCWLSummary generates an Excel file with CWL stats for a clan.
//
// @Summary Export CWL summary to Excel
// @Tags Other
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Param tag query string true "Clan tag"
// @Success 200 {file} binary
// @Failure 404 {object} modelsv2.ErrorResponse
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
// @Tags Other
// @Accept json
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Param body body modelsv2.PlayerWarStatsExportRequest true "Player tag and filters"
// @Success 200 {file} binary
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/exports/war/player-stats [post]
func exportPlayerWarStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.PlayerWarStatsExportRequest
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
	var latest time.Time
	var clanName string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT max(end_time), COALESCE((SELECT name FROM basic_clan WHERE tag = $1), $1)
		FROM wars
		WHERE (clan_tag = $1 OR opponent_tag = $1) AND war_type = 'cwl'
	`, clanTag).Scan(&latest, &clanName)
	if err != nil || latest.IsZero() {
		return nil, nil, err
	}
	monthStart := time.Date(latest.Year(), latest.Month(), 1, 0, 0, 0, 0, time.UTC)
	wars, err := sqlClanWars(c, a, clanTag, monthStart, monthStart.AddDate(0, 1, 0), []string{"cwl"}, 100)
	if err != nil {
		return nil, nil, err
	}
	type totals struct {
		name                                  string
		townhall, attacks, stars, destruction int
	}
	byPlayer := map[string]*totals{}
	totalStars := 0
	totalAttacks := 0
	totalDestruction := 0
	for _, war := range wars {
		for _, member := range war.Clan.Members {
			if len(member.Attacks) == 0 {
				continue
			}
			value := byPlayer[member.Tag]
			if value == nil {
				value = &totals{name: member.Name, townhall: member.TownhallLevel}
				byPlayer[member.Tag] = value
			}
			value.townhall = max(value.townhall, member.TownhallLevel)
			for _, attack := range member.Attacks {
				value.attacks++
				value.stars += attack.Stars
				value.destruction += attack.DestructionPercentage
				totalStars += attack.Stars
				totalAttacks++
				totalDestruction += attack.DestructionPercentage
			}
		}
	}
	members := make([]map[string]any, 0, len(byPlayer))
	for tag, value := range byPlayer {
		members = append(members, map[string]any{
			"tag": tag, "name": value.name, "town_hall": value.townhall,
			"total_attacks": value.attacks, "total_stars": value.stars, "total_destruction": value.destruction,
		})
	}
	sort.Slice(members, func(i, j int) bool { return excelInt(members[i]["total_stars"]) > excelInt(members[j]["total_stars"]) })
	return map[string]any{
		"clan_tag":    clanTag,
		"clan_name":   clanName,
		"season":      latest.Format("2006-01"),
		"league":      "Unknown",
		"stars":       totalStars,
		"attacks":     totalAttacks,
		"destruction": totalDestruction,
	}, members, nil
}

func sqlExportPlayerWarHits(c *fiber.Ctx, a apptypes.Deps, playerTag string, start float64, end float64, limit int) ([]map[string]any, error) {
	startTime := time.Unix(0, 0).UTC()
	endTime := time.Unix(9999999999, 0).UTC()
	if start > 0 {
		startTime = time.Unix(int64(start), 0).UTC()
	}
	if end > 0 {
		endTime = time.Unix(int64(end), 0).UTC()
	}
	attacks, _, err := sqlAttacksForPlayersContext(c.UserContext(), a, []string{playerTag}, startTime, endTime)
	if err != nil {
		return nil, err
	}
	sort.Slice(attacks, func(i, j int) bool { return attacks[i].WarEndTime.After(attacks[j].WarEndTime) })
	if limit > 0 && len(attacks) > limit {
		attacks = attacks[:limit]
	}
	hits := make([]map[string]any, 0, len(attacks))
	for _, attack := range attacks {
		hits = append(hits, map[string]any{
			"war_date": attack.WarEndTime.Format(time.RFC3339), "clan_tag": attack.AttackingClanTag,
			"tag": attack.AttackerTag, "name": attack.AttackerName, "town_hall": attack.AttackerTownhall,
			"defender_tag": attack.DefenderTag, "defender_town_hall": attack.DefenderTownhall,
			"stars": attack.Stars, "destruction_percentage": attack.DestructionPercentage, "attack_order": attack.AttackOrder,
		})
	}
	return hits, nil
}
