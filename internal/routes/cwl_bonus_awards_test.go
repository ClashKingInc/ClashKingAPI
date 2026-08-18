package routes

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestCWLBonusRecipientContractIsMinimal(t *testing.T) {
	raw, err := json.Marshal(modelsv2.ReplaceCWLBonusRecipientsRequest{Recipients: []modelsv2.CWLBonusRecipient{{PlayerTag: "#P1", MedalCount: 100}}})
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"recipients":[{"playerTag":"#P1","medalCount":100}]}` {
		t.Fatalf("request = %s", raw)
	}
}

func TestCWLBonusSeasonValidation(t *testing.T) {
	for _, season := range []string{"2026-01", "2026-12", "2026-07-02", "2026-12-31"} {
		if !validCWLBonusSeason(season) {
			t.Fatalf("valid season %q rejected", season)
		}
	}
	for _, season := range []string{"", "2026-00", "2026-13", "26-01", "2026-02-30", "2026-07-2", "2026-07-02-extra"} {
		if validCWLBonusSeason(season) {
			t.Fatalf("invalid season %q accepted", season)
		}
	}
}

func TestCWLBonusSQLUsesFrozenRosterAndReplaceSemantics(t *testing.T) {
	raw, err := os.ReadFile("cwl_bonus_awards.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	for _, required := range []string{"FROM cwl_group_members", "DELETE FROM cwl_bonus_recipients", "INSERT INTO cwl_bonus_recipients", "FROM server_clans"} {
		if !strings.Contains(source, required) {
			t.Errorf("CWL bonus implementation lacks %q", required)
		}
	}
	for _, forbidden := range []string{"cwl_bonus_award_rules", "cwl_bonus_award_submissions", "cwl_standings", "idempotency_key"} {
		if strings.Contains(source, forbidden) {
			t.Errorf("simplified implementation still contains %q", forbidden)
		}
	}
}
