package routes

import (
	"net/http/httptest"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestWebRefreshCookieIsHostOnlySecureHttpOnlyAndStrict(t *testing.T) {
	app := fiber.New()
	app.Get("/cookie", func(c *fiber.Ctx) error {
		setWebRefreshCookie(c, "refresh-token")
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
		"https://dashboard.clashk.ing",
		"https://app.clashk.ing",
	}}
	if err := validateWebRedirectURI(
		cfg,
		"https://dashboard.clashk.ing",
		"https://dashboard.clashk.ing/auth/callback",
	); err != nil {
		t.Fatalf("allowed redirect was rejected: %v", err)
	}
	if err := validateWebRedirectURI(
		cfg,
		"https://dashboard.clashk.ing",
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
