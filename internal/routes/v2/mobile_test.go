package v2

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestPublicMobileConfigReturnsSentryDSN(t *testing.T) {
	app := fiber.New()
	app.Get("/v2/public-config", publicMobileConfig(apptypes.Deps{
		Config: apptypes.Config{
			SentryDSNMobile: "mobile-dsn",
		},
	}))

	req := httptest.NewRequest(http.MethodGet, "/v2/public-config", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got := body["sentry_dsn"]; got != "mobile-dsn" {
		t.Fatalf("expected sentry_dsn to round-trip, got %v", got)
	}
}

func TestMobileInitializationResponseMatchesAppContract(t *testing.T) {
	response := mobileInitializationResponse(
		[]string{"#AAA", "#BBB"},
		nil,
		nil,
		nil,
		nil,
		nil,
		"user-123",
		time.Date(2026, time.May, 9, 12, 0, 0, 0, time.UTC),
	)

	for _, key := range []string{"players", "players_basic", "clans", "war_stats", "clan_tags", "metadata"} {
		if _, exists := response[key]; !exists {
			t.Fatalf("expected initialization response to include %q", key)
		}
	}

	clans, ok := response["clans"].(map[string]any)
	if !ok {
		t.Fatalf("expected clans bundle map, got %T", response["clans"])
	}
	for _, key := range []string{"clan_details", "clan_stats", "war_data", "join_leave_data", "capital_data", "war_log_data", "clan_war_stats", "cwl_data"} {
		if _, exists := clans[key]; !exists {
			t.Fatalf("expected clans bundle to include %q", key)
		}
	}

	metadata, ok := response["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata map, got %T", response["metadata"])
	}
	if got := metadata["total_players"]; got != 2 {
		t.Fatalf("expected total_players=2, got %v", got)
	}
	if got := metadata["total_clans"]; got != 0 {
		t.Fatalf("expected total_clans=0, got %v", got)
	}
	if got := metadata["user_id"]; got != "user-123" {
		t.Fatalf("expected user_id to round-trip, got %v", got)
	}
	if got := metadata["fetch_time"]; got != "2026-05-09T12:00:00Z" {
		t.Fatalf("expected stable fetch_time, got %v", got)
	}
}
