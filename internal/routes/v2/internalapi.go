package v2

import (
	"context"
	"runtime"
	"sort"
	"sync"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// botInfo godoc
// @Summary Get bot info
// @Description Returns internal bot cluster stats, system info, and database document counts.
// @Tags Internal
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/internal/bot/info [get]
func botInfo(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		shardCur, err := a.Store.C.BotSync.Find(ctx, map[string]any{"bot_id": int64(824653933347209227)}, options.Find())
		if err != nil {
			return err
		}
		var shardData []map[string]any
		if err := shardCur.All(ctx, &shardData); err != nil {
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

		dbStats := parallelCounts(ctx, map[string]counter{
			"clans_tracked":   a.Store.C.ClanDB,
			"players_tracked": a.Store.C.PlayerStats,
			"wars_stored":     a.Store.C.ClanWars,
			"tickets_open":    a.Store.C.OpenTickets,
			"capital_raids":   a.Store.C.RaidWeekendDB,
		})

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

type counter interface {
	EstimatedDocumentCount(context.Context, ...options.Lister[options.EstimatedDocumentCountOptions]) (int64, error)
}

func count(ctx context.Context, coll counter) int64 {
	total, _ := coll.EstimatedDocumentCount(ctx)
	return total
}

func parallelCounts(ctx context.Context, items map[string]counter) map[string]any {
	out := make(map[string]any, len(items))
	var wg sync.WaitGroup
	var mu sync.Mutex
	for key, coll := range items {
		wg.Add(1)
		go func(key string, coll counter) {
			defer wg.Done()
			total := count(ctx, coll)
			mu.Lock()
			out[key] = total
			mu.Unlock()
		}(key, coll)
	}
	wg.Wait()
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
	case bson.A:
		return len(typed)
	default:
		return 0
	}
}
