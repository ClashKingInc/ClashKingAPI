package v2

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

		pipeline := bson.A{
			bson.M{"$match": bson.M{"clan_tag": tag}},
			bson.M{"$sort": bson.M{"season": -1}},
			bson.M{"$limit": 1},
		}
		cur, err := a.Store.C.ClanLeaderboardDB.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		if len(results) == 0 {
			return apptypes.Error(http.StatusNotFound, "No CWL data found for this clan")
		}
		cwl := results[0]

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

		members, _ := cwl["members"].(bson.A)
		for _, m := range members {
			member, ok := m.(bson.M)
			if !ok {
				continue
			}
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

		filter := bson.M{"tag": tag}
		findOpts := options.Find()
		if body.Limit > 0 {
			findOpts.SetLimit(int64(body.Limit))
		}
		cur, err := a.Store.DB.Looper.Collection("warhits").Find(c.UserContext(), filter, findOpts)
		if err != nil {
			return err
		}
		var hits []bson.M
		if err := cur.All(c.UserContext(), &hits); err != nil {
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
