package routes

import "testing"

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
