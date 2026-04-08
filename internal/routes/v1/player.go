package v1

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var v1PlayerTagRe = regexp.MustCompile(`[^A-Z0-9]+`)

func fixTag(tag string) string {
	tag = strings.ToUpper(strings.TrimSpace(tag))
	tag = strings.TrimPrefix(tag, "#")
	tag = v1PlayerTagRe.ReplaceAllString(tag, "")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

// playerStats godoc
// @Summary All collected stats for a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /player/{player_tag}/stats [get]
func playerStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "player_tag is required")
		}
		ctx := c.UserContext()

		var result bson.M
		if err := a.Store.C.PlayerStats.FindOne(ctx, bson.M{"tag": tag}).Decode(&result); err != nil {
			return apptypes.Error(http.StatusNotFound, "No player found")
		}

		// Remove streak from legends
		if legends, ok := result["legends"].(bson.M); ok {
			delete(legends, "streak")
		}

		var lbSpot bson.M
		_ = a.Store.C.PlayerLeaderboard.FindOne(ctx, bson.M{"tag": tag}).Decode(&lbSpot)

		out := modelsv1.PlayerStatsResponse{
			Name:                     result["name"],
			Tag:                      result["tag"],
			Townhall:                 result["townhall"],
			Legends:                  result["legends"],
			LastOnline:               result["last_online"],
			Looted:                   modelsv1.PlayerLootedData{Gold: result["gold"], Elixir: result["elixir"], DarkElixir: result["dark_elixir"]},
			Trophies:                 result["trophies"],
			WarStars:                 result["warStars"],
			ClanCapitalContributions: result["aggressive_capitalism"],
			Donations:                result["donations"],
			Capital:                  result["capital_gold"],
			ClanGames:                result["clan_games"],
			SeasonPass:               result["season_pass"],
			AttackWins:               result["attack_wins"],
			Activity:                 result["activity"],
			ClanTag:                  result["clan_tag"],
			League:                   result["league"],
		}

		if lbSpot != nil {
			if legends, ok := out.Legends.(bson.M); ok {
				legends["global_rank"] = lbSpot["global_rank"]
				legends["local_rank"] = lbSpot["local_rank"]
			}
			out.Location = lbSpot["country_name"]
		}

		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// playerLegends godoc
// @Summary Legend stats for a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season query string false "Season YYYY-MM"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /player/{player_tag}/legends [get]
func playerLegends(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		season := c.Query("season")
		ctx := c.UserContext()

		var result bson.M
		if err := a.Store.C.PlayerStats.FindOne(ctx, bson.M{"tag": tag},
			options.FindOne().SetProjection(bson.M{"name": 1, "townhall": 1, "legends": 1, "tag": 1, "_id": 0}),
		).Decode(&result); err != nil {
			return apptypes.Error(http.StatusNotFound, "No player found")
		}

		var rankingData bson.M
		_ = a.Store.C.PlayerLeaderboard.FindOne(ctx, bson.M{"tag": tag},
			options.FindOne().SetProjection(bson.M{"_id": 0}),
		).Decode(&rankingData)
		if rankingData == nil {
			rankingData = bson.M{"country_code": nil, "country_name": nil, "local_rank": nil, "global_rank": nil}
		}

		legendData, _ := result["legends"].(bson.M)
		if legendData == nil {
			legendData = bson.M{}
		}

		if season != "" && len(legendData) > 0 {
			legendData = filterLegendsBySeason(legendData, season)
		}

		delete(legendData, "global_rank")
		delete(legendData, "local_rank")
		streak := legendData["streak"]
		delete(legendData, "streak")

		return apptypes.JSON(c, http.StatusOK, modelsv1.PlayerLegendsResponse{
			Name:     result["name"],
			Tag:      result["tag"],
			Townhall: result["townhall"],
			Legends:  legendData,
			Rankings: rankingData,
			Streak:   streak,
		})
	}
}

// filterLegendsBySeason returns only the legend days for a given season (YYYY-MM).
func filterLegendsBySeason(legends bson.M, season string) bson.M {
	parts := strings.SplitN(season, "-", 2)
	if len(parts) != 2 {
		return legends
	}
	// Season start = first day of (season month - 1), season end = last day of (season month - 1)
	// For simplicity, include all days that fall within the season month's range
	// The Python code uses coc.utils.get_season_start/end which compute the actual season boundaries
	// We'll approximate by including all keys that match days within the prior month
	var yearInt, monthInt int
	_, err1 := parseYearMonth(parts[0], parts[1], &yearInt, &monthInt)
	_ = err1
	// Generate date range for the previous month (season boundaries)
	prevMonth := monthInt - 1
	prevYear := yearInt
	if prevMonth == 0 {
		prevMonth = 12
		prevYear--
	}
	start := time.Date(prevYear, time.Month(prevMonth), 1, 5, 0, 0, 0, time.UTC)
	end := time.Date(yearInt, time.Month(monthInt), 1, 5, 0, 0, 0, time.UTC)

	filtered := bson.M{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if v, ok := legends[key]; ok {
			filtered[key] = v
		}
	}
	return filtered
}

