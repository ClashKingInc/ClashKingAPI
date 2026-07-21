package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestUpgradeRequestsDoNotExposeClientTimestamps(t *testing.T) {
	upgrades, err := json.Marshal(modelsv2.PlayerUpgradesReplaceRequest{Data: map[string]any{"heroes": map[string]any{}}})
	if err != nil {
		t.Fatalf("marshal upgrades: %v", err)
	}
	preferences, err := json.Marshal(modelsv2.PlayerUpgradePreferencesPatchRequest{Preferences: map[string]any{"show_completed": false}})
	if err != nil {
		t.Fatalf("marshal preferences: %v", err)
	}
	for _, body := range [][]byte{upgrades, preferences} {
		if strings.Contains(string(body), "updated_at") || strings.Contains(string(body), "timestamp") {
			t.Fatalf("request unexpectedly exposes a client timestamp: %s", body)
		}
	}
}

func TestUpgradeReadRejectsMismatchedAppUserBeforeSQL(t *testing.T) {
	cfg := apptypes.Config{Local: true, DevUserID: "auth-user"}
	deps := apptypes.Deps{Config: cfg}
	auth := apptypes.NewAuthenticator(cfg, &apptypes.Store{})

	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/links/:id/:playerTag/upgrades", authUserOrBot(deps, auth.Wrap, getPlayerUpgrades(deps)))

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/links/other-user/%23P0Y/upgrades", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected %d, got %d", fiber.StatusForbidden, resp.StatusCode)
	}
}

func TestDecodeJSONObjectRejectsNonObject(t *testing.T) {
	if _, err := decodeJSONObject([]byte(`[1,2,3]`)); err == nil {
		t.Fatal("expected non-object JSON to be rejected")
	}
}
