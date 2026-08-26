package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

var staticDataPath = filepath.Join(".venv", "lib", "python3.13", "site-packages", "coc", "static", "static_data.json")

// builderBaseLeagues godoc
// @Summary Get builder base leagues
// @Description Returns legacy builder base league metadata.
// @Tags Other
// @Produce json
// @Success 200 {object} modelsv2.BuilderBaseLeaguesResponse
// @Failure 404 {object} modelsv2.ErrorResponse
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

// globalCounts godoc
// @Summary Get global ClashKing counts
// @Description Returns global tracking counts used by legacy clients.
// @Tags Global
// @Produce json
// @Success 200 {object} modelsv2.GlobalCountsResponse
// @Router /global/counts [get]
func globalCounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var playersInWar, clansInWar, totalJoinLeaves, playersInLegends, playerCount, clanCount, warsStored int64
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT players_in_war, clans_in_war, total_join_leaves, players_in_legends,
				player_count, clan_count, wars_stored
			FROM api_global_counts
			WHERE id = 1
		`).Scan(&playersInWar, &clansInWar, &totalJoinLeaves, &playersInLegends, &playerCount, &clanCount, &warsStored)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"players_in_war":     playersInWar,
			"clans_in_war":       clansInWar,
			"total_join_leaves":  totalJoinLeaves,
			"players_in_legends": playersInLegends,
			"player_count":       playerCount,
			"clan_count":         clanCount,
			"wars_stored":        warsStored,
		})
	}
}

// legendTrophyBuckets godoc
// @Summary Get legend trophy buckets
// @Description Returns histogram buckets for current legend trophy counts.
// @Tags Legacy Legends
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
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

// liveLegendRankings godoc
// @Summary Get live legend rankings
// @Description Returns current legend rankings in the requested rank range.
// @Tags Rankings
// @Produce json
// @Param top_ranking query int false "First rank"
// @Param lower_ranking query int false "Last rank"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
// @Tags Rankings
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
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

func currentGamesSeason() string {
	now := time.Now().UTC()
	return fmt.Sprintf("%04d-%02d", now.Year(), int(now.Month()))
}

func currentSeason() string {
	return currentGamesSeason()
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
