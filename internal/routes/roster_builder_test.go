package routes

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

func TestRosterRefreshTreatsOnlyClashNotFoundAsDeletedPlayer(t *testing.T) {
	notFound := &clashy.NotFound{HTTPException: &clashy.HTTPException{Status: 404, Reason: "notFound"}}
	if !isClashPlayerNotFound(notFound) {
		t.Fatal("typed Clash 404 should remove the missing roster member")
	}
	if isClashPlayerNotFound(errors.New("proxy unavailable")) {
		t.Fatal("transient lookup errors must not remove roster members")
	}
}

func TestRosterViewValidationRejectsUnknownAndDuplicateMetrics(t *testing.T) {
	write := modelsv2.RosterViewWrite{Name: "War roster", SourceCode: `async () => ({ columns: [], rows: [] })`, SourceVersion: 1}
	if err := validateRosterViewWrite(write); err != nil {
		t.Fatalf("valid saved view rejected: %v", err)
	}
	valid := modelsv2.RosterViewSpec{
		SchemaVersion: 1,
		Columns: []modelsv2.RosterViewColumn{
			{ID: "player", Label: "Player", MetricID: "player.name"},
			{ID: "hit_rate", Label: "Hit rate", MetricID: "war.hit_rate.30d"},
		},
	}
	if err := validateRosterViewSpec(valid); err != nil {
		t.Fatalf("valid view rejected: %v", err)
	}
	unknown := valid
	unknown.Columns = []modelsv2.RosterViewColumn{{ID: "custom", Label: "Custom", MetricID: "sql.custom"}}
	if err := validateRosterViewSpec(unknown); err == nil {
		t.Fatal("unknown metric was accepted")
	}
	duplicate := valid
	duplicate.Columns = []modelsv2.RosterViewColumn{{ID: "player", Label: "Player", MetricID: "player.name"}, {ID: "player", Label: "Again", MetricID: "player.tag"}}
	if err := validateRosterViewSpec(duplicate); err == nil {
		t.Fatal("duplicate metric was accepted")
	}
}

func TestRosterMembershipProposalAllowsOnlyAuthorizedExactChanges(t *testing.T) {
	aliases := map[string]string{"one": "First", "two": "Second"}
	memberships := map[string]map[string]struct{}{
		"one": {"#P1": {}},
		"two": {},
	}
	changes := []modelsv2.RosterMembershipChange{{Action: "move", PlayerTag: "p1", FromRosterID: "one", ToRosterID: "two", Reason: "  TH18 to primary  "}}
	normalized, err := validateRosterMembershipChanges(changes, aliases, memberships)
	if err != nil {
		t.Fatal(err)
	}
	if len(normalized) != 1 || normalized[0].PlayerTag != "#P1" || normalized[0].FromRosterID != "one" || normalized[0].ToRosterID != "two" || normalized[0].Reason != "TH18 to primary" {
		t.Fatalf("normalized changes = %+v", normalized)
	}
	expanded := append(normalized, modelsv2.RosterMembershipChange{Action: "add", PlayerTag: "#P2", ToRosterID: "unattached"})
	if _, err := validateRosterMembershipChanges(expanded, aliases, memberships); err == nil {
		t.Fatal("expanded change to an unattached roster was accepted")
	}
}

