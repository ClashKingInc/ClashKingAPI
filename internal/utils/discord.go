package utils

import (
	"context"
	"time"

	disgo "github.com/disgoorg/disgo/rest"
)

type DiscordAdapter struct {
	cfg     Config
	client  disgo.Rest
	limiter <-chan time.Time
}

func NewDiscordAdapter(cfg Config) (*DiscordAdapter, error) {
	client := disgo.New(disgo.NewClient(cfg.BotToken))
	return &DiscordAdapter{
		cfg:     cfg,
		client:  client,
		limiter: time.Tick(500 * time.Millisecond),
	}, nil
}

func (a *DiscordAdapter) wait() {
	if a == nil || a.limiter == nil {
		return
	}
	<-a.limiter
}

func (a *DiscordAdapter) VerifyMember(_ context.Context, _ int64, _ int64) error {
	a.wait()
	return nil
}

func (a *DiscordAdapter) Close(context.Context) error { return nil }
