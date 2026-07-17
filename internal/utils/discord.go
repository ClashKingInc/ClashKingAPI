package utils

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/disgoorg/disgo/discord"
	disgo "github.com/disgoorg/disgo/rest"
	"github.com/disgoorg/snowflake/v2"
	"golang.org/x/sync/singleflight"
)

const (
	botGuildProfileCacheTTL  = 5 * time.Minute
	botGlobalProfileCacheTTL = 15 * time.Minute
)

type DiscordAdapter struct {
	cfg     Config
	client  disgo.Rest
	http    *http.Client
	limiter <-chan time.Time

	profileMu       sync.RWMutex
	profileCache    map[int64]cachedBotGuildProfile
	profileRequests singleflight.Group
	globalProfile   cachedBotGlobalProfile
	globalRequests  singleflight.Group
}

type cachedBotGuildProfile struct {
	profile   *DiscordBotGuildProfile
	expiresAt time.Time
}

type cachedBotGlobalProfile struct {
	profile   *discordCurrentApplication
	expiresAt time.Time
}

type DiscordBotGuildProfile struct {
	UserID             string  `json:"-"`
	Name               string  `json:"name"`
	Avatar             *string `json:"avatar"`
	Banner             *string `json:"banner"`
	Bio                string  `json:"bio"`
	NameGuildProfile   bool    `json:"-"`
	AvatarGuildProfile bool    `json:"-"`
	BannerGuildProfile bool    `json:"-"`
	BioGuildProfile    bool    `json:"-"`
}

type discordBotGuildMember struct {
	Nick   *string `json:"nick"`
	Avatar *string `json:"avatar"`
	Banner *string `json:"banner"`
	Bio    *string `json:"bio"`
	User   struct {
		ID         string  `json:"id"`
		Username   string  `json:"username"`
		GlobalName *string `json:"global_name"`
	} `json:"user"`
}

type discordCurrentApplication struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Bot         struct {
		ID         string  `json:"id"`
		Username   string  `json:"username"`
		GlobalName *string `json:"global_name"`
		Avatar     *string `json:"avatar"`
		Banner     *string `json:"banner"`
	} `json:"bot"`
}

