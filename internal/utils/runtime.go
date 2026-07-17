package utils

import (
	"time"
)

type Deps struct {
	Config    Config
	Store     *Store
	Clash     *ClashAdapter
	Discord   *DiscordAdapter
	Auth      *Authenticator
	Cache     *CacheAdapter
	Mailer    *Mailer
	StartedAt time.Time
}
