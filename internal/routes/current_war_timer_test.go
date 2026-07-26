package routes

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

type currentWarTimerTestRow struct {
	warID       string
	clanTag     string
	opponentTag string
	endTime     time.Time
}

func (row currentWarTimerTestRow) Scan(dest ...any) error {
	*dest[0].(*string) = row.warID
	*dest[1].(*string) = row.clanTag
	*dest[2].(*string) = row.opponentTag
	*dest[3].(*time.Time) = row.endTime
	return nil
}

func TestCurrentWarTimerResponseUsesOnlyRetainedTypedFields(t *testing.T) {
	endTime := time.Date(2026, time.July, 24, 23, 45, 0, 0, time.FixedZone("offset", -5*60*60))
	response, err := currentWarTimerResponse(currentWarTimerTestRow{
		warID:       "war-123",
		clanTag:     "#2PP",
		opponentTag: "#9CG",
		endTime:     endTime,
	}, "#PLAYER")
	if err != nil {
		t.Fatalf("currentWarTimerResponse() error = %v", err)
	}
	want := map[string]any{
		"tag":       "#PLAYER",
		"war_id":    "war-123",
		"clan":      "#2PP",
		"opponent":  "#9CG",
		"unix_time": endTime.Unix(),
		"time":      endTime.UTC().Format(time.RFC3339),
	}
	if !reflect.DeepEqual(response, want) {
		t.Fatalf("currentWarTimerResponse() = %#v, want %#v", response, want)
	}
}

func TestCurrentWarTimerQueryUsesRetainedColumnsAndActivePredicate(t *testing.T) {
	for _, required := range []string{
		"SELECT war_id, clan_tag, opponent_tag, end_time",
		"FROM current_war_timers",
		"WHERE player_tag = $1",
		"AND end_time > now()",
	} {
		if !strings.Contains(currentWarTimerQuery, required) {
			t.Fatalf("current-war timer query missing %q", required)
		}
	}
	for _, obsolete := range []string{"data", "updated_at"} {
		if strings.Contains(currentWarTimerQuery, obsolete) {
			t.Fatalf("current-war timer query still reads dropped column %q", obsolete)
		}
	}
}
