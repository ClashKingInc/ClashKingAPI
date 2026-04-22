package v2

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// playerNormalizeTag converts a raw tag string to #TAG format.
func playerNormalizeTag(tag string) string {
	tag = strings.ToUpper(strings.TrimSpace(tag))
	tag = strings.TrimLeft(tag, "#!")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

// playerTagsFromBody decodes a JSON body with a "player_tags" array.
func playerTagsFromBody(c *fiber.Ctx) ([]string, error) {
	var body modelsv2.PlayerTagsRequest
	if err := apptypes.DecodeJSON(c, &body); err != nil {
		return nil, err
	}
	tags := make([]string, 0, len(body.PlayerTags))
	for _, t := range body.PlayerTags {
		if n := playerNormalizeTag(t); n != "" {
			tags = append(tags, n)
		}
	}
	return tags, nil
}

// playerDotGet traverses a map[string]any using dot-notation (e.g., "league.name").
func playerDotGet(data map[string]any, path string) any {
	keys := strings.Split(path, ".")
	var cur any = data
	for _, key := range keys {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = m[key]
	}
	return cur
}

// playerToFloat converts any numeric-ish value to float64 for sorting.
func playerToFloat(v any) float64 {
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
	default:
		return 0
	}
}

// playerStructToMap converts a CoC API player struct to map[string]any via JSON round-trip.
func playerStructToMap(v any) map[string]any {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}
	return m
}

// playersLocation returns location info for a list of players.
//
// @Summary Get locations for a list of players
// @Tags Player
// @Accept json
// @Produce json
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/location [post]
func playersLocation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		proj := options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "country_name": 1, "country_code": 1})
		cur, err := a.Store.C.LeaderboardDB.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}}, proj)
		if err != nil {
			return err
		}
		var items []bson.M
		if err := cur.All(c.UserContext(), &items); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items)})
	}
}

