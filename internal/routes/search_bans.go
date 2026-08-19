package routes

import (
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// searchBannedPlayers godoc
// @Summary Search for banned players in a guild
// @Description Returns banned players matching the query in the given guild.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id path int true "Discord guild ID"
// @Param query query string false "Player name search query"
// @Success 200 {object} modelsv2.SearchPlayerReferenceResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/search/{guild_id}/banned-players [get]
func searchBannedPlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, err := strconv.ParseInt(c.Params("guild_id"), 10, 64)
		if err != nil || guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid guild_id")
		}
		query := strings.TrimSpace(c.Query("query"))
		sqlQuery := `
			SELECT player_tag, player_name
			FROM server_bans
			WHERE server_id = $1
		`
		args := []any{strconv.FormatInt(guildID, 10)}
		if query != "" {
			sqlQuery += ` AND player_name ILIKE $2`
			args = append(args, "%"+query+"%")
		}
		sqlQuery += ` ORDER BY player_name ASC LIMIT 25`
		rows, err := a.Store.SQL.Query(c.UserContext(), sqlQuery, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []modelsv2.SearchPlayerReference{}
		for rows.Next() {
			var item modelsv2.SearchPlayerReference
			if err := rows.Scan(&item.Tag, &item.Name); err != nil {
				return err
			}
			if item.Name == "" {
				item.Name = "Missing"
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.SearchPlayerReferenceResponse{Items: items})
	}
}
