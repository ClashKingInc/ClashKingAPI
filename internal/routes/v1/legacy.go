package v1

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var staticDataPath = filepath.Join(".venv", "lib", "python3.13", "site-packages", "coc", "static", "static_data.json")
var translationsPath = filepath.Join(".venv", "lib", "python3.13", "site-packages", "coc", "static", "translations.json")
var superTroops = []string{
	"Super Barbarian", "Super Archer", "Super Giant", "Sneaky Goblin", "Super Wall Breaker",
	"Rocket Balloon", "Super Wizard", "Inferno Dragon", "Super Minion", "Super Valkyrie",
	"Super Witch", "Ice Hound", "Super Bowler", "Super Dragon", "Super Miner", "Super Hog Rider",
	"Druid", "Thrower",
}

// assets godoc
// @Summary Get legacy asset download link
// @Description Returns the ClashKing sprite bundle download link.
// @Tags Legacy
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /assets [get]
func assets() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{"download-link": "https://cdn.clashking.xyz/Out-Sprites.zip"})
	}
}

// jsonData godoc
// @Summary Get legacy static JSON data
// @Description Returns static Clash data for the requested legacy data type.
// @Tags Legacy Static Data
// @Produce json
// @Param data_type path string true "Static data type"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /json/{data_type} [get]
func jsonData() fiber.Handler {
	return func(c *fiber.Ctx) error {
		dataType := c.Params("data_type")
		if dataType == "list" {
			return apptypes.JSON(c, http.StatusOK, map[string]any{
				"types": []string{"troops", "heroes", "hero_equipment", "spells", "buildings", "pets", "supers", "townhalls", "translations"},
			})
		}
		if dataType == "translations" {
			return sendJSONFile(c, translationsPath)
		}
		data, err := loadStaticData()
		if err != nil {
			return err
		}
		switch dataType {
		case "hero_equipment":
			return apptypes.JSON(c, http.StatusOK, data["equipment"])
		case "supers":
			items := make([]map[string]any, 0)
			for _, item := range asMapSlice(data["troops"]) {
				name := stringValue(item["name"])
				for _, super := range superTroops {
					if name == super {
						items = append(items, item)
						break
					}
				}
			}
			return apptypes.JSON(c, http.StatusOK, items)
		case "townhalls":
			items := make([]map[string]any, 0)
			for _, item := range asMapSlice(data["buildings"]) {
				if stringValue(item["name"]) == "Town Hall" {
					items = append(items, item)
				}
			}
			return apptypes.JSON(c, http.StatusOK, items)
		default:
			if value, ok := data[dataType]; ok {
				return apptypes.JSON(c, http.StatusOK, value)
			}
		}
		return apptypes.Error(http.StatusNotFound, "data type not found")
	}
}

