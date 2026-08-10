package routes

import (
	"context"
	"net/http"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const rosterMembershipMaxChanges = 1000

func validateRosterMembershipChanges(changes []modelsv2.RosterMembershipChange, aliases map[string]string, memberships map[string]map[string]struct{}) ([]modelsv2.RosterMembershipChange, error) {
	if len(changes) == 0 || len(changes) > rosterMembershipMaxChanges {
		return nil, apptypes.Error(http.StatusBadRequest, "Membership proposals require 1 to 1000 changes")
	}
	normalized := make([]modelsv2.RosterMembershipChange, 0, len(changes))
	seen := map[string]struct{}{}
	for _, change := range changes {
		change.PlayerTag = rosterNormalizeTag(change.PlayerTag)
		change.Reason = strings.TrimSpace(change.Reason)
		if runes := []rune(change.Reason); len(runes) > 80 {
			change.Reason = string(runes[:80])
		}
		if change.PlayerTag == "" {
			return nil, apptypes.Error(http.StatusBadRequest, "Membership changes require playerTag")
		}
		if change.FromRosterID != "" {
			if _, ok := aliases[change.FromRosterID]; !ok {
				return nil, apptypes.Error(http.StatusBadRequest, "Membership change references an unattached source roster")
			}
		}
		if change.ToRosterID != "" {
			if _, ok := aliases[change.ToRosterID]; !ok {
				return nil, apptypes.Error(http.StatusBadRequest, "Membership change references an unattached destination roster")
			}
		}
		switch change.Action {
		case "add":
			if change.FromRosterID != "" || change.ToRosterID == "" {
				return nil, apptypes.Error(http.StatusBadRequest, "add requires only toRosterId")
			}
			if _, exists := memberships[change.ToRosterID][change.PlayerTag]; exists {
				return nil, apptypes.Error(http.StatusConflict, "Player is already in the destination roster")
			}
		case "remove":
			if change.FromRosterID == "" || change.ToRosterID != "" {
				return nil, apptypes.Error(http.StatusBadRequest, "remove requires only fromRosterId")
			}
			if _, exists := memberships[change.FromRosterID][change.PlayerTag]; !exists {
				return nil, apptypes.Error(http.StatusConflict, "Player is not in the source roster")
			}
		case "move":
			if change.FromRosterID == "" || change.ToRosterID == "" || change.FromRosterID == change.ToRosterID {
				return nil, apptypes.Error(http.StatusBadRequest, "move requires distinct fromRosterId and toRosterId")
			}
			if _, exists := memberships[change.FromRosterID][change.PlayerTag]; !exists {
				return nil, apptypes.Error(http.StatusConflict, "Player is not in the source roster")
			}
			if _, exists := memberships[change.ToRosterID][change.PlayerTag]; exists {
				return nil, apptypes.Error(http.StatusConflict, "Player is already in the destination roster")
			}
		default:
			return nil, apptypes.Error(http.StatusBadRequest, "Membership action must be add, remove, or move")
		}
		key := change.Action + "|" + change.PlayerTag + "|" + change.FromRosterID + "|" + change.ToRosterID
		if _, duplicate := seen[key]; duplicate {
			return nil, apptypes.Error(http.StatusBadRequest, "Membership proposal contains a duplicate change")
		}
		seen[key] = struct{}{}
		normalized = append(normalized, change)
	}
	return normalized, nil
}

func rosterMembershipContext(ctx context.Context, a apptypes.Deps, serverID string, rosterIDs []string) (map[string]string, map[string]map[string]struct{}, error) {
	ids, err := parseRosterUUIDs(rosterIDs)
	if err != nil {
		return nil, nil, err
	}
	rows, err := a.Store.SQL.Query(ctx, "SELECT id, alias FROM rosters WHERE server_id = $1 AND id = ANY($2)", serverID, ids)
	if err != nil {
		return nil, nil, err
	}
	aliases := map[string]string{}
	for rows.Next() {
		var id uuid.UUID
		var alias string
		if err := rows.Scan(&id, &alias); err != nil {
			rows.Close()
			return nil, nil, err
		}
		aliases[id.String()] = alias
	}
	rows.Close()
	if len(aliases) != len(rosterIDs) {
		return nil, nil, apptypes.Error(http.StatusBadRequest, "One or more proposal rosters are not attached to this server")
	}
	membershipRows, err := a.Store.SQL.Query(ctx, `
		SELECT r.id, m.tag FROM rosters r
		LEFT JOIN roster_members m ON m.roster_id = r.id
		WHERE r.server_id = $1 AND r.id = ANY($2)
	`, serverID, ids)
	if err != nil {
		return nil, nil, err
	}
	memberships := map[string]map[string]struct{}{}
	for id := range aliases {
		memberships[id] = map[string]struct{}{}
	}
	for membershipRows.Next() {
		var id uuid.UUID
		var tag *string
		if err := membershipRows.Scan(&id, &tag); err != nil {
			membershipRows.Close()
			return nil, nil, err
		}
		if tag != nil {
			memberships[id.String()][*tag] = struct{}{}
		}
	}
	membershipRows.Close()
	return aliases, memberships, membershipRows.Err()
}

type rosterMembershipQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func applyExactRosterMembershipChange(ctx context.Context, tx pgx.Tx, ids map[string]uuid.UUID, change modelsv2.RosterMembershipChange) error {
	switch change.Action {
	case "remove":
		result, err := tx.Exec(ctx, "DELETE FROM roster_members WHERE roster_id = $1 AND tag = $2", ids[change.FromRosterID], change.PlayerTag)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(http.StatusConflict, "Approved remove no longer matches roster state")
		}
	case "add":
		result, err := tx.Exec(ctx, `
			INSERT INTO roster_members (roster_id, tag, name, townhall, trophies, current_clan_tag, position)
			SELECT $1, p.tag, p.name, p.townhall_level, p.trophies, p.clan_tag,
			       COALESCE((SELECT max(position) + 1 FROM roster_members WHERE roster_id = $1), 0)
			FROM basic_player p WHERE p.tag = $2
		`, ids[change.ToRosterID], change.PlayerTag)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(http.StatusConflict, "Approved add account snapshot is unavailable")
		}
	case "move":
		result, err := tx.Exec(ctx, `
			INSERT INTO roster_members (
				roster_id, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
				war_preference, discord_user_id, discord_username,
				discord_avatar_url, last_online, position, is_in_family, member_status,
				signup_answers, league_id, league_name, hero_level_sum, max_percent, refreshed_at
			)
			SELECT $2, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
			       war_preference, discord_user_id, discord_username,
			       discord_avatar_url, last_online,
			       COALESCE((SELECT max(position) + 1 FROM roster_members WHERE roster_id = $2), 0),
			       is_in_family, member_status, signup_answers, league_id, league_name, hero_level_sum,
			       max_percent, refreshed_at
			FROM roster_members WHERE roster_id = $1 AND tag = $3
		`, ids[change.FromRosterID], ids[change.ToRosterID], change.PlayerTag)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(http.StatusConflict, "Approved move no longer matches roster state")
		}
		result, err = tx.Exec(ctx, "DELETE FROM roster_members WHERE roster_id = $1 AND tag = $2", ids[change.FromRosterID], change.PlayerTag)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(http.StatusConflict, "Approved move source changed during apply")
		}
	}
	return nil
}
