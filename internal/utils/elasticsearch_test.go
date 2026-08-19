package utils

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestElasticsearchAdapterUsesAPIKeyAndPreservesBasePath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/elastic/_search" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "ApiKey encoded-key" {
			t.Errorf("authorization = %q", got)
		}
		if got := r.URL.Query().Get("keep_alive"); got != "2m" {
			t.Errorf("keep_alive = %q", got)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		if string(body) != `{"query":{"match_all":{}}}` {
			t.Errorf("body = %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer server.Close()

	adapter, err := NewElasticsearchAdapter(Config{
		ElasticsearchURL: server.URL + "/elastic", ElasticsearchAPIKey: "encoded-key",
		ElasticsearchPlayersAlias: "  players  ", ElasticsearchClansAlias: "  clans  ",
	})
	if err != nil {
		t.Fatalf("create adapter: %v", err)
	}
	defer adapter.Close()
	if adapter.PlayersAlias != "players" || adapter.ClansAlias != "clans" {
		t.Fatalf("unexpected normalized aliases: players=%q clans=%q", adapter.PlayersAlias, adapter.ClansAlias)
	}

	var response map[string]bool
	err = adapter.DoJSON(
		context.Background(),
		http.MethodPost,
		"/_search",
		url.Values{"keep_alive": {"2m"}},
		map[string]any{"query": map[string]any{"match_all": map[string]any{}}},
		&response,
	)
	if err != nil {
		t.Fatalf("perform request: %v", err)
	}
	if !response["ok"] {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestElasticsearchAdapterRejectsInvalidURL(t *testing.T) {
	for _, raw := range []string{"elastic:9200", "ftp://elastic.example"} {
		if _, err := NewElasticsearchAdapter(Config{ElasticsearchURL: raw}); err == nil {
			t.Fatalf("expected %q to be rejected", raw)
		}
	}
}

func TestElasticsearchNameValidation(t *testing.T) {
	for _, valid := range []string{"clashking_players", "clans-v2", "search.alias"} {
		if !validElasticsearchName(valid) {
			t.Fatalf("expected %q to be valid", valid)
		}
	}
	for _, invalid := range []string{"", "_hidden", "-clans", "Uppercase", "clans/*"} {
		if validElasticsearchName(invalid) {
			t.Fatalf("expected %q to be invalid", invalid)
		}
	}
}

func TestNormalizeElasticsearchAliasUsesTrimmedOverrideOrDefault(t *testing.T) {
	if got := normalizeElasticsearchAlias("  clans-v2  ", "clashking_clans"); got != "clans-v2" {
		t.Fatalf("normalized override = %q", got)
	}
	if got := normalizeElasticsearchAlias("  ", "clashking_clans"); got != "clashking_clans" {
		t.Fatalf("normalized default = %q", got)
	}
}

func TestElasticsearchAdapterRejectsNonJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "not-json")
	}))
	defer server.Close()
	adapter, err := NewElasticsearchAdapter(Config{ElasticsearchURL: server.URL})
	if err != nil {
		t.Fatalf("create adapter: %v", err)
	}
	var response json.RawMessage
	if err := adapter.DoJSON(context.Background(), http.MethodGet, "/", nil, nil, &response); err == nil {
		t.Fatal("expected invalid JSON to fail")
	}
}
