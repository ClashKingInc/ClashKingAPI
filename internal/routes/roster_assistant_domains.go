package routes

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const rosterAssistantMaxRosters = 25

func rosterSnapshotToolFields() []string {
	return []string{"playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"}
}

func rosterRefreshNonFailure(err error) (string, string, bool) {
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) {
		return "", "", false
	}
	if appErr.Status == http.StatusTooManyRequests {
		return "reused", "Roster data was refreshed recently; continue with the stored snapshot.", true
	}
	if appErr.Status == http.StatusConflict && strings.Contains(strings.ToLower(appErr.Detail), "refresh") {
		return "waiting", "A roster refresh is already in progress; continue with the stored snapshot for this request.", true
	}
	return "", "", false
}

type rosterBatchQuery struct {
	ServerID  string   `json:"serverId"`
	RosterIDs []string `json:"rosterIds"`
	Fields    []string `json:"fields,omitempty"`
}

type rosterViewPreviewRequest struct {
	ServerID      string                         `json:"serverId"`
	RosterIDs     []string                       `json:"rosterIds"`
	ViewID        string                         `json:"viewId,omitempty"`
	Name          string                         `json:"name"`
	SourceCode    string                         `json:"sourceCode"`
	SourceVersion int                            `json:"sourceVersion"`
	Columns       []modelsv2.RosterViewColumn    `json:"columns"`
	Filters       []modelsv2.RosterViewFilter    `json:"filters"`
	Sort          []modelsv2.RosterViewSort      `json:"sort"`
	Highlights    []modelsv2.RosterViewHighlight `json:"highlights"`
	Limit         *int                           `json:"limit"`
	Rows          *[]rosterViewPreviewRow        `json:"rows,omitempty"`
}

type rosterViewPreviewRow struct {
	RosterID  string         `json:"rosterId"`
	PlayerTag string         `json:"playerTag"`
	Values    map[string]any `json:"values"`
	Highlight *string        `json:"highlight,omitempty"`
}

type rosterMembershipProposalRequest struct {
	ServerID  string                            `json:"serverId"`
	RosterIDs []string                          `json:"rosterIds"`
	Changes   []modelsv2.RosterMembershipChange `json:"changes"`
}

func queryRosterMembersBatch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body rosterBatchQuery
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterBatch(body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		allowed := map[string]bool{}
		for _, field := range rosterSnapshotToolFields() {
			allowed[field] = true
		}
		for _, field := range body.Fields {
			if !allowed[field] {
				return apptypes.Error(http.StatusBadRequest, "Unsupported roster field: "+field)
			}
		}
		resolved, err := resolveRosterViewRosterIDs(c, a, body.ServerID, body.RosterIDs)
		if err != nil {
			return err
		}
		rows := []map[string]any{}
		for index, rosterID := range resolved {
			members, memberErr := queryRosterBuilderMembers(c, a, rosterID, false)
			if memberErr != nil {
				return memberErr
			}
			for _, member := range members {
				row := map[string]any{"rosterId": body.RosterIDs[index], "playerTag": member["playerTag"]}
				for _, field := range body.Fields {
					if field == "signupAnswers" {
						row[field] = member["answers"]
					} else {
						row[field] = member[field]
					}
				}
				rows = append(rows, row)
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"rows": rows})
	}
}

func queryRosterAccountGroups(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body rosterBatchQuery
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterBatch(body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		resolved, err := resolveRosterViewRosterIDs(c, a, body.ServerID, body.RosterIDs)
		if err != nil {
			return err
		}
		owners := map[string][]map[string]any{}
		for index, rosterID := range resolved {
			members, memberErr := queryRosterBuilderMembers(c, a, rosterID, false)
			if memberErr != nil {
				return memberErr
			}
			for _, member := range members {
				owner, _ := member["discordUserId"].(*string)
				if owner == nil || strings.TrimSpace(*owner) == "" {
					continue
				}
				owners[*owner] = append(owners[*owner], map[string]any{"rosterId": body.RosterIDs[index], "playerTag": member["playerTag"], "playerName": member["playerName"]})
			}
		}
		ownerIDs := make([]string, 0, len(owners))
		for ownerID := range owners {
			ownerIDs = append(ownerIDs, ownerID)
		}
		sort.Strings(ownerIDs)
		groups := make([]map[string]any, 0, len(ownerIDs))
		for index, ownerID := range ownerIDs {
			groups = append(groups, map[string]any{"group": index + 1, "accounts": owners[ownerID]})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"groups": groups, "note": "Accounts in one group share a linked Discord owner; unlinked accounts are omitted."})
	}
}

