package routes

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type persistedRosterQuestion struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	Options  []string `json:"options"`
	Order    int      `json:"order"`
}

func encodeRosterQuestions(questions []modelsv2.RosterQuestion) ([]byte, error) {
	persisted := make([]persistedRosterQuestion, 0, len(questions))
	for _, question := range questions {
		persisted = append(persisted, persistedRosterQuestion{
			ID: question.ID, Label: question.Label, Type: question.Type, Required: question.Required,
			Options: question.Options, Order: question.Order,
		})
	}
	return json.Marshal(persisted)
}

func decodeRosterQuestions(raw []byte) []modelsv2.RosterQuestion {
	var persisted []persistedRosterQuestion
	if json.Unmarshal(raw, &persisted) != nil {
		return []modelsv2.RosterQuestion{}
	}
	questions := make([]modelsv2.RosterQuestion, 0, len(persisted))
	for _, question := range persisted {
		questions = append(questions, modelsv2.RosterQuestion{
			ID: question.ID, Label: question.Label, Type: question.Type, Required: question.Required,
			Options: question.Options, Order: question.Order,
		})
	}
	return questions
}

func rosterUUID(c *fiber.Ctx, a apptypes.Deps, serverID, rosterID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT id FROM rosters WHERE id = $1 AND server_id = $2`, rosterID, serverID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, apptypes.Error(http.StatusNotFound, "Roster not found")
	}
	return id, err
}

func rosterDashboardDiscordUserID(c *fiber.Ctx, a apptypes.Deps) (string, error) {
	var discordUserID string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT user_id FROM auth_users WHERE user_id = $1 AND provider = 'discord'
	`, apptypes.UserID(c.UserContext())).Scan(&discordUserID)
	if errors.Is(err, pgx.ErrNoRows) || strings.TrimSpace(discordUserID) == "" {
		return "", apptypes.Error(http.StatusForbidden, "A Discord identity is required for roster management")
	}
	return discordUserID, err
}

// createRosterView godoc
// @Summary Create a saved roster view
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Param body body modelsv2.RosterViewWrite true "Typed saved view"
// @Success 201 {object} modelsv2.RosterView
// @Router /v2/roster/views [post]
func createRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var write modelsv2.RosterViewWrite
		if err := apptypes.DecodeJSON(c, &write); err != nil {
			return err
		}
		if err := validateRosterViewWrite(write); err != nil {
			return err
		}
		serverID := c.Query("server_id")
		if err := authorizeDashboardAccess(c, a, serverID, "rosters", true, true, false); err != nil {
			return err
		}
		discordUserID, err := rosterDashboardDiscordUserID(c, a)
		if err != nil {
			return err
		}
		var viewID uuid.UUID
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO roster_views (server_id, name, source_code, source_version, created_by_discord_user_id)
			VALUES ($1, $2, $3, $4, $5) RETURNING id
		`, serverID, strings.TrimSpace(write.Name), strings.TrimSpace(write.SourceCode), write.SourceVersion, discordUserID).Scan(&viewID)
		if err != nil {
			return err
		}
		view, err := loadRosterView(c, a, serverID, viewID.String())
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, view)
	}
}

// listRosterViews godoc
// @Summary List saved roster views
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Success 200 {array} modelsv2.RosterView
// @Router /v2/roster/views [get]
func listRosterViews(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT id FROM roster_views WHERE server_id = $1 ORDER BY updated_at DESC`, c.Query("server_id"))
		if err != nil {
			return err
		}
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		rows.Close()
		items := []modelsv2.RosterView{}
		for _, id := range ids {
			view, err := loadRosterView(c, a, c.Query("server_id"), id)
			if err != nil {
				return err
			}
			items = append(items, view)
		}
		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// getRosterView godoc
// @Summary Get a saved roster view
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param viewId path string true "View ID"
// @Param server_id query string true "Discord server ID"
// @Success 200 {object} modelsv2.RosterView
// @Router /v2/roster/views/{viewId} [get]
func getRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		view, err := loadRosterView(c, a, c.Query("server_id"), c.Params("viewId"))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, view)
	}
}

