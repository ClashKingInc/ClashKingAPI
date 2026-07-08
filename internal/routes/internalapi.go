package routes

import (
	"context"
	"encoding/json"
	"runtime"
	"sort"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// botInfo godoc
// @Summary Get bot info
// @Description Returns internal bot cluster stats, system info, and database document counts.
// @Tags Other
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/internal/bot/info [get]
func botInfo(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		rows, err := a.Store.SQL.Query(ctx, `
			SELECT cluster_id, shard_ids, server_count, member_count, clan_count, servers, data
			FROM bot_sync_status
			WHERE bot_id = $1
		`, "824653933347209227")
		if err != nil {
			return err
		}
		var shardData []map[string]any
		defer rows.Close()
		for rows.Next() {
			var clusterID int
			var shardIDs []int
			var serverCount, memberCount, clanCount int
			var serversRaw, dataRaw []byte
			if err := rows.Scan(&clusterID, &shardIDs, &serverCount, &memberCount, &clanCount, &serversRaw, &dataRaw); err != nil {
				return err
			}
			doc := map[string]any{}
			_ = json.Unmarshal(dataRaw, &doc)
			var servers any
			_ = json.Unmarshal(serversRaw, &servers)
			doc["cluster_id"] = clusterID
			doc["shards"] = shardIDs
			doc["shard_ids"] = shardIDs
			doc["server_count"] = serverCount
			doc["member_count"] = memberCount
			doc["clan_count"] = clanCount
			doc["servers"] = servers
			shardData = append(shardData, doc)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		sort.SliceStable(shardData, func(i, j int) bool {
			return toInt(shardData[i]["cluster_id"]) < toInt(shardData[j]["cluster_id"])
		})

		totalServers := int64(0)
		totalMembers := int64(0)
		totalClans := int64(0)
		totalShards := 0
		for _, shard := range shardData {
			totalServers += int64(toInt(shard["server_count"]))
			totalMembers += int64(toInt(shard["member_count"]))
			totalClans += int64(toInt(shard["clan_count"]))
			totalShards += sliceLen(shard["shards"])
		}

		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)

		dbStats := sqlInternalCounts(ctx, a)

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"bot": map[string]any{
				"total_servers": totalServers,
				"total_members": totalMembers,
				"total_clans":   totalClans,
				"total_shards":  totalShards,
				"clusters":      shardData,
			},
			"system": map[string]any{
				"python_version":     runtime.Version(),
				"go_version":         runtime.Version(),
				"platform":           runtime.GOOS + "/" + runtime.GOARCH,
				"cpu_percent":        0.0,
				"memory_used_mb":     float64(mem.Alloc) / 1024 / 1024,
				"memory_total_gb":    0.0,
				"memory_percent":     0.0,
				"disk_usage_percent": 0.0,
			},
			"database": dbStats,
		})
	}
}

func sqlInternalCounts(ctx context.Context, a apptypes.Deps) map[string]any {
	queries := map[string]string{
		"clans_tracked":   `SELECT count(*) FROM server_clans`,
		"players_tracked": `SELECT count(*) FROM player_current_stats`,
		"wars_stored":     `SELECT count(*) FROM war_log_index`,
		"tickets_open":    `SELECT count(*) FROM tickets WHERE closed_at IS NULL`,
		"capital_raids":   `SELECT count(*) FROM raid_weekends`,
	}
	out := map[string]any{}
	for key, query := range queries {
		var count int64
		_ = a.Store.SQL.QueryRow(ctx, query).Scan(&count)
		out[key] = count
	}
	return out
}

func toInt(value any) int {
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

func sliceLen(value any) int {
	switch typed := value.(type) {
	case []any:
		return len(typed)
	default:
		return 0
	}
}