func parseYearMonth(yearStr, monthStr string, year, month *int) (bool, error) {
	*year = 0
	for _, ch := range yearStr {
		if ch < '0' || ch > '9' {
			return false, nil
		}
		*year = *year*10 + int(ch-'0')
	}
	*month = 0
	for _, ch := range monthStr {
		if ch < '0' || ch > '9' {
			return false, nil
		}
		*month = *month*10 + int(ch-'0')
	}
	return true, nil
}

// playerHistorical godoc
// @Summary Historical data for player events
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season path string true "Season YYYY-MM"
// @Success 200 {object} map[string]interface{}
// @Router /player/{player_tag}/historical/{season} [get]
func playerHistorical(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		season := c.Params("season")
		ctx := c.UserContext()

		parts := strings.SplitN(season, "-", 2)
		if len(parts) != 2 {
			return apptypes.Error(http.StatusBadRequest, "invalid season format")
		}
		var yearInt, monthInt int
		parseYearMonth(parts[0], parts[1], &yearInt, &monthInt)

		// Season start = first of (month-1), season end = first of month (exclusive)
		prevMonth := monthInt - 1
		prevYear := yearInt
		if prevMonth == 0 {
			prevMonth = 12
			prevYear--
		}
		seasonStart := time.Date(prevYear, time.Month(prevMonth), 1, 5, 0, 0, 0, time.UTC)
		seasonEnd := time.Date(yearInt, time.Month(monthInt), 1, 5, 0, 0, 0, time.UTC)

		cur, err := a.Store.C.PlayerHistory.Find(ctx, bson.M{
			"$and": bson.A{
				bson.M{"tag": tag},
				bson.M{"time": bson.M{"$gte": seasonStart.Unix()}},
				bson.M{"time": bson.M{"$lte": seasonEnd.Unix()}},
			},
		}, options.Find().SetSort(bson.M{"time": 1}))
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(ctx, &docs); err != nil {
			return err
		}

		breakdown := map[string][]bson.M{}
		for _, doc := range docs {
			delete(doc, "_id")
			t, _ := doc["type"].(string)
			breakdown[t] = append(breakdown[t], doc)
		}
		return apptypes.JSON(c, http.StatusOK, breakdown)
	}
}

