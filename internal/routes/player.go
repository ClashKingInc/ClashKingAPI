package routes

import (
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