// resolveSharedRosterView godoc
// @Summary Resolve an authenticated saved-view share link
// @Description Resolves the server for a compact saved-view link after enforcing normal dashboard roster authorization.
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param shareId path string true "Compact share ID"
// @Success 200 {object} modelsv2.RosterView
// @Router /v2/roster/views/shared/{shareId} [get]
func resolveSharedRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		shareID := c.Params("shareId")
		if matched, _ := regexp.MatchString(`^[A-Za-z0-9_-]{10,16}$`, shareID); !matched {
			return apptypes.Error(http.StatusBadRequest, "Invalid shareId")
		}
		var serverID, viewID string
		err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT server_id, id FROM roster_views WHERE share_id = $1`, shareID).Scan(&serverID, &viewID)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Roster view not found")
		}
		if err != nil {
			return err
		}
		if err := authorizeDashboardAccess(c, a, serverID, "rosters", true, true, false); err != nil {
			return err
		}
		view, err := loadRosterView(c, a, serverID, viewID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, view)
	}
}

// updateRosterView godoc
// @Summary Update a saved roster view
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param viewId path string true "View ID"
// @Param server_id query string true "Discord server ID"
// @Param body body modelsv2.RosterViewUpdate true "Typed view"
// @Success 200 {object} modelsv2.RosterView
// @Router /v2/roster/views/{viewId} [patch]
func updateRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterViewUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		write := modelsv2.RosterViewWrite{Name: body.Name, SourceCode: body.SourceCode, SourceVersion: body.SourceVersion}
		if err := validateRosterViewWrite(write); err != nil {
			return err
		}
		serverID := c.Query("server_id")
		if _, err := loadRosterView(c, a, serverID, c.Params("viewId")); err != nil {
			return err
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE roster_views SET name = $2, source_code = $3, source_version = $4, updated_at = now()
			WHERE id = $1 AND server_id = $5
		`, c.Params("viewId"), strings.TrimSpace(body.Name), strings.TrimSpace(body.SourceCode), body.SourceVersion, serverID); err != nil {
			return err
		}
		view, err := loadRosterView(c, a, serverID, c.Params("viewId"))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, view)
	}
}

// deleteRosterView godoc
// @Summary Delete a saved roster view
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param viewId path string true "View ID"
// @Param server_id query string true "Discord server ID"
// @Success 204
// @Router /v2/roster/views/{viewId} [delete]
func deleteRosterView(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		result, err := a.Store.SQL.Exec(c.UserContext(), `DELETE FROM roster_views WHERE id = $1 AND server_id = $2`, c.Params("viewId"), c.Query("server_id"))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Roster view not found")
		}
		return c.SendStatus(http.StatusNoContent)
	}
}

func loadRosterView(c *fiber.Ctx, a apptypes.Deps, serverID, viewID string) (modelsv2.RosterView, error) {
	var view modelsv2.RosterView
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT id, share_id, server_id, name, source_code, source_version, created_by_discord_user_id, created_at, updated_at
		FROM roster_views WHERE id = $1 AND server_id = $2
	`, viewID, serverID).Scan(&view.ID, &view.ShareID, &view.ServerID, &view.Name, &view.SourceCode, &view.SourceVersion,
		&view.CreatedBy, &view.CreatedAt, &view.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return view, apptypes.Error(http.StatusNotFound, "Roster view not found")
	}
	if err != nil {
		return view, err
	}
	return view, nil
}

func resolveRosterViewRosterIDs(c *fiber.Ctx, a apptypes.Deps, serverID string, rosterIDs []string) ([]uuid.UUID, error) {
	ids, err := parseRosterUUIDs(rosterIDs)
	if err != nil {
		return nil, err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT id FROM rosters WHERE server_id = $1 AND id = ANY($2)`, serverID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[uuid.UUID]struct{}{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		byID[id] = struct{}{}
	}
	for _, id := range ids {
		_, ok := byID[id]
		if !ok {
			return nil, apptypes.Error(http.StatusBadRequest, "One or more rosterIds do not belong to this server")
		}
	}
	return ids, nil
}