func TestPublicRosterViewerResponseOmitsPrivateFields(t *testing.T) {
	response := modelsv2.PublicRosterViewerResponse{
		ID: "share-1", Name: "War team", UpdatedAt: time.Unix(1, 0).UTC(),
		Members: []modelsv2.PublicRosterMember{{PlayerTag: "#P1", Name: "Player", Townhall: 17}},
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{`"id":"share-1"`, `"name":"War team"`, `"updatedAt"`, `"playerTag":"#P1"`, `"townhall":17`} {
		if !bytes.Contains(encoded, []byte(required)) {
			t.Fatalf("public response %s lacks %s", encoded, required)
		}
	}
	for _, forbidden := range []string{"discord", "answers", "heroes", "trophies", "refreshError", "webhook", "view"} {
		if bytes.Contains(bytes.ToLower(encoded), []byte(strings.ToLower(forbidden))) {
			t.Fatalf("public response leaked %s: %s", forbidden, encoded)
		}
	}
}

func TestQuestionValidationAndIncompatibleAnswerRemoval(t *testing.T) {
	old := []modelsv2.RosterQuestion{
		{ID: "availability", Label: "Available?", Type: "boolean"},
		{ID: "note", Label: "Note", Type: "text"},
	}
	current := []modelsv2.RosterQuestion{
		{ID: "availability", Label: "Available?", Type: "single_select", Options: []string{"yes", "no"}},
	}
	got := incompatibleRosterQuestionIDs(old, current)
	if strings.Join(got, ",") != "availability,note" {
		t.Fatalf("incompatible IDs = %v", got)
	}
	if err := validateRosterQuestions([]modelsv2.RosterQuestion{{ID: "account", Label: "Choose", Type: "text"}}); err == nil {
		t.Fatal("reserved account question ID was accepted")
	}
	if err := validateRosterQuestions(make([]modelsv2.RosterQuestion, 5)); err == nil {
		t.Fatal("more than four questions were accepted")
	}
}

func TestQuestionValidationAcceptsCanonicalTypes(t *testing.T) {
	questions := []modelsv2.RosterQuestion{
		{ID: "notes", Label: "Notes", Type: "text"},
		{ID: "backup", Label: "Backup", Type: "boolean"},
		{ID: "available", Label: "Available", Type: "boolean"},
		{ID: "team", Label: "Team", Type: "single_select", Options: []string{"A", "B"}},
	}
	if err := validateRosterQuestions(questions); err != nil {
		t.Fatalf("canonical question types rejected: %v", err)
	}
	questions[3] = modelsv2.RosterQuestion{ID: "teams", Label: "Teams", Type: "multi_select", Options: []string{"A", "B"}}
	if err := validateRosterQuestions(questions); err == nil {
		t.Fatal("multi_select was accepted")
	}
	questions[3].Type = "select"
	if err := validateRosterQuestions(questions); err == nil {
		t.Fatal("non-canonical select type was accepted")
	}
}

func TestQuestionPersistenceHasNoAIDescription(t *testing.T) {
	encoded, err := encodeRosterQuestions([]modelsv2.RosterQuestion{{
		ID: "availability", Label: "Availability", Type: "text", Required: true,
		Options: []string{}, Order: 0,
	}})
	if err != nil {
		t.Fatalf("encode questions: %v", err)
	}
	if strings.Contains(string(encoded), "aiDescription") || strings.Contains(string(encoded), "ai_description") {
		t.Fatalf("persisted question keys = %s", encoded)
	}
	decoded := decodeRosterQuestions(encoded)
	if len(decoded) != 1 || decoded[0].ID != "availability" {
		t.Fatalf("decoded questions = %#v", decoded)
	}
}

func TestRosterRefreshCooldownAndInProgressAreNonFailures(t *testing.T) {
	status, _, ok := rosterRefreshNonFailure(apptypes.Error(fiber.StatusTooManyRequests, "recent"))
	if !ok || status != "reused" {
		t.Fatalf("cooldown status = %q, ok = %v", status, ok)
	}
	status, _, ok = rosterRefreshNonFailure(apptypes.Error(fiber.StatusConflict, "Roster data refresh is already in progress"))
	if !ok || status != "waiting" {
		t.Fatalf("in-progress status = %q, ok = %v", status, ok)
	}
	if _, _, ok = rosterRefreshNonFailure(apptypes.Error(fiber.StatusConflict, "Roster role is not configured")); ok {
		t.Fatal("unrelated conflict was treated as a refresh no-op")
	}
}

func TestMetricParametersAreNormalizedIntoReplayableRecipe(t *testing.T) {
	parameters := normalizeRosterMetricParameters("war.hit_rate", map[string]any{"windowDays": float64(15), "ignored": "value"})
	if parameters["windowDays"] != 15 || parameters["ignored"] != nil {
		t.Fatalf("normalized parameters = %#v", parameters)
	}
}

func TestViewPresentationUsesColumnIDsForFilterSortAndLimit(t *testing.T) {
	limit := 1
	rows := []map[string]any{
		{"playerTag": "#A", "values": map[string]any{"rate": 55.0}},
		{"playerTag": "#B", "values": map[string]any{"rate": 75.0}},
		{"playerTag": "#C", "values": map[string]any{"rate": 40.0}},
	}
	spec := modelsv2.RosterViewSpec{
		Filters: []modelsv2.RosterViewFilter{{ColumnID: "rate", Operator: "gte", Value: 50.0}},
		Sort:    []modelsv2.RosterViewSort{{ColumnID: "rate", Direction: "desc"}}, Limit: &limit,
	}
	result := applyRosterViewPresentation(rows, spec)
	if len(result) != 1 || result[0]["playerTag"] != "#B" {
		t.Fatalf("presented rows = %#v", result)
	}
}

func TestViewRankIsAssignedAfterSortAndLimit(t *testing.T) {
	limit := 2
	rows := []map[string]any{
		{"playerTag": "#A", "values": map[string]any{"rate": 55.0, "rank": nil}},
		{"playerTag": "#B", "values": map[string]any{"rate": 75.0, "rank": nil}},
		{"playerTag": "#C", "values": map[string]any{"rate": 40.0, "rank": nil}},
	}
	spec := modelsv2.RosterViewSpec{
		Columns: []modelsv2.RosterViewColumn{{ID: "rank", MetricID: "view.rank"}},
		Sort:    []modelsv2.RosterViewSort{{ColumnID: "rate", Direction: "desc"}}, Limit: &limit,
	}
	result := applyRosterViewPresentation(rows, spec)
	applyRosterViewRanks(result, spec)
	first := result[0]["values"].(map[string]any)
	second := result[1]["values"].(map[string]any)
	if result[0]["playerTag"] != "#B" || first["rank"] != 1 || second["rank"] != 2 {
		t.Fatalf("ranked rows = %#v", result)
	}
}

func TestRosterViewHighlightsValidateAsPresentationRules(t *testing.T) {
	spec := modelsv2.RosterViewSpec{
		SchemaVersion: 1,
		Columns:       []modelsv2.RosterViewColumn{{ID: "name", Label: "Name", MetricID: "player.name"}},
		Highlights: []modelsv2.RosterViewHighlight{{
			ID: "top_five", Target: "row", Tone: "green",
			When: &modelsv2.RosterViewHighlightCondition{Operator: "lte", Value: 5},
		}},
	}
	if err := validateRosterViewSpec(spec); err != nil {
		t.Fatal(err)
	}
}

func TestRosterViewSupportsPortablePresentationColumns(t *testing.T) {
	spec := modelsv2.RosterViewSpec{
		SchemaVersion: 1,
		Columns: []modelsv2.RosterViewColumn{
			{ID: "roster", Label: "Roster", MetricID: "roster.name"},
			{ID: "league_trophies", Label: "League", MetricID: "player.league_trophies"},
			{ID: "name_length", Label: "Name length", MetricID: "view.computed"},
		},
	}
	if err := validateRosterViewSpec(spec); err != nil {
		t.Fatal(err)
	}
}