func NewDiscordAdapter(cfg Config) (*DiscordAdapter, error) {
	client := disgo.New(disgo.NewClient(cfg.BotToken))
	return &DiscordAdapter{
		cfg:          cfg,
		client:       client,
		http:         &http.Client{Timeout: 15 * time.Second},
		limiter:      time.Tick(500 * time.Millisecond),
		profileCache: make(map[int64]cachedBotGuildProfile),
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

// GetChannelDirect fetches a channel without the adapter's extra delay.
// Use this only for bounded, concurrent lookups where the underlying Discord client
// already handles rate limiting.
func (a *DiscordAdapter) GetChannelDirect(_ context.Context, channelID int64) (discord.Channel, error) {
	return a.client.GetChannel(snowflake.ID(channelID))
}

// GetGuildChannels fetches the guild channels using the bot token.
func (a *DiscordAdapter) GetGuildChannels(_ context.Context, guildID int64) ([]discord.GuildChannel, error) {
	a.wait()
	return a.client.GetGuildChannels(snowflake.ID(guildID))
}

// CreateCountdownChannel creates a read-only voice channel used as a live stat display.
func (a *DiscordAdapter) CreateCountdownChannel(_ context.Context, guildID int64, name string) (discord.GuildChannel, error) {
	a.wait()
	guildSnowflake := snowflake.ID(guildID)
	return a.client.CreateGuildChannel(guildSnowflake, discord.GuildVoiceChannelCreate{
		Name: name,
		PermissionOverwrites: []discord.PermissionOverwrite{
			discord.RolePermissionOverwrite{
				RoleID: guildSnowflake,
				Allow:  discord.PermissionViewChannel,
				Deny:   discord.PermissionConnect,
			},
		},
	})
}

// DeleteChannel removes a channel using the bot token.
func (a *DiscordAdapter) DeleteChannel(_ context.Context, channelID int64) error {
	a.wait()
	return a.client.DeleteChannel(snowflake.ID(channelID))
}

// GetGuildWebhooks fetches all webhooks for a guild using the bot token.
func (a *DiscordAdapter) GetGuildWebhooks(_ context.Context, guildID int64) ([]discord.Webhook, error) {
	a.wait()
	return a.client.GetAllWebhooks(snowflake.ID(guildID))
}

// GetWebhook fetches a webhook by ID using the bot token.
func (a *DiscordAdapter) GetWebhook(_ context.Context, webhookID int64) (discord.Webhook, error) {
	a.wait()
	return a.client.GetWebhook(snowflake.ID(webhookID))
}

// CreateWebhook creates a webhook in a guild channel using the bot token.
func (a *DiscordAdapter) CreateWebhook(_ context.Context, channelID int64, name string) (*discord.IncomingWebhook, error) {
	a.wait()
	return a.client.CreateWebhook(snowflake.ID(channelID), discord.WebhookCreate{Name: name})
}

// DeleteWebhook removes a webhook using the bot token.
func (a *DiscordAdapter) DeleteWebhook(_ context.Context, webhookID int64) error {
	a.wait()
	return a.client.DeleteWebhook(snowflake.ID(webhookID))
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

func (a *DiscordAdapter) GetBotGuildProfile(ctx context.Context, guildID int64) (*DiscordBotGuildProfile, error) {
	if profile := a.cachedBotGuildProfile(guildID); profile != nil {
		return profile, nil
	}

	value, err, _ := a.profileRequests.Do(fmt.Sprintf("%d", guildID), func() (any, error) {
		if profile := a.cachedBotGuildProfile(guildID); profile != nil {
			return profile, nil
		}
		// Discord's Guild Member GET omits the newer per-guild bot profile fields.
		// Modify Current Member accepts an empty body and returns the complete profile.
		raw, err := a.requestBotGuildProfile(ctx, guildID, map[string]any{})
		if err != nil {
			return nil, fmt.Errorf("discord profile lookup failed: %w", err)
		}
		profile, err := a.hydrateBotGuildProfile(ctx, *raw)
		if err != nil {
			return nil, err
		}
		a.cacheBotGuildProfile(guildID, profile)
		return profile, nil
	})
	if err != nil {
		return nil, err
	}
	return cloneBotGuildProfile(value.(*DiscordBotGuildProfile)), nil
}

func (a *DiscordAdapter) UpdateBotGuildProfile(ctx context.Context, guildID int64, payload map[string]any) (*DiscordBotGuildProfile, error) {
	raw, err := a.requestBotGuildProfile(ctx, guildID, payload)
	if err != nil {
		return nil, fmt.Errorf("discord profile update failed: %w", err)
	}
	profile, err := a.hydrateBotGuildProfile(ctx, *raw)
	if err != nil {
		return nil, err
	}
	a.cacheBotGuildProfile(guildID, profile)
	return cloneBotGuildProfile(profile), nil
}

func (a *DiscordAdapter) requestBotGuildProfile(ctx context.Context, guildID int64, payload map[string]any) (*discordBotGuildMember, error) {
	var raw discordBotGuildMember
	err := a.client.Do(disgo.UpdateCurrentMember.Compile(nil, snowflake.ID(guildID)), payload, &raw, disgo.WithCtx(ctx))
	if err != nil {
		return nil, err
	}
	return &raw, nil
}

func (a *DiscordAdapter) cachedBotGuildProfile(guildID int64) *DiscordBotGuildProfile {
	a.profileMu.RLock()
	cached, ok := a.profileCache[guildID]
	a.profileMu.RUnlock()
	if !ok || time.Now().After(cached.expiresAt) {
		return nil
	}
	return cloneBotGuildProfile(cached.profile)
}

func (a *DiscordAdapter) cacheBotGuildProfile(guildID int64, profile *DiscordBotGuildProfile) {
	a.profileMu.Lock()
	if a.profileCache == nil {
		a.profileCache = make(map[int64]cachedBotGuildProfile)
	}
	a.profileCache[guildID] = cachedBotGuildProfile{
		profile: cloneBotGuildProfile(profile), expiresAt: time.Now().Add(botGuildProfileCacheTTL),
	}
	a.profileMu.Unlock()
}

func cloneBotGuildProfile(profile *DiscordBotGuildProfile) *DiscordBotGuildProfile {
	if profile == nil {
		return nil
	}
	clone := *profile
	return &clone
}

func (a *DiscordAdapter) hydrateBotGuildProfile(ctx context.Context, member discordBotGuildMember) (*DiscordBotGuildProfile, error) {
	profile := &DiscordBotGuildProfile{
		UserID:             member.User.ID,
		Name:               discordMemberDisplayName(member.Nick, member.User.GlobalName, member.User.Username),
		Avatar:             member.Avatar,
		Banner:             member.Banner,
		NameGuildProfile:   member.Nick != nil && strings.TrimSpace(*member.Nick) != "",
		AvatarGuildProfile: member.Avatar != nil,
		BannerGuildProfile: member.Banner != nil,
		BioGuildProfile:    member.Bio != nil && strings.TrimSpace(*member.Bio) != "",
	}
	if member.Bio != nil {
		profile.Bio = *member.Bio
	}
	if profile.NameGuildProfile && profile.AvatarGuildProfile && profile.BannerGuildProfile && profile.BioGuildProfile {
		return profile, nil
	}

	global, err := a.getBotGlobalProfile(ctx)
	if err != nil {
		return nil, err
	}
	if profile.UserID == "" {
		profile.UserID = global.Bot.ID
	}
	if !profile.NameGuildProfile {
		profile.Name = discordMemberDisplayName(nil, global.Bot.GlobalName, global.Bot.Username)
		if profile.Name == "" {
			profile.Name = global.Name
		}
	}
	if profile.Avatar == nil {
		profile.Avatar = global.Bot.Avatar
	}
	if profile.Banner == nil {
		profile.Banner = global.Bot.Banner
	}
	if !profile.BioGuildProfile {
		profile.Bio = global.Description
	}
	return profile, nil
}

func (a *DiscordAdapter) getBotGlobalProfile(ctx context.Context) (*discordCurrentApplication, error) {
	a.profileMu.RLock()
	cached := a.globalProfile
	a.profileMu.RUnlock()
	if cached.profile != nil && time.Now().Before(cached.expiresAt) {
		clone := *cached.profile
		return &clone, nil
	}

	value, err, _ := a.globalRequests.Do("global", func() (any, error) {
		a.profileMu.RLock()
		cached := a.globalProfile
		a.profileMu.RUnlock()
		if cached.profile != nil && time.Now().Before(cached.expiresAt) {
			clone := *cached.profile
			return &clone, nil
		}
		var profile discordCurrentApplication
		if err := a.client.Do(disgo.GetBotApplicationInfo.Compile(nil), nil, &profile, disgo.WithCtx(ctx)); err != nil {
			return nil, fmt.Errorf("discord bot profile lookup failed: %w", err)
		}
		a.profileMu.Lock()
		a.globalProfile = cachedBotGlobalProfile{profile: &profile, expiresAt: time.Now().Add(botGlobalProfileCacheTTL)}
		a.profileMu.Unlock()
		clone := profile
		return &clone, nil
	})
	if err != nil {
		return nil, err
	}
	return value.(*discordCurrentApplication), nil
}

func discordMemberDisplayName(nick, globalName *string, username string) string {
	if nick != nil && strings.TrimSpace(*nick) != "" {
		return *nick
	}
	if globalName != nil && strings.TrimSpace(*globalName) != "" {
		return *globalName
	}
	return username
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
