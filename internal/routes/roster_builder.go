package routes

import (
	"net/http"
	"regexp"
	"sort"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const (
	rosterViewSpecVersion = 1
)

var rosterQuestionIDPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,47}$`)

var rosterMetrics = []modelsv2.RosterMetric{
	{ID: "player.name", Label: "Player", ValueType: "string", Kind: "snapshot", Description: "Player name"},
	{ID: "player.tag", Label: "Player tag", ValueType: "string", Kind: "snapshot", Description: "Canonical player tag"},
	{ID: "clan.name", Label: "Clan", ValueType: "string", Kind: "snapshot", Description: "Current clan name"},
	{ID: "clan.tag", Label: "Clan tag", ValueType: "string", Kind: "snapshot", Description: "Current clan tag"},
	{ID: "player.townhall", Label: "Town Hall", ValueType: "number", Kind: "snapshot", Description: "Current Town Hall level"},
	{ID: "player.trophies", Label: "Trophies", ValueType: "number", Kind: "snapshot", Description: "Current home-village trophies"},
	{ID: "player.league", Label: "League", ValueType: "string", Kind: "snapshot", Description: "Current league"},
	{ID: "player.league_trophies", Label: "League + Trophies", ValueType: "json", Kind: "presentation", Description: "Current league badge and trophy count"},
	{ID: "roster.name", Label: "Roster", ValueType: "string", Kind: "presentation", Description: "Roster alias for each player row"},
	{ID: "player.heroes", Label: "Heroes", ValueType: "number", Kind: "snapshot", Description: "Sum of current home-village hero levels"},
	{ID: "player.max_percent", Label: "Maxed", ValueType: "number", Kind: "snapshot", Description: "Versioned account completion percent"},
	{ID: "player.war_preference", Label: "War preference", ValueType: "boolean", Kind: "snapshot", Description: "Current war preference"},
	{ID: "discord.username", Label: "Discord", ValueType: "string", Kind: "snapshot", Description: "Stored Discord username"},
	{ID: "signup.answer", Label: "Signup answer", ValueType: "json", Kind: "snapshot", Description: "Answer selected by a roster-scoped questionId parameter"},
	{ID: "player.last_online", Label: "Last online", ValueType: "time", Kind: "snapshot", Description: "Most recently observed online time"},
	{ID: "view.rank", Label: "Rank", ValueType: "number", Kind: "presentation", Description: "One-based row number after the view's filters and sorting are applied"},
	{ID: "view.computed", Label: "Computed value", ValueType: "json", Kind: "presentation", Description: "A value computed transiently by the roster assistant from authorized tool data; the saved replay prompt is its authoritative recipe"},
	{ID: "war.hit_rate", Label: "Hit rate", ValueType: "number", Kind: "historical", Description: "War hit rate with a replayable windowDays parameter", CacheTTL: 900, DependsOn: []string{"player.tag"}},
	{ID: "cwl.stars", Label: "CWL stars", ValueType: "number", Kind: "historical", Description: "CWL stars with a replayable seasonOffset parameter", CacheTTL: 900, DependsOn: []string{"player.tag"}},
	{ID: "trophies.delta", Label: "Trophy delta", ValueType: "number", Kind: "historical", Description: "Trophy delta with a replayable windowDays parameter", CacheTTL: 900, DependsOn: []string{"player.tag"}},
	{ID: "benchmark.th_hit_rate_delta", Label: "TH benchmark delta", ValueType: "number", Kind: "derived", Description: "Hit-rate difference from the Town Hall benchmark with a replayable windowDays parameter", CacheTTL: 900, DependsOn: []string{"war.hit_rate", "player.townhall"}},
	{ID: "war.hit_rate.30d", Label: "Hit rate (30d)", ValueType: "number", Kind: "historical", Description: "Trailing 30-day war hit rate", CacheTTL: 900, DependsOn: []string{"player.tag"}},
	{ID: "cwl.stars.current", Label: "CWL stars", ValueType: "number", Kind: "historical", Description: "Current-season CWL stars", CacheTTL: 900, DependsOn: []string{"player.tag"}},
	{ID: "benchmark.th_hit_rate_delta.30d", Label: "TH benchmark delta", ValueType: "number", Kind: "derived", Description: "Hit-rate difference from the Town Hall benchmark", CacheTTL: 900, DependsOn: []string{"war.hit_rate.30d", "player.townhall"}},
	{ID: "trophies.delta.7d", Label: "Trophy delta (7d)", ValueType: "number", Kind: "historical", Description: "Trailing seven-day trophy change", CacheTTL: 900, DependsOn: []string{"player.tag"}},
}

func rosterMetricByID(id string) (modelsv2.RosterMetric, bool) {
	for _, metric := range rosterMetrics {
		if metric.ID == id {
			return metric, true
		}
	}
	return modelsv2.RosterMetric{}, false
}

// listRosterMetrics godoc
// @Summary List roster metrics
// @Description Returns stable metric IDs available to saved roster views and the AI builder.
// @Tags Roster Builder
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Success 200 {object} map[string][]modelsv2.RosterMetric
// @Router /v2/roster/metrics [get]
func listRosterMetrics(_ apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": rosterMetrics})
	}
}

func validateRosterViewWrite(write modelsv2.RosterViewWrite) error {
	if strings.TrimSpace(write.Name) == "" || len(write.Name) > 80 {
		return apptypes.Error(http.StatusBadRequest, "View name is required and must be at most 80 characters")
	}
	if strings.TrimSpace(write.SourceCode) == "" || len(write.SourceCode) > 65536 {
		return apptypes.Error(http.StatusBadRequest, "View sourceCode is required and must be at most 65536 characters")
	}
	if write.SourceVersion != 1 {
		return apptypes.Error(http.StatusBadRequest, "Unsupported roster view sourceVersion")
	}
	return nil
}

func validateRosterViewSpec(spec modelsv2.RosterViewSpec) error {
	if spec.SchemaVersion != rosterViewSpecVersion {
		return apptypes.Error(http.StatusBadRequest, "Unsupported roster view spec version")
	}
	if spec.Limit != nil && (*spec.Limit < 1 || *spec.Limit > 500) {
		return apptypes.Error(http.StatusBadRequest, "Roster view limit must be between 1 and 500")
	}
	if len(spec.Columns) == 0 || len(spec.Columns) > 24 {
		return apptypes.Error(http.StatusBadRequest, "Roster views require 1 to 24 columns")
	}
	seen := map[string]struct{}{}
	for _, column := range spec.Columns {
		if !rosterQuestionIDPattern.MatchString(column.ID) || strings.TrimSpace(column.Label) == "" {
			return apptypes.Error(http.StatusBadRequest, "Roster columns require stable IDs and labels")
		}
		if _, ok := rosterMetricByID(column.MetricID); !ok {
			return apptypes.Error(http.StatusBadRequest, "Unknown roster metric: "+column.MetricID)
		}
		if column.MetricID == "signup.answer" {
			questionID, _ := column.Parameters["questionId"].(string)
			if !rosterQuestionIDPattern.MatchString(questionID) {
				return apptypes.Error(http.StatusBadRequest, "signup.answer columns require a valid questionId parameter")
			}
		}
		if _, ok := seen[column.ID]; ok {
			return apptypes.Error(http.StatusBadRequest, "Roster view column IDs must be unique")
		}
		seen[column.ID] = struct{}{}
	}
	for _, item := range spec.Sort {
		if _, ok := seen[item.ColumnID]; !ok || item.Direction != "asc" && item.Direction != "desc" {
			return apptypes.Error(http.StatusBadRequest, "Invalid roster view sort")
		}
	}
	for _, item := range spec.Filters {
		if _, ok := seen[item.ColumnID]; !ok || !validRosterFilterOperator(item.Operator) {
			return apptypes.Error(http.StatusBadRequest, "Invalid roster view filter")
		}
	}
	if len(spec.Highlights) > 20 {
		return apptypes.Error(http.StatusBadRequest, "Roster views support at most 20 highlight rules")
	}
	highlightIDs := map[string]struct{}{}
	for _, item := range spec.Highlights {
		if !rosterQuestionIDPattern.MatchString(item.ID) {
			return apptypes.Error(http.StatusBadRequest, "Roster highlights require stable IDs")
		}
		if _, exists := highlightIDs[item.ID]; exists {
			return apptypes.Error(http.StatusBadRequest, "Roster highlight IDs must be unique")
		}
		highlightIDs[item.ID] = struct{}{}
		if item.Target != "row" && item.Target != "column" && item.Target != "cell" {
			return apptypes.Error(http.StatusBadRequest, "Invalid roster highlight target")
		}
		if item.Target == "column" || item.Target == "cell" {
			if _, ok := seen[item.ColumnID]; !ok {
				return apptypes.Error(http.StatusBadRequest, "Roster column and cell highlights require a valid columnId")
			}
		}
		if item.When != nil {
			if item.When.ColumnID != "" {
				if _, ok := seen[item.When.ColumnID]; !ok {
					return apptypes.Error(http.StatusBadRequest, "Roster highlight conditions require a valid columnId")
				}
			}
			if !validRosterFilterOperator(item.When.Operator) {
				return apptypes.Error(http.StatusBadRequest, "Invalid roster highlight condition")
			}
		}
		switch item.Tone {
		case "red", "amber", "green", "blue", "purple", "gray":
		default:
			return apptypes.Error(http.StatusBadRequest, "Invalid roster highlight tone")
		}
	}
	return nil
}

func validRosterFilterOperator(value string) bool {
	switch value {
	case "eq", "neq", "gt", "gte", "lt", "lte", "in", "contains":
		return true
	default:
		return false
	}
}

func validateRosterQuestions(questions []modelsv2.RosterQuestion) error {
	if len(questions) > 4 {
		return apptypes.Error(http.StatusBadRequest, "A roster can have at most four configurable questions")
	}
	seen := map[string]struct{}{}
	for _, question := range questions {
		if !rosterQuestionIDPattern.MatchString(question.ID) || question.ID == "account" {
			return apptypes.Error(http.StatusBadRequest, "Question IDs must be stable lowercase identifiers and cannot be account")
		}
		if _, ok := seen[question.ID]; ok {
			return apptypes.Error(http.StatusBadRequest, "Question IDs must be unique")
		}
		seen[question.ID] = struct{}{}
		if strings.TrimSpace(question.Label) == "" || len(question.Label) > 160 {
			return apptypes.Error(http.StatusBadRequest, "Question labels are required and must be at most 160 characters")
		}
		switch question.Type {
		case "text", "boolean":
			if len(question.Options) != 0 {
				return apptypes.Error(http.StatusBadRequest, "Only select questions can define options")
			}
		case "single_select":
			if len(question.Options) < 1 || len(question.Options) > 20 {
				return apptypes.Error(http.StatusBadRequest, "Select questions require 1 to 20 options")
			}
		default:
			return apptypes.Error(http.StatusBadRequest, "Unsupported roster question type")
		}
	}
	return nil
}

func incompatibleRosterQuestionIDs(oldQuestions, newQuestions []modelsv2.RosterQuestion) []string {
	newByID := make(map[string]modelsv2.RosterQuestion, len(newQuestions))
	for _, question := range newQuestions {
		newByID[question.ID] = question
	}
	var ids []string
	for _, old := range oldQuestions {
		current, exists := newByID[old.ID]
		if !exists || current.Type != old.Type {
			ids = append(ids, old.ID)
		}
	}
	sort.Strings(ids)
	return ids
}

func validateRosterAIRequest(body modelsv2.RosterAIRequest, cfg apptypes.Config) error {
	if strings.TrimSpace(body.ServerID) == "" || len(body.RosterIDs) == 0 {
		return apptypes.Error(http.StatusBadRequest, "serverId and rosterIds are required")
	}
	if len(body.Messages) == 0 || len(body.Messages) > 30 || len(body.RosterIDs) > 25 {
		return apptypes.Error(http.StatusBadRequest, "AI requests require 1 to 30 messages and 1 to 25 roster attachments")
	}
	seenRosters := map[string]struct{}{}
	for _, rosterID := range body.RosterIDs {
		if strings.TrimSpace(rosterID) == "" {
			return apptypes.Error(http.StatusBadRequest, "rosterIds cannot contain empty values")
		}
		if _, exists := seenRosters[rosterID]; exists {
			return apptypes.Error(http.StatusBadRequest, "rosterIds must be unique")
		}
		seenRosters[rosterID] = struct{}{}
	}
	total := 0
	for _, message := range body.Messages {
		content := rosterAIMessageText(message)
		if message.Role != "user" && message.Role != "assistant" || strings.TrimSpace(content) == "" {
			return apptypes.Error(http.StatusBadRequest, "AI messages require user or assistant roles and non-empty text parts")
		}
		total += len(content)
	}
	if total > cfg.AIRosterMaxPromptChars {
		return apptypes.Error(http.StatusRequestEntityTooLarge, "AI roster prompt is too large")
	}
	return nil
}

func loadRosterAIAttachments(c *fiber.Ctx, a apptypes.Deps, serverID string, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rosterIDs, err := parseRosterUUIDs(ids)
	if err != nil {
		return nil, err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT r.id, r.alias, r.clan_tag, r.revision, r.signup_questions, count(rm.tag)
		FROM rosters r
		LEFT JOIN roster_members rm ON rm.roster_id = r.id
		WHERE r.server_id = $1 AND r.id = ANY($2)
		GROUP BY r.id, r.alias, r.clan_tag, r.revision, r.signup_questions
	`, serverID, rosterIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var databaseID uuid.UUID
		var alias string
		var clanTag *string
		var memberCount int
		var revision int64
		var questionsRaw []byte
		if err := rows.Scan(&databaseID, &alias, &clanTag, &revision, &questionsRaw, &memberCount); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"rosterId": databaseID.String(), "alias": alias, "clanTag": clanTag, "memberCount": memberCount, "revision": revision, "signupQuestions": decodeRosterQuestions(questionsRaw)})
	}
	if len(items) != len(ids) {
		return nil, apptypes.Error(http.StatusBadRequest, "One or more roster attachments do not belong to this server")
	}
	return items, nil
}

func rosterAIMessageText(message modelsv2.RosterAIMessage) string {
	if strings.TrimSpace(message.Content) != "" {
		return strings.TrimSpace(message.Content)
	}
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		if part.Type == "text" && strings.TrimSpace(part.Text) != "" {
			parts = append(parts, strings.TrimSpace(part.Text))
		}
	}
	return strings.Join(parts, "\n")
}
