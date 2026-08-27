package routes

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// getCWLBonusRecipients godoc
// @Summary View saved CWL bonus recipients
// @Description Returns the saved bonus-medal recipients for one server, clan, and CWL season so an existing award plan can be reviewed.
// @Tags Server Clans
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param clan_tag path string true "Clan tag"
// @Param season query string true "CWL season (YYYY-MM or YYYY-MM-DD)"
// @Success 200 {object} modelsv2.CWLBonusRecipientsResponse
// @Router /v2/server/{server_id}/cwl/{clan_tag}/bonus-recipients [get]
func getCWLBonusRecipients(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := c.Params("server_id")
		clanTag := warFixTag(c.Params("clan_tag"))
		season := strings.TrimSpace(c.Query("season"))
		if clanTag == "" || !validCWLBonusSeason(season) {
			return apptypes.Error(http.StatusBadRequest, "a valid clan tag and YYYY-MM or YYYY-MM-DD season are required")
		}
		if err := requireConfiguredServerClan(c, a, serverID, clanTag); err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, medal_count
			FROM cwl_bonus_recipients
			WHERE season = $1 AND clan_tag = $2
			ORDER BY player_tag
		`, season, clanTag)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := make([]modelsv2.CWLBonusRecipient, 0)
		for rows.Next() {
			var item modelsv2.CWLBonusRecipient
			if err := rows.Scan(&item.PlayerTag, &item.MedalCount); err != nil {
				return err
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.CWLBonusRecipientsResponse{Items: items})
	}
}

// replaceCWLBonusRecipients godoc
// @Summary Replace saved CWL bonus recipients
// @Description Replaces the saved bonus-medal recipients for one server, clan, and CWL season with the submitted player list.
// @Tags Server Clans
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param clan_tag path string true "Clan tag"
// @Param season query string true "CWL season (YYYY-MM or YYYY-MM-DD)"
// @Param request body modelsv2.ReplaceCWLBonusRecipientsRequest true "Recipients"
// @Success 200 {object} modelsv2.CWLBonusRecipientsResponse
// @Router /v2/server/{server_id}/cwl/{clan_tag}/bonus-recipients [put]
func replaceCWLBonusRecipients(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := c.Params("server_id")
		clanTag := warFixTag(c.Params("clan_tag"))
		season := strings.TrimSpace(c.Query("season"))
		if clanTag == "" || !validCWLBonusSeason(season) {
			return apptypes.Error(http.StatusBadRequest, "a valid clan tag and YYYY-MM or YYYY-MM-DD season are required")
		}
		var request modelsv2.ReplaceCWLBonusRecipientsRequest
		if err := apptypes.DecodeJSON(c, &request); err != nil {
			return err
		}
		seen := make(map[string]struct{}, len(request.Recipients))
		for index := range request.Recipients {
			request.Recipients[index].PlayerTag = warFixTag(request.Recipients[index].PlayerTag)
			recipient := request.Recipients[index]
			if recipient.PlayerTag == "" || recipient.MedalCount < 0 || recipient.MedalCount > 32767 {
				return apptypes.Error(http.StatusBadRequest, "each recipient requires a valid playerTag and medalCount between 0 and 32767")
			}
			if _, duplicate := seen[recipient.PlayerTag]; duplicate {
				return apptypes.Error(http.StatusBadRequest, "recipient player tags must be unique")
			}
			seen[recipient.PlayerTag] = struct{}{}
		}

		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		if err := requireConfiguredServerClanQuerier(c, tx, serverID, clanTag); err != nil {
			return err
		}
		if err := requireFrozenCWLRecipients(c, tx, season, clanTag, request.Recipients); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `
			DELETE FROM cwl_bonus_recipients WHERE season = $1 AND clan_tag = $2
		`, season, clanTag); err != nil {
			return err
		}
		for _, recipient := range request.Recipients {
			if _, err := tx.Exec(c.UserContext(), `
				INSERT INTO cwl_bonus_recipients (season, clan_tag, player_tag, medal_count)
				VALUES ($1, $2, $3, $4)
			`, season, clanTag, recipient.PlayerTag, recipient.MedalCount); err != nil {
				return err
			}
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.CWLBonusRecipientsResponse{Items: request.Recipients})
	}
}

func requireConfiguredServerClan(c *fiber.Ctx, a apptypes.Deps, serverID, clanTag string) error {
	return requireConfiguredServerClanQuerier(c, a.Store.SQL, serverID, clanTag)
}

type cwlBonusSQLQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func requireConfiguredServerClanQuerier(c *fiber.Ctx, db cwlBonusSQLQuerier, serverID, clanTag string) error {
	var exists bool
	if err := db.QueryRow(c.UserContext(), `
		SELECT EXISTS (SELECT 1 FROM server_clans WHERE server_id = $1 AND tag = $2)
	`, serverID, clanTag).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return apptypes.Error(http.StatusNotFound, "clan is not configured for this server")
	}
	return nil
}

func requireFrozenCWLRecipients(c *fiber.Ctx, db cwlBonusSQLQuerier, season, clanTag string, recipients []modelsv2.CWLBonusRecipient) error {
	var cwlID string
	err := db.QueryRow(c.UserContext(), `
		SELECT g.cwl_id
		FROM cwl_groups AS g
		JOIN cwl_group_clans AS clan ON clan.cwl_id = g.cwl_id
		WHERE g.season = $1 AND clan.clan_tag = $2
		ORDER BY g.cwl_id DESC LIMIT 1
	`, season, clanTag).Scan(&cwlID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apptypes.Error(http.StatusNotFound, "stored CWL group not found")
	}
	if err != nil {
		return err
	}
	for _, recipient := range recipients {
		var member bool
		if err := db.QueryRow(c.UserContext(), `
			SELECT EXISTS (
				SELECT 1 FROM cwl_group_members
				WHERE cwl_id = $1 AND clan_tag = $2 AND tag = $3
			)
		`, cwlID, clanTag, recipient.PlayerTag).Scan(&member); err != nil {
			return err
		}
		if !member {
			return apptypes.Error(http.StatusBadRequest, "recipient "+recipient.PlayerTag+" is not in the stored CWL master roster")
		}
	}
	return nil
}

func validCWLBonusSeason(value string) bool {
	for _, layout := range []string{"2006-01", "2006-01-02"} {
		season, err := time.Parse(layout, value)
		if err == nil && season.Year() >= 2000 {
			return true
		}
	}
	return false
}
