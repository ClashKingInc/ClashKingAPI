package utils

import (
	"strings"
	"testing"
)

func TestWebOriginsIncludeLandingDashboardAndAppHosts(t *testing.T) {
	values := map[string]string{
		"CLASHKING_LANDING_ORIGIN":   "https://clashk.ing/",
		"CLASHKING_DASHBOARD_ORIGIN": "https://dash.clashk.ing/",
	}

	landing, dashboard, app := webOrigins(func(key string) string { return values[key] })
	if landing != "https://clashk.ing" || dashboard != "https://dash.clashk.ing" {
		t.Fatalf("webOrigins() = %q, %q, %q", landing, dashboard, app)
	}
	if app != "https://app.clashk.ing" {
		t.Fatalf("app origin = %q, want https://app.clashk.ing", app)
	}
}

func TestWebOriginsNormalizeExplicitAppOrigin(t *testing.T) {
	values := map[string]string{
		"CLASHKING_APP_ORIGIN": " https://staging-app.clashk.ing/ ",
	}

	_, _, app := webOrigins(func(key string) string { return values[key] })
	if app != "https://staging-app.clashk.ing" {
		t.Fatalf("app origin = %q, want https://staging-app.clashk.ing", app)
	}
}

func TestBuildTimescaleURLFromCoolifyVariables(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_HOST":     "timescale",
		"TIMESCALE_PORT":     "5432",
		"TIMESCALE_USERNAME": "tracking",
		"TIMESCALE_PASSWORD": "p@ss/word",
		"TIMESCALE_DATABASE": "tracking data",
		"TIMESCALE_SSLMODE":  "require",
	}

	got := buildTimescaleURL(func(key string) string { return values[key] })
	want := "postgres://tracking:p%40ss%2Fword@timescale:5432/tracking%20data?sslmode=require"
	if got != want {
		t.Fatalf("buildTimescaleURL() = %q, want %q", got, want)
	}
}

func TestBuildTimescaleURLRequiresConnectionParts(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_HOST":     "timescale",
		"TIMESCALE_USERNAME": "tracking",
		"TIMESCALE_DATABASE": "tracking",
	}

	err := validateTimescaleEnvironment(func(key string) string { return values[key] })
	if err == nil || !strings.Contains(err.Error(), "TIMESCALE_PASSWORD") {
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

func TestBuildTimescaleURLDoesNotAcceptLegacyParts(t *testing.T) {
	values := map[string]string{
		"TIMESCALE_HOST":     "timescale",
		"TIMESCALE_USER":     "legacy-user",
		"TIMESCALE_PASSWORD": "password",
		"TIMESCALE_DB":       "legacy-database",
	}

	err := validateTimescaleEnvironment(func(key string) string { return values[key] })
	if err == nil || !strings.Contains(err.Error(), "TIMESCALE_USERNAME") || !strings.Contains(err.Error(), "TIMESCALE_DATABASE") {
		t.Fatalf("validateTimescaleEnvironment() error = %v", err)
	}
}

func TestBuildValkeyAddressFromCanonicalParts(t *testing.T) {
	values := map[string]string{
		"VALKEY_HOST": "valkey",
		"VALKEY_PORT": "6380",
	}
	if got, want := buildValkeyAddress(func(key string) string { return values[key] }), "valkey:6380"; got != want {
		t.Fatalf("buildValkeyAddress() = %q, want %q", got, want)
	}
}

func TestBuildValkeyAddressDoesNotAcceptRedisAliases(t *testing.T) {
	values := map[string]string{
		"REDIS_IP": "redis:6379",
		"REDIS_PW": "legacy-password",
	}
	if got := buildValkeyAddress(func(key string) string { return values[key] }); got != "" {
		t.Fatalf("buildValkeyAddress() = %q, want empty", got)
	}
}
