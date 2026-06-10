package routes

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

var legendsDayParam = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// legendStatsDay godoc
// @Summary Get legend stats by day
// @Description Returns legend stats for requested players on a specific day.
// @Tags Bot Legends Endpoints
// @Produce json
// @Param day path string true "Legend day YYYY-MM-DD"
// @Param players query []string false "Player tags"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/players/day/{day} [get]
func legendStatsDay(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		day := c.Params("day")
		if !legendsDayParam.MatchString(day) {
			return apptypes.Error(http.StatusBadRequest, "invalid day format, expected YYYY-MM-DD")
		}
		players := apptypes.QueryValues(c, "players")
		rows, err := legendsStatsRows(c, a, players)
		if err != nil {
			return err
		}
		for _, row := range rows {
			legends, _ := row["legends"].(map[string]any)
			filtered := map[string]any{}
			if streak, ok := legends["streak"]; ok {
				filtered["streak"] = streak
			}
			if dayData, ok := legends[day]; ok {
				filtered[day] = normalizeLegendDay(dayData)
			}
			row["legends"] = filtered
		}
		return apptypes.JSON(c, fiber.StatusOK, rows)
	}
}

// legendStatsSeason godoc
// @Summary Get legend stats by season
// @Description Returns legend stats for requested players in a season.
// @Tags Bot Legends Endpoints
// @Produce json
// @Param season path string true "Season YYYY-MM"
// @Param players query []string false "Player tags"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/players/season/{season} [get]
func legendStatsSeason(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := c.Params("season")
		players := apptypes.QueryValues(c, "players")

		seasonDays, err := cocSeasonDays(season)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid season format, use YYYY-MM")
		}

		rows, err := legendsStatsRows(c, a, players)
		if err != nil {
			return err
		}

		// Filter legends to season days only and normalise old field names.
		for _, row := range rows {
			legends, _ := row["legends"].(map[string]any)
			if legends == nil {
				row["streak"] = 0
				row["legends"] = map[string]any{}
				continue
			}
			streak := legends["streak"]
			if streak == nil {
				streak = 0
			}
			row["streak"] = streak
			filtered := map[string]any{}
			for dayKey, dayVal := range legends {
				if dayKey == "streak" {
					continue
				}
				if _, ok := seasonDays[dayKey]; !ok {
					continue
				}
				dayData, ok := normalizeLegendDay(dayVal).(map[string]any)
				if !ok {
					continue
				}
				filtered[dayKey] = dayData
			}
			row["legends"] = filtered
		}
		return apptypes.JSON(c, fiber.StatusOK, rows)
	}
}

