package routes

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestValidateCWLBonusRequestNormalizesRecipientsAndRequiresOverrideReason(t *testing.T) {
	count := 7
	request := modelsv2.SubmitCWLBonusAwards{
		ServerID: "1", CWLID: "abcdefghijkl", ExpectedRevision: 0,
		RecipientTags: []string{" player1 ", "#player2"}, AwardCountOverride: &count,
	}
	if err := validateCWLBonusRequest(&request, "retry-key"); err == nil {
		t.Fatal("manual award count without an override reason was accepted")
	}
	reason := " verified against the in-game result "
	request.OverrideReason = &reason
	if err := validateCWLBonusRequest(&request, "retry-key"); err != nil {
		t.Fatalf("valid override rejected: %v", err)
	}
	if strings.Join(request.RecipientTags, ",") != "#PLAYER1,#PLAYER2" {
		t.Fatalf("recipient tags = %v", request.RecipientTags)
	}
	if request.OverrideReason == nil || *request.OverrideReason != "verified against the in-game result" {
		t.Fatalf("override reason = %#v", request.OverrideReason)
	}
}

func TestValidateCWLBonusRequestRejectsDuplicateRecipients(t *testing.T) {
	request := modelsv2.SubmitCWLBonusAwards{
		ServerID: "1", CWLID: "abcdefghijkl", RecipientTags: []string{"player1", "#PLAYER1"},
	}
	if err := validateCWLBonusRequest(&request, "retry-key"); err == nil {
		t.Fatal("duplicate normalized recipients were accepted")
	}
}

func TestCWLBonusCalculationNeedsEndedFinalStandingsAndEffectiveRule(t *testing.T) {
	league, size, wins, placement := 48000016, 15, 5, 2
	facts := cwlBonusFacts{
		Season: "2026-07", State: "ended", LeagueID: &league, WarSize: &size,
		WarsWon: &wins, FinalPlacement: &placement,
	}
	calculation := cwlBonusCalculation(facts, cwlBonusRule{Version: "2026-v1", Base: 3}, true)
	if calculation.Status != "ready" || calculation.AwardCount == nil || *calculation.AwardCount != 8 ||
		calculation.BaseAwardCount == nil || *calculation.BaseAwardCount != 3 || len(calculation.Reasons) != 0 {
		t.Fatalf("ready calculation = %#v", calculation)
	}
	facts.FinalPlacement = nil
	calculation = cwlBonusCalculation(facts, cwlBonusRule{Version: "2026-v1", Base: 3}, true)
	if calculation.Status != "incomplete" || calculation.AwardCount != nil ||
		!strings.Contains(strings.Join(calculation.Reasons, ","), "Final placement") {
		t.Fatalf("incomplete calculation = %#v", calculation)
	}
}

func TestCWLBonusContextUsesTypedCamelCaseContract(t *testing.T) {
	placement, awardCount := 2, 8
	response := modelsv2.CWLBonusContext{
		CWLID: "abcdefghijkl", Clan: modelsv2.CWLBonusClan{Tag: "#CLAN", Name: "Clan"},
		Season: "2026-07", League: modelsv2.CWLBonusLeague{ID: 48000016, Name: "Champion League III"},
		WarSize: 15, FinalPlacement: &placement, WarsWon: 5,
		Calculation: modelsv2.CWLBonusCalculation{Status: "ready", AwardCount: &awardCount, RulesetVersion: "2026-v1", Reasons: []string{}},
		Members:     []modelsv2.CWLBonusMember{},
	}
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{`"cwlId"`, `"finalPlacement"`, `"warsWon"`, `"awardCount"`, `"rulesetVersion"`, `"members":[]`} {
		if !bytes.Contains(raw, []byte(required)) {
			t.Errorf("response %s lacks %s", raw, required)
		}
	}
	for _, forbidden := range []string{`"cwl_id"`, `"final_placement"`, `"wars_won"`, `"award_count"`} {
		if bytes.Contains(raw, []byte(forbidden)) {
			t.Errorf("response %s contains %s", raw, forbidden)
		}
	}
}

func TestCWLBonusCreateContractContainsNoClientCalculatedInputs(t *testing.T) {
	raw, err := json.Marshal(modelsv2.SubmitCWLBonusAwards{
		ServerID: "1", CWLID: "abcdefghijkl", RecipientTags: []string{"#PLAYER"}, ExpectedRevision: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{`"serverId"`, `"cwlId"`, `"recipientTags"`, `"expectedRevision"`} {
		if !bytes.Contains(raw, []byte(required)) {
			t.Errorf("request %s lacks %s", raw, required)
		}
	}
	for _, forbidden := range []string{"league", "warSize", "warsWon", "finalPlacement", "baseAwardCount"} {
		if bytes.Contains(raw, []byte(forbidden)) {
			t.Errorf("request %s exposes server-calculated field %s", raw, forbidden)
		}
	}
}

func TestCWLBonusHistoryRequiresExactlyOneFilter(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/history", getCWLBonusHistory(apptypes.Deps{}))
	for _, query := range []string{
		"?serverId=1",
		"?serverId=1&clanTag=%23CLAN&playerTag=%23PLAYER",
	} {
		response, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/history"+query, nil))
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != fiber.StatusBadRequest {
			t.Fatalf("query %q status = %d", query, response.StatusCode)
		}
	}
}

func TestCWLBonusSQLUsesAuthoritativeFrozenRosterAndImmutableLedger(t *testing.T) {
	raw, err := os.ReadFile("cwl_bonus_awards.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	for _, required := range []string{
		"FROM cwl_bonus_award_rules", "FROM cwl_group_members", "LEFT JOIN cwl_standings",
		"INSERT INTO cwl_bonus_award_submissions", "INSERT INTO cwl_bonus_award_recipients",
		"supersedes_id", "idempotency_key", "expectedRevision is stale",
		"Every recipient must belong to the frozen CWL group roster",
	} {
		if !strings.Contains(source, required) {
			t.Errorf("CWL bonus implementation lacks %q", required)
		}
	}
	for _, forbidden := range []string{"UPDATE cwl_bonus_award_submissions", "DELETE FROM cwl_bonus_award_submissions"} {
		if strings.Contains(source, forbidden) {
			t.Errorf("immutable ledger implementation contains %q", forbidden)
		}
	}
}
