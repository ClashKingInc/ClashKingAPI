package routes

import (
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestNewDeveloperAPITokenReturnsOnlyHashForStorage(t *testing.T) {
	token, prefix, hash, err := newDeveloperAPIToken()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, developerAPITokenPrefix) || len(token) < 40 {
		t.Fatalf("unexpected token format: %q", token)
	}
	if prefix != token[:len(developerAPITokenPrefix)+8] {
		t.Fatalf("prefix = %q, want safe leading token characters", prefix)
	}
	wantHash := sha256.Sum256([]byte(token))
	if string(hash) != string(wantHash[:]) {
		t.Fatal("stored hash does not match token SHA-256")
	}
	if strings.Contains(string(hash), token) {
		t.Fatal("stored hash contains plaintext token")
	}

	secondToken, _, _, err := newDeveloperAPIToken()
	if err != nil {
		t.Fatal(err)
	}
	if secondToken == token {
		t.Fatal("two generated developer tokens were identical")
	}
}

func TestDecodeDeveloperApplicationPatchSupportsClearingNullableFields(t *testing.T) {
	patch, err := decodeDeveloperApplicationPatch([]byte(`{
		"application_name":" Renamed App ",
		"developer_name":null,
		"contact_email":" dev@example.com ",
		"redirect_uri":""
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if !patch.ApplicationNamePresent || patch.ApplicationName != "Renamed App" {
		t.Fatalf("application name patch = %#v", patch)
	}
	if !patch.DeveloperNamePresent || patch.DeveloperName != nil {
		t.Fatalf("developer name should be explicitly cleared: %#v", patch)
	}
	if !patch.ContactEmailPresent || patch.ContactEmail == nil || *patch.ContactEmail != "dev@example.com" {
		t.Fatalf("contact email patch = %#v", patch)
	}
	if !patch.RedirectURIPresent || patch.RedirectURI != nil {
		t.Fatalf("redirect URI should be explicitly cleared: %#v", patch)
	}
}

func TestDecodeDeveloperApplicationPatchRejectsUnknownAndReadOnlyFields(t *testing.T) {
	for _, body := range []string{
		`{}`,
		`{"token_prefix":"ck_dev_fake"}`,
		`{"revoked_at":null}`,
		`{"application_name":null}`,
	} {
		_, err := decodeDeveloperApplicationPatch([]byte(body))
		assertSharedLinksAppErrorStatus(t, err, http.StatusBadRequest)
	}
}

func TestValidateDeveloperRedirectURIRequiresSafeAbsoluteDestination(t *testing.T) {
	for _, allowed := range []string{
		"https://developer.example/callback",
		"https://developer.example/callback?source=clashking",
		"http://localhost:3000/callback",
		"http://127.0.0.1:3000/callback",
	} {
		if err := validateDeveloperRedirectURI(allowed); err != nil {
			t.Fatalf("expected %q to be allowed: %v", allowed, err)
		}
	}
	for _, rejected := range []string{
		"developer.example/callback",
		"http://developer.example/callback",
		"https://user:password@developer.example/callback",
		"https://developer.example/callback#fragment",
		"javascript:alert(1)",
	} {
		if err := validateDeveloperRedirectURI(rejected); err == nil {
			t.Fatalf("expected %q to be rejected", rejected)
		}
	}
}

func TestAdminDeveloperApplicationRoutesRequireInternalBotToken(t *testing.T) {
	deps := apptypes.Deps{Config: apptypes.Config{APIBotToken: "bot-secret"}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/admin/developer-applications", authBot(deps, listDeveloperApplications(deps)))

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/admin/developer-applications", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", response.StatusCode)
	}

	request := httptest.NewRequest(http.MethodGet, "/v2/admin/developer-applications", nil)
	request.Header.Set(fiber.HeaderAuthorization, "Bearer bot-secret")
	response, err = app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("authenticated status = %d, want missing-store 503", response.StatusCode)
	}
}