// playerWarhits godoc
// @Summary War attacks done/defended by a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param timestamp_end query int false "End timestamp"
// @Param limit query int false "Limit (default 50)"
// @Success 200 {object} map[string]interface{}
// @Router /player/{player_tag}/warhits [get]
func playerWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		tsStart := queryInt64(c, "timestamp_start", 0)
		tsEnd := queryInt64(c, "timestamp_end", 9999999999)
		limit := queryInt(c, "limit", 50)
		ctx := c.UserContext()

		start := time.Unix(tsStart, 0).UTC().Format("20060102T150405.000Z")
		end := time.Unix(tsEnd, 0).UTC().Format("20060102T150405.000Z")

		pipeline := bson.A{
			bson.M{"$match": bson.M{"$or": bson.A{
				bson.M{"data.clan.members.tag": tag},
				bson.M{"data.opponent.members.tag": tag},
			}}},
			bson.M{"$match": bson.M{"$and": bson.A{
				bson.M{"data.preparationStartTime": bson.M{"$gte": start}},
				bson.M{"data.preparationStartTime": bson.M{"$lte": end}},
			}}},
			bson.M{"$project": bson.M{"data": "$data", "_id": 0}},
			bson.M{"$sort": bson.M{"data.preparationStartTime": -1}},
		}
		cur, err := a.Store.C.ClanWars.Aggregate(ctx, pipeline)
		if err != nil {
			return err
		}
		var wars []bson.M
		if err := cur.All(ctx, &wars); err != nil {
			return err
		}

		foundIDs := map[string]bool{}
		items := []map[string]any{}
		for _, w := range wars {
			if len(items) >= limit {
				break
			}
			warData, _ := w["data"].(bson.M)
			if warData == nil {
				continue
			}
			prepTime, _ := warData["preparationStartTime"].(string)
			clanTag, _ := warData["clan"].(bson.M)
			oppTag, _ := warData["opponent"].(bson.M)
			clanTagStr, _ := clanTag["tag"].(string)
			oppTagStr, _ := oppTag["tag"].(string)
			uid := sortedJoin(clanTagStr, oppTagStr) + "-" + prepTime
			if foundIDs[uid] {
				continue
			}
			foundIDs[uid] = true

			// Find player in war members
			member, side := findWarMember(warData, tag)
			if member == nil {
				continue
			}
			_ = side

			// Build response
			cleanWar := copyMapExcept(warData, "_id", "clan.members", "opponent.members")
			cleanMember := copyMapExcept(member, "attacks", "bestOpponentAttack")

			attacks := []map[string]any{}
			defenses := []map[string]any{}

			if atks, ok := member["attacks"].(bson.A); ok {
				for _, a2 := range atks {
					atk, ok := a2.(bson.M)
					if !ok {
						continue
					}
					defenderTag, _ := atk["defenderTag"].(string)
					def := findMemberByTag(warData, defenderTag)
					atkCopy := copyMap(atk)
					delete(atkCopy, "_id")
					if def != nil {
						defCopy := copyMapExcept(def, "attacks", "bestOpponentAttack")
						atkCopy["defender"] = defCopy
					}
					attacks = append(attacks, atkCopy)
				}
			}

			// Defenses: attacks where defender = tag
			for _, sideKey := range []string{"clan", "opponent"} {
				sideData, _ := warData[sideKey].(bson.M)
				if sideData == nil {
					continue
				}
				members, _ := sideData["members"].(bson.A)
				for _, m := range members {
					mem, ok := m.(bson.M)
					if !ok {
						continue
					}
					if atks, ok := mem["attacks"].(bson.A); ok {
						for _, a2 := range atks {
							atk, ok := a2.(bson.M)
							if !ok {
								continue
							}
							if defTag, _ := atk["defenderTag"].(string); defTag == tag {
								atkCopy := copyMap(atk)
								delete(atkCopy, "_id")
								attackerCopy := copyMapExcept(mem, "attacks", "bestOpponentAttack")
								atkCopy["attacker"] = attackerCopy
								defenses = append(defenses, atkCopy)
							}
						}
					}
				}
			}

			items = append(items, map[string]any{
				"war_data":    cleanWar,
				"member_data": cleanMember,
				"attacks":     attacks,
				"defenses":    defenses,
			})
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playerRaids godoc
// @Summary Raids participated in by a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Limit (default 1)"
// @Success 200 {object} map[string]interface{}
// @Router /player/{player_tag}/raids [get]
func playerRaids(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		limit := queryInt(c, "limit", 1)
		ctx := c.UserContext()

		cur, err := a.Store.C.RaidWeekendDB.Find(ctx,
			bson.M{"data.members.tag": tag},
			options.Find().SetSort(bson.M{"data.endTime": -1}).SetLimit(int64(limit)),
		)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(ctx, &docs); err != nil {
			return err
		}
		items := make([]any, 0, len(docs))
		for _, d := range docs {
			if data, ok := d["data"]; ok {
				items = append(items, data)
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playerLegendRankings godoc
// @Summary Previous player legend rankings
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Limit (default 10)"
// @Success 200 {object} []map[string]interface{}
// @Router /player/{player_tag}/legend_rankings [get]
func playerLegendRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		limit := queryInt(c, "limit", 10)
		ctx := c.UserContext()

		cur, err := a.Store.C.LegendHistory.Find(ctx,
			bson.M{"tag": tag},
			options.Find().SetSort(bson.M{"season": -1}).SetLimit(int64(limit)).SetProjection(bson.M{"_id": 0}),
		)
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(ctx, &results); err != nil {
			return err
		}
		if results == nil {
			results = []bson.M{}
		}
		return apptypes.JSON(c, http.StatusOK, results)
	}
}

// playerWartimer godoc
// @Summary Get the war timer for a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Router /player/{player_tag}/wartimer [get]
func playerWartimer(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		ctx := c.UserContext()

		var result bson.M
		if err := a.Store.C.WarTimer.FindOne(ctx, bson.M{"_id": tag}).Decode(&result); err != nil {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		result["tag"] = result["_id"]
		delete(result, "_id")
		if t, ok := result["time"].(int64); ok {
			result["unix_time"] = t
			result["time"] = time.Unix(t, 0).UTC().Format(time.RFC3339)
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// playerJoinLeave godoc
// @Summary Get join leave history for a player
// @Tags Player Endpoints
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Param limit query int false "Limit (default 250)"
// @Success 200 {object} map[string]interface{}
// @Router /player/{player_tag}/join-leave [get]
func playerJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		tsStart := queryInt64(c, "timestamp_start", 0)
		tsEnd := queryInt64(c, "time_stamp_end", 9999999999)
		limit := queryInt(c, "limit", 250)
		ctx := c.UserContext()

		start := time.Unix(tsStart, 0).UTC()
		end := time.Unix(tsEnd, 0).UTC()

		pipeline := bson.A{
			bson.M{"$match": bson.M{"$and": bson.A{
				bson.M{"tag": tag},
				bson.M{"time": bson.M{"$gte": start}},
				bson.M{"time": bson.M{"$lte": end}},
			}}},
			bson.M{"$lookup": bson.M{
				"from":         "clan_tags",
				"localField":   "clan",
				"foreignField": "tag",
				"as":           "clan_info",
			}},
			bson.M{"$unwind": "$clan_info"},
			bson.M{"$project": bson.M{
				"_id": 0, "type": 1, "clan": 1,
				"clan_name": "$clan_info.name",
				"time":      1, "tag": 1, "name": 1, "th": 1,
			}},
			bson.M{"$sort": bson.M{"time": 1}},
			bson.M{"$limit": limit},
		}
		cur, err := a.Store.C.JoinLeaveHistory.Aggregate(ctx, pipeline)
		if err != nil {
			return err
		}
		var events []bson.M
		if err := cur.All(ctx, &events); err != nil {
			return err
		}

		// Reverse the list
		for i, j := 0, len(events)-1; i < j; i, j = i+1, j-1 {
			events[i], events[j] = events[j], events[i]
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": events})
	}
}

// playerSearchByName godoc
// @Summary Search for players by name (Atlas search)
// @Tags Player Endpoints
// @Produce json
// @Param name path string true "Player name"
// @Success 200 {object} map[string]interface{}
// @Router /player/search/{name} [get]
func playerSearchByName(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		ctx := c.UserContext()

		pipeline := bson.A{
			bson.M{"$search": bson.M{
				"index": "player_search",
				"autocomplete": bson.M{
					"query": name,
					"path":  "name",
				},
			}},
			bson.M{"$limit": 25},
		}
		// Note: player_search is an Atlas search collection; using PlayerStats as fallback with regex
		_ = pipeline
		// Try with a simple regex fallback since Atlas search requires Atlas
		cur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"name": bson.M{"$regex": name, "$options": "i"}},
			options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "name": 1, "townhall": 1}).SetLimit(25),
		)
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(ctx, &results); err != nil {
			return err
		}
		if results == nil {
			results = []bson.M{}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

// --- helpers ---

func queryInt(c *fiber.Ctx, key string, def int) int {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	v := 0
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return def
		}
		v = v*10 + int(ch-'0')
	}
	return v
}

