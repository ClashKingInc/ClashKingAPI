package routes

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestStatsParseWindowDefaultsAndCapsAtNinetyDays(t *testing.T) {
	now := time.Date(2026, 7, 20, 19, 30, 0, 0, time.UTC)
	window, err := statsParseWindow(modelsv2.StatsDateFilter{}, now)
	if err != nil {
		t.Fatal(err)
	}
	if got := window.start.Format("2006-01-02"); got != "2026-06-21" {
		t.Fatalf("expected default 30-day start, got %s", got)
	}
	if got := window.endExclusive.Format("2006-01-02"); got != "2026-07-21" {
		t.Fatalf("expected inclusive end date, got exclusive boundary %s", got)
	}

	_, err = statsParseWindow(modelsv2.StatsDateFilter{StartDate: "2026-04-21", EndDate: "2026-07-20"}, now)
	if err == nil || !strings.Contains(err.Error(), "90 days") {
		t.Fatalf("expected 91-day range rejection, got %v", err)
	}
	if _, err := statsParseWindow(modelsv2.StatsDateFilter{StartDate: "2026-04-22", EndDate: "2026-07-20"}, now); err != nil {
		t.Fatalf("expected 90-day range to pass: %v", err)
	}
}

func TestStatsBattlelogLeagueFilterUsesBattleSeasonMembership(t *testing.T) {
	tier := 1
	from, where, _ := statsBattlelogFilterSQL(modelsv2.StatsBattleFilters{RankedLeagueTierID: &tier}, statsTimeWindow{
		start: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC), endExclusive: time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC),
	})
	query := from + " " + strings.Join(where, " ")
	for _, required := range []string{"ranked_league_group_members", "to_char(b.\"timestamp\" AT TIME ZONE 'UTC', 'YYYYMM')", "ranked_membership.league_tier_id"} {
		if !strings.Contains(query, required) {
			t.Fatalf("expected ranked attribution query to contain %q: %s", required, query)
		}
	}
	if strings.Contains(query, "basic_player") || strings.Contains(query, "p.league_id") {
		t.Fatalf("historical ranked attribution must not use current player league: %s", query)
	}
	if !strings.Contains(statsRankedSourceSQL, "membership.season_id = to_char(b.\"timestamp\"") {
		t.Fatalf("ranked KPI source must join each battle timestamp to its season: %s", statsRankedSourceSQL)
	}
}

func TestStatsItemSelectorsRequireValidEquipmentHero(t *testing.T) {
	if _, err := validateStatsItemSelectors([]modelsv2.StatsItemSelector{{Item: "eq_1", Type: "equipment"}}); err == nil {
		t.Fatal("expected equipment without hero to fail")
	}
	invalid := "Goblin"
	if _, err := validateStatsItemSelectors([]modelsv2.StatsItemSelector{{Item: "eq_1", Type: "equipment", Hero: &invalid}}); err == nil {
		t.Fatal("expected equipment with non-hero owner to fail")
	}
	valid := "archer queen"
	items, err := validateStatsItemSelectors([]modelsv2.StatsItemSelector{{Item: "eq_1", Type: "equipment", Hero: &valid}})
	if err != nil {
		t.Fatal(err)
	}
	if items[0].Hero == nil || *items[0].Hero != "Archer Queen" {
		t.Fatalf("expected canonical hero, got %#v", items[0].Hero)
	}
}

func TestStatsRequestsDoNotExposeArmyLevels(t *testing.T) {
	body, err := json.Marshal(modelsv2.StatsArmiesQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "level") {
		t.Fatalf("army request must not expose unavailable levels: %s", body)
	}
}

func TestStatsQueryRoutesUseQueryMethodAndJSONBody(t *testing.T) {
	app := fiber.New(fiber.Config{
		ErrorHandler:   apptypes.ErrorHandler,
		RequestMethods: apptypes.APIRequestMethods(),
	})
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, path := range []string{"/v2/stats/armies", "/v2/stats/items", "/v2/stats/ranked", "/v2/stats/war", "/v2/stats/cwl"} {
		if registeredRouteIndex(app, apptypes.MethodQuery, path) < 0 {
			t.Fatalf("expected QUERY route %s to be registered", path)
		}
		if registeredRouteIndex(app, fiber.MethodGet, path) >= 0 || registeredRouteIndex(app, fiber.MethodPost, path) >= 0 {
			t.Fatalf("expected %s to be QUERY-only", path)
		}
		req := httptest.NewRequest(apptypes.MethodQuery, path, nil)
		req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("QUERY %s failed: %v", path, err)
		}
		if resp.StatusCode != fiber.StatusBadRequest {
			t.Fatalf("expected QUERY %s with missing JSON body to reach handler and return 400, got %d", path, resp.StatusCode)
		}
	}
	req := httptest.NewRequest(apptypes.MethodQuery, "/v2/stats/armies", strings.NewReader(`{}`))
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusUnsupportedMediaType {
		t.Fatalf("expected non-JSON QUERY body to return 415, got %d", resp.StatusCode)
	}
}
