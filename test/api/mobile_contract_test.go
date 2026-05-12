package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	routesv2 "github.com/ClashKingInc/ClashKingAPI/internal/routes/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestPublicMobileConfigReturnsSentryDSN(t *testing.T) {
	app := fiber.New()
	app.Get("/v2/public-config", routesv2.PublicMobileConfigForTest(apptypes.Deps{
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
	response := routesv2.MobileInitializationResponseForTest(
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
	player := routesv2.MobilePlayerExtendedContractForTest(map[string]any{
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
	bundle := routesv2.MobileClanBundleContractForTest(map[string]any{
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
	filter := routesv2.MobileInitializationWarHitsFilterForTest()

	if filter.Limit != 50 {
		t.Fatalf("expected startup war stats limit to stay at 50, got %d", filter.Limit)
	}
	if filter.TimestampStart <= 0 || filter.TimestampEnd <= 0 {
		t.Fatalf("expected initialization filter timestamps to be initialized, got start=%d end=%d", filter.TimestampStart, filter.TimestampEnd)
	}
}

func TestMobilePlayerWarHitsDefaultFilterMatchesPythonDefaultLimit(t *testing.T) {
	filter := routesv2.MobileDefaultPlayerWarHitsFilterForTest([]string{"#P1"})
	if filter.Limit != 50 {
		t.Fatalf("expected default player warhits limit=50, got %d", filter.Limit)
	}
}

func TestMobileClanWarHitsDefaultFilterMatchesPythonDefaultLimit(t *testing.T) {
	filter := routesv2.MobileDefaultClanWarHitsFilterForTest([]string{"#C1"})
	if filter.Limit != 100 {
		t.Fatalf("expected default clan warhits limit=100, got %d", filter.Limit)
	}
}

func TestMobileDecodeWarHitsFilterAppliesPlayerDefaultLimit(t *testing.T) {
	filter, err := routesv2.MobileDecodeWarHitsFilterBodyForTest(map[string]any{
		"player_tags": []string{"#P1"},
	})
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if filter.Limit != 50 {
		t.Fatalf("expected decoded player limit=50, got %d", filter.Limit)
	}
}

func TestMobileDecodeWarHitsFilterAppliesClanDefaultLimit(t *testing.T) {
	filter, err := routesv2.MobileDecodeWarHitsFilterBodyForTest(map[string]any{
		"clan_tags": []string{"#C1"},
	})
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if filter.Limit != 100 {
		t.Fatalf("expected decoded clan limit=100, got %d", filter.Limit)
	}
}

func TestMobileInitializationWarStatsFromSharedDocsKeepsPerTargetLimits(t *testing.T) {
	playerFilter := routesv2.MobileInitializationWarHitsFilterForTest()
	playerFilter.PlayerTags = []string{"#P1"}
	playerFilter.Limit = 1

	clanFilter := routesv2.MobileInitializationWarHitsFilterForTest()
	clanFilter.ClanTags = []string{"#C1"}
	clanFilter.Limit = 1

	wars := []map[string]any{
		{
			"preparationStartTime": "20260510T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#C1",
				"members": []any{
					map[string]any{
						"tag":           "#C1M1",
						"name":          "ClanOnly",
						"townhallLevel": 16,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
			"opponent": map[string]any{
				"tag": "#O1",
				"members": []any{
					map[string]any{
						"tag":           "#O1M1",
						"name":          "Opp1",
						"townhallLevel": 16,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
		},
		{
			"preparationStartTime": "20260509T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#O2",
				"members": []any{
					map[string]any{
						"tag":           "#P1",
						"name":          "PlayerOne",
						"townhallLevel": 15,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
			"opponent": map[string]any{
				"tag": "#O3",
				"members": []any{
					map[string]any{
						"tag":           "#O3M1",
						"name":          "Opp2",
						"townhallLevel": 15,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
		},
	}

	playerStats, clanStats := routesv2.MobileBuildInitializationWarStatsFromDocsForTest(wars, playerFilter, clanFilter)

	if len(playerStats) != 1 {
		t.Fatalf("expected one player stat result, got %d", len(playerStats))
	}
	playerResult := playerStats[0].(map[string]any)
	if playerResult["tag"] != "#P1" {
		t.Fatalf("expected player result for #P1, got %+v", playerResult)
	}
	playerWars := playerResult["wars"].([]map[string]any)
	playerWarData := playerWars[0]["war_data"].(map[string]any)
	if playerWarData["preparationStartTime"] != "20260509T120000.000Z" {
		t.Fatalf("expected player limit to ignore clan-only war, got %v", playerWarData["preparationStartTime"])
	}

	if len(clanStats) != 1 {
		t.Fatalf("expected one clan stat result, got %d", len(clanStats))
	}
	clanResult := clanStats[0].(map[string]any)
	if clanResult["clan_tag"] != "#C1" {
		t.Fatalf("expected clan result for #C1, got %+v", clanResult)
	}
	clanWars := clanResult["wars"].([]map[string]any)
	clanWarData := clanWars[0]["war_data"].(map[string]any)
	if clanWarData["preparationStartTime"] != "20260510T120000.000Z" {
		t.Fatalf("expected clan limit to use clan war, got %v", clanWarData["preparationStartTime"])
	}
}

func TestMobilePlayerWarStatsFromSharedDocsKeepsPerTargetLimits(t *testing.T) {
	filter := routesv2.MobileInitializationWarHitsFilterForTest()
	filter.PlayerTags = []string{"#P1", "#P2"}
	filter.Limit = 1

	wars := []map[string]any{
		{
			"preparationStartTime": "20260510T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#C1",
				"members": []any{
					map[string]any{
						"tag":           "#P1",
						"name":          "PlayerOne",
						"townhallLevel": 16,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
			"opponent": map[string]any{
				"tag": "#O1",
				"members": []any{
					map[string]any{
						"tag":           "#O1M1",
						"name":          "Opp1",
						"townhallLevel": 16,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
		},
		{
			"preparationStartTime": "20260509T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#C2",
				"members": []any{
					map[string]any{
						"tag":           "#P2",
						"name":          "PlayerTwo",
						"townhallLevel": 15,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
			"opponent": map[string]any{
				"tag": "#O2",
				"members": []any{
					map[string]any{
						"tag":           "#O2M1",
						"name":          "Opp2",
						"townhallLevel": 15,
						"mapPosition":   1,
						"attacks":       []any{},
					},
				},
			},
		},
	}

	results := routesv2.MobileBuildPlayerWarStatsFromDocsForTest(filter.PlayerTags, wars, filter)
	if len(results) != 2 {
		t.Fatalf("expected two player results, got %d", len(results))
	}

	first := results[0].(map[string]any)
	firstWar := first["wars"].([]map[string]any)[0]["war_data"].(map[string]any)
	if first["tag"] != "#P1" || firstWar["preparationStartTime"] != "20260510T120000.000Z" {
		t.Fatalf("expected #P1 to keep its own newest war, got %+v", first)
	}

	second := results[1].(map[string]any)
	secondWar := second["wars"].([]map[string]any)[0]["war_data"].(map[string]any)
	if second["tag"] != "#P2" || secondWar["preparationStartTime"] != "20260509T120000.000Z" {
		t.Fatalf("expected #P2 to keep its own newest war, got %+v", second)
	}
}

func TestMobileClanWarStatsFromSharedDocsKeepsPerTargetLimitsAndEmptyRows(t *testing.T) {
	filter := routesv2.MobileInitializationWarHitsFilterForTest()
	filter.ClanTags = []string{"#C1", "#C2", "#C3"}
	filter.Limit = 1

	wars := []map[string]any{
		{
			"preparationStartTime": "20260510T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#C1",
				"members": []any{
					map[string]any{"tag": "#C1M1", "name": "ClanOne", "townhallLevel": 16, "mapPosition": 1, "attacks": []any{}},
				},
			},
			"opponent": map[string]any{
				"tag": "#O1",
				"members": []any{
					map[string]any{"tag": "#O1M1", "name": "Opp1", "townhallLevel": 16, "mapPosition": 1, "attacks": []any{}},
				},
			},
		},
		{
			"preparationStartTime": "20260509T120000.000Z",
			"attacksPerMember":     1,
			"clan": map[string]any{
				"tag": "#O2",
				"members": []any{
					map[string]any{"tag": "#O2M1", "name": "Opp2", "townhallLevel": 15, "mapPosition": 1, "attacks": []any{}},
				},
			},
			"opponent": map[string]any{
				"tag": "#C2",
				"members": []any{
					map[string]any{"tag": "#C2M1", "name": "ClanTwo", "townhallLevel": 15, "mapPosition": 1, "attacks": []any{}},
				},
			},
		},
	}

	results := routesv2.MobileBuildClanWarStatsFromDocsForTest(filter.ClanTags, wars, filter)
	if len(results) != 3 {
		t.Fatalf("expected three clan rows including empty result, got %d", len(results))
	}

	first := results[0].(map[string]any)
	firstWar := first["wars"].([]map[string]any)[0]["war_data"].(map[string]any)
	if first["clan_tag"] != "#C1" || firstWar["preparationStartTime"] != "20260510T120000.000Z" {
		t.Fatalf("expected #C1 to keep its own newest war, got %+v", first)
	}

	second := results[1].(map[string]any)
	secondWar := second["wars"].([]map[string]any)[0]["war_data"].(map[string]any)
	if second["clan_tag"] != "#C2" || secondWar["preparationStartTime"] != "20260509T120000.000Z" {
		t.Fatalf("expected #C2 to keep its own newest war, got %+v", second)
	}

	third := results[2].(map[string]any)
	if third["clan_tag"] != "#C3" {
		t.Fatalf("expected empty row for #C3, got %+v", third)
	}
	if len(third["wars"].([]map[string]any)) != 0 || len(third["players"].([]any)) != 0 {
		t.Fatalf("expected empty clan row for #C3, got %+v", third)
	}
}

func TestMobileMergeWarDocBatchesDedupesAndSortsNewestFirst(t *testing.T) {
	merged := routesv2.MobileMergeWarDocBatchesForTest([][]map[string]any{
		{
			{
				"clan":                 map[string]any{"tag": "#A"},
				"opponent":             map[string]any{"tag": "#B"},
				"preparationStartTime": "20260509T120000.000Z",
			},
			{
				"clan":                 map[string]any{"tag": "#A"},
				"opponent":             map[string]any{"tag": "#C"},
				"preparationStartTime": "20260510T120000.000Z",
			},
		},
		{
			{
				"clan":                 map[string]any{"tag": "#B"},
				"opponent":             map[string]any{"tag": "#A"},
				"preparationStartTime": "20260509T120000.000Z",
			},
			{
				"clan":                 map[string]any{"tag": "#D"},
				"opponent":             map[string]any{"tag": "#E"},
				"preparationStartTime": "20260508T120000.000Z",
			},
		},
	})

	if len(merged) != 3 {
		t.Fatalf("expected 3 unique wars, got %d", len(merged))
	}
	if got := merged[0]["preparationStartTime"]; got != "20260510T120000.000Z" {
		t.Fatalf("expected newest war first, got %v", got)
	}
	if got := merged[1]["preparationStartTime"]; got != "20260509T120000.000Z" {
		t.Fatalf("expected deduped middle war, got %v", got)
	}
	if got := merged[2]["preparationStartTime"]; got != "20260508T120000.000Z" {
		t.Fatalf("expected oldest war last, got %v", got)
	}
}

func TestMobilePlayerWarDocsPipelineMatchesBothSidesAndAppliesEarlyLimit(t *testing.T) {
	pipeline := routesv2.MobilePlayerWarDocsPipelineForTest("#P1", 100, 200, 50)
	if len(pipeline) != 4 {
		t.Fatalf("expected 4 stages, got %d", len(pipeline))
	}

	matchStage := pipeline[0].(bson.M)["$match"].(bson.M)
	andStage := matchStage["$and"].(bson.A)
	orStage := andStage[0].(bson.M)["$or"].(bson.A)
	if len(orStage) != 2 {
		t.Fatalf("expected player query to match both clan sides, got %+v", orStage)
	}

	if _, ok := pipeline[2].(bson.M)["$limit"]; !ok {
		t.Fatalf("expected limit stage before projection, got %+v", pipeline)
	}
}

func TestMobileClanWarDocsPipelineMatchesPythonShape(t *testing.T) {
	pipeline := routesv2.MobileClanWarDocsPipelineForTest("#C1", 100, 200, 50)
	if len(pipeline) != 4 {
		t.Fatalf("expected 4 stages, got %d", len(pipeline))
	}

	matchStage := pipeline[0].(bson.M)["$match"].(bson.M)
	if _, hasOpponent := matchStage["data.opponent.tag"]; hasOpponent {
		t.Fatalf("expected clan query to ignore opponent tag like python, got %+v", matchStage)
	}
	if got := matchStage["data.clan.tag"]; got != "#C1" {
		t.Fatalf("expected clan tag match, got %v", got)
	}

	expectedRange := bson.M{"$gte": "19700101T000140.000Z", "$lte": "19700101T000320.000Z"}
	if !reflect.DeepEqual(matchStage["data.preparationStartTime"], expectedRange) {
		t.Fatalf("unexpected time range: %+v", matchStage["data.preparationStartTime"])
	}

	if _, ok := pipeline[2].(bson.M)["$limit"]; !ok {
		t.Fatalf("expected limit stage before projection, got %+v", pipeline)
	}
}
