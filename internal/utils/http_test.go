package utils

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/gofiber/fiber/v2"
)

func TestErrorHandlerKeepsAccountOutOfGenericErrors(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Get("/generic", func(*fiber.Ctx) error {
		return Error(fiber.StatusBadRequest, "bad request")
	})

	response, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/generic", nil))
	if err != nil {
		t.Fatalf("request generic error: %v", err)
	}
	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode generic error: %v", err)
	}
	if _, exists := body["account"]; exists {
		t.Fatal("generic error unexpectedly included account")
	}
}

func TestErrorHandlerIncludesAccountForLinkConflict(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Get("/conflict", func(*fiber.Ctx) error {
		return &AppError{
			Status: fiber.StatusConflict,
			Code:   modelsv2.ErrorCodeConflict,
			Detail: "already linked",
			Account: &modelsv2.AccountsLinkedPlayer{
				Tag:  "#2PP",
				Name: "Player",
			},
		}
	})

	response, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/conflict", nil))
	if err != nil {
		t.Fatalf("request conflict error: %v", err)
	}
	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode conflict error: %v", err)
	}
	account, ok := body["account"].(map[string]any)
	if !ok || account["tag"] != "#2PP" {
		t.Fatalf("expected conflict account, got %#v", body["account"])
	}
}