// builderBaseLeagues godoc
// @Summary Get builder base leagues
// @Description Returns legacy builder base league metadata.
// @Tags Legacy Static Data
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /builderbaseleagues [get]
func builderBaseLeagues() fiber.Handler {
	return func(c *fiber.Ctx) error {
		data, err := loadStaticData()
		if err != nil {
			return err
		}
		results := make([]map[string]any, 0)
		for _, item := range asMapSlice(data["league_tiers"]) {
			name := stringValue(item["name"])
			if !strings.Contains(strings.ToLower(name), "wood") &&
				!strings.Contains(strings.ToLower(name), "clay") &&
				!strings.Contains(strings.ToLower(name), "stone") &&
				!strings.Contains(strings.ToLower(name), "copper") &&
				!strings.Contains(strings.ToLower(name), "brass") &&
				!strings.Contains(strings.ToLower(name), "iron") &&
				!strings.Contains(strings.ToLower(name), "steel") &&
				!strings.Contains(strings.ToLower(name), "titanium") &&
				!strings.Contains(strings.ToLower(name), "platinum") &&
				!strings.Contains(strings.ToLower(name), "emerald") &&
				!strings.Contains(strings.ToLower(name), "ruby") &&
				!strings.Contains(strings.ToLower(name), "diamond") {
				continue
			}
			copyItem := cloneMap(item)
			parts := strings.Fields(strings.ToLower(name))
			if len(parts) >= 2 {
				tier := 1
				if len(parts) == 3 {
					switch parts[2] {
					case "iv":
						tier = 4
					case "v":
						tier = 5
					default:
						tier = len(parts[2])
					}
				}
				copyItem["iconUrls"] = map[string]any{"medium": fmt.Sprintf("https://assets.clashk.ing/bot/builder-base-leagues/builder_base_%s_%s_%d.png", parts[0], parts[1], tier)}
			}
			results = append(results, copyItem)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

// listTownhalls godoc
// @Summary List tracked town halls
// @Description Returns distinct town hall levels seen in tracked player stats.
// @Tags Legacy Lists
// @Produce json
// @Success 200 {array} int
// @Failure 500 {object} map[string]interface{}
// @Router /list/townhalls [get]
func listTownhalls(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT DISTINCT townhall_level FROM player_current_stats WHERE townhall_level IS NOT NULL ORDER BY townhall_level`)
		if err != nil {
			return err
		}
		defer rows.Close()
		out := []int{}
		for rows.Next() {
			var level int
			if err := rows.Scan(&level); err != nil {
				return err
			}
			out = append(out, level)
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// listSeasons godoc
// @Summary List recent seasons
// @Description Returns recent season identifiers in YYYY-MM format.
// @Tags Legacy Lists
// @Produce json
// @Param last query int false "Number of previous months to include"
// @Success 200 {array} string
// @Router /list/seasons [get]
func listSeasons() fiber.Handler {
	return func(c *fiber.Ctx) error {
		last, _ := strconv.Atoi(c.Query("last", "12"))
		if last > 1000 {
			last = 1000
		}
		if last < 0 {
			last = 12
		}
		now := time.Now().UTC()
		results := make([]string, 0, last+1)
		for i := 0; i <= last; i++ {
			t := now.AddDate(0, -i, 0)
			results = append(results, fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month())))
		}
		return apptypes.JSON(c, http.StatusOK, results)
	}
}

// superTroopBoostRate godoc
// @Summary Get super troop boost rates
// @Description Returns boost counts and usage percentages for super troops in a season window.
// @Tags Legacy Stats
// @Produce json
// @Param start_season query string true "Start season YYYY-MM"
// @Param end_season query string true "End season YYYY-MM"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /boost-rate [get]
func superTroopBoostRate(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start, end, err := parseSeasonWindow(c.Query("start_season"), c.Query("end_season"))
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			WITH boosted AS (
				SELECT event_type, count(*)::int AS boosts
				FROM player_history_events
				WHERE event_type = ANY($1) AND event_time >= $2 AND event_time <= $3
				GROUP BY event_type
			), total AS (SELECT COALESCE(sum(boosts), 0)::float8 AS count FROM boosted)
			SELECT boosted.event_type, boosted.boosts,
				CASE WHEN total.count = 0 THEN 0 ELSE boosted.boosts / total.count * 100 END AS usage_percent
			FROM boosted, total
			ORDER BY boosted.boosts DESC
		`, superTroops, start, end)
		if err != nil {
			return err
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var name string
			var boosts int
			var usage float64
			if err := rows.Scan(&name, &boosts, &usage); err != nil {
				return err
			}
			out = append(out, map[string]any{"name": name, "boosts": boosts, "usagePercent": usage})
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// globalCounts godoc
// @Summary Get global ClashKing counts
// @Description Returns global tracking counts used by legacy clients.
// @Tags Legacy Stats
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /global/counts [get]
func globalCounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		count := func(query string, args ...any) int64 {
			var value int64
			_ = a.Store.SQL.QueryRow(ctx, query, args...).Scan(&value)
			return value
		}
		now := time.Now().UTC()
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"players_in_war":     count(`SELECT count(DISTINCT attacker_tag) FROM war_attack_events WHERE war_end_time >= $1`, now),
			"clans_in_war":       count(`SELECT count(DISTINCT clan_tag) FROM war_log_index WHERE end_time >= $1`, now),
			"total_join_leaves":  count(`SELECT count(*) FROM join_leave_history`),
			"players_in_legends": count(`SELECT count(*) FROM legend_rankings_current`),
			"player_count":       count(`SELECT count(*) FROM player_current_stats`),
			"clan_count":         count(`SELECT count(*) FROM basic_clan`),
			"wars_stored":        count(`SELECT count(DISTINCT war_id) FROM war_log_index`),
		})
	}
}

