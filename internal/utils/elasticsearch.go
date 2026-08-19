package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const elasticsearchMaximumResponseBytes = 16 << 20

// ElasticsearchAdapter is the API's narrow, read-only Elasticsearch transport.
// Search query construction remains in the route package so this adapter does
// not leak product contracts into shared infrastructure.
type ElasticsearchAdapter struct {
	baseURL      *url.URL
	apiKey       string
	client       *http.Client
	PlayersAlias string
	ClansAlias   string
}

func NewElasticsearchAdapter(cfg Config) (*ElasticsearchAdapter, error) {
	if strings.TrimSpace(cfg.ElasticsearchURL) == "" {
		return nil, nil
	}
	parsed, err := url.Parse(cfg.ElasticsearchURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid ELASTICSEARCH_URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("ELASTICSEARCH_URL must use http or https")
	}
	return &ElasticsearchAdapter{
		baseURL: parsed,
		apiKey:  strings.TrimSpace(cfg.ElasticsearchAPIKey),
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		PlayersAlias: firstNonEmpty(cfg.ElasticsearchPlayersAlias, "clashking_players"),
		ClansAlias:   firstNonEmpty(cfg.ElasticsearchClansAlias, "clashking_clans"),
	}, nil
}

// DoJSON sends one Elasticsearch request and decodes its JSON response.
func (a *ElasticsearchAdapter) DoJSON(ctx context.Context, method, requestPath string, query url.Values, body any, out any) error {
	if a == nil || a.client == nil || a.baseURL == nil {
		return fmt.Errorf("Elasticsearch is not configured")
	}
	var encoded io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		encoded = bytes.NewReader(raw)
	}
	endpoint := *a.baseURL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/" + strings.TrimLeft(requestPath, "/")
	endpoint.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), encoded)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if a.apiKey != "" {
		req.Header.Set("Authorization", "ApiKey "+a.apiKey)
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	limited := io.LimitReader(resp.Body, elasticsearchMaximumResponseBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(raw) > elasticsearchMaximumResponseBytes {
		return fmt.Errorf("Elasticsearch response exceeded the supported size")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("Elasticsearch request failed with status %d", resp.StatusCode)
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("decode Elasticsearch response: %w", err)
	}
	return nil
}

func (a *ElasticsearchAdapter) Close() {
	if a == nil || a.client == nil {
		return
	}
	if transport, ok := a.client.Transport.(interface{ CloseIdleConnections() }); ok {
		transport.CloseIdleConnections()
		return
	}
	a.client.CloseIdleConnections()
}
