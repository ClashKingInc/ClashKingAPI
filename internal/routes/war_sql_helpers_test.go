package routes

import (
	"strings"
	"testing"
)

func TestOfficialWarStateUsesClashAPICasing(t *testing.T) {
	for input, expected := range map[string]string{
		"notinwar":    "notInWar",
		"notInWar":    "notInWar",
		"preparation": "preparation",
		"inwar":       "inWar",
		"inWar":       "inWar",
		"ended":       "warEnded",
		"warended":    "warEnded",
		"warEnded":    "warEnded",
	} {
		if actual := officialWarState(input); actual != expected {
			t.Errorf("officialWarState(%q) = %q, want %q", input, actual, expected)
		}
	}
}

func TestSQLClanWarAtTimeUsesPrecomputedTimestampBounds(t *testing.T) {
	query := strings.ToLower(sqlClanWarAtTimeQuery)
	for _, invalid := range []string{"$2 -", "$2 +", "make_interval", "end_time - $"} {
		if strings.Contains(query, invalid) {
			t.Errorf("end-time query still performs ambiguous parameter arithmetic %q", invalid)
		}
	}
	for _, required := range []string{"end_time >= $2", "end_time <= $3", "war_type = any($4)", "extract(epoch from end_time)::double precision - $5"} {
		if !strings.Contains(query, required) {
			t.Errorf("end-time query missing %q", required)
		}
	}
}
