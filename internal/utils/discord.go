package utils

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/disgoorg/disgo/discord"
	disgo "github.com/disgoorg/disgo/rest"
	"github.com/disgoorg/snowflake/v2"
)

type DiscordAdapter struct {
	cfg     Config
	client  disgo.Rest
	http    *http.Client
	limiter <-chan time.Time
}

func NewDiscordAdapter(cfg Config) (*DiscordAdapter, error) {
	client := disgo.New(disgo.NewClient(cfg.BotToken))
	return &DiscordAdapter{
		cfg:     cfg,
		client:  client,
		http:    &http.Client{Timeout: 15 * time.Second},
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

// ExchangeCode exchanges a Discord OAuth authorization code for an access token using PKCE.
func (a *DiscordAdapter) ExchangeCode(_ context.Context, code, codeVerifier, redirectURI string) (*discord.AccessTokenResponse, error) {
	a.wait()
	form := url.Values{}
	form.Set("client_id", a.cfg.DiscordClientID)
	form.Set("client_secret", a.cfg.DiscordClientSecret)
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("code_verifier", codeVerifier)

	req, err := http.NewRequest(http.MethodPost, "https://discord.com/api/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := a.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode >= http.StatusBadRequest {
		var body struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body.ErrorDescription != "" {
			return nil, fmt.Errorf("discord token exchange failed: %s", body.ErrorDescription)
		}
		if body.Error != "" {
			return nil, fmt.Errorf("discord token exchange failed: %s", body.Error)
		}
		return nil, fmt.Errorf("discord token exchange failed with status %d", resp.StatusCode)
	}

	var token discord.AccessTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return nil, err
	}
	return &token, nil
}

// GetCurrentUser fetches the OAuth2 user associated with the bearer token.
func (a *DiscordAdapter) GetCurrentUser(_ context.Context, bearerToken string) (*discord.OAuth2User, error) {
	a.wait()
	return a.client.GetCurrentUser(bearerToken)
}

// GetUserGuilds fetches the guilds the OAuth2 user belongs to using their bearer token.
func (a *DiscordAdapter) GetUserGuilds(_ context.Context, bearerToken string) ([]discord.OAuth2Guild, error) {
	a.wait()
	return a.client.GetCurrentUserGuilds(bearerToken, 0, 0, 200, true)
}

// GetGuild fetches a guild by ID using the bot token.
func (a *DiscordAdapter) GetGuild(_ context.Context, guildID int64) (*discord.RestGuild, error) {
	a.wait()
	return a.client.GetGuild(snowflake.ID(guildID), true)
}

// GetMembers fetches guild members using the bot token.
func (a *DiscordAdapter) GetMembers(_ context.Context, guildID int64, limit int, after int64) ([]discord.Member, error) {
	a.wait()
	return a.client.GetMembers(snowflake.ID(guildID), limit, snowflake.ID(after))
}

// GetChannel fetches a channel by ID using the bot token.
func (a *DiscordAdapter) GetChannel(_ context.Context, channelID int64) (discord.Channel, error) {
	a.wait()
	return a.client.GetChannel(snowflake.ID(channelID))
}

// GetGuildChannels fetches the guild channels using the bot token.
func (a *DiscordAdapter) GetGuildChannels(_ context.Context, guildID int64) ([]discord.GuildChannel, error) {
	a.wait()
	return a.client.GetGuildChannels(snowflake.ID(guildID))
}

// GetGuildWebhooks fetches all webhooks for a guild using the bot token.
func (a *DiscordAdapter) GetGuildWebhooks(_ context.Context, guildID int64) ([]discord.Webhook, error) {
	a.wait()
	return a.client.GetAllWebhooks(snowflake.ID(guildID))
}

// CreateWebhook creates a webhook in a guild channel using the bot token.
func (a *DiscordAdapter) CreateWebhook(_ context.Context, channelID int64, name string) (*discord.IncomingWebhook, error) {
	a.wait()
	return a.client.CreateWebhook(snowflake.ID(channelID), discord.WebhookCreate{Name: name})
}

// GetActiveGuildThreads fetches active threads for a guild using the bot token.
func (a *DiscordAdapter) GetActiveGuildThreads(_ context.Context, guildID int64) (*discord.GuildActiveThreads, error) {
	a.wait()
	return a.client.GetActiveGuildThreads(snowflake.ID(guildID))
}

// GetRoles fetches guild roles using the bot token.
func (a *DiscordAdapter) GetRoles(_ context.Context, guildID int64) ([]discord.Role, error) {
	a.wait()
	return a.client.GetRoles(snowflake.ID(guildID))
}

// GetMember fetches a single guild member by user ID using the bot token.
// Returns nil if the member is not found or an error occurs.
func (a *DiscordAdapter) GetMember(_ context.Context, guildID, userID int64) *discord.Member {
	a.wait()
	m, err := a.client.GetMember(snowflake.ID(guildID), snowflake.ID(userID))
	if err != nil {
		return nil
	}
	return m
}

// GetMemberDirect fetches a single guild member without the adapter's extra delay.
// Use this only for bounded, concurrent lookups where the underlying Discord client
// already handles rate limiting.
func (a *DiscordAdapter) GetMemberDirect(_ context.Context, guildID, userID int64) *discord.Member {
	m, err := a.client.GetMember(snowflake.ID(guildID), snowflake.ID(userID))
	if err != nil {
		return nil
	}
	return m
}

// IsMember checks whether a user is a member of a guild (using bot token).
func (a *DiscordAdapter) IsMember(_ context.Context, guildID, userID int64) bool {
	a.wait()
	_, err := a.client.GetMember(snowflake.ID(guildID), snowflake.ID(userID))
	return err == nil
}

// IsInGuild reports whether the bot is present in the given guild (using bot token).
func (a *DiscordAdapter) IsInGuild(_ context.Context, guildID int64) (bool, error) {
	_, err := a.client.GetGuild(snowflake.ID(guildID), false)
	if err == nil {
		return true, nil
	}

	var discordErr *disgo.Error
	if errors.As(err, &discordErr) {
		if discordErr.Response != nil {
			status := discordErr.Response.StatusCode
			if status == http.StatusForbidden || status == http.StatusNotFound {
				return false, nil
			}
		}
		if disgo.IsJSONErrorCode(err, disgo.JSONErrorCodeUnknownGuild) {
			return false, nil
		}
	}

	return false, fmt.Errorf("discord guild lookup failed: %w", err)
}

// RefreshToken exchanges a Discord refresh token for a new access token.
func (a *DiscordAdapter) RefreshToken(_ context.Context, refreshToken string) (*discord.AccessTokenResponse, error) {
	a.wait()
	clientID, err := snowflake.Parse(a.cfg.DiscordClientID)
	if err != nil {
		return nil, fmt.Errorf("invalid discord client ID: %w", err)
	}
	return a.client.RefreshAccessToken(clientID, a.cfg.DiscordClientSecret, refreshToken)
}

func (a *DiscordAdapter) Close(_ context.Context) error { return nil }