// playersSorted returns players sorted by any CoC API attribute.
//
// @Summary Get players sorted by an attribute
// @Tags Player
// @Accept json
// @Produce json
// @Param attribute path string true "Attribute path (dot notation, e.g. trophies or league.name)"
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/sorted/{attribute} [post]
func playersSorted(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		attribute := c.Params("attribute")
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		var mu sync.Mutex
		var wg sync.WaitGroup
		results := make([]modelsv2.PlayerSortedItem, 0, len(tags))

		for _, tag := range tags {
			wg.Add(1)
			go func(t string) {
				defer wg.Done()
				player, err := a.Clash.GetPlayer(c.UserContext(), t)
				if err != nil || player == nil {
					return
				}
				pm := playerStructToMap(player)
				if pm == nil {
					return
				}
				var val any
				if attribute == "cumulative_heroes" {
					total := 0
					if heroes, ok := pm["heroes"].([]any); ok {
						for _, h := range heroes {
							if hm, ok := h.(map[string]any); ok {
								if hm["village"] == "home" {
									total += int(playerToFloat(hm["level"]))
								}
							}
						}
					}
					val = total
				} else {
					val = playerDotGet(pm, attribute)
				}
				clan := map[string]any{}
				if cm, ok := pm["clan"].(map[string]any); ok {
					clan = cm
				}
				mu.Lock()
				results = append(results, modelsv2.PlayerSortedItem{
					Name:  player.Name,
					Tag:   player.Tag,
					Value: val,
					Clan:  clan,
				})
				mu.Unlock()
			}(tag)
		}
		wg.Wait()

		sort.Slice(results, func(i, j int) bool {
			vi, vj := results[i].Value, results[j].Value
			if vi == nil && vj == nil {
				return false
			}
			if vi == nil {
				return false
			}
			if vj == nil {
				return true
			}
			return playerToFloat(vi) > playerToFloat(vj)
		})

		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

// playersSummaryTop returns top performers in various stats categories for a season.
//
// @Summary Get summary of top stats for a list of players
// @Tags Player
// @Accept json
// @Produce json
// @Param season path string true "Season (e.g. 2024-01)"
// @Param limit query int false "Max players per category (default 10)"
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/summary/{season}/top [post]
func playersSummaryTop(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := c.Params("season")
		limit := c.QueryInt("limit", 10)
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}

		type catEntry struct {
			Tag   string `json:"tag"`
			Value any    `json:"value"`
			Count int    `json:"count"`
		}

		newData := map[string][]catEntry{}

		type option struct {
			path string
			name string
		}
		opts := []option{
			{path: "gold." + season, name: "gold"},
			{path: "elixir." + season, name: "elixir"},
			{path: "dark_elixir." + season, name: "dark_elixir"},
			{path: "activity." + season, name: "activity"},
			{path: "attack_wins." + season, name: "attack_wins"},
			{path: "season_trophies." + season, name: "season_trophies"},
			{path: "donations." + season + ".donated", name: "donated"},
			{path: "donations." + season + ".received", name: "received"},
		}

		for _, opt := range opts {
			sorted := make([]bson.M, len(rows))
			copy(sorted, rows)
			sort.Slice(sorted, func(i, j int) bool {
				vi := playerToFloat(playerDotGet(sorted[i], opt.path))
				vj := playerToFloat(playerDotGet(sorted[j], opt.path))
				return vi > vj
			})
			top := sorted
			if len(top) > limit {
				top = top[:limit]
			}
			entries := make([]catEntry, 0, len(top))
			for count, row := range top {
				entries = append(entries, catEntry{
					Tag:   serverAsString(row["tag"]),
					Value: playerDotGet(row, opt.path),
					Count: count + 1,
				})
			}
			newData[opt.name] = entries
		}

		// War stars aggregation via ClanWars collection
		pipeline := bson.A{
			bson.M{"$match": bson.M{
				"$or": bson.A{
					bson.M{"data.clan.members.tag": bson.M{"$in": tags}},
					bson.M{"data.opponent.members.tag": bson.M{"$in": tags}},
				},
				"type": bson.M{"$ne": "friendly"},
			}},
			bson.M{"$project": bson.M{
				"_id": 0,
				"uniqueKey": bson.M{"$concat": bson.A{
					bson.M{"$cond": bson.M{
						"if":   bson.M{"$lt": bson.A{"$data.clan.tag", "$data.opponent.tag"}},
						"then": "$data.clan.tag",
						"else": "$data.opponent.tag",
					}},
					bson.M{"$cond": bson.M{
						"if":   bson.M{"$lt": bson.A{"$data.opponent.tag", "$data.clan.tag"}},
						"then": "$data.opponent.tag",
						"else": "$data.clan.tag",
					}},
					"$data.preparationStartTime",
				}},
				"data": 1,
			}},
			bson.M{"$group": bson.M{"_id": "$uniqueKey", "data": bson.M{"$first": "$data"}}},
			bson.M{"$project": bson.M{"members": bson.M{"$concatArrays": bson.A{"$data.clan.members", "$data.opponent.members"}}}},
			bson.M{"$unwind": "$members"},
			bson.M{"$match": bson.M{"members.tag": bson.M{"$in": tags}}},
			bson.M{"$project": bson.M{
				"_id":        0,
				"tag":        "$members.tag",
				"totalStars": bson.M{"$sum": "$members.attacks.stars"},
			}},
			bson.M{"$group": bson.M{
				"_id":        "$tag",
				"totalStars": bson.M{"$sum": "$totalStars"},
			}},
			bson.M{"$sort": bson.M{"totalStars": -1}},
			bson.M{"$limit": limit},
		}
		warCur, err := a.Store.C.ClanWars.Aggregate(c.UserContext(), pipeline)
		if err == nil {
			var warResults []bson.M
			if err := warCur.All(c.UserContext(), &warResults); err == nil {
				warEntries := make([]catEntry, 0, len(warResults))
				for count, r := range warResults {
					warEntries = append(warEntries, catEntry{
						Tag:   serverAsString(r["_id"]),
						Value: r["totalStars"],
						Count: count + 1,
					})
				}
				newData["war_stars"] = warEntries
			}
		}

		items := make([]map[string]any, 0, len(newData))
		for key, val := range newData {
			items = append(items, map[string]any{key: val})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playersBasic returns basic CoC API data for multiple players.
//
// @Summary Get basic API data for multiple players
// @Tags Player
// @Accept json
// @Produce json
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players [post]
func playersBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		var mu sync.Mutex
		var wg sync.WaitGroup
		items := make([]map[string]any, 0, len(tags))

		for _, tag := range tags {
			wg.Add(1)
			go func(t string) {
				defer wg.Done()
				player, err := a.Clash.GetPlayer(c.UserContext(), t)
				if err != nil || player == nil {
					return
				}
				pm := playerStructToMap(player)
				if pm == nil {
					return
				}
				mu.Lock()
				items = append(items, pm)
				mu.Unlock()
			}(tag)
		}
		wg.Wait()

		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playersExtended returns comprehensive player data combining API and tracking stats.
//
// @Summary Get comprehensive stats for multiple players
// @Tags Player
// @Accept json
// @Produce json
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/extended [post]
func playersExtended(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		// Fetch tracking stats from MongoDB
		proj := options.Find().SetProjection(bson.M{
			"_id": 0, "tag": 1, "donations": 1, "clan_games": 1,
			"season_pass": 1, "activity": 1, "last_online": 1, "last_online_time": 1,
			"attack_wins": 1, "dark_elixir": 1, "gold": 1, "capital_gold": 1,
			"season_trophies": 1, "last_updated": 1, "legends": 1,
		})
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}}, proj)
		if err != nil {
			return err
		}
		var statsDocs []bson.M
		if err := cur.All(c.UserContext(), &statsDocs); err != nil {
			return err
		}
		statsMap := make(map[string]bson.M, len(statsDocs))
		for _, doc := range statsDocs {
			if tag, ok := doc["tag"].(string); ok {
				statsMap[tag] = doc
			}
		}

		var mu sync.Mutex
		var wg sync.WaitGroup
		items := make([]map[string]any, 0, len(tags))

		for _, tag := range tags {
			wg.Add(1)
			go func(t string) {
				defer wg.Done()
				player, err := a.Clash.GetPlayer(c.UserContext(), t)
				if err != nil || player == nil {
					return
				}
				pm := playerStructToMap(player)
				if pm == nil {
					return
				}
				// Merge tracking stats
				if stats, ok := statsMap[t]; ok {
					for k, v := range stats {
						if k != "tag" {
							pm[k] = v
						}
					}
				}
				mu.Lock()
				items = append(items, pm)
				mu.Unlock()
			}(tag)
		}
		wg.Wait()

		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playerExtendedSingle returns comprehensive data for a single player.
