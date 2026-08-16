package utils

import (
	"context"
	"strings"
	"sync"

	clashy "github.com/clashkinginc/clashy.go"
)

type PlayerResult struct {
	Player *clashy.Player
	Err    error
}

type ClashAdapter struct {
	client             *clashy.Client
	locationsMu        sync.RWMutex
	cachedLocation     []clashy.Location
	staticSections     sync.Map
	staticTranslations sync.Map
}

func NewClashAdapter(ctx context.Context, proxyOrigin string) (*ClashAdapter, error) {
	config := clashy.DefaultClientConfig()
	config.BaseURL = strings.TrimRight(proxyOrigin, "/") + "/v1"
	config.KeyCount = 10
	config.KeyNames = "test"
	config.ThrottleLimit = 500
	config.CacheMaxSize = 10_000

	client, err := clashy.NewClient(config)
	if err != nil {
		return nil, err
	}
	return &ClashAdapter{client: client}, nil
}

func NormalizeTag(tag string) string {
	for i := len(tag) - 1; i >= 0; i-- {
		if tag[i] == '|' {
			return tag[i+1:]
		}
	}
	return tag
}

func (a *ClashAdapter) Client() *clashy.Client { return a.client }

// StaticSection returns a cached, read-only static-data section. Callers must
// clone items before modifying them for a response.
func (a *ClashAdapter) StaticSection(name string) []map[string]any {
	if a == nil || a.client == nil {
		return nil
	}
	if cached, ok := a.staticSections.Load(name); ok {
		return cached.([]map[string]any)
	}
	items := a.client.StaticData().Section(name)
	cached, _ := a.staticSections.LoadOrStore(name, items)
	return cached.([]map[string]any)
}

// StaticTranslation returns a cached, read-only translation entry.
func (a *ClashAdapter) StaticTranslation(id string) map[string]string {
	if a == nil || a.client == nil {
		return nil
	}
	if cached, ok := a.staticTranslations.Load(id); ok {
		return cached.(map[string]string)
	}
	translation := a.client.StaticData().Translation(id)
	cached, _ := a.staticTranslations.LoadOrStore(id, translation)
	return cached.(map[string]string)
}

func (a *ClashAdapter) GetPlayer(ctx context.Context, tag string) (*clashy.Player, error) {
	return a.client.GetPlayer(ctx, NormalizeTag(tag))
}

func (a *ClashAdapter) GetClan(ctx context.Context, tag string) (*clashy.Clan, error) {
	return a.client.GetClan(ctx, NormalizeTag(tag))
}

func (a *ClashAdapter) SearchLocations(ctx context.Context) ([]clashy.Location, error) {
	a.locationsMu.RLock()
	if a.cachedLocation != nil {
		defer a.locationsMu.RUnlock()
		return append([]clashy.Location(nil), a.cachedLocation...), nil
	}
	a.locationsMu.RUnlock()

	locations, err := a.client.SearchLocations(ctx, clashy.PageOptions{})
	if err != nil {
		return nil, err
	}
	a.locationsMu.Lock()
	a.cachedLocation = append([]clashy.Location(nil), locations...)
	a.locationsMu.Unlock()
	return locations, nil
}

func (a *ClashAdapter) FetchPlayers(ctx context.Context, tags []string) <-chan PlayerResult {
	out := make(chan PlayerResult)
	go func() {
		defer close(out)
		sem := make(chan struct{}, 100)
		var wg sync.WaitGroup
		for _, rawTag := range tags {
			wg.Add(1)
			tag := NormalizeTag(rawTag)
			sem <- struct{}{}
			go func() {
				defer wg.Done()
				defer func() { <-sem }()
				player, err := a.client.GetPlayer(ctx, tag)
				out <- PlayerResult{Player: player, Err: err}
			}()
		}
		wg.Wait()
	}()
	return out
}

func (a *ClashAdapter) Close() error { return a.client.Close() }