// putRosterQuestionnaire godoc
// @Summary Replace a roster questionnaire
// @Description The fixed account selector is always first; incompatible edits transactionally remove matching member answers.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Param roster_id query string true "Roster ID"
// @Param body body modelsv2.RosterQuestionnaireWrite true "Up to four questions"
// @Success 200 {object} modelsv2.RosterQuestionnaireMutationResponse
// @Router /v2/roster/questionnaire [put]
func putRosterQuestionnaire(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var write modelsv2.RosterQuestionnaireWrite
		if err := apptypes.DecodeJSON(c, &write); err != nil {
			return err
		}
		for index := range write.Questions {
			write.Questions[index].Order = index
			if write.Questions[index].Options == nil {
				write.Questions[index].Options = []string{}
			}
		}
		if err := validateRosterQuestions(write.Questions); err != nil {
			return err
		}
		serverID, rosterID := c.Query("server_id"), c.Query("roster_id")
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var id uuid.UUID
		var oldRaw []byte
		err = tx.QueryRow(c.UserContext(), `SELECT id, signup_questions FROM rosters WHERE id = $1 AND server_id = $2 FOR UPDATE`, rosterID, serverID).Scan(&id, &oldRaw)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
		}
		if err != nil {
			return err
		}
		old := decodeRosterQuestions(oldRaw)
		removeIDs := incompatibleRosterQuestionIDs(old, write.Questions)
		var affected int64
		if len(removeIDs) > 0 {
			result, err := tx.Exec(c.UserContext(), `UPDATE roster_members SET signup_answers = signup_answers - $1::text[] WHERE roster_id = $2 AND signup_answers ?| $1::text[]`, removeIDs, id)
			if err != nil {
				return err
			}
			affected = result.RowsAffected()
		}
		encoded, err := encodeRosterQuestions(write.Questions)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `UPDATE rosters SET signup_questions = $1, updated_at = now() WHERE id = $2`, encoded, id); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		questionnaire := modelsv2.RosterQuestionnaire{
			AccountSelector: modelsv2.RosterAccountSelector{ID: "account", Type: "account", Required: true},
			Questions:       write.Questions,
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RosterQuestionnaireMutationResponse{Questionnaire: questionnaire, AffectedMemberCount: affected})
	}
}

// publicRosterViewer godoc
// @Summary View a public roster
// @Description Returns a restricted snapshot without answers, refresh errors, raw Discord IDs, or webhook fields.
// @Tags Public Rosters
// @Produce json
// @Param publicShareId path string true "Public share ID"
// @Success 200 {object} modelsv2.PublicRosterViewerResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/public/rosters/{publicShareId} [get]
func publicRosterViewer(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var response modelsv2.PublicRosterViewerResponse
		var id uuid.UUID
		var badgeToken *string
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT r.id, r.public_share_id, r.alias, NULLIF(r.description, ''),
			       c.name, r.clan_tag, c.badge_token, r.updated_at
			FROM rosters r LEFT JOIN basic_clan c ON c.tag = r.clan_tag
			WHERE r.public_share_id = $1 AND r.public_enabled
		`, c.Params("publicShareId")).Scan(&id, &response.ID, &response.Name, &response.Description,
			&response.ClanName, &response.ClanTag, &badgeToken, &response.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Public roster not found")
		}
		if err != nil {
			return err
		}
		response.ClanBadgeURL = badgeURLPtr(badgeToken, 512)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT tag, name, townhall, current_clan_name, current_clan_tag
			FROM roster_members WHERE roster_id = $1 ORDER BY position, tag
		`, id)
		if err != nil {
			return err
		}
		defer rows.Close()
		response.Members = []modelsv2.PublicRosterMember{}
		for rows.Next() {
			var item modelsv2.PublicRosterMember
			if err := rows.Scan(&item.PlayerTag, &item.Name, &item.Townhall, &item.CurrentClanName, &item.CurrentClanTag); err != nil {
				return err
			}
			response.Members = append(response.Members, item)
		}
		c.Set(fiber.HeaderCacheControl, "public, max-age=60")
		return apptypes.JSON(c, http.StatusOK, response)
	}
}
