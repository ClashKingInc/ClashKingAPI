package routes

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestNormalizeHomeActivityMappingsAcceptsClanlessPlayers(t *testing.T) {
	clanTag := " 2pp "
	mappings, err := normalizeHomeActivityMappings([]modelsv2.HomeActivityPlayerMapping{
		{PlayerTag: " p0y "},
		{PlayerTag: "#abc", ClanTag: &clanTag},
	})
	if err != nil {
		t.Fatalf("normalize mappings: %v", err)
	}
	if mappings[0].playerTag != "#P0Y" || mappings[0].clanTag != nil {
		t.Fatalf("unexpected clanless mapping: %+v", mappings[0])
	}
	if mappings[1].playerTag != "#ABC" || mappings[1].clanTag == nil || *mappings[1].clanTag != "#2PP" {
		t.Fatalf("unexpected clan mapping: %+v", mappings[1])
	}
}

func TestNormalizeHomeActivityMappingsRejectsDuplicatePlayers(t *testing.T) {
	_, err := normalizeHomeActivityMappings([]modelsv2.HomeActivityPlayerMapping{
		{PlayerTag: "#P0Y"},
		{PlayerTag: "poy"},
	})
	if err == nil {
		t.Fatal("expected normalized duplicate player tags to be rejected")
	}
}

func TestClampHomeActivityLimit(t *testing.T) {
	for _, test := range []struct {
		input int
		want  int
	}{{0, 25}, {-5, 1}, {1, 1}, {25, 25}, {1000, 100}} {
		if got := clampHomeActivityLimit(test.input); got != test.want {
			t.Fatalf("clampHomeActivityLimit(%d) = %d, want %d", test.input, got, test.want)
		}
	}
}

func TestHomeActivityRejectsMismatchedAccountBeforeSQL(t *testing.T) {
	cfg := apptypes.Config{Local: true, DevUserID: "auth-user"}
	deps := apptypes.Deps{Config: cfg}
	auth := apptypes.NewAuthenticator(cfg, &apptypes.Store{})
	app := fiber.New(fiber.Config{
		ErrorHandler:   apptypes.ErrorHandler,
		RequestMethods: apptypes.APIRequestMethods(),
	})
	app.Add(apptypes.MethodQuery, "/v2/home/activity", authUserOrBot(deps, auth.Wrap, homeActivity(deps)))

	body, _ := json.Marshal(modelsv2.HomeActivityRequest{
		AccountID: "other-user",
		Mappings:  []modelsv2.HomeActivityPlayerMapping{{PlayerTag: "#P0Y"}},
		Limit:     25,
	})
	req := httptest.NewRequest(apptypes.MethodQuery, "/v2/home/activity", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected %d, got %d", fiber.StatusForbidden, resp.StatusCode)
	}
}
