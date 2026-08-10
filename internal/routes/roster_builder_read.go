package routes

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// listRosterBuilderRosters godoc
// @Summary List roster-builder rosters
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} map[string]any
// @Router /v2/server/{server_id}/rosters [get]
func listRosterBuilderRosters(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		items, err := queryRosterBuilderSummaries(c, a, c.Params("server_id"), "")
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// getRosterBuilderRoster godoc
// @Summary Get a roster-builder roster
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param roster_id path string true "Roster ID"
// @Success 200 {object} map[string]any
// @Router /v2/server/{server_id}/rosters/{roster_id} [get]
func getRosterBuilderRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		items, err := queryRosterBuilderSummaries(c, a, c.Params("server_id"), c.Params("roster_id"))
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
		}
		roster := items[0]
		id := roster["databaseId"].(uuid.UUID)
		delete(roster, "databaseId")
		members, err := queryRosterBuilderMembers(c, a, id, false)
		if err != nil {
			return err
		}
		roster["members"] = members
		return apptypes.JSON(c, http.StatusOK, map[string]any{"roster": roster})
	}
}

func queryRosterBuilderSummaries(c *fiber.Ctx, a apptypes.Deps, serverID, rosterID string) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT r.id, r.server_id, r.alias, NULLIF(r.description, ''), r.clan_tag,
		       r.public_share_id, r.signup_questions, r.last_refreshed_at,
		       r.display_column_ids, r.sort_configuration, r.webhook_id, r.message_id,
		       r.created_at, r.updated_at, r.revision,
		       (SELECT count(*) FROM roster_members m WHERE m.roster_id = r.id)
		FROM rosters r
		WHERE r.server_id = $1 AND ($2 = '' OR r.id = NULLIF($2, '')::uuid)
		ORDER BY r.updated_at DESC
	`, serverID, rosterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var storedServerID, alias string
		var description, clanTag, shareID *string
		var questionsRaw []byte
		var memberCount int
		var revision int64
		var displayColumnIDs []string
		var sortRaw []byte
		var webhookID, messageID *string
		var refreshedAt *time.Time
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &storedServerID, &alias, &description, &clanTag, &shareID, &questionsRaw, &refreshedAt, &displayColumnIDs, &sortRaw, &webhookID, &messageID, &createdAt, &updatedAt, &revision, &memberCount); err != nil {
			return nil, err
		}
		questions := decodeRosterQuestions(questionsRaw)
		var sortConfiguration []modelsv2.RosterViewSort
		_ = json.Unmarshal(sortRaw, &sortConfiguration)
		items = append(items, map[string]any{
			"databaseId": id, "id": id.String(), "serverId": storedServerID, "alias": alias,
			"description": description, "clanTag": clanTag, "publicShareId": shareID,
			"displayColumnIds": displayColumnIDs, "sortConfiguration": sortConfiguration,
			"webhookId": webhookID, "messageId": messageID,
			"questionnaire": modelsv2.RosterQuestionnaire{
				AccountSelector: modelsv2.RosterAccountSelector{ID: "account", Type: "account", Required: true},
				Questions:       questions,
			},
			"memberCount": memberCount, "refreshedAt": refreshedAt, "revision": revision,
			"createdAt": createdAt, "updatedAt": updatedAt,
		})
	}
	return items, rows.Err()
}

func queryRosterBuilderMembers(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID, public bool) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, current_clan_tag, current_clan_name, townhall, trophies,
		       league_id, league_name, hero_level_sum, max_percent,
		       war_preference, discord_user_id, discord_username,
		       discord_avatar_url, last_online, refreshed_at, signup_answers
		FROM roster_members WHERE roster_id = $1 ORDER BY position, tag
	`, rosterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var tag, name string
		var clanTag, clanName, leagueName, discordID, discordUsername, discordAvatar *string
		var townhall, heroLevelSum int
		var trophies, leagueID *int
		var maxPercent *float64
		var warPreference *bool
		var lastOnline, refreshedAt *time.Time
		var answersRaw []byte
		if err := rows.Scan(&tag, &name, &clanTag, &clanName, &townhall, &trophies, &leagueID, &leagueName, &heroLevelSum, &maxPercent, &warPreference, &discordID, &discordUsername, &discordAvatar, &lastOnline, &refreshedAt, &answersRaw); err != nil {
			return nil, err
		}
		var answers any
		_ = json.Unmarshal(answersRaw, &answers)
		item := map[string]any{
			"playerTag": tag, "playerName": name, "clanTag": clanTag, "clanName": clanName,
			"townhall": townhall, "trophies": trophies, "leagueId": leagueID, "leagueName": leagueName,
			"heroLevelSum": heroLevelSum,
			"maxPercent":   maxPercent, "warPreference": warPreference,
			"discordUsername":  discordUsername,
			"discordAvatarUrl": discordAvatar, "lastOnline": lastOnline, "refreshedAt": refreshedAt,
		}
		if !public {
			item["discordUserId"], item["answers"] = discordID, answers
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// getRosterSignupForm godoc
// @Summary Get a roster signup form
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param roster_id path string true "Roster ID"
// @Success 200 {object} modelsv2.RosterQuestionnaire
// @Router /v2/server/{server_id}/rosters/{roster_id}/signup-form [get]
func getRosterSignupForm(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		items, err := queryRosterBuilderSummaries(c, a, c.Params("server_id"), c.Params("roster_id"))
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
		}
		return apptypes.JSON(c, http.StatusOK, items[0]["questionnaire"])
	}
}

