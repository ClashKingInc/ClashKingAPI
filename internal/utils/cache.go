package utils

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/valkey-io/valkey-go"
)

// DiscordMemberCacheEntry is the value stored in Valkey for a guild member identity.
// The bot is the producer; this API is a read-only consumer.
// Key format: discord:guild_member:{guild_id}:{user_id}
type DiscordMemberCacheEntry struct {
	Username    *string `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	// NotOnServer is set to true by the bot when it has confirmed the user
	// is no longer a member of the guild. Acts as a negative cache entry.
	NotOnServer bool `json:"not_on_server,omitempty"`
}

// CacheAdapter wraps the Valkey client. It degrades gracefully when Valkey is
// unavailable (nil client → all lookups are cache misses).
type CacheAdapter struct {
	client valkey.Client
}

// NewCacheAdapter creates a CacheAdapter connected to the configured Valkey/Redis
// instance. If RedisIP is empty or the connection fails, a no-op adapter is returned
// so the rest of the app can continue without caching.
func NewCacheAdapter(cfg Config) *CacheAdapter {
	if cfg.RedisIP == "" {
		return &CacheAdapter{}
	}
	opts := valkey.ClientOption{
		InitAddress: []string{cfg.RedisIP},
	}
	if cfg.RedisPassword != "" {
		opts.Password = cfg.RedisPassword
	}
	client, err := valkey.NewClient(opts)
	if err != nil {
		return &CacheAdapter{}
	}
	return &CacheAdapter{client: client}
}

// GetDiscordMember looks up a guild member's identity from the Valkey cache.
// Returns (entry, true) on cache hit, (nil, false) on miss or error.
func (c *CacheAdapter) GetDiscordMember(ctx context.Context, guildID int64, userID string) (*DiscordMemberCacheEntry, bool) {
	if c.client == nil {
		return nil, false
	}
	key := fmt.Sprintf("discord:guild_member:%d:%s", guildID, userID)
	result := c.client.Do(ctx, c.client.B().Get().Key(key).Build())
	if result.Error() != nil {
		return nil, false
	}
	data, err := result.AsBytes()
	if err != nil {
		return nil, false
	}
	var entry DiscordMemberCacheEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, false
	}
	return &entry, true
}

// GetTownhallLeaderboard returns the current leaderboard snapshot produced by
// clashking_tracking. Key format: leaderboards:townhall:{townhall_level}.
func (c *CacheAdapter) GetTownhallLeaderboard(ctx context.Context, townhall int) ([]byte, bool) {
	if c == nil || c.client == nil {
		return nil, false
	}
	key := fmt.Sprintf("leaderboards:townhall:%d", townhall)
	result := c.client.Do(ctx, c.client.B().Get().Key(key).Build())
	if result.Error() != nil {
		return nil, false
	}
	data, err := result.AsBytes()
	if err != nil {
		return nil, false
	}
	return data, true
}

// Close releases the Valkey connection.
func (c *CacheAdapter) Close() {
	if c.client != nil {
		c.client.Close()
	}
}
