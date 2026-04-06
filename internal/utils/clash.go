package utils

import (
	"context"
	"sync"

	clashy "github.com/clashkinginc/clashy.go"
)

type PlayerResult struct {
	Player *clashy.Player
	Err    error
}

type ClashAdapter struct {
	client         *clashy.Client
	locationsMu    sync.RWMutex
	cachedLocation []clashy.Location
}

func NewClashAdapter(ctx context.Context, email, password string) (*ClashAdapter, error) {
	client, err := clashy.NewClient(clashy.ClientConfig{
		BaseURL:       "https://proxy.clashk.ing/v1",
		KeyCount:      10,
		KeyNames:      "test",
		ThrottleLimit: 500,
		CacheMaxSize:  10_000,
		RawJSON:       true,
		LoadGameData:  clashy.LoadGameData{Default: false},
	})
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

	locations, err := a.client.SearchLocations(ctx, 0, "", "")
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
