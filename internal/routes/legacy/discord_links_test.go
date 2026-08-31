package legacy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

func legacyDiscordLinksRequest(t *testing.T, body string, handler fiber.Handler) (*http.Response, []byte) {
	t.Helper()
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Post("/discord_links", handler)
	request := httptest.NewRequest(http.MethodPost, "/discord_links", bytes.NewBufferString(body))
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response, payload
}

func TestLegacyDiscordLinksHandlerMatchesContract(t *testing.T) {
	var received []string
	handler := discordLinksHandler(func(_ context.Context, tags []string) (map[string]json.Number, error) {
		received = append([]string(nil), tags...)
		return map[string]json.Number{"#G002": "123456789012345678"}, nil
	})
	response, payload := legacyDiscordLinksRequest(t, `[" goO-2 ","#missing","goO-2"]`, handler)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.StatusCode, payload)
	}
	if !reflect.DeepEqual(received, []string{"#G002", "#MISSING"}) {
		t.Fatalf("lookup tags = %#v", received)
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var result map[string]any
	if err := decoder.Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result["#G002"] != json.Number("123456789012345678") || result["#MISSING"] != nil {
		t.Fatalf("response = %#v", result)
	}
}

func TestLegacyDiscordLinkTagMatchesCocPyNormalization(t *testing.T) {
	for input, expected := range map[string]string{
		" goO-2 ": "#G002",
		"%23ABC":  "#23ABC",
		"":        "#",
	} {
		if result := legacyDiscordLinkTag(input); result != expected {
			t.Fatalf("legacyDiscordLinkTag(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestLegacyDiscordLinksHandlerValidatesBodyAndPropagatesErrors(t *testing.T) {
	lookupErr := errors.New("database unavailable")
	for _, test := range []struct {
		body   string
		lookup discordLinksLookup
		status int
	}{
		{body: ``, lookup: func(context.Context, []string) (map[string]json.Number, error) { return nil, nil }, status: http.StatusUnprocessableEntity},
		{body: `{}`, lookup: func(context.Context, []string) (map[string]json.Number, error) { return nil, nil }, status: http.StatusUnprocessableEntity},
		{body: `null`, lookup: func(context.Context, []string) (map[string]json.Number, error) { return nil, nil }, status: http.StatusUnprocessableEntity},
		{body: `["#A"]`, lookup: func(context.Context, []string) (map[string]json.Number, error) { return nil, lookupErr }, status: http.StatusInternalServerError},
	} {
		response, _ := legacyDiscordLinksRequest(t, test.body, discordLinksHandler(test.lookup))
		if response.StatusCode != test.status {
			t.Fatalf("body %q status = %d, want %d", test.body, response.StatusCode, test.status)
		}
	}
}

func TestQueryDiscordLinksUsesVisibleNumericLinks(t *testing.T) {
	db := &legacyTestDB{rows: []pgx.Rows{&legacyTestRows{values: [][]any{{"#A", "123456789012345678"}}}}}
	result, err := queryDiscordLinks(context.Background(), db, []string{"#A", "#B"})
	if err != nil {
		t.Fatal(err)
	}
	if result["#A"] != json.Number("123456789012345678") {
		t.Fatalf("result = %#v", result)
	}
	if len(db.queries) != 1 || !strings.Contains(db.queries[0], "hidden = false") || !strings.Contains(db.queries[0], "user_id ~") {
		t.Fatalf("query did not enforce public Discord links: %q", db.queries)
	}
	if !reflect.DeepEqual(db.args[0], []any{[]string{"#A", "#B"}}) {
		t.Fatalf("query args = %#v", db.args[0])
	}
}

func TestLegacyDiscordLinksRouteIsRegistered(t *testing.T) {
	app := fiber.New()
	Register(app, apptypes.Deps{})
	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodPost && route.Path == "/discord_links" {
			return
		}
	}
	t.Fatal("POST /discord_links is not registered")
}
