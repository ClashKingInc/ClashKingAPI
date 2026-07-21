package routes

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
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

func TestScanLinkedAccountOutputsNullableLastLogin(t *testing.T) {
	lastLogin := time.Date(2026, 7, 20, 22, 15, 30, 0, time.UTC)
	for _, test := range []struct {
		name      string
		lastLogin *time.Time
		want      any
	}{
		{name: "null", want: nil},
		{name: "timestamp", lastLogin: &lastLogin, want: "2026-07-20T22:15:30Z"},
	} {
		t.Run(test.name, func(t *testing.T) {
			account, err := scanLinkedAccount(linkedAccountTestRow{lastLogin: test.lastLogin})
			if err != nil {
				t.Fatalf("scan linked account: %v", err)
			}
			if account.LastLogin != test.lastLogin {
				t.Fatalf("last_login = %v, want %v", account.LastLogin, test.lastLogin)
			}
			body, err := json.Marshal(modelsv2.AccountsListResponse{Items: []modelsv2.AccountsLinkedAccount{account}})
			if err != nil {
				t.Fatalf("marshal linked accounts: %v", err)
			}
			var decoded struct {
				Items []map[string]any `json:"items"`
			}
			if err := json.Unmarshal(body, &decoded); err != nil {
				t.Fatalf("decode linked accounts: %v", err)
			}
			if len(decoded.Items) != 1 {
				t.Fatalf("items length = %d, want 1", len(decoded.Items))
			}
			item := decoded.Items[0]
			got, exists := item["last_login"]
			if !exists {
				t.Fatalf("last_login missing from response: %s", body)
			}
			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("last_login = %#v, want %#v", got, test.want)
			}
			if hidden, exists := item["hidden"]; !exists || hidden != true {
				t.Fatalf("required hidden field changed: %s", body)
			}
		})
	}
}

type linkedAccountTestRow struct {
	lastLogin *time.Time
}

func (row linkedAccountTestRow) Scan(dest ...any) error {
	if len(dest) != 8 {
		return fmt.Errorf("scan destination count = %d, want 8", len(dest))
	}
	addedAt := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	verifiedAt := time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC)
	*dest[0].(*string) = "user-1"
	*dest[1].(*string) = "#ABC123"
	*dest[2].(*int) = 0
	*dest[3].(*bool) = true
	*dest[4].(*bool) = true
	*dest[5].(*time.Time) = addedAt
	*dest[6].(**time.Time) = &verifiedAt
	*dest[7].(**time.Time) = row.lastLogin
	return nil
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

func TestLastLoginRejectsMismatchedAppUserBeforeSQL(t *testing.T) {
	cfg := apptypes.Config{Local: true, DevUserID: "auth-user"}
	deps := apptypes.Deps{Config: cfg}
	auth := apptypes.NewAuthenticator(cfg, &apptypes.Store{})

	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Patch("/v2/links/:id/last-login", authUserOrBot(deps, auth.Wrap, updateLastLogin(deps)))

	resp, err := app.Test(httptest.NewRequest(http.MethodPatch, "/v2/links/other-user/last-login", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected %d, got %d", fiber.StatusForbidden, resp.StatusCode)
	}
}

func TestAccountDeletionStateProtectsFinalVerifiedLinkOnlyWhileLinksRemain(t *testing.T) {
	tests := []struct {
		name      string
		links     []accountDeletionLink
		target    string
		found     bool
		protected bool
	}{
		{
			name:      "verified target with unverified link remaining",
			links:     []accountDeletionLink{{Tag: "#A", Verified: true}, {Tag: "#B", Verified: false}},
			target:    "#A",
			found:     true,
			protected: true,
		},
		{
			name:   "only verified target and no links remaining",
			links:  []accountDeletionLink{{Tag: "#A", Verified: true}},
			target: "#A",
			found:  true,
		},
		{
			name:   "another verified link remains",
			links:  []accountDeletionLink{{Tag: "#A", Verified: true}, {Tag: "#B", Verified: true}},
			target: "#A",
			found:  true,
		},
		{
			name:   "unverified target",
			links:  []accountDeletionLink{{Tag: "#A", Verified: true}, {Tag: "#B", Verified: false}},
			target: "#B",
			found:  true,
		},
		{name: "missing target", links: []accountDeletionLink{{Tag: "#A", Verified: true}}, target: "#B"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			found, protected := accountDeletionState(test.links, test.target)
			if found != test.found || protected != test.protected {
				t.Fatalf("got found=%v protected=%v, want found=%v protected=%v", found, protected, test.found, test.protected)
			}
		})
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
