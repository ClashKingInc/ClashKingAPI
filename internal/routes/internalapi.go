package routes

import (
	"context"
	"runtime"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// botInfo returns internal bot and database health information.
func botInfo(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		shardCur, err := a.Store.C.BotSync.Find(ctx, map[string]any{"bot_id": 824653933347209227}, options.Find())
		if err != nil {
			return err
		}
		var shardData []map[string]any
		if err := shardCur.All(ctx, &shardData); err != nil {
			return err
		}
		dbStats := map[string]any{
			"clans_tracked":   count(ctx, a.Store.C.ClanDB),
			"players_tracked": count(ctx, a.Store.C.PlayerStats),
			"wars_stored":     count(ctx, a.Store.C.ClanWars),
			"tickets_open":    count(ctx, a.Store.C.Banlist),
			"capital_raids":   count(ctx, a.Store.C.RaidWeekendDB),
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"bot": map[string]any{
				"clusters": shardData,
			},
			"system": map[string]any{
				"go_version": runtime.Version(),
				"platform":   runtime.GOOS + "/" + runtime.GOARCH,
			},
			"database": dbStats,
		})
	}
}

func count(ctx context.Context, coll interface {
	EstimatedDocumentCount(context.Context, ...options.Lister[options.EstimatedDocumentCountOptions]) (int64, error)
}) int64 {
	total, _ := coll.EstimatedDocumentCount(ctx)
	return total
}