func refreshRosterBatch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body rosterBatchQuery
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterBatch(body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		results := make([]map[string]any, 0, len(body.RosterIDs))
		for _, rosterID := range body.RosterIDs {
			result, err := refreshRosterSnapshot(c, a, body.ServerID, rosterID, "data", true)
			if err != nil {
				if status, message, ok := rosterRefreshNonFailure(err); ok {
					results = append(results, map[string]any{"rosterId": rosterID, "status": status, "message": message})
					continue
				}
				return err
			}
			status := "completed"
			if result.Reused {
				status = "reused"
			}
			results = append(results, map[string]any{"rosterId": rosterID, "status": status, "refreshedPlayers": result.Refreshed, "failedPlayers": result.Failed, "refreshedAt": result.At})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"rosters": results})
	}
}

func previewRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body rosterViewPreviewRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterBatch(body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		write := modelsv2.RosterViewWrite{Name: body.Name, SourceCode: strings.TrimSpace(body.SourceCode), SourceVersion: body.SourceVersion}
		if err := validateRosterViewWrite(write); err != nil {
			return err
		}
		spec := modelsv2.RosterViewSpec{SchemaVersion: rosterViewSpecVersion, Columns: body.Columns, Filters: body.Filters, Sort: body.Sort, Highlights: body.Highlights, Limit: body.Limit}
		if err := validateRosterViewSpec(spec); err != nil {
			return err
		}
		if _, err := resolveRosterViewRosterIDs(c, a, body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		now := time.Now().UTC()
		view := modelsv2.RosterView{ID: body.ViewID, ServerID: body.ServerID, Name: strings.TrimSpace(body.Name), SourceCode: write.SourceCode, SourceVersion: write.SourceVersion, Spec: &spec, CreatedAt: now, UpdatedAt: now}
		var result map[string]any
		if body.Rows != nil {
			if len(*body.Rows) > 500 {
				return apptypes.Error(http.StatusBadRequest, "Roster view previews support at most 500 computed rows")
			}
			allowedRosters := make(map[string]struct{}, len(body.RosterIDs))
			for _, rosterID := range body.RosterIDs {
				allowedRosters[rosterID] = struct{}{}
			}
			allowedColumns := make(map[string]struct{}, len(body.Columns))
			for _, column := range body.Columns {
				allowedColumns[column.ID] = struct{}{}
			}
			rows := make([]map[string]any, 0, len(*body.Rows))
			for _, row := range *body.Rows {
				if _, ok := allowedRosters[row.RosterID]; !ok || strings.TrimSpace(row.PlayerTag) == "" {
					return apptypes.Error(http.StatusBadRequest, "Computed view rows must reference an attached roster and playerTag")
				}
				for columnID := range row.Values {
					if _, ok := allowedColumns[columnID]; !ok {
						return apptypes.Error(http.StatusBadRequest, "Computed view row contains an unknown column: "+columnID)
					}
				}
				if row.Highlight != nil {
					matched, _ := regexp.MatchString(`^#[0-9A-Fa-f]{6}$`, *row.Highlight)
					if !matched {
						return apptypes.Error(http.StatusBadRequest, "Computed row highlight must be a six-digit hex color")
					}
				}
				rows = append(rows, map[string]any{"rosterId": row.RosterID, "playerTag": row.PlayerTag, "values": row.Values, "highlight": row.Highlight})
			}
			rows = applyRosterViewPresentation(rows, spec)
			applyRosterViewRanks(rows, spec)
			result = map[string]any{"viewId": view.ID, "rosterIds": body.RosterIDs, "schemaVersion": spec.SchemaVersion, "rows": rows, "cachedMetricIds": []string{}, "evaluatedAt": time.Now().UTC()}
		} else {
			evaluated, evaluateErr := evaluateRosterViewData(c, a, view, spec, body.RosterIDs, false)
			if evaluateErr != nil {
				return evaluateErr
			}
			result = evaluated
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"view": view, "result": result})
	}
}

func validateRosterMembershipProposal(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body rosterMembershipProposalRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterBatch(body.ServerID, body.RosterIDs); err != nil {
			return err
		}
		aliases, memberships, err := rosterMembershipContext(c.UserContext(), a, body.ServerID, body.RosterIDs)
		if err != nil {
			return err
		}
		changes, err := validateRosterMembershipChanges(body.Changes, aliases, memberships)
		if err != nil {
			return err
		}
		affected := affectedRosterIDs(changes)
		revisions, err := queryRosterRevisions(c.UserContext(), a.Store.SQL, body.ServerID, affected, false)
		if err != nil {
			return err
		}
		counts := map[string]int{"add": 0, "move": 0, "remove": 0}
		items := make([]map[string]any, 0, len(changes))
		for _, change := range changes {
			counts[change.Action]++
			items = append(items, map[string]any{"action": change.Action, "playerTag": change.PlayerTag, "fromRoster": aliases[change.FromRosterID], "toRoster": aliases[change.ToRosterID], "reason": change.Reason})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"type": "membershipProposal", "changes": changes, "expectedRevisions": revisions,
			"generatedAt": time.Now().UTC(), "counts": counts, "items": items,
		})
	}
}

