package utils

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

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
	auth := NewAuthenticator(Config{JWTAccessSecret: "secret"}, nil)
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

func TestAuthenticatorLocalModeUsesPresentedBearerIdentity(t *testing.T) {
	cfg := Config{
		Local:           true,
		DevUserID:       "configured-dev-user",
		JWTAccessSecret: "secret",
	}
	token, err := GenerateAccessToken(cfg, "oauth-user", "device-1")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := NewAuthenticator(cfg, nil)
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		if got := UserID(c.UserContext()); got != "oauth-user" {
			t.Fatalf("user ID = %q, want %q", got, "oauth-user")
		}
		if got := DeviceID(c.UserContext()); got != "device-1" {
			t.Fatalf("device ID = %q, want %q", got, "device-1")
		}
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

func TestAuthenticatorLocalModeFallsBackWithoutBearerToken(t *testing.T) {
	cfg := Config{
		Local:           true,
		DevUserID:       "configured-dev-user",
		JWTAccessSecret: "secret",
	}
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := NewAuthenticator(cfg, nil)
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		if got := UserID(c.UserContext()); got != "configured-dev-user" {
			t.Fatalf("user ID = %q, want %q", got, "configured-dev-user")
		}
		if got := DeviceID(c.UserContext()); got != "" {
			t.Fatalf("device ID = %q, want empty", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	}))

	response, err := app.Test(httptest.NewRequest("GET", "/private", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
	}
}

func TestAuthenticatorLocalModeRejectsInvalidPresentedBearerToken(t *testing.T) {
	cfg := Config{
		Local:           true,
		DevUserID:       "configured-dev-user",
		JWTAccessSecret: "secret",
	}
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := NewAuthenticator(cfg, nil)
	handlerCalled := false
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		handlerCalled = true
		return c.SendStatus(fiber.StatusNoContent)
	}))
	req := httptest.NewRequest("GET", "/private", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")

	response, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusUnauthorized)
	}
	if handlerCalled {
		t.Fatal("handler was called for an invalid presented token")
	}
}

func TestAuthenticatorRejectsUnexpectedJWTAlgorithm(t *testing.T) {
	cfg := Config{JWTAccessSecret: "secret"}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS512, Claims{Sub: "user-1"}).SignedString([]byte(cfg.JWTAccessSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := NewAuthenticator(cfg, nil).parseJWT(token); err == nil {
		t.Fatal("expected token signed with HS512 to be rejected")
	}
}

func TestAccessTokenSurvivesAuthenticatorRestart(t *testing.T) {
	cfg := Config{JWTAccessSecret: "stable-secret"}
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

func TestGenerateRefreshTokenUsesThirtyDayRollingExpiry(t *testing.T) {
	cfg := Config{JWTRefreshSecret: "refresh-secret"}
	before := time.Now().UTC()
	token, err := GenerateRefreshToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate refresh token: %v", err)
	}
	after := time.Now().UTC()

	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(
		token,
		claims,
		func(*jwt.Token) (any, error) { return []byte(cfg.JWTRefreshSecret), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	); err != nil {
		t.Fatalf("parse refresh token: %v", err)
	}
	if claims.ExpiresAt == nil {
		t.Fatal("refresh token expiration is missing")
	}
	minExpiry := before.Add(30 * 24 * time.Hour).Truncate(time.Second)
	maxExpiry := after.Add(30 * 24 * time.Hour).Truncate(time.Second)
	if claims.ExpiresAt.Time.Before(minExpiry) || claims.ExpiresAt.Time.After(maxExpiry) {
		t.Fatalf("refresh token expires at %s, want between %s and %s", claims.ExpiresAt.Time, minExpiry, maxExpiry)
	}
}

func TestNativeAndWebTokensUseSeparateServerSelectedPolicies(t *testing.T) {
	cfg := Config{
		JWTAccessSecret:     "access-secret",
		JWTRefreshSecret:    "refresh-secret",
		NativeTokenAudience: "native-audience",
		WebTokenAudience:    "web-audience",
	}
	nativeToken, err := GenerateAccessToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate native access token: %v", err)
	}
	webToken, err := GenerateWebAccessToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate web access token: %v", err)
	}

	nativeClaims := parseAccessClaimsForTest(t, cfg.JWTAccessSecret, nativeToken)
	webClaims := parseAccessClaimsForTest(t, cfg.JWTAccessSecret, webToken)
	if !claimsHasAudience(nativeClaims, cfg.NativeTokenAudience) || claimsHasAudience(nativeClaims, cfg.WebTokenAudience) {
		t.Fatalf("native audience = %#v", nativeClaims.Audience)
	}
	if !claimsHasAudience(webClaims, cfg.WebTokenAudience) || claimsHasAudience(webClaims, cfg.NativeTokenAudience) {
		t.Fatalf("web audience = %#v", webClaims.Audience)
	}
	if got := nativeClaims.ExpiresAt.Sub(nativeClaims.IssuedAt.Time); got != 24*time.Hour {
		t.Fatalf("native access lifetime = %s, want 24h", got)
	}
	if got := webClaims.ExpiresAt.Sub(webClaims.IssuedAt.Time); got != 15*time.Minute {
		t.Fatalf("web access lifetime = %s, want 15m", got)
	}
}

func TestAuthenticatorRejectsLegacyAccessTokenWithoutAudience(t *testing.T) {
	cfg := Config{JWTAccessSecret: "secret"}
	legacy := Claims{
		Sub: "user-1",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(time.Hour)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, legacy).SignedString([]byte(cfg.JWTAccessSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	if _, err := NewAuthenticator(cfg, nil).parseJWT(token); err == nil {
		t.Fatal("expected access token without an audience to be rejected")
	}
}

func parseAccessClaimsForTest(t *testing.T, secret, token string) *Claims {
	t.Helper()
	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(
		token,
		claims,
		func(*jwt.Token) (any, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	); err != nil {
		t.Fatalf("parse access token: %v", err)
	}
	return claims
}

func TestAuthenticatorRejectsAccessTokenAfterUserDeletion(t *testing.T) {
	cfg := Config{JWTAccessSecret: "secret"}
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
	cfg := Config{JWTAccessSecret: "secret"}
	token, err := GenerateAccessToken(cfg, "active-user", "device-1")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := newAuthenticator(cfg, fakeAuthUserLookup{exists: true})
	app.Get("/private", auth.Wrap(func(c *fiber.Ctx) error {
		if got := UserID(c.UserContext()); got != "active-user" {
			t.Fatalf("user ID = %q, want %q", got, "active-user")
		}
		if got := DeviceID(c.UserContext()); got != "device-1" {
			t.Fatalf("device ID = %q, want %q", got, "device-1")
		}
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
