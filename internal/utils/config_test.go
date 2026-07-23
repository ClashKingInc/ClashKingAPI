package utils

import (
	"strings"
	"testing"
)

func TestBuildTimescaleURLFromCoolifyVariables(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_HOST":    "timescale",
		"TIMESCALE_PORT":    "5432",
		"POSTGRES_USER":     "tracking",
		"POSTGRES_PASSWORD": "p@ss/word",
		"POSTGRES_DB":       "tracking data",
		"TIMESCALE_SSLMODE": "require",
	}

	got := buildTimescaleURL(func(key string) string { return values[key] })
	want := "postgres://tracking:p%40ss%2Fword@timescale:5432/tracking%20data?sslmode=require"
	if got != want {
		t.Fatalf("buildTimescaleURL() = %q, want %q", got, want)
	}
}

func TestBuildTimescaleURLRequiresConnectionParts(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_HOST": "timescale",
		"POSTGRES_USER":  "tracking",
		"POSTGRES_DB":    "tracking",
	}

	err := validateTimescaleEnvironment(func(key string) string { return values[key] })
	if err == nil || !strings.Contains(err.Error(), "POSTGRES_PASSWORD") {
		t.Fatalf("validateTimescaleEnvironment() error = %v", err)
	}
}

func TestBuildTimescaleURLDoesNotAcceptDirectURL(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_URL": "postgres://direct/database",
		"DATABASE_URL":  "postgres://direct/database",
	}

	err := validateTimescaleEnvironment(func(key string) string { return values[key] })
	if err == nil {
		t.Fatal("validateTimescaleEnvironment() accepted direct database URL")
	}
}