// guildStats godoc
// @Summary Get guild legends statistics
// @Description Returns legends leaderboard and player stats for a guild.
// @Tags Bot Legends Endpoints
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param season query string false "Season (YYYY-MM)"
// @Param limit_top_players query int false "Max number of top players to return"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/guild-stats [get]
func guildStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		season := c.Query("season")
		limitTopPlayers := legendsParseIntDefault(c.Query("limit_top_players"), 10)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		if err := activityRequireServer(c, a, guildID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}

		var seasonDays map[string]struct{}
		if season != "" {
			seasonDays, _ = cocSeasonDays(season)
		}

		type legendEntry struct {
			tag      string
			name     string
			trophies int
			clanTag  string
			clanName string
		}
		type clanData struct {
			tag             string
			name            string
			players         []legendEntry
			totalTrophies   int
			highestTrophies int
			lowestTrophies  int
		}

		allClanData := make([]clanData, 0, len(clans))
		allPlayerTags := make([]string, 0)

		for _, clan := range clans {
			tag := legendsAsString(clan["tag"])
			name := legendsAsString(clan["name"])
			cocClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || cocClan == nil {
				continue
			}
			var legendPlayers []legendEntry
			totalT, highT, lowT := 0, 0, 0
			for _, member := range cocClan.Members {
				if member.League != nil && member.League.Name == "Legend League" {
					legendPlayers = append(legendPlayers, legendEntry{
						tag: member.Tag, name: member.Name, trophies: member.Trophies,
						clanTag: tag, clanName: name,
					})
					totalT += member.Trophies
					if member.Trophies > highT || highT == 0 {
						highT = member.Trophies
					}
					if member.Trophies < lowT || lowT == 0 {
						lowT = member.Trophies
					}
					allPlayerTags = append(allPlayerTags, member.Tag)
				}
			}
			if len(legendPlayers) > 0 {
				allClanData = append(allClanData, clanData{
					tag: tag, name: name, players: legendPlayers,
					totalTrophies: totalT, highestTrophies: highT, lowestTrophies: lowT,
				})
			}
		}

		playerAttacks := make(map[string]int)
		playerDefenses := make(map[string]int)
		if len(allPlayerTags) > 0 {
			statsDocs, err := playerCurrentStatsByTags(c.UserContext(), a, allPlayerTags)
			if err != nil {
				return err
			}
			for _, doc := range statsDocs {
				pTag, _ := doc["tag"].(string)
				legends, _ := doc["legends"].(map[string]any)
				if legends == nil {
					continue
				}
				atk, def := countLegendsAttacksDefenses(legends, seasonDays)
				playerAttacks[pTag] = atk
				playerDefenses[pTag] = def
			}
		}

		topPlayers := make([]modelsv2.GuildStatsTopPlayer, 0)
		totalTrophies := 0
		totalPlayers := 0
		clanRows := make([]modelsv2.GuildStatsClanRow, 0, len(allClanData))

		for _, cd := range allClanData {
			clanTotalAtk, clanTotalDef := 0, 0
			for _, p := range cd.players {
				totalPlayers++
				totalTrophies += p.trophies
				clanTotalAtk += playerAttacks[p.tag]
				clanTotalDef += playerDefenses[p.tag]
				topPlayers = append(topPlayers, modelsv2.GuildStatsTopPlayer{
					Tag:      p.tag,
					Name:     p.name,
					Trophies: p.trophies,
					ClanTag:  p.clanTag,
					ClanName: p.clanName,
				})
			}
			n := len(cd.players)
			avgT, avgA, avgD := 0.0, 0.0, 0.0
			if n > 0 {
				avgT = float64(cd.totalTrophies) / float64(n)
				avgA = float64(clanTotalAtk) / float64(n)
				avgD = float64(clanTotalDef) / float64(n)
			}
			clanRows = append(clanRows, modelsv2.GuildStatsClanRow{
				ClanTag:                  cd.tag,
				ClanName:                 cd.name,
				PlayersInLegends:         n,
				AverageTrophies:          avgT,
				TotalTrophies:            cd.totalTrophies,
				HighestTrophies:          cd.highestTrophies,
				LowestTrophies:           cd.lowestTrophies,
				TotalAttacks:             clanTotalAtk,
				TotalDefenses:            clanTotalDef,
				AverageAttacksPerPlayer:  avgA,
				AverageDefensesPerPlayer: avgD,
			})
		}

		sort.Slice(topPlayers, func(i, j int) bool {
			return topPlayers[i].Trophies > topPlayers[j].Trophies
		})
		if limitTopPlayers > 0 && len(topPlayers) > limitTopPlayers {
			topPlayers = topPlayers[:limitTopPlayers]
		}

		avgOverall := 0.0
		if totalPlayers > 0 {
			avgOverall = float64(totalTrophies) / float64(totalPlayers)
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.GuildStatsResponse{
			GuildID:               guildID,
			Season:                season,
			TotalPlayersInLegends: totalPlayers,
			TotalClans:            len(clanRows),
			AverageTrophies:       avgOverall,
			TotalTrophies:         totalTrophies,
			TopPlayers:            topPlayers,
			Clans:                 clanRows,
		})
	}
}

