package routes

import (
	"encoding/json"
	"errors"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	homeActivityDefaultLimit = 25
	homeActivityMaxLimit     = 100
	homeActivityMaxMappings  = 100
)

type normalizedHomeActivityMapping struct {
	playerTag string
	clanTag   *string
}

// homeActivity returns the newest activity for explicitly supplied verified players and clans.
//
// Swag only accepts the legacy Swagger 2 method set, so this is generated as POST and promoted
// to QUERY by swaggerdocs.BuildDoc. The registered HTTP method is always RFC QUERY.
//
// @Summary Get Home activity
// @Description Uses RFC QUERY with a JSON body to return the newest merged clan membership and player history activity.
// @Tags Activity & Inactivity
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.HomeActivityRequest true "Home activity selection"
// @Success 200 {object} modelsv2.HomeActivityResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @x-rfc-method "QUERY"
// @Router /v2/home/activity [post]
func homeActivity(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.HomeActivityRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		userID, err := resolveLinkSubject(c.UserContext(), a, c, body.AccountID)
		if err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		mappings, err := normalizeHomeActivityMappings(body.Mappings)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, err.Error())
		}
		limit := clampHomeActivityLimit(body.Limit)

		tx, err := a.Store.SQL.BeginTx(c.UserContext(), pgx.TxOptions{
			IsoLevel:   pgx.RepeatableRead,
			AccessMode: pgx.ReadOnly,
		})
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())

		playerTags := make([]string, 0, len(mappings))
		for _, mapping := range mappings {
			playerTags = append(playerTags, mapping.playerTag)
		}
		rows, err := tx.Query(c.UserContext(), `
			SELECT links.tag, players.clan_tag
			FROM player_links AS links
			LEFT JOIN basic_player AS players ON players.tag = links.tag
			WHERE links.user_id = $1
			  AND links.is_verified = true
			  AND links.tag = ANY($2)
		`, userID, playerTags)
		if err != nil {
			return err
		}
		storedClans := make(map[string]*string, len(mappings))
		for rows.Next() {
			var playerTag string
			var clanTag pgtype.Text
			if err := rows.Scan(&playerTag, &clanTag); err != nil {
				rows.Close()
				return err
			}
			if clanTag.Valid && strings.TrimSpace(clanTag.String) != "" {
				value := clashy.CorrectTag(clanTag.String)
				storedClans[playerTag] = &value
			} else {
				storedClans[playerTag] = nil
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if len(storedClans) != len(mappings) {
			return apptypes.Error(fiber.StatusForbidden, "Every submitted player must be a verified link owned by the account")
		}
		clanTags := make([]string, 0, len(mappings))
		seenClans := make(map[string]struct{}, len(mappings))
		for _, mapping := range mappings {
			if mapping.clanTag == nil {
				continue
			}
			storedClan := storedClans[mapping.playerTag]
			if storedClan == nil || *storedClan != *mapping.clanTag {
				return apptypes.Error(fiber.StatusBadRequest, "Submitted clan does not match the player's current clan")
			}
			if _, exists := seenClans[*mapping.clanTag]; !exists {
				seenClans[*mapping.clanTag] = struct{}{}
				clanTags = append(clanTags, *mapping.clanTag)
			}
		}

		activityRows, err := tx.Query(c.UserContext(), `
			WITH activity AS (
				SELECT joins."time" AS occurred_at,
				       'join_leave'::text AS kind,
				       joins."type" AS event_type,
				       joins.player_tag,
				       joins.clan_tag,
				       joins.player_name,
				       clans.name AS clan_name,
				       joins.townhall_level,
				       NULL::text AS season,
				       NULL::integer AS value,
				       '{}'::jsonb AS data
				FROM join_leave_history AS joins
				LEFT JOIN basic_clan AS clans ON clans.tag = joins.clan_tag
				WHERE joins.clan_tag = ANY($1)

				UNION ALL

				SELECT history.event_time AS occurred_at,
				       'player_history'::text AS kind,
				       history.event_type,
				       history.player_tag,
				       NULLIF(history.clan_tag, '') AS clan_tag,
				       players.name AS player_name,
				       clans.name AS clan_name,
				       NULL::smallint AS townhall_level,
				       NULLIF(history.season, '') AS season,
				       history.value,
				       history.data
				FROM player_history_events AS history
				LEFT JOIN basic_player AS players ON players.tag = history.player_tag
				LEFT JOIN basic_clan AS clans ON clans.tag = NULLIF(history.clan_tag, '')
				WHERE history.player_tag = ANY($2)
			)
			SELECT occurred_at, kind, event_type, player_tag, clan_tag, player_name,
			       clan_name, townhall_level, season, value, data
			FROM activity
			ORDER BY occurred_at DESC, kind ASC, player_tag ASC, event_type ASC
			LIMIT $3
		`, clanTags, playerTags, limit)
		if err != nil {
			return err
		}
		defer activityRows.Close()

		items := make([]modelsv2.HomeActivityItem, 0, limit)
		for activityRows.Next() {
			var item modelsv2.HomeActivityItem
			var clanTag, playerName, clanName, season pgtype.Text
			var townHall pgtype.Int2
			var value pgtype.Int4
			var rawData []byte
			if err := activityRows.Scan(
				&item.Timestamp,
				&item.Type,
				&item.EventType,
				&item.PlayerTag,
				&clanTag,
				&playerName,
				&clanName,
				&townHall,
				&season,
				&value,
				&rawData,
			); err != nil {
				return err
			}
			item.ClanTag = textPointer(clanTag)
			item.PlayerName = textPointer(playerName)
			item.ClanName = textPointer(clanName)
			item.Season = textPointer(season)
			if townHall.Valid {
				item.TownHallLevel = &townHall.Int16
			}
			if value.Valid {
				item.Value = &value.Int32
			}
			item.Data = map[string]any{}
			if len(rawData) > 0 {
				if err := json.Unmarshal(rawData, &item.Data); err != nil {
					return err
				}
			}
			items = append(items, item)
		}
		if err := activityRows.Err(); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.HomeActivityResponse{Items: items})
	}
}

