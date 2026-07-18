package routes

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestProxyForwardJoinsBaseAndEscapedPath(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.RequestURI != "/v1/players/%23PLAYER" {
			t.Errorf("upstream request URI = %q, want %q", r.RequestURI, "/v1/players/%23PLAYER")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"tag":"#PLAYER"}`)
	}))
	defer upstream.Close()

	app := fiber.New()
	deps := apptypes.Deps{Config: apptypes.Config{ProxyBaseURL: upstream.URL + "/"}}
	app.Get("/proxy/v1/*", proxyForward(deps, "/proxy/"))

	request := httptest.NewRequest(http.MethodGet, "/proxy/v1/players/%23PLAYER", nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}