//
// @Summary Get comprehensive stats for single player
// @Tags Player
// @Accept json
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param clan_tag query string false "Optional clan tag for context"
// @Success 200 {object} map[string]interface{}
// @Router /v2/player/{player_tag}/extended [get]
func playerExtendedSingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "player_tag is required")
		}

		proj := options.FindOne().SetProjection(bson.M{
			"_id": 0, "tag": 1, "donations": 1, "clan_games": 1,
			"season_pass": 1, "activity": 1, "last_online": 1, "last_online_time": 1,
			"attack_wins": 1, "dark_elixir": 1, "gold": 1, "capital_gold": 1,
			"season_trophies": 1, "last_updated": 1, "legends": 1,
		})
		var statsDoc bson.M
		_ = a.Store.C.PlayerStats.FindOne(c.UserContext(), bson.M{"tag": tag}, proj).Decode(&statsDoc)

		player, err := a.Clash.GetPlayer(c.UserContext(), tag)
		if err != nil || player == nil {
			return apptypes.Error(http.StatusNotFound, "player not found")
		}
		pm := playerStructToMap(player)
		if pm == nil {
			return apptypes.Error(http.StatusInternalServerError, "failed to process player data")
		}
		for k, v := range statsDoc {
			if k != "tag" {
				pm[k] = v
			}
		}
		return apptypes.JSON(c, http.StatusOK, pm)
	}
}

// playersLegendDays returns legend league daily statistics for multiple players.
//
// @Summary Get legend league statistics for multiple players
// @Tags Player
// @Accept json
// @Produce json
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/legend-days [post]
func playersLegendDays(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		proj := options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "legends": 1})
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}}, proj)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}

		items := make([]modelsv2.PlayerLegendDaysItem, 0, len(rows))
		for _, row := range rows {
			tag, _ := row["tag"].(string)
			items = append(items, modelsv2.PlayerLegendDaysItem{
				Tag:             tag,
				LegendsBySeason: row["legends"],
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playersLegendRankings returns historical legend league rankings for multiple players.
//
// @Summary Get historical legend league rankings for multiple players
// @Tags Player
// @Accept json
// @Produce json
// @Param limit query int false "Max rankings per player (default 10)"
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
// @Router /v2/players/legend_rankings [post]
func playersLegendRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit := c.QueryInt("limit", 10)
		tags, err := playerTagsFromBody(c)
		if err != nil {
			return err
		}
		if len(tags) == 0 {
			return apptypes.Error(http.StatusBadRequest, "player_tags cannot be empty")
		}

		historyCol := a.Store.DB.RankingHistory.Collection("history_db")
		items := make([]modelsv2.PlayerLegendRankingItem, 0, len(tags))

		for _, tag := range tags {
			findOpts := options.Find().SetSort(bson.M{"season": -1}).SetLimit(int64(limit))
			cur, err := historyCol.Find(c.UserContext(), bson.M{"tag": tag}, findOpts)
			if err != nil {
				items = append(items, modelsv2.PlayerLegendRankingItem{Tag: tag, Rankings: []any{}})
				continue
			}
			var rankDocs []bson.M
			if err := cur.All(c.UserContext(), &rankDocs); err != nil {
				items = append(items, modelsv2.PlayerLegendRankingItem{Tag: tag, Rankings: []any{}})
				continue
			}
			sanitized := sanitize(rankDocs)
			var rankingsAny []any
			if arr, ok := sanitized.([]bson.M); ok {
				rankingsAny = make([]any, len(arr))
				for i, r := range arr {
					rankingsAny[i] = r
				}
			}
			if rankingsAny == nil {
				rankingsAny = []any{}
			}
			items = append(items, modelsv2.PlayerLegendRankingItem{Tag: tag, Rankings: rankingsAny})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}
