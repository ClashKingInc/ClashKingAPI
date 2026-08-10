package routes

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

func TestWebRefreshOnlyInvalidatesRejectedCredentials(t *testing.T) {
	if !isInvalidWebRefreshCredential(pgx.ErrNoRows) {
		t.Fatal("missing refresh row must invalidate the browser credential")
	}
	if !isInvalidWebRefreshCredential(errRefreshTokenConsumed) {
		t.Fatal("consumed refresh token must invalidate the browser credential")
	}
	if shouldClearRejectedWebRefresh(errRefreshTokenConsumed) {
		t.Fatal("a consumed token response must not expire a concurrently rotated successor cookie")
	}
	if !shouldClearRejectedWebRefresh(pgx.ErrNoRows) {
		t.Fatal("a missing refresh credential must expire the rejected browser cookie")
	}
	if isInvalidWebRefreshCredential(errors.New("database unavailable")) {
		t.Fatal("transient database errors must not invalidate the browser credential")
	}
}

func TestWebRefreshCookieIsHostOnlySecureHttpOnlyAndStrict(t *testing.T) {
	app := fiber.New()
	app.Get("/cookie", func(c *fiber.Ctx) error {
		setWebRefreshCookie(c, apptypes.Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}}, "refresh-token")
		return c.SendStatus(fiber.StatusNoContent)
	})

	response, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/cookie", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	cookie := response.Header.Get(fiber.HeaderSetCookie)
	lowerCookie := strings.ToLower(cookie)
	for _, required := range []string{
		"ck_web_refresh=refresh-token",
		"path=/v2/auth/web",
		"max-age=2592000",
		"httponly",
		"secure",
		"samesite=strict",
	} {
		if !strings.Contains(lowerCookie, required) {
			t.Fatalf("cookie %q does not contain %q", cookie, required)
		}
	}
	if strings.Contains(lowerCookie, "domain=") {
		t.Fatalf("cookie is not host-only: %q", cookie)
	}
}

func TestWebRefreshCookieUsesNoneOnlyForExplicitAllowedLocalOrigins(t *testing.T) {
	cfg := apptypes.Config{WebAllowedOrigins: []string{
		"http://localhost:3002",
		"http://127.0.0.1:3002",
		"https://dash.clashk.ing",
	}}
	for _, test := range []struct {
		name   string
		origin string
		want   string
	}{
		{name: "localhost", origin: "http://localhost:3002", want: "samesite=none"},
		{name: "loopback", origin: "http://127.0.0.1:3002", want: "samesite=none"},
		{name: "production", origin: "https://dash.clashk.ing", want: "samesite=strict"},
		{name: "unlisted localhost", origin: "http://localhost:4000", want: "samesite=strict"},
		{name: "lookalike", origin: "https://localhost.attacker.example", want: "samesite=strict"},
	} {
		t.Run(test.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/cookie", func(c *fiber.Ctx) error {
				setWebRefreshCookie(c, cfg, "refresh-token")
				return c.SendStatus(fiber.StatusNoContent)
			})
			request := httptest.NewRequest(fiber.MethodGet, "/cookie", nil)
			request.Header.Set(fiber.HeaderOrigin, test.origin)
			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			cookie := strings.ToLower(response.Header.Get(fiber.HeaderSetCookie))
			if !strings.Contains(cookie, test.want) || !strings.Contains(cookie, "secure") || !strings.Contains(cookie, "httponly") {
				t.Fatalf("cookie = %q, want %q with Secure and HttpOnly", cookie, test.want)
			}
		})
	}
}

func TestWebRefreshCookieUsesFirstPartyPolicyForLocalDevelopment(t *testing.T) {
	cfg := apptypes.Config{
		Local:             true,
		WebAllowedOrigins: []string{"http://localhost:3002"},
	}
	app := fiber.New()
	app.Get("/cookie", func(c *fiber.Ctx) error {
		setWebRefreshCookie(c, cfg, "refresh-token")
		return c.SendStatus(fiber.StatusNoContent)
	})
	request := httptest.NewRequest(fiber.MethodGet, "/cookie", nil)
	request.Header.Set(fiber.HeaderOrigin, "http://localhost:3002")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	cookie := strings.ToLower(response.Header.Get(fiber.HeaderSetCookie))
	for _, required := range []string{"ck_web_refresh=refresh-token", "httponly", "samesite=strict"} {
		if !strings.Contains(cookie, required) {
			t.Fatalf("cookie %q does not contain %q", cookie, required)
		}
	}
	if strings.Contains(cookie, "secure") {
		t.Fatalf("local HTTP cookie must not require Secure: %q", cookie)
	}
}

func TestClearedWebRefreshCookieUsesRequestOriginPolicy(t *testing.T) {
	cfg := apptypes.Config{WebAllowedOrigins: []string{"http://localhost:3002"}}
	app := fiber.New()
	app.Get("/cookie", func(c *fiber.Ctx) error {
		clearWebRefreshCookie(c, cfg)
		return c.SendStatus(fiber.StatusNoContent)
	})
	request := httptest.NewRequest(fiber.MethodGet, "/cookie", nil)
	request.Header.Set(fiber.HeaderOrigin, "http://localhost:3002")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	cookie := strings.ToLower(response.Header.Get(fiber.HeaderSetCookie))
	for _, required := range []string{"ck_web_refresh=", "max-age=0", "samesite=none", "secure", "httponly"} {
		if !strings.Contains(cookie, required) {
			t.Fatalf("cleared cookie %q does not contain %q", cookie, required)
		}
	}
}

func TestWebRefreshParserRejectsNativeRefreshToken(t *testing.T) {
	cfg := apptypes.Config{
		RefreshSecret:       "refresh-secret",
		NativeTokenAudience: "native-audience",
		WebTokenAudience:    "web-audience",
	}
	nativeToken, err := apptypes.GenerateRefreshToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate native refresh token: %v", err)
	}
	if _, err := parseWebRefreshToken(apptypes.Deps{Config: cfg}, nativeToken); err == nil {
		t.Fatal("expected native refresh token to be rejected by the web endpoint")
	}

	webToken, err := apptypes.GenerateWebRefreshToken(cfg, "user-1", "device-1")
	if err != nil {
		t.Fatalf("generate web refresh token: %v", err)
	}
	if _, err := parseWebRefreshToken(apptypes.Deps{Config: cfg}, webToken); err != nil {
		t.Fatalf("web refresh token was rejected: %v", err)
	}
}

func TestValidateWebRedirectURIRequiresMatchingAllowedOrigin(t *testing.T) {
	cfg := apptypes.Config{WebAllowedOrigins: []string{
		"https://dash.clashk.ing",
		"https://app.clashk.ing",
	}}
	if err := validateWebRedirectURI(
		cfg,
		"https://dash.clashk.ing",
		"https://dash.clashk.ing/auth/callback",
	); err != nil {
		t.Fatalf("allowed redirect was rejected: %v", err)
	}
	if err := validateWebRedirectURI(
		cfg,
		"https://dash.clashk.ing",
		"https://app.clashk.ing/auth/callback",
	); err == nil {
		t.Fatal("expected redirect on a different allowed origin to be rejected")
	}
	if err := validateWebRedirectURI(
		cfg,
		"https://attacker.example",
		"https://attacker.example/auth/callback",
	); err == nil {
		t.Fatal("expected unknown redirect origin to be rejected")
	}
}