// getRosterBuilderMissingMembers godoc
// @Summary List clan members missing from a roster
// @Description Returns roster output data; the bot resolves guild membership and sends reminders.
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param roster_id path string true "Roster ID"
// @Success 200 {object} map[string]any
// @Router /v2/server/{server_id}/rosters/{roster_id}/missing-members [get]
func getRosterBuilderMissingMembers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var id uuid.UUID
		var clanTag *string
		err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT id, clan_tag FROM rosters WHERE id = $1 AND server_id = $2`, c.Params("roster_id"), c.Params("server_id")).Scan(&id, &clanTag)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
		}
		if err != nil {
			return err
		}
		if clanTag == nil || *clanTag == "" {
			return apptypes.Error(http.StatusConflict, "Roster clan is not configured")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT tag, name, townhall, trophies, current_clan_tag, current_clan_name, discord_user_id
			FROM roster_members
			WHERE roster_id = $1 AND current_clan_tag IS DISTINCT FROM $2
			ORDER BY position, tag
		`, id, *clanTag)
		if err != nil {
			return err
		}
		items := []map[string]any{}
		for rows.Next() {
			var tag, name string
			var townhall int
			var trophies *int
			var currentClanTag, currentClanName, discordUserID *string
			if err := rows.Scan(&tag, &name, &townhall, &trophies, &currentClanTag, &currentClanName, &discordUserID); err != nil {
				rows.Close()
				return err
			}
			items = append(items, map[string]any{
				"playerTag": tag, "playerName": name, "townhall": townhall, "trophies": trophies,
				"clanTag": currentClanTag, "clanName": currentClanName, "discordUserId": discordUserID,
			})
		}
		rows.Close()
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

