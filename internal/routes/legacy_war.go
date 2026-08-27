package routes

import (
	"net/http"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// warPreviousAtTime godoc
// @Summary Find a stored war by end time
// @Description Returns the stored clan war ending nearest the supplied Clash time, allowing a ten-minute difference in either direction.
// @Tags War & CWL
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param endtime path string true "War end time in Clash format, such as 20260820T120000.000Z"
// @Success 200 {object} modelsv2.WarResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/war/{clan_tag}/previous/{endtime} [get]
func warPreviousAtTime(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid clan_tag")
		}
		endTime, err := time.Parse("20060102T150405.000Z", c.Params("endtime"))
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid endtime format")
		}
		item, err := sqlClanWarAtTime(c, a, tag, endTime, 10*time.Minute)
		if err != nil {
			return err
		}
		if item == nil {
			return apptypes.Error(http.StatusNotFound, "war not found")
		}
		return apptypes.JSON(c, http.StatusOK, item)
	}
}
