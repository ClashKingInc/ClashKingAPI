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

func TestMobilePlayerExtendedContractMatchesAppExpectations(t *testing.T) {
	player := mobilePlayerExtendedContract(map[string]any{
		"tag": "#AAA",
		"war_data": map[string]any{
			"clan_tag": "#CLAN",
			"war_info": map[string]any{
				"state": "war",
				"currentWarInfo": map[string]any{
					"state": "inWar",
					"clan":  map[string]any{"tag": "#CLAN"},
				},
			},
		},
		"raid_data": map[string]any{
			"attack_limit":  6,
			"attacks_done":  4,
			"unexpectedKey": true,
		},
	})

	if _, ok := player["legends_by_season"].(map[string]any); !ok {
		t.Fatalf("expected legends_by_season map, got %T", player["legends_by_season"])
	}
	if _, ok := player["legend_eos_ranking"].([]any); !ok {
		t.Fatalf("expected legend_eos_ranking slice, got %T", player["legend_eos_ranking"])
	}

	rankings, ok := player["rankings"].(map[string]any)
	if !ok {
		t.Fatalf("expected rankings map, got %T", player["rankings"])
	}
	if got := rankings["tag"]; got != "#AAA" {
		t.Fatalf("expected rankings tag fallback, got %v", got)
	}

	raidData, ok := player["raid_data"].(map[string]any)
	if !ok {
		t.Fatalf("expected raid_data map, got %T", player["raid_data"])
	}
	if got := raidData["attack_limit"]; got != 6 {
		t.Fatalf("expected attack_limit=6, got %v", got)
	}
	if _, exists := raidData["unexpectedKey"]; exists {
		t.Fatal("expected raid_data contract to strip unknown keys")
	}

	warData, ok := player["war_data"].(map[string]any)
	if !ok {
		t.Fatalf("expected war_data map, got %T", player["war_data"])
	}
	currentWarInfo, ok := warData["currentWarInfo"].(map[string]any)
	if !ok {
		t.Fatalf("expected currentWarInfo to be lifted for app parsing, got %T", warData["currentWarInfo"])
	}
	if got := currentWarInfo["state"]; got != "inWar" {
		t.Fatalf("expected currentWarInfo to round-trip, got %v", got)
	}
}

func TestMobileClanBundleContractMatchesAppExpectations(t *testing.T) {
	bundle := mobileClanBundleContract(map[string]any{
		"war_data": []any{
			map[string]any{
				"clan_tag": "#CLAN",
				"isInWar":  false,
				"isInCwl":  true,
				"war_info": nil,
				"league_info": map[string]any{
					"state": "inWar",
				},
				"war_league_infos": []any{nil},
			},
		},
		"join_leave_data": map[string]any{
			"#CLAN": map[string]any{},
		},
		"capital_data": []any{
			map[string]any{"clan_tag": "#CLAN"},
		},
		"war_log_data": []any{
			map[string]any{"clan_tag": "#CLAN"},
		},
		"clan_war_stats": []any{
			map[string]any{"clan_tag": "#CLAN"},
		},
	})

	warData, ok := bundle["war_data"].([]any)
	if !ok || len(warData) != 1 {
		t.Fatalf("expected one normalized war_data item, got %T len=%d", bundle["war_data"], len(warData))
	}
	warSummary, ok := warData[0].(map[string]any)
	if !ok {
		t.Fatalf("expected war summary map, got %T", warData[0])
	}
	if got := warSummary["war_league_infos"].([]any); len(got) != 0 {
		t.Fatalf("expected null war_league_infos entries to be filtered, got %d items", len(got))
	}

	joinLeaveByClan, ok := bundle["join_leave_data"].(map[string]any)
	if !ok {
		t.Fatalf("expected join_leave_data map, got %T", bundle["join_leave_data"])
	}
	joinLeave, ok := joinLeaveByClan["#CLAN"].(map[string]any)
	if !ok {
		t.Fatalf("expected join_leave item map, got %T", joinLeaveByClan["#CLAN"])
	}
	if _, ok := joinLeave["stats"].(map[string]any); !ok {
		t.Fatalf("expected join_leave stats map, got %T", joinLeave["stats"])
	}
	if _, ok := joinLeave["join_leave_list"].([]any); !ok {
		t.Fatalf("expected join_leave_list slice, got %T", joinLeave["join_leave_list"])
	}

	capitalData := bundle["capital_data"].([]any)
	capitalItem := capitalData[0].(map[string]any)
	if _, ok := capitalItem["history"].([]any); !ok {
		t.Fatalf("expected capital history slice, got %T", capitalItem["history"])
	}

	warLogData := bundle["war_log_data"].([]any)
	warLogItem := warLogData[0].(map[string]any)
	if _, ok := warLogItem["items"].([]any); !ok {
		t.Fatalf("expected war log items slice, got %T", warLogItem["items"])
	}

	clanWarStats := bundle["clan_war_stats"].([]any)
	clanWarStat := clanWarStats[0].(map[string]any)
	if _, ok := clanWarStat["players"].([]any); !ok {
		t.Fatalf("expected clan_war_stats players slice, got %T", clanWarStat["players"])
	}
	if _, ok := clanWarStat["wars"].([]any); !ok {
		t.Fatalf("expected clan_war_stats wars slice, got %T", clanWarStat["wars"])
	}
}

func TestMobileInitializationWarHitsFilterUsesStartupLimit(t *testing.T) {
	filter := mobileInitializationWarHitsFilter()

	if filter.Limit != 50 {
		t.Fatalf("expected startup war stats limit to stay at 50, got %d", filter.Limit)
	}
	if filter.TimestampStart <= 0 || filter.TimestampEnd <= 0 {
		t.Fatalf("expected initialization filter timestamps to be initialized, got start=%d end=%d", filter.TimestampStart, filter.TimestampEnd)
	}
}
