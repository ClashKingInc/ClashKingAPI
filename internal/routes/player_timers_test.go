package routes

import (
	"reflect"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestPlayerTimerFromStoredRowMapsWarCWLAndCapital(t *testing.T) {
	expiresAt := time.Date(2026, time.August, 31, 7, 0, 0, 0, time.FixedZone("offset", 2*60*60))
	text := func(value string) pgtype.Text { return pgtype.Text{String: value, Valid: true} }

	tests := []struct {
		name      string
		eventType string
		eventKey  string
		source    pgtype.Text
		opponent  pgtype.Text
		warType   pgtype.Text
		warTag    pgtype.Text
		want      modelsv2.PlayerTimer
	}{
		{
			name: "regular war", eventType: "war", eventKey: "schedule-1",
			source: text("#VY2J0LL"), opponent: text("#2QJGQLVJ9"), warType: text("random"),
			want: modelsv2.PlayerTimer{Type: modelsv2.PlayerTimerTypeWar, ExpiresAt: "2026-08-31T05:00:00Z", Clans: []string{"#VY2J0LL", "#2QJGQLVJ9"}},
		},
		{
			name: "CWL war", eventType: "war", eventKey: "schedule-2",
			source: text("#28R0LG20C"), opponent: text("#VJJPR9YR"), warType: text("cwl"), warTag: text("#2J0VQG9"),
			want: modelsv2.PlayerTimer{Type: modelsv2.PlayerTimerTypeCWL, ExpiresAt: "2026-08-31T05:00:00Z", WarTag: "#2J0VQG9", Clans: []string{"#28R0LG20C", "#VJJPR9YR"}},
		},
		{
			name: "Capital Raid", eventType: "raid", eventKey: "#VY2J0LL",
			want: modelsv2.PlayerTimer{Type: modelsv2.PlayerTimerTypeCapital, ExpiresAt: "2026-08-31T05:00:00Z", Clans: []string{"#VY2J0LL"}},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := playerTimerFromStoredRow(test.eventType, test.eventKey, expiresAt, test.source, test.opponent, test.warType, test.warTag)
			if !ok || !reflect.DeepEqual(got, test.want) {
				t.Fatalf("timer = %#v, %v; want %#v", got, ok, test.want)
			}
		})
	}
}

func TestPlayerTimersQueryLoadsAllActiveTimerKindsAndCWLTag(t *testing.T) {
	for _, fragment := range []string{
		"schedule.war_type, schedule.war_tag",
		"LEFT JOIN war_schedule AS schedule",
		"timer.event_type = 'war'",
		"timer.player_tag = $1",
		"timer.expires_at > now()",
	} {
		if !strings.Contains(playerTimersQuery, fragment) {
			t.Fatalf("player timers query missing %q", fragment)
		}
	}
}
