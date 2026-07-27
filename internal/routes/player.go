package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

// playerWarAttacks godoc
// @Summary Get player war attacks
// @Description Returns stored attacks and defenses involving a player, most recent first.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param timestamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of rows. Max 500."
// @Success 200 {object} modelsv2.PlayerWarAttacksResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/war/attacks [get]
func playerWarAttacks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := warFixTag(c.Params("player_tag"))
		start := time.Unix(queryInt64(c, "timestamp_start", 0), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		limit := clamp(warParseIntDefault(c.Query("limit"), 50), 1, 500)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT war_id, war_end_time, war_type, war_size, attacking_clan_tag, defending_clan_tag,
				attacker_tag, attacker_name, defender_tag, defender_name, attacker_townhall, defender_townhall,
				attacker_map_position, defender_map_position, stars, destruction_percentage, duration, attack_order,
				battle_modifier
			FROM war_attacks
			WHERE (attacker_tag = $1 OR defender_tag = $1)
				AND war_end_time >= $2
				AND war_end_time <= $3
			ORDER BY war_end_time DESC, attack_order
			LIMIT $4
		`, tag, start, end, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			attack, err := scanSQLWarAttack(rows)
			if err != nil {
				return err
			}
			items = append(items, sqlWarAttackMap(attack, tag))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playerWarStats godoc
// @Summary Get player war stats
// @Description Returns player war performance stats for all, random, friendly, and CWL wars in a time range.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to 90 days ago."
// @Param timestamp_end query int false "End Unix timestamp"
// @Success 200 {object} modelsv2.PlayerWarStatsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/war/stats [get]
func playerWarStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := warFixTag(c.Params("player_tag"))
		start := time.Unix(queryInt64(c, "timestamp_start", time.Now().UTC().Add(-90*24*time.Hour).Unix()), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		stats, err := sqlPlayerWarStats(c, a, tag, start, end)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, stats)
	}
}

// playerNormalizeTag converts a raw tag string to #TAG format.
func playerNormalizeTag(tag string) string {
	tag = decodeRouteTag(tag)
	tag = strings.ToUpper(strings.TrimSpace(tag))
	tag = strings.TrimLeft(tag, "#!")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func decodeRouteTag(tag string) string {
	if decoded, err := url.PathUnescape(tag); err == nil {
		return decoded
	}
	return tag
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

// playersSorted returns players sorted by any CoC API attribute.
//
// @Summary Get players sorted by an attribute
// @Tags Player
// @Accept json
// @Produce json
// @Param attribute path string true "Attribute path (dot notation, e.g. trophies or league.name)"
// @Param body body object true "Player tags list"
// @Success 200 {object} map[string]interface{}
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

		rows, err := playerSeasonStatsByTags(c.UserContext(), a, tags, season)
		if err != nil {
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
			sorted := make([]map[string]any, len(rows))
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

		warRows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT attacker_tag, COALESCE(sum(stars), 0)::bigint AS total_stars
			FROM war_attacks
			WHERE attacker_tag = ANY($1)
			  AND war_type <> 'friendly'
			GROUP BY attacker_tag
			ORDER BY total_stars DESC
			LIMIT $2
		`, tags, limit)
		if err != nil {
			return err
		}
		defer warRows.Close()
		warEntries := []catEntry{}
		count := 1
		for warRows.Next() {
			var tag string
			var stars int64
			if err := warRows.Scan(&tag, &stars); err != nil {
				return err
			}
			warEntries = append(warEntries, catEntry{Tag: tag, Value: stars, Count: count})
			count++
		}
		if err := warRows.Err(); err != nil {
			return err
		}
		newData["war_stars"] = warEntries

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

func playerSeasonStatsByTags(ctx context.Context, a apptypes.Deps, tags []string, season string) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, clan_tag, season, name, townhall_level, donations, clan_games, activity, data, updated_at
		FROM player_season_stats
		WHERE player_tag = ANY($1) AND season = $2
	`, tags, season)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var tag, clanTag, rowSeason, name string
		var townhall pgtype.Int4
		var donationsRaw, clanGamesRaw, activityRaw, dataRaw []byte
		var updatedAt pgtype.Timestamptz
		if err := rows.Scan(&tag, &clanTag, &rowSeason, &name, &townhall, &donationsRaw, &clanGamesRaw, &activityRaw, &dataRaw, &updatedAt); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["tag"] = tag
		item["clan_tag"] = clanTag
		item["season"] = rowSeason
		item["name"] = name
		if townhall.Valid {
			item["townhall"] = townhall.Int32
		}
		item["donations"] = map[string]any{rowSeason: playerDecodeJSONObject(donationsRaw)}
		item["clan_games"] = map[string]any{rowSeason: playerDecodeJSONObject(clanGamesRaw)}
		item["activity"] = map[string]any{rowSeason: playerDecodeJSONValue(activityRaw, 0)}
		if updatedAt.Valid {
			item["last_updated"] = updatedAt.Time
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func playerDecodeJSONObject(raw []byte) map[string]any {
	value := playerDecodeJSONValue(raw, map[string]any{})
	if obj, ok := value.(map[string]any); ok {
		return obj
	}
	return map[string]any{}
}

func playerDecodeJSONValue(raw []byte, fallback any) any {
	if len(raw) == 0 {
		return fallback
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fallback
	}
	if value == nil {
		return fallback
	}
	return value
}
