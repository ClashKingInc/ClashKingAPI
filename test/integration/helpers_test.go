//go:build integration

package integration_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

func apiURL() string {
	if v := os.Getenv("API_URL"); v != "" {
		return v
	}
	return "http://localhost:8000"
}

func apiToken() string {
	if v := os.Getenv("API_TOKEN"); v != "" {
		return v
	}
	return "testing"
}

func serverID(t *testing.T) string {
	t.Helper()
	v := os.Getenv("SERVER_ID")
	if v == "" {
		t.Skip("SERVER_ID not set — skipping integration test")
	}
	return v
}

func panelName() string {
	if v := os.Getenv("PANEL_NAME"); v != "" {
		return v
	}
	return "Recruitment"
}

// do performs an authenticated HTTP request and returns the decoded body.
func do(t *testing.T, method, path string, body io.Reader) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(method, apiURL()+path, body)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", apiToken())
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp.StatusCode, result
}

// doSlice is like do but decodes into a slice.
func doSlice(t *testing.T, method, path string) (int, []any) {
	t.Helper()
	req, err := http.NewRequest(method, apiURL()+path, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", apiToken())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var result []any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp.StatusCode, result
}

func jsonBody(v any) io.Reader {
	b, _ := json.Marshal(v)
	return strings.NewReader(string(b))
}

func getFloat(t *testing.T, m map[string]any, key string) float64 {
	t.Helper()
	v, ok := m[key]
	if !ok {
		t.Fatalf("key %q not found in response", key)
	}
	f, ok := v.(float64)
	if !ok {
		t.Fatalf("key %q: expected float64, got %T (%v)", key, v, v)
	}
	return f
}

func getString(t *testing.T, m map[string]any, key string) string {
	t.Helper()
	v, ok := m[key]
	if !ok {
		t.Fatalf("key %q not found in response", key)
	}
	s, ok := v.(string)
	if !ok {
		t.Fatalf("key %q: expected string, got %T (%v)", key, v, v)
	}
	return s
}

func getSlice(t *testing.T, m map[string]any, key string) []any {
	t.Helper()
	v, ok := m[key]
	if !ok {
		t.Fatalf("key %q not found in response", key)
	}
	s, ok := v.([]any)
	if !ok {
		t.Fatalf("key %q: expected []any, got %T (%v)", key, v, v)
	}
	return s
}

func requireStatus(t *testing.T, got, want int, body map[string]any) {
	t.Helper()
	if got != want {
		t.Fatalf("expected HTTP %d, got %d — body: %v", want, got, body)
	}
}

func doMultipart(t *testing.T, path string, fields map[string]string) (int, map[string]any) {
	t.Helper()
	var sb strings.Builder
	boundary := "integrationboundary"
	for k, v := range fields {
		fmt.Fprintf(&sb, "--%s\r\nContent-Disposition: form-data; name=%q\r\n\r\n%s\r\n", boundary, k, v)
	}
	fmt.Fprintf(&sb, "--%s--\r\n", boundary)

	req, err := http.NewRequest(http.MethodPost, apiURL()+path, strings.NewReader(sb.String()))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", apiToken())
	req.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp.StatusCode, result
}