// legendsClan godoc
// @Summary Get clan legend day data
// @Description Returns clan data with legend league members for a specific day.
// @Tags Legacy Legends
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param date path string true "Legend day YYYY-MM-DD"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /legends/clan/{clan_tag}/{date} [get]
func legendsClan(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := fixTag(c.Params("clan_tag"))
		date := c.Params("date")
		clan, err := v1BasicClan(c, a, clanTag)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Clan not found")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, name, townhall_level, legends, data
			FROM player_current_stats
			WHERE clan_tag = $1
			ORDER BY name
		`, clanTag)
		if err != nil {
			return err
		}
		defer rows.Close()
		memberList := []map[string]any{}
		for rows.Next() {
			var tag, name string
			var th pgtype.Int4
			var legendsRaw, dataRaw []byte
			if err := rows.Scan(&tag, &name, &th, &legendsRaw, &dataRaw); err != nil {
				return err
			}
			data := jsonObject(dataRaw)
			league := nestedMap(data["league"])
			if !strings.EqualFold(stringValue(league["name"]), "Legend League") {
				continue
			}
			legendData := nestedMap(jsonObject(legendsRaw)[date])
			delete(legendData, "attacks")
			delete(legendData, "defenses")
			item := map[string]any{"name": name, "tag": tag, "league": league["name"], "legends": legendData}
			if th.Valid {
				item["townhall"] = th.Int32
			}
			memberList = append(memberList, item)
		}
		clan["memberList"] = memberList
		return apptypes.JSON(c, http.StatusOK, clan)
	}
}

// legendStreaks godoc
// @Summary Get legend streak leaderboard
// @Description Returns players ordered by their tracked legend streak.
// @Tags Legacy Legends
// @Produce json
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /legends/streaks [get]
func legendStreaks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit := clamp(queryInt(c, "limit", 50), 1, 500)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, name, legends
			FROM player_current_stats
			ORDER BY COALESCE(NULLIF(legends->>'streak', '')::int, 0) DESC
			LIMIT $1
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		results := []map[string]any{}
		for rows.Next() {
			var tag, name string
			var raw []byte
			if err := rows.Scan(&tag, &name, &raw); err != nil {
				return err
			}
			results = append(results, map[string]any{"rank": len(results) + 1, "tag": tag, "name": name, "legends": map[string]any{"streak": jsonObject(raw)["streak"]}})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

// legendTrophyBuckets godoc
// @Summary Get legend trophy buckets
// @Description Returns histogram buckets for current legend trophy counts.
// @Tags Legacy Legends
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /legends/trophy-buckets [get]
func legendTrophyBuckets(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT width_bucket(trophies, 4500, 8500, 16) AS bucket, count(*)::int
			FROM legend_rankings_current
			GROUP BY bucket
			ORDER BY bucket
		`)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var bucket, count int
			if err := rows.Scan(&bucket, &count); err != nil {
				return err
			}
			items = append(items, map[string]any{"_id": bucket, "count": count})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// legendEOSWinners godoc
// @Summary Get legend end-of-season winners
// @Description Returns season rank-one legend snapshots.
// @Tags Legacy Legends
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /legends/eos-winners [get]
func legendEOSWinners(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT season, player_tag, rank, trophies, data
			FROM legend_history_snapshots
			WHERE rank = 1
			ORDER BY season DESC
		`)
		if err != nil {
			return err
		}
		defer rows.Close()
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": scanLegendHistory(rows)})
	}
}

// liveLegendRankings godoc
// @Summary Get live legend rankings
// @Description Returns current legend rankings in the requested rank range.
// @Tags Legacy Rankings
// @Produce json
// @Param top_ranking query int false "First rank"
// @Param lower_ranking query int false "Last rank"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/live/legends [get]
func liveLegendRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		topRanking := queryInt(c, "top_ranking", 1)
		lowerRanking := queryInt(c, "lower_ranking", 200)
		if abs((lowerRanking+1)-topRanking) >= 5000 {
			return apptypes.Error(http.StatusBadRequest, "Max 5000 rankings can be pulled at one time")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, rank, trophies, player_name, clan_tag, clan_name, data
			FROM legend_rankings_current
			WHERE rank >= $1 AND rank <= $2
			ORDER BY rank
		`, topRanking, lowerRanking)
		if err != nil {
			return err
		}
		defer rows.Close()
		return apptypes.JSON(c, http.StatusOK, scanLegendCurrent(rows))
	}
}