// submitRosterSignup godoc
// @Summary Submit a roster signup
// @Description The account selector is represented by playerTag and must belong to the authenticated user.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param roster_id path string true "Roster ID"
// @Param body body modelsv2.RosterSignupSubmissionRequest true "Signup"
// @Success 201 {object} map[string]modelsv2.RosterSignupSubmission
// @Router /v2/server/{server_id}/rosters/{roster_id}/submissions [post]
func submitRosterSignup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterSignupSubmissionRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag := clashy.CorrectTag(body.PlayerTag)
		userID := apptypes.UserID(c.UserContext())
		linkedUserID := userID
		var owns bool
		if isBotPrincipal(c) {
			err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT user_id FROM player_links WHERE tag = $1`, tag).Scan(&linkedUserID)
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusForbidden, "Selected account is not linked")
			}
			if err != nil {
				return err
			}
			if body.DiscordUserID != "" && body.DiscordUserID != linkedUserID {
				return apptypes.Error(http.StatusForbidden, "Discord user does not own the selected account")
			}
		} else {
			if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT EXISTS (SELECT 1 FROM player_links WHERE user_id = $1 AND tag = $2)`, userID, tag).Scan(&owns); err != nil {
				return err
			}
			if !owns {
				return apptypes.Error(http.StatusForbidden, "Selected account is not linked")
			}
		}
		discordUsername, discordAvatarURL := strings.TrimSpace(body.DiscordUsername), strings.TrimSpace(body.DiscordAvatarURL)
		if !isBotPrincipal(c) || discordUsername == "" {
			guildID, guildErr := strconv.ParseInt(c.Params("server_id"), 10, 64)
			userSnowflake, userErr := strconv.ParseInt(linkedUserID, 10, 64)
			if guildErr == nil && userErr == nil && a.Discord != nil {
				if member := a.Discord.GetMemberDirect(c.UserContext(), guildID, userSnowflake); member != nil {
					discordUsername, discordAvatarURL = member.User.Username, member.EffectiveAvatarURL()
				}
			}
		}
		var rosterID uuid.UUID
		var questionsRaw []byte
		if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT id, signup_questions FROM rosters WHERE id = $1 AND server_id = $2`, c.Params("roster_id"), c.Params("server_id")).Scan(&rosterID, &questionsRaw); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Roster not found")
			}
			return err
		}
		questions := decodeRosterQuestions(questionsRaw)
		if err := validateRosterAnswers(questions, body.Answers); err != nil {
			return err
		}
		answers, _ := json.Marshal(body.Answers)
		var submission modelsv2.RosterSignupSubmission
		var answersOut []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO roster_members (roster_id, tag, name, townhall, trophies, current_clan_tag, current_clan_name, signup_answers, discord_user_id, discord_username, discord_avatar_url)
			SELECT $1, p.tag, p.name, p.townhall_level, p.trophies, p.clan_tag, c.name, $3, $4, NULLIF($5, ''), NULLIF($6, '')
			FROM basic_player p LEFT JOIN basic_clan c ON c.tag = p.clan_tag WHERE p.tag = $2
			ON CONFLICT (roster_id, tag) DO UPDATE SET
				signup_answers = EXCLUDED.signup_answers,
				discord_user_id = EXCLUDED.discord_user_id,
				discord_username = EXCLUDED.discord_username,
				discord_avatar_url = EXCLUDED.discord_avatar_url
			RETURNING signup_answers
		`, rosterID, tag, answers, linkedUserID, discordUsername, discordAvatarURL).Scan(&answersOut)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Selected account snapshot is unavailable")
		}
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		submission.ID, submission.RosterID, submission.PlayerTag = c.Params("roster_id")+":"+tag, c.Params("roster_id"), tag
		submission.CreatedAt, submission.UpdatedAt = now, now
		_ = json.Unmarshal(answersOut, &submission.Answers)
		return apptypes.JSON(c, http.StatusCreated, map[string]any{"submission": submission})
	}
}

func validateRosterAnswers(questions []modelsv2.RosterQuestion, answers map[string]any) error {
	byID := map[string]modelsv2.RosterQuestion{}
	for _, question := range questions {
		byID[question.ID] = question
	}
	for key := range answers {
		if _, ok := byID[key]; !ok {
			return apptypes.Error(http.StatusBadRequest, "Unknown roster answer key: "+key)
		}
	}
	for _, question := range questions {
		value, exists := answers[question.ID]
		if question.Required && (!exists || value == nil || (question.Type != "boolean" && strings.TrimSpace(asAnswerString(value)) == "")) {
			return apptypes.Error(http.StatusBadRequest, "Missing required roster answer: "+question.ID)
		}
		if exists && !validRosterAnswerType(question, value) {
			return apptypes.Error(http.StatusBadRequest, "Invalid answer for roster question: "+question.ID)
		}
	}
	return nil
}

func asAnswerString(value any) string {
	text, _ := value.(string)
	return text
}

func validRosterAnswerType(question modelsv2.RosterQuestion, value any) bool {
	switch question.Type {
	case "text":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "single_select":
		text, ok := value.(string)
		return ok && containsRosterOption(question.Options, text)
	default:
		return false
	}
}

func containsRosterOption(options []string, value string) bool {
	for _, option := range options {
		if option == value {
			return true
		}
	}
	return false
}
