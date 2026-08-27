package routes

import (
	"net/http"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

const playerTimersQuery = `
	SELECT timer.event_type, timer.event_key, timer.expires_at,
	       schedule.source_clan_tag, schedule.opponent_tag,
	       schedule.war_type, schedule.war_tag
	FROM player_timers AS timer
	LEFT JOIN war_schedule AS schedule
	  ON timer.event_type = 'war' AND schedule.schedule_key = timer.event_key
	WHERE timer.player_tag = $1 AND timer.expires_at > now()
	ORDER BY timer.expires_at, timer.event_type, timer.event_key
`

// playerTimers godoc
// @Summary View a player's active timers
// @Description Returns active regular-war, CWL, and Capital Raid timers currently stored for the player.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerTimersResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/timers [get]
func playerTimers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := warFixTag(c.Params("player_tag"))
		if playerTag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid player_tag")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), playerTimersQuery, playerTag)
		if err != nil {
			return err
		}
		defer rows.Close()

		items := []modelsv2.PlayerTimer{}
		for rows.Next() {
			var eventType, eventKey string
			var expiresAt time.Time
			var sourceClanTag, opponentTag, warType, warTag pgtype.Text
			if err := rows.Scan(&eventType, &eventKey, &expiresAt, &sourceClanTag, &opponentTag, &warType, &warTag); err != nil {
				return err
			}
			item, ok := playerTimerFromStoredRow(eventType, eventKey, expiresAt, sourceClanTag, opponentTag, warType, warTag)
			if ok {
				items = append(items, item)
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.PlayerTimersResponse{Items: items})
	}
}

func playerTimerFromStoredRow(
	eventType, eventKey string,
	expiresAt time.Time,
	sourceClanTag, opponentTag, warType, warTag pgtype.Text,
) (modelsv2.PlayerTimer, bool) {
	item := modelsv2.PlayerTimer{ExpiresAt: expiresAt.UTC().Format(time.RFC3339), Clans: []string{}}
	switch eventType {
	case "war":
		if !sourceClanTag.Valid || !opponentTag.Valid {
			return modelsv2.PlayerTimer{}, false
		}
		item.Type = modelsv2.PlayerTimerTypeWar
		if warType.Valid && strings.EqualFold(warType.String, "cwl") {
			item.Type = modelsv2.PlayerTimerTypeCWL
			if warTag.Valid {
				item.WarTag = warFixTag(warTag.String)
			}
		}
		item.Clans = uniqueTimerClans(sourceClanTag.String, opponentTag.String)
	case "raid", "capital":
		item.Type = modelsv2.PlayerTimerTypeCapital
		item.Clans = uniqueTimerClans(eventKey)
	default:
		return modelsv2.PlayerTimer{}, false
	}
	if len(item.Clans) == 0 {
		return modelsv2.PlayerTimer{}, false
	}
	return item, true
}

func uniqueTimerClans(tags ...string) []string {
	items := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, raw := range tags {
		tag := warFixTag(raw)
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		items = append(items, tag)
	}
	return items
}
