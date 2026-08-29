package routes

import (
	"errors"
	"net/http"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const basicWarQuery = `
	SELECT schedule.source_clan_tag, schedule.opponent_tag,
	       schedule.prep_time, schedule.end_time, schedule.war_type, schedule.war_tag,
	       source.public_war_log, opponent.public_war_log
	FROM war_schedule AS schedule
	LEFT JOIN basic_clan AS source ON source.tag = schedule.source_clan_tag
	LEFT JOIN basic_clan AS opponent ON opponent.tag = schedule.opponent_tag
	WHERE schedule.source_clan_tag = $1 OR schedule.opponent_tag = $1
	ORDER BY schedule.end_time DESC
	LIMIT 1
`

// basicWar godoc
// @Summary View a clan's scheduled war
// @Description Returns the stored active war schedule, participants, timing, type, optional CWL tag, and known public-war-log visibility.
// @Tags War & CWL
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.BasicWarResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/war/{clan_tag}/basic [get]
func basicWar(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		if clanTag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid clan_tag")
		}
		var sourceTag, opponentTag, warType string
		var preparationStartTime, endTime time.Time
		var warTag pgtype.Text
		var sourcePublicWarLog, opponentPublicWarLog pgtype.Bool
		err := a.Store.SQL.QueryRow(c.UserContext(), basicWarQuery, clanTag).Scan(
			&sourceTag, &opponentTag, &preparationStartTime, &endTime, &warType, &warTag,
			&sourcePublicWarLog, &opponentPublicWarLog,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		if err != nil {
			return err
		}
		response := basicWarFromStoredRow(
			clanTag, sourceTag, opponentTag, preparationStartTime, endTime, warType, warTag,
			sourcePublicWarLog, opponentPublicWarLog,
		)
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

func basicWarFromStoredRow(
	requestedTag, sourceTag, opponentTag string,
	preparationStartTime, endTime time.Time,
	warType string,
	warTag pgtype.Text,
	sourcePublicWarLog, opponentPublicWarLog pgtype.Bool,
) modelsv2.BasicWarResponse {
	clan := modelsv2.BasicWarClan{Tag: sourceTag, PublicWarLog: nullableBool(sourcePublicWarLog)}
	opponent := modelsv2.BasicWarClan{Tag: opponentTag, PublicWarLog: nullableBool(opponentPublicWarLog)}
	if requestedTag == opponentTag {
		clan, opponent = opponent, clan
	}
	response := modelsv2.BasicWarResponse{
		Clan: clan, Opponent: opponent,
		PreparationStartTime: clashTime(preparationStartTime),
		EndTime:              clashTime(endTime),
		Type:                 warType,
	}
	if warTag.Valid && warTag.String != "" {
		value := warFixTag(warTag.String)
		response.WarTag = &value
	}
	return response
}

func nullableBool(value pgtype.Bool) *bool {
	if !value.Valid {
		return nil
	}
	result := value.Bool
	return &result
}