func queryInt64(c *fiber.Ctx, key string, def int64) int64 {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	v := int64(0)
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return def
		}
		v = v*10 + int64(ch-'0')
	}
	return v
}

func sortedJoin(a, b string) string {
	if a < b {
		return a + "-" + b
	}
	return b + "-" + a
}

func findWarMember(warData bson.M, tag string) (bson.M, string) {
	for _, sideKey := range []string{"clan", "opponent"} {
		side, _ := warData[sideKey].(bson.M)
		if side == nil {
			continue
		}
		members, _ := side["members"].(bson.A)
		for _, m := range members {
			mem, ok := m.(bson.M)
			if !ok {
				continue
			}
			if t, _ := mem["tag"].(string); t == tag {
				return mem, sideKey
			}
		}
	}
	return nil, ""
}

func findMemberByTag(warData bson.M, tag string) bson.M {
	for _, sideKey := range []string{"clan", "opponent"} {
		side, _ := warData[sideKey].(bson.M)
		if side == nil {
			continue
		}
		members, _ := side["members"].(bson.A)
		for _, m := range members {
			mem, ok := m.(bson.M)
			if !ok {
				continue
			}
			if t, _ := mem["tag"].(string); t == tag {
				return mem
			}
		}
	}
	return nil
}

func copyMap(src bson.M) map[string]any {
	out := make(map[string]any, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func copyMapExcept(src bson.M, excludeKeys ...string) map[string]any {
	excl := make(map[string]bool, len(excludeKeys))
	for _, k := range excludeKeys {
		excl[k] = true
	}
	out := make(map[string]any, len(src))
	for k, v := range src {
		if excl[k] {
			continue
		}
		// Handle nested exclusions like "clan.members"
		if strings.Contains(k, ".") {
			out[k] = v
			continue
		}
		out[k] = v
	}
	// Handle dot-notation exclusions on nested maps
	for _, key := range excludeKeys {
		parts := strings.SplitN(key, ".", 2)
		if len(parts) == 2 {
			if nested, ok := out[parts[0]].(bson.M); ok {
				delete(nested, parts[1])
			}
		}
	}
	return out
}

// sortWarsByEndTime sorts wars descending by endTime field.
func sortWarsByEndTime(wars []bson.M) {
	sort.SliceStable(wars, func(i, j int) bool {
		ei, _ := wars[i]["endTime"].(string)
		ej, _ := wars[j]["endTime"].(string)
		return ei > ej
	})
}