// dailyTracking godoc
// @Summary Get legends daily tracking
// @Description Returns per-day legend stats for all players in a guild over a date range.
// @Tags Bot Legends Endpoints
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param start_date query string true "Start date in YYYY-MM-DD format"
// @Param end_date query string true "End date in YYYY-MM-DD format"
// @Param clan_tag query string false "Restrict to a single clan"
// @Param limit query int false "Maximum number of players to return"
// @Param offset query int false "Number of players to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/daily-tracking [get]
func dailyTracking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")
		clanTagFilter := c.Query("clan_tag")
		limit := legendsParseIntDefault(c.Query("limit"), 100)
		offset := legendsParseIntDefault(c.Query("offset"), 0)

		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}
		if startDate == "" || endDate == "" {
			return apptypes.Error(fiber.StatusBadRequest, "start_date and end_date are required (YYYY-MM-DD)")
		}

		startDt, err := time.Parse("2006-01-02", startDate)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid start_date format, use YYYY-MM-DD")
		}
		endDt, err := time.Parse("2006-01-02", endDate)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid end_date format, use YYYY-MM-DD")
		}

		if err := activityRequireServer(c, a, guildID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		// Build the list of dates in the range.
		var dateStrings []string
		for d := startDt; !d.After(endDt); d = d.AddDate(0, 0, 1) {
			dateStrings = append(dateStrings, d.Format("2006-01-02"))
		}

		// Collect member tags from the guild's clans (optionally filtered by clan_tag).
		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}
		if clanTagFilter != "" {
			filtered := make([]map[string]any, 0, len(clans))
			for _, clan := range clans {
				if legendsAsString(clan["tag"]) == clanTagFilter {
					filtered = append(filtered, clan)
				}
			}
			clans = filtered
		}

		memberTags := make([]string, 0)
		clanNameMap := make(map[string]string)
		clanTagMap := make(map[string]string) // player tag → clan tag
		for _, clan := range clans {
			tag := legendsAsString(clan["tag"])
			name := legendsAsString(clan["name"])
			clanNameMap[tag] = name
			cocClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || cocClan == nil {
				continue
			}
			for _, member := range cocClan.Members {
				memberTags = append(memberTags, member.Tag)
				clanTagMap[member.Tag] = tag
			}
		}

		if len(memberTags) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.DailyTrackingResponse{
				GuildID: guildID, StartDate: startDate, EndDate: endDate,
				Players: []modelsv2.PlayerDailyTracking{}, Limit: limit, Offset: offset,
			})
		}

		statsDocs, err := playerCurrentStatsByTags(c.UserContext(), a, memberTags)
		if err != nil {
			return err
		}

		playersWithData := make([]modelsv2.PlayerDailyTracking, 0)
		for _, doc := range statsDocs {
			pTag, _ := doc["tag"].(string)
			pName, _ := doc["name"].(string)
			legends, _ := doc["legends"].(map[string]any)
			if legends == nil {
				continue
			}
			hasData := false
			for _, ds := range dateStrings {
				if _, ok := legends[ds]; ok {
					hasData = true
					break
				}
			}
			if !hasData {
				continue
			}

			townhall := legendsAsInt(doc["townhall"])
			trophies := legendsAsInt(doc["trophies"])

			var dailyData []modelsv2.DailyTrackingDayData
			for _, ds := range dateStrings {
				dayVal, ok := legends[ds]
				if !ok {
					continue
				}
				dayData, ok := normalizeLegendDay(dayVal).(map[string]any)
				if !ok || len(dayData) == 0 {
					continue
				}
				startT := legendsAsInt(dayData["start"])
				endT := legendsAsInt(dayData["end"])

				atkArr := legendsArray(dayData["attacks"])
				defArr := legendsArray(dayData["defenses"])
				atkCount, atkWins := countDayAttacks(atkArr)
				defCount, defWins := countDayDefenses(defArr)

				dailyData = append(dailyData, modelsv2.DailyTrackingDayData{
					Date:             ds,
					StartingTrophies: startT,
					EndingTrophies:   endT,
					NetChange:        endT - startT,
					Attacks:          atkCount,
					Defenses:         defCount,
					AttackWins:       atkWins,
					DefenseWins:      defWins,
				})
			}
			if len(dailyData) == 0 {
				continue
			}

			ct := clanTagMap[pTag]
			var ctPtr, cnPtr *string
			if ct != "" {
				ctPtr = &ct
				cn := clanNameMap[ct]
				cnPtr = &cn
			}
			playersWithData = append(playersWithData, modelsv2.PlayerDailyTracking{
				PlayerTag:       pTag,
				PlayerName:      pName,
				ClanTag:         ctPtr,
				ClanName:        cnPtr,
				TownhallLevel:   townhall,
				CurrentTrophies: trophies,
				DailyData:       dailyData,
			})
		}

		totalCount := len(playersWithData)
		if offset > totalCount {
			offset = totalCount
		}
		end := offset + limit
		if end > totalCount {
			end = totalCount
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.DailyTrackingResponse{
			GuildID:    guildID,
			StartDate:  startDate,
			EndDate:    endDate,
			Players:    playersWithData[offset:end],
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
		})
	}
}

func legendsAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func legendsAsInt(v any) int {
	switch x := v.(type) {
	case int32:
		return int(x)
	case int64:
		return int(x)
	case int:
		return x
	case float64:
		return int(x)
	}
	return 0
}

func legendsParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

// lastMondayOfMonth returns the last Monday of month at 05:00 UTC.
func lastMondayOfMonth(year int, month time.Month) time.Time {
	lastDay := time.Date(year, month+1, 0, 5, 0, 0, 0, time.UTC)
	daysBack := (int(lastDay.Weekday()) + 6) % 7
	return lastDay.AddDate(0, 0, -daysBack)
}

