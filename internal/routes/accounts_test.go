package routes

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"unsafe"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

func TestAccountsListResponseUsesItemsJSON(t *testing.T) {
	body, err := json.Marshal(modelsv2.AccountsListResponse{
		Items: []modelsv2.AccountsLinkedAccount{{UserID: "user-1", PlayerTag: "#ABC123", OrderIndex: 0}},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if !strings.Contains(string(body), `"items"`) {
		t.Fatalf("expected items field in response JSON: %s", body)
	}
	if strings.Contains(string(body), "coc_accounts") {
		t.Fatalf("did not expect legacy coc_accounts field in response JSON: %s", body)
	}
}

func TestAccountsRequestDoesNotExposePlayerTokenJSON(t *testing.T) {
	body, err := json.Marshal(modelsv2.AccountsCOCAccountRequest{
		PlayerTag: "#ABC123",
		APIToken:  "api-token",
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(body), "player_token") {
		t.Fatalf("did not expect player_token field in request JSON: %s", body)
	}
	if !strings.Contains(string(body), "api_token") {
		t.Fatalf("expected api_token field in request JSON: %s", body)
	}
}

func TestAddAccountShortTagUsesClashLookup(t *testing.T) {
	var seenPath string
	client := testClashyClient(t, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		seenPath = r.URL.EscapedPath()
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"reason":"notFound","message":"not found"}`)),
			Request:    r,
		}, nil
	}))

	authCfg := apptypes.Config{Local: true, DevUserID: "auth-user"}
	deps := apptypes.Deps{
		Config: authCfg,
		Clash:  testClashAdapter(t, client),
	}
	auth := apptypes.NewAuthenticator(authCfg, &apptypes.Store{})

	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Post("/v2/links/:id", authUserOrBot(deps, auth.Wrap, addAccount(deps)))

	req := httptest.NewRequest(http.MethodPost, "/v2/links/auth-user", strings.NewReader(`{"player_tag":"#2PP"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNotFound {
		t.Fatalf("expected downstream Clash lookup 404, got %d", resp.StatusCode)
	}
	if seenPath != "/players/%232PP" {
		t.Fatalf("expected short tag to reach mocked Clash lookup, got path %q", seenPath)
	}
}

func TestLinkSubjectRejectsMismatchedAppUser(t *testing.T) {
	cfg := apptypes.Config{Local: true, DevUserID: "auth-user"}
	deps := apptypes.Deps{Config: cfg}
	auth := apptypes.NewAuthenticator(cfg, &apptypes.Store{})

	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/links/:id", authUserOrBot(deps, auth.Wrap, listAccounts(deps)))

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/links/other-user", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected %d, got %d", fiber.StatusForbidden, resp.StatusCode)
	}
}

func TestLinkSubjectAllowsBotArbitraryID(t *testing.T) {
	deps := apptypes.Deps{Config: apptypes.Config{APIBotToken: "bot-secret"}}

	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/links/:id", authUserOrBot(deps, func(next fiber.Handler) fiber.Handler {
		return func(c *fiber.Ctx) error {
			return apptypes.Error(fiber.StatusUnauthorized, "user auth required")
		}
	}, listAccounts(deps)))

	req := httptest.NewRequest(http.MethodGet, "/v2/links/123456789012345678", nil)
	req.Header.Set("Authorization", "Bearer bot-secret")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode == fiber.StatusForbidden {
		t.Fatalf("expected bot subject to pass authorization, got %d", resp.StatusCode)
	}
	if resp.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("expected missing SQL store to be the next failure, got %d", resp.StatusCode)
	}
}

func testClashAdapter(t *testing.T, client *clashy.Client) *apptypes.ClashAdapter {
	t.Helper()

	adapter := &apptypes.ClashAdapter{}
	field := reflect.ValueOf(adapter).Elem().FieldByName("client")
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(client))
	return adapter
}

func testClashyClient(t *testing.T, transport http.RoundTripper) *clashy.Client {
	t.Helper()

	cfg := clashy.DefaultClientConfig()
	cfg.BaseURL = "https://mock.clash.local"
	cfg.LookupCache = false
	cfg.UpdateCache = false
	client, err := clashy.NewClient(cfg)
	if err != nil {
		t.Fatalf("new clashy client: %v", err)
	}
	if err := client.LoginWithTokens(t.Context(), "test-token"); err != nil {
		t.Fatalf("login with token: %v", err)
	}

	httpField := reflect.ValueOf(client).Elem().FieldByName("http")
	httpClient := reflect.NewAt(httpField.Type(), unsafe.Pointer(httpField.UnsafeAddr())).Elem().Interface().(*clashy.HTTPClient)
	clientField := reflect.ValueOf(httpClient).Elem().FieldByName("client")
	reflect.NewAt(clientField.Type(), unsafe.Pointer(clientField.UnsafeAddr())).Elem().Set(reflect.ValueOf(&http.Client{Transport: transport}))
	return client
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}
