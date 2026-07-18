package utils

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type fakeAuthUserLookup struct {
	exists bool
	err    error
}

func (f fakeAuthUserLookup) AuthUserExists(context.Context, string) (bool, error) {
	return f.exists, f.err
}

func TestAuthenticatorRejectsMissingTokenWithUnauthorized(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := NewAuthenticator(Config{SecretKey: "secret"}, nil)
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	}))

	response, err := app.Test(httptest.NewRequest("GET", "/private", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusUnauthorized)
	}
}

func TestAuthenticatorRejectsUnexpectedJWTAlgorithm(t *testing.T) {
	cfg := Config{SecretKey: "secret"}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS512, Claims{Sub: "user-1"}).SignedString([]byte(cfg.SecretKey))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := NewAuthenticator(cfg, nil).parseJWT(token); err == nil {
		t.Fatal("expected token signed with HS512 to be rejected")
	}
}

func TestAccessTokenSurvivesAuthenticatorRestart(t *testing.T) {
	cfg := Config{SecretKey: "stable-secret"}
	token, err := GenerateAccessToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	first := NewAuthenticator(cfg, nil)
	if _, err := first.parseJWT(token); err != nil {
		t.Fatalf("first authenticator rejected token: %v", err)
	}
	second := NewAuthenticator(cfg, nil)
	claims, err := second.parseJWT(token)
	if err != nil {
		t.Fatalf("restarted authenticator rejected token: %v", err)
	}
	if claims.Sub != "user-1" || claims.Device != "device-1" {
		t.Fatalf("unexpected claims after restart: sub=%q device=%q", claims.Sub, claims.Device)
	}
}

func TestAuthenticatorRejectsAccessTokenAfterUserDeletion(t *testing.T) {
	cfg := Config{SecretKey: "secret"}
	token, err := GenerateAccessToken(cfg, "deleted-user", "device-1")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := newAuthenticator(cfg, fakeAuthUserLookup{exists: false})
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	}))
	req := httptest.NewRequest("GET", "/private", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	response, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusUnauthorized)
	}
}

func TestAuthenticatorAllowsAccessTokenForExistingUser(t *testing.T) {
	cfg := Config{SecretKey: "secret"}
	token, err := GenerateAccessToken(cfg, "active-user", "device-1")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := newAuthenticator(cfg, fakeAuthUserLookup{exists: true})
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	}))
	req := httptest.NewRequest("GET", "/private", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	response, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
	}
}