// cocSeasonDays returns the set of dates (YYYY-MM-DD) belonging to the given CoC season.
// Season format is YYYY-MM (e.g. "2026-04" is the April 2026 season).
func cocSeasonDays(season string) (map[string]struct{}, error) {
	parts := strings.SplitN(season, "-", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid season format")
	}
	year, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil, err
	}
	monthInt, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, err
	}
	// Season start = last Monday of (month-1) at 05:00 UTC
	prevYear, prevMonth := year, monthInt-1
	if prevMonth == 0 {
		prevMonth = 12
		prevYear--
	}
	seasonStart := lastMondayOfMonth(prevYear, time.Month(prevMonth))
	seasonEnd := lastMondayOfMonth(year, time.Month(monthInt))

	days := make(map[string]struct{})
	for d := seasonStart; d.Before(seasonEnd); d = d.AddDate(0, 0, 1) {
		days[d.Format("2006-01-02")] = struct{}{}
	}
	return days, nil
}

func countDayAttacks(arr []any) (count, wins int) {
	for _, item := range arr {
		attack, ok := item.(map[string]any)
		if !ok {
			continue
		}
		count++
		if legendsAsInt(attack["stars"]) >= 1 {
			wins++
		}
	}
	return
}

func countDayDefenses(arr []any) (count, wins int) {
	for _, item := range arr {
		defense, ok := item.(map[string]any)
		if !ok {
			continue
		}
		count++
		if legendsAsInt(defense["stars"]) == 0 {
			wins++
		}
	}
	return
}

// countLegendsAttacksDefenses sums attacks and defenses for all days in a legends map.
// If seasonDays is non-nil only days within the season are counted.
func countLegendsAttacksDefenses(legends map[string]any, seasonDays map[string]struct{}) (attacks, defenses int) {
	for key, val := range legends {
		if key == "streak" {
			continue
		}
		if seasonDays != nil {
			if _, ok := seasonDays[key]; !ok {
				continue
			}
		}
		dayData, ok := normalizeLegendDay(val).(map[string]any)
		if !ok {
			continue
		}
		atkArr := legendsArray(dayData["attacks"])
		attacks += len(atkArr)

		defArr := legendsArray(dayData["defenses"])
		defenses += len(defArr)
	}
	return
}

func legendsStatsRows(c *fiber.Ctx, a apptypes.Deps, players []string) ([]map[string]any, error) {
	rows, err := playerCurrentStatsByTags(c.UserContext(), a, players)
	if err != nil {
		return nil, err
	}
	leaderboard, err := legendsPlayerRankings(c, a, players)
	if err != nil {
		return nil, err
	}
	global, err := legendsGlobalRankings(c, a, players)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		tag := legendsAsString(row["tag"])
		row["leaderboard_data"] = leaderboard[tag]
		if row["leaderboard_data"] == nil {
			row["leaderboard_data"] = map[string]any{}
		}
		row["global_ranking_data"] = global[tag]
		if row["global_ranking_data"] == nil {
			row["global_ranking_data"] = map[string]any{}
		}
	}
	return rows, nil
}

func legendsPlayerRankings(c *fiber.Ctx, a apptypes.Deps, players []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, country_name, country_code, rank, global_rank, local_rank, data
		FROM player_rankings_current
		WHERE player_tag = ANY($1)
	`, players)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag string
		var countryName, countryCode *string
		var rank, globalRank, localRank *int
		var dataRaw []byte
		if err := rows.Scan(&tag, &countryName, &countryCode, &rank, &globalRank, &localRank, &dataRaw); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["tag"] = tag
		if countryName != nil {
			item["country_name"] = *countryName
		}
		if countryCode != nil {
			item["country_code"] = *countryCode
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
		out[tag] = item
	}
	return out, rows.Err()
}

func legendsGlobalRankings(c *fiber.Ctx, a apptypes.Deps, players []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, rank, trophies, player_name, clan_tag, clan_name, data
		FROM legend_rankings_current
		WHERE player_tag = ANY($1)
	`, players)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag, playerName, clanName string
		var clanTag *string
		var rank, trophies int
		var dataRaw []byte
		if err := rows.Scan(&tag, &rank, &trophies, &playerName, &clanTag, &clanName, &dataRaw); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["tag"] = tag
		item["rank"] = rank
		item["trophies"] = trophies
		item["name"] = playerName
		if clanTag != nil {
			item["clan_tag"] = *clanTag
		}
		item["clan_name"] = clanName
		out[tag] = item
	}
	return out, rows.Err()
}

func normalizeLegendDay(raw any) any {
	dayData, ok := raw.(map[string]any)
	if !ok {
		return raw
	}
	if v, ok := dayData["new_attacks"]; ok {
		dayData["attacks"] = v
		delete(dayData, "new_attacks")
	}
	if v, ok := dayData["new_defenses"]; ok {
		dayData["defenses"] = v
		delete(dayData, "new_defenses")
	}
	return dayData
}

func legendsArray(raw any) []any {
	if arr, ok := raw.([]any); ok {
		return arr
	}
	return []any{}
}