// liveLegendRankingByPlayer godoc
// @Summary Get live legend ranking by player
// @Description Returns the current legend ranking row for a player.
// @Tags Legacy Rankings
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/legends/{player_tag} [get]
func liveLegendRankingByPlayer(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := fixTag(c.Params("player_tag"))
		var tag, name, clanTag, clanName string
		var rank, trophies int
		var raw []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT player_tag, rank, trophies, player_name, COALESCE(clan_tag, ''), clan_name, data
			FROM legend_rankings_current
			WHERE player_tag = $1
		`, playerTag).Scan(&tag, &rank, &trophies, &name, &clanTag, &clanName, &raw)
		if err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.JSON(c, http.StatusOK, nil)
			}
			return err
		}
		item := jsonObject(raw)
		item["tag"] = tag
		item["rank"] = rank
		item["trophies"] = trophies
		item["name"] = name
		item["clan_tag"] = clanTag
		item["clan_name"] = clanName
		return apptypes.JSON(c, http.StatusOK, item)
	}
}

// playerTrophiesRanking godoc
// @Summary Get player trophy ranking snapshot
// @Description Returns a stored player trophy ranking snapshot for a location and date.
// @Tags Legacy Rankings
// @Produce json
// @Param location path string true "Location"
// @Param date path string true "Snapshot date"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/player-trophies/{location}/{date} [get]
func playerTrophiesRanking(a apptypes.Deps) fiber.Handler { return rankingByDate(a, "player_trophies") }

// playerBuilderRanking godoc
// @Summary Get player builder ranking snapshot
// @Description Returns a stored player builder ranking snapshot for a location and date.
// @Tags Legacy Rankings
// @Produce json
// @Param location path string true "Location"
// @Param date path string true "Snapshot date"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/player-builder/{location}/{date} [get]
func playerBuilderRanking(a apptypes.Deps) fiber.Handler { return rankingByDate(a, "player_builder") }

// clanTrophiesRanking godoc
// @Summary Get clan trophy ranking snapshot
// @Description Returns a stored clan trophy ranking snapshot for a location and date.
// @Tags Legacy Rankings
// @Produce json
// @Param location path string true "Location"
// @Param date path string true "Snapshot date"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/clan-trophies/{location}/{date} [get]
func clanTrophiesRanking(a apptypes.Deps) fiber.Handler { return rankingByDate(a, "clan_trophies") }

// clanBuilderRanking godoc
// @Summary Get clan builder ranking snapshot
// @Description Returns a stored clan builder ranking snapshot for a location and date.
// @Tags Legacy Rankings
// @Produce json
// @Param location path string true "Location"
// @Param date path string true "Snapshot date"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/clan-builder/{location}/{date} [get]
func clanBuilderRanking(a apptypes.Deps) fiber.Handler { return rankingByDate(a, "clan_builder") }

// clanCapitalRanking godoc
// @Summary Get clan capital ranking snapshot
// @Description Returns a stored clan capital ranking snapshot for a location and date.
// @Tags Legacy Rankings
// @Produce json
// @Param location path string true "Location"
// @Param date path string true "Snapshot date"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /ranking/clan-capital/{location}/{date} [get]
func clanCapitalRanking(a apptypes.Deps) fiber.Handler { return rankingByDate(a, "clan_capital") }

// playerTodo godoc
// @Summary Get player to-do state
// @Description Returns war, raid, legend, clan games, and season pass to-do data for player tags.
// @Tags Legacy Player
// @Produce json
// @Param player_tags query []string true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /player/to-do [get]
func playerTodo(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		values := collectQueryValues(c, "player_tags")
		result := make([]map[string]any, 0, len(values))
		for _, value := range values {
			tag := fixTag(value)
			player, _ := v1PlayerCurrent(c, a, tag)
			clanTag := stringValue(player["clan_tag"])
			raid := map[string]any{}
			_ = a.Store.SQL.QueryRow(c.UserContext(), `
				SELECT attack_count, attack_limit + bonus_attack_limit
				FROM capital_raid_members
				WHERE player_tag = $1
				ORDER BY start_time DESC
				LIMIT 1
			`, tag).Scan(mapScanInt(raid, "attacks_done"), mapScanInt(raid, "attack_limit"))
			war, _ := v1CurrentWarTimer(c, a, tag)
			result = append(result, map[string]any{
				"player_tag":   tag,
				"current_clan": clanTag,
				"legends":      nestedMap(player["legends"])[currentLegendDate()],
				"clan_games":   nestedMap(player["clan_games"])[currentGamesSeason()],
				"season_pass":  nestedMap(player["season_pass"])[currentGamesSeason()],
				"last_active":  player["last_online"],
				"raids":        raid,
				"war":          war,
				"cwl":          map[string]any{},
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": result})
	}
}

// playerFullSearch godoc
// @Summary Full player search
// @Description Searches tracked players by name with optional filters.
// @Tags Legacy Player
// @Produce json
// @Param name path string true "Player name search"
// @Param limit query int false "Maximum number of rows"
// @Param role query string false "Role filter"
// @Param league query string false "League filter"
// @Param townhall query string false "Town hall range as min,max"
// @Param exp query string false "Experience range as min,max"
// @Param trophies query string false "Trophy range as min,max"
// @Param donations query string false "Donation range as min,max"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /player/full-search/{name} [get]
func playerFullSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		limit := clamp(queryInt(c, "limit", 25), 1, 1000)
		role := c.Query("role")
		league := c.Query("league")
		townhallRange := parseRange(c.Query("townhall"))
		expRange := parseRange(c.Query("exp"))
		trophiesRange := parseRange(c.Query("trophies"))
		donationsRange := parseRange(c.Query("donations"))
		re := regexp.MustCompile("(?i)" + regexp.QuoteMeta(name))
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, name, townhall_level, clan_tag, data
			FROM player_current_stats
			WHERE name ILIKE '%' || $1 || '%'
			ORDER BY name
			LIMIT $2
		`, name, limit*2)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var tag, playerName string
			var th pgtype.Int4
			var clanTag pgtype.Text
			var raw []byte
			if err := rows.Scan(&tag, &playerName, &th, &clanTag, &raw); err != nil {
				return err
			}
			item := jsonObject(raw)
			if !re.MatchString(playerName) {
				continue
			}
			if role != "" && stringValue(item["role"]) != role {
				continue
			}
			if league != "" && stringValue(nestedMap(item["league"])["name"]) != league {
				continue
			}
			if !rangeOK(intValue(firstNonNil(item["townhall"], th.Int32)), townhallRange) ||
				!rangeOK(intValue(item["expLevel"]), expRange) ||
				!rangeOK(intValue(item["trophies"]), trophiesRange) ||
				!rangeOK(intValue(item["donations"]), donationsRange) {
				continue
			}
			item["tag"] = tag
			item["name"] = playerName
			if th.Valid {
				item["townhall"] = th.Int32
			}
			if clanTag.Valid {
				item["clan_tag"] = clanTag.String
			}
			items = append(items, item)
			if len(items) >= limit {
				break
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

func rankingByDate(a apptypes.Deps, rankingType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var raw []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT data
			FROM ranking_snapshots
			WHERE ranking_type = $1 AND location = $2 AND snapshot_date = $3
		`, rankingType, c.Params("location"), c.Params("date")).Scan(&raw)
		if err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.JSON(c, http.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, http.StatusOK, jsonValue(raw, nil))
	}
}

func collectQueryValues(c *fiber.Ctx, key string) []string {
	values := make([]string, 0)
	c.Context().QueryArgs().VisitAll(func(k, v []byte) {
		if string(k) == key {
			values = append(values, string(v))
		}
	})
	if len(values) == 0 {
		if raw := c.Query(key); raw != "" {
			for _, part := range strings.Split(raw, ",") {
				part = strings.TrimSpace(part)
				if part != "" {
					values = append(values, part)
				}
			}
		}
	}
	return values
}

func sendJSONFile(c *fiber.Ctx, path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return apptypes.Error(http.StatusNotFound, "file not found")
	}
	c.Type("json")
	return c.Send(content)
}

func loadStaticData() (map[string]any, error) {
	content, err := os.ReadFile(staticDataPath)
	if err != nil {
		return nil, apptypes.Error(http.StatusNotFound, "static data file not found")
	}
	var out map[string]any
	if err := json.Unmarshal(content, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func parseSeasonWindow(startSeason, endSeason string) (time.Time, time.Time, error) {
	if len(startSeason) != 7 || len(endSeason) != 7 {
		return time.Time{}, time.Time{}, apptypes.Error(http.StatusBadRequest, "invalid season format")
	}
	startYear, _ := strconv.Atoi(startSeason[:4])
	startMonth, _ := strconv.Atoi(startSeason[5:])
	endYear, _ := strconv.Atoi(endSeason[:4])
	endMonth, _ := strconv.Atoi(endSeason[5:])
	start := time.Date(startYear, time.Month(startMonth), 1, 5, 0, 0, 0, time.UTC).AddDate(0, -1, 0)
	end := time.Date(endYear, time.Month(endMonth), 1, 5, 0, 0, 0, time.UTC)
	return start, end, nil
}

func currentLegendDate() string {
	now := time.Now().UTC()
	if now.Hour() < 5 {
		now = now.AddDate(0, 0, -1)
	}
	return now.Format("2006-01-02")
}

func currentGamesSeason() string {
	now := time.Now().UTC()
	return fmt.Sprintf("%04d-%02d", now.Year(), int(now.Month()))
}

func currentSeason() string {
	return currentGamesSeason()
}

func parseRange(raw string) [2]int {
	if raw == "" {
		return [2]int{-1, -1}
	}
	parts := strings.SplitN(raw, ",", 2)
	if len(parts) != 2 {
		return [2]int{-1, -1}
	}
	a, errA := strconv.Atoi(parts[0])
	b, errB := strconv.Atoi(parts[1])
	if errA != nil || errB != nil {
		return [2]int{-1, -1}
	}
	return [2]int{a, b}
}

func rangeOK(value int, bounds [2]int) bool {
	if bounds[0] == -1 && bounds[1] == -1 {
		return true
	}
	return value >= bounds[0] && value <= bounds[1]
}

func asMapSlice(value any) []map[string]any {
	switch typed := value.(type) {
	case []map[string]any:
		return typed
	case []any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

func nestedMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	switch typed := value.(type) {
	case map[string]any:
		return typed
	default:
		return map[string]any{}
	}
}

func cloneMap(value any) map[string]any {
	out := map[string]any{}
	if typed, ok := value.(map[string]any); ok {
		for k, v := range typed {
			out[k] = v
		}
	}
	return out
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func clamp(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func jsonObject(raw []byte) map[string]any {
	value := jsonValue(raw, map[string]any{})
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func jsonValue(raw []byte, fallback any) any {
	if len(raw) == 0 {
		return fallback
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil || out == nil {
		return fallback
	}
	return out
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

type mapIntScanner struct {
	target map[string]any
	key    string
}

func mapScanInt(target map[string]any, key string) *mapIntScanner {
	return &mapIntScanner{target: target, key: key}
}

func (s *mapIntScanner) Scan(src any) error {
	s.target[s.key] = intValue(src)
	return nil
}

func scanLegendCurrent(rows pgx.Rows) []map[string]any {
	items := []map[string]any{}
	for rows.Next() {
		var tag, name, clanTag, clanName string
		var rank, trophies int
		var raw []byte
		if rows.Scan(&tag, &rank, &trophies, &name, &clanTag, &clanName, &raw) != nil {
			continue
		}
		item := jsonObject(raw)
		item["tag"] = tag
		item["rank"] = rank
		item["trophies"] = trophies
		item["name"] = name
		item["clan_tag"] = clanTag
		item["clan_name"] = clanName
		items = append(items, item)
	}
	return items
}

func scanLegendHistory(rows pgx.Rows) []map[string]any {
	items := []map[string]any{}
	for rows.Next() {
		var season, tag string
		var rank, trophies int
		var raw []byte
		if rows.Scan(&season, &tag, &rank, &trophies, &raw) != nil {
			continue
		}
		item := jsonObject(raw)
		item["season"] = season
		item["tag"] = tag
		item["rank"] = rank
		item["trophies"] = trophies
		items = append(items, item)
	}
	return items
}

func sortMapsByNumeric(items []map[string]any, field string, descending bool) {
	sort.SliceStable(items, func(i, j int) bool {
		iv := floatValue(items[i][field])
		jv := floatValue(items[j][field])
		if descending {
			return iv > jv
		}
		return iv < jv
	})
}