func normalizeHomeActivityMappings(raw []modelsv2.HomeActivityPlayerMapping) ([]normalizedHomeActivityMapping, error) {
	if len(raw) == 0 {
		return nil, errors.New("at least one player mapping is required")
	}
	if len(raw) > homeActivityMaxMappings {
		return nil, errors.New("too many player mappings")
	}
	out := make([]normalizedHomeActivityMapping, 0, len(raw))
	seenPlayers := make(map[string]struct{}, len(raw))
	for _, mapping := range raw {
		if strings.TrimSpace(mapping.PlayerTag) == "" {
			return nil, errors.New("player_tag is required")
		}
		playerTag := clashy.CorrectTag(mapping.PlayerTag)
		if _, exists := seenPlayers[playerTag]; exists {
			return nil, errors.New("duplicate player_tag")
		}
		seenPlayers[playerTag] = struct{}{}
		normalized := normalizedHomeActivityMapping{playerTag: playerTag}
		if mapping.ClanTag != nil {
			if strings.TrimSpace(*mapping.ClanTag) == "" {
				return nil, errors.New("clan_tag must be a tag or null")
			}
			clanTag := clashy.CorrectTag(*mapping.ClanTag)
			normalized.clanTag = &clanTag
		}
		out = append(out, normalized)
	}
	return out, nil
}

func clampHomeActivityLimit(limit int) int {
	if limit == 0 {
		return homeActivityDefaultLimit
	}
	if limit < 1 {
		return 1
	}
	if limit > homeActivityMaxLimit {
		return homeActivityMaxLimit
	}
	return limit
}

func textPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}
