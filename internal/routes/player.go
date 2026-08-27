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
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
)

// playerWarAttacks godoc
// @Summary Get player war attacks
// @Description Returns stored attacks and defenses involving a player, most recent first.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param type query string false "War type" Enums(cwl,random,friendly)
// @Param time[after] query string false "Only include attacks at or after this ISO-8601 time"
// @Param time[before] query string false "Only include attacks at or before this ISO-8601 time"
// @Param limit query int false "Maximum attacks to return" default(50) minimum(1) maximum(500)
// @Success 200 {object} modelsv2.PlayerWarAttacksResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/war/attacks [get]
func playerWarAttacks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := warFixTag(c.Params("player_tag"))
		warType := strings.ToLower(strings.TrimSpace(c.Query("type")))
		if warType != "" && warType != "cwl" && warType != "random" && warType != "friendly" {
			return apptypes.Error(http.StatusBadRequest, "invalid type")
		}
		start, end, err := v2TimeWindowFromQuery(c, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC())
		if err != nil {
			return err
		}
		limit, err := v2QueryInt(c, "limit", 50)
		if err != nil || limit < 1 {
			return apptypes.Error(http.StatusBadRequest, "invalid limit")
		}
		limit = clamp(limit, 1, 500)
		wars, err := sqlWarsForPlayersContext(c.UserContext(), a, []string{tag}, start, end)
		if err != nil {
			return err
		}
		var attacks []sqlWarAttackRow
		for warID, war := range wars {
			if warType != "" && war.Type != warType {
				continue
			}
			for _, attack := range wararchive.Attacks(warID, war) {
				if attack.AttackerTag == tag || attack.DefenderTag == tag {
					attacks = append(attacks, sqlWarAttackFromArchive(attack))
				}
			}
		}
		sort.Slice(attacks, func(i, j int) bool {
			if attacks[i].WarEndTime.Equal(attacks[j].WarEndTime) {
				return attacks[i].AttackOrder > attacks[j].AttackOrder
			}
			return attacks[i].WarEndTime.After(attacks[j].WarEndTime)
		})
		if len(attacks) > limit {
			attacks = attacks[:limit]
		}
		items := make([]map[string]any, 0, len(attacks))
		for _, attack := range attacks {
			items = append(items, sqlWarAttackMap(attack, tag))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
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

// playerDotGet traverses a map[string]any using dot-notation (e.g., "leagueTier.name").
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
// @Param attribute path string true "Attribute path (dot notation, e.g. trophies or leagueTier.name)"
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
