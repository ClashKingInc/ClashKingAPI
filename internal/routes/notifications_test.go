package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestDecodeNotificationDeviceUnregistrationAllowsEmptyBody(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Delete("/devices", func(c *fiber.Ctx) error {
		request, err := decodeNotificationDeviceUnregistration(c)
		if err != nil {
			return err
		}
		if request.DeviceID != "" || request.Environment != "" {
			t.Fatalf("unexpected request: %#v", request)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	response, err := app.Test(httptest.NewRequest(http.MethodDelete, "/devices", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
	}
}
