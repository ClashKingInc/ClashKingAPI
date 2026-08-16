package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/valkey-io/valkey-go"
)

const VerifiedPlayerTrackingKey = "tracking:verified_players"
const trackingEventStreamKey = "tracking:events"

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

// NewCacheAdapter creates a CacheAdapter connected to the configured Valkey
// instance. If ValkeyAddress is empty or the connection fails, a no-op adapter is returned
// so the rest of the app can continue without caching.
func NewCacheAdapter(cfg Config) *CacheAdapter {
	if cfg.ValkeyAddress == "" {
		return &CacheAdapter{}
	}
	opts := valkey.ClientOption{
		InitAddress: []string{cfg.ValkeyAddress},
	}
	if cfg.ValkeyPassword != "" {
		opts.Password = cfg.ValkeyPassword
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
	return c.getLeaderboard(ctx, fmt.Sprintf("leaderboards:townhall:%d", townhall))
}

// GetLeagueLeaderboard returns the current ranked-league snapshot produced by
// clashking_tracking. Key format: leaderboards:league:{league_tier_id}.
func (c *CacheAdapter) GetLeagueLeaderboard(ctx context.Context, leagueID int) ([]byte, bool) {
	return c.getLeaderboard(ctx, fmt.Sprintf("leaderboards:league:%d", leagueID))
}

func (c *CacheAdapter) getLeaderboard(ctx context.Context, key string) ([]byte, bool) {
	if c == nil || c.client == nil {
		return nil, false
	}
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

// RefreshVerifiedPlayers keeps verified player tags eligible for priority tracking.
// The score is the tag's expiry time, so tracking workers can enumerate active tags
// without scanning keys and expired users naturally fall out after seven days.
func (c *CacheAdapter) RefreshVerifiedPlayers(ctx context.Context, tags []string, ttl time.Duration) error {
	if c == nil || c.client == nil || len(tags) == 0 {
		return nil
	}
	expiresAt := time.Now().UTC().Add(ttl).Unix()
	command := c.client.B().Zadd().Key(VerifiedPlayerTrackingKey).ScoreMember()
	for _, tag := range tags {
		command = command.ScoreMember(float64(expiresAt), tag)
	}
	if err := c.client.Do(ctx, command.Build()).Error(); err != nil {
		return err
	}
	return c.client.Do(ctx, c.client.B().Zremrangebyscore().Key(VerifiedPlayerTrackingKey).
		Min("-inf").Max(strconv.FormatInt(time.Now().UTC().Unix(), 10)).Build()).Error()
}

// PublishTrackingEvent tells independent tracking workers that authoritative SQL
// configuration changed. The worker reloads the referenced scope from Postgres.
func (c *CacheAdapter) PublishTrackingEvent(ctx context.Context, topic, clanTag string, value map[string]any) error {
	if c == nil || c.client == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.client.Do(ctx, c.client.B().Xadd().Key(trackingEventStreamKey).Id("*").FieldValue().
		FieldValue("topic", topic).
		FieldValue("clan_tag", clanTag).
		FieldValue("timestamp", time.Now().UTC().Format(time.RFC3339Nano)).
		FieldValue("value", string(raw)).Build()).Error()
}

// Close releases the Valkey connection.
func (c *CacheAdapter) Close() {
	if c.client != nil {
		c.client.Close()
	}
}