// applyRosterMembershipChanges godoc
// @Summary Apply an approved transient roster proposal
// @Description Atomically applies exact membership changes when every affected roster still has the expected revision.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Param body body modelsv2.RosterMembershipApplyRequest true "Exact changes and expected roster revisions"
// @Success 200 {object} map[string]any
// @Failure 409 {object} modelsv2.ErrorResponse
// @Router /v2/roster/membership-changes [post]
func applyRosterMembershipChanges(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterMembershipApplyRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		affected := affectedRosterIDs(body.Changes)
		if len(affected) == 0 || len(affected) > rosterAssistantMaxRosters || len(body.ExpectedRevisions) != len(affected) {
			return apptypes.Error(http.StatusBadRequest, "Expected revisions must exactly cover every affected roster")
		}
		aliases, memberships, err := rosterMembershipContext(c.UserContext(), a, body.ServerID, affected)
		if err != nil {
			return err
		}
		changes, err := validateRosterMembershipChanges(body.Changes, aliases, memberships)
		if err != nil {
			return err
		}
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		current, err := queryRosterRevisions(c.UserContext(), tx, body.ServerID, affected, true)
		if err != nil {
			return err
		}
		for rosterID, revision := range body.ExpectedRevisions {
			if current[rosterID] != revision {
				return apptypes.Error(http.StatusConflict, "Roster data has changed since this proposal was created")
			}
		}
		ids := map[string]uuid.UUID{}
		for _, rosterID := range affected {
			ids[rosterID] = uuid.MustParse(rosterID)
		}
		for _, change := range changes {
			if err := applyExactRosterMembershipChange(c.UserContext(), tx, ids, change); err != nil {
				return err
			}
		}
		databaseIDs := make([]uuid.UUID, 0, len(affected))
		for _, rosterID := range affected {
			databaseIDs = append(databaseIDs, ids[rosterID])
		}
		if _, err := tx.Exec(c.UserContext(), "UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ANY($1)", databaseIDs); err != nil {
			return err
		}
		updated, err := queryRosterRevisions(c.UserContext(), tx, body.ServerID, affected, false)
		if err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"applied": true, "changeCount": len(changes), "revisions": updated})
	}
}

func affectedRosterIDs(changes []modelsv2.RosterMembershipChange) []string {
	set := map[string]bool{}
	for _, change := range changes {
		if change.FromRosterID != "" {
			set[change.FromRosterID] = true
		}
		if change.ToRosterID != "" {
			set[change.ToRosterID] = true
		}
	}
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func queryRosterRevisions(ctx context.Context, query rosterMembershipQuerier, serverID string, rosterIDs []string, lock bool) (map[string]int64, error) {
	parsed, err := parseRosterUUIDs(rosterIDs)
	if err != nil {
		return nil, err
	}
	statement := "SELECT id, revision FROM rosters WHERE server_id = $1 AND id = ANY($2)"
	if lock {
		statement += " FOR UPDATE"
	}
	rows, err := query.Query(ctx, statement, serverID, parsed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	revisions := map[string]int64{}
	for rows.Next() {
		var id uuid.UUID
		var revision int64
		if err := rows.Scan(&id, &revision); err != nil {
			return nil, err
		}
		revisions[id.String()] = revision
	}
	if len(revisions) != len(rosterIDs) {
		return nil, apptypes.Error(http.StatusConflict, "One or more rosters no longer exist")
	}
	return revisions, rows.Err()
}

func validateRosterBatch(serverID string, rosterIDs []string) error {
	if strings.TrimSpace(serverID) == "" || len(rosterIDs) < 1 || len(rosterIDs) > rosterAssistantMaxRosters {
		return apptypes.Error(http.StatusBadRequest, "serverId and 1 to 25 rosterIds are required")
	}
	seen := map[string]bool{}
	for _, rosterID := range rosterIDs {
		if _, err := uuid.Parse(rosterID); err != nil || seen[rosterID] {
			return apptypes.Error(http.StatusBadRequest, "rosterIds must be unique UUIDs")
		}
		seen[rosterID] = true
	}
	return nil
}
