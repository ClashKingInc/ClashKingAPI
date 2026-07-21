package utils

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	disgo "github.com/disgoorg/disgo/rest"
)

func TestGetBotGuildProfileUsesCurrentMemberResponseAndGlobalFallback(t *testing.T) {
	const botUserID = "123456789012345678"
	memberRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/v10/guilds/987654321098765432/members/@me":
			memberRequests++
			if request.Method != http.MethodPatch {
				t.Fatalf("profile lookup method = %q, want PATCH", request.Method)
			}
			_, _ = writer.Write([]byte(`{"nick":"ClashKing Beta","avatar":"guild-avatar","user":{"id":"` + botUserID + `"},"bio":"Family bot"}`))
		case "/api/v10/oauth2/applications/@me":
			_, _ = writer.Write([]byte(`{"id":"` + botUserID + `","name":"ClashKing","description":"Global bot description","bot":{"id":"` + botUserID + `","username":"ClashKing","avatar":"global-avatar","banner":"global-banner"}}`))
		default:
			t.Fatalf("unexpected profile lookup path %q", request.URL.Path)
		}
	}))
	defer server.Close()
	adapter := &DiscordAdapter{
		client: disgo.New(disgo.NewClient("token", disgo.WithURL(server.URL+"/api/v10"))),
	}

	profile, err := adapter.GetBotGuildProfile(context.Background(), 987654321098765432)
	if err != nil {
		t.Fatalf("GetBotGuildProfile() error = %v", err)
	}
	if profile.UserID != botUserID || profile.Name != "ClashKing Beta" || profile.Bio != "Family bot" || profile.Avatar == nil || *profile.Avatar != "guild-avatar" || profile.Banner == nil || *profile.Banner != "global-banner" || !profile.NameGuildProfile || !profile.AvatarGuildProfile || profile.BannerGuildProfile || !profile.BioGuildProfile {
		t.Fatalf("GetBotGuildProfile() = %#v", profile)
	}
	if _, err := adapter.GetBotGuildProfile(context.Background(), 987654321098765432); err != nil {
		t.Fatalf("cached GetBotGuildProfile() error = %v", err)
	}
	if memberRequests != 1 {
		t.Fatalf("member profile requests = %d, want 1", memberRequests)
	}
}

func TestHydrateBotGuildProfileUsesApplicationDescriptionForEmptyGuildBio(t *testing.T) {
	emptyBio := ""
	member := discordBotGuildMember{Bio: &emptyBio}
	member.User.ID = "123456789012345678"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/v10/oauth2/applications/@me" {
			t.Fatalf("application lookup path = %q", request.URL.Path)
		}
		_, _ = writer.Write([]byte(`{"name":"ClashKing","description":"Global bot description","bot":{"id":"123456789012345678","username":"ClashKing"}}`))
	}))
	defer server.Close()
	adapter := &DiscordAdapter{
		client: disgo.New(disgo.NewClient("token", disgo.WithURL(server.URL+"/api/v10"))),
	}

	profile, err := adapter.hydrateBotGuildProfile(context.Background(), member)
	if err != nil {
		t.Fatalf("hydrateBotGuildProfile() error = %v", err)
	}
	if profile.Bio != "Global bot description" || profile.BioGuildProfile {
		t.Fatalf("hydrateBotGuildProfile() = %#v", profile)
	}
}

func TestFindOrCreateLogWebhookReusesBotWebhookInSelectedChannel(t *testing.T) {
	const botUserID = "123456789012345678"
	const guildID = int64(987654321098765432)
	const channelID = int64(456789012345678901)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/v10/guilds/987654321098765432/members/@me":
			_, _ = writer.Write([]byte(`{"nick":"ClashKing Beta","user":{"id":"` + botUserID + `"}}`))
		case "/api/v10/oauth2/applications/@me":
			_, _ = writer.Write([]byte(`{"id":"` + botUserID + `","name":"ClashKing","bot":{"id":"` + botUserID + `","username":"ClashKing"}}`))
		case "/api/v10/guilds/987654321098765432/webhooks":
			if request.Method != http.MethodGet {
				t.Fatalf("webhook method = %q, want GET", request.Method)
			}
			_, _ = writer.Write([]byte(`[{"type":1,"id":"111111111111111111","name":"ClashKing Beta","channel_id":"456789012345678901","guild_id":"987654321098765432","token":"secret","user":{"id":"` + botUserID + `"}}]`))
		default:
			t.Fatalf("unexpected webhook path %q", request.URL.Path)
		}
	}))
	defer server.Close()
	adapter := &DiscordAdapter{
		client:       disgo.New(disgo.NewClient("token", disgo.WithURL(server.URL+"/api/v10"))),
		http:         server.Client(),
		profileCache: make(map[int64]cachedBotGuildProfile),
	}

	webhook, err := adapter.FindOrCreateLogWebhook(context.Background(), guildID, channelID)
	if err != nil {
		t.Fatalf("FindOrCreateLogWebhook() error = %v", err)
	}
	if webhook.ID().String() != "111111111111111111" {
		t.Fatalf("webhook ID = %s", webhook.ID())
	}
}

func TestBotProfileAvatarURLUsesGuildAvatar(t *testing.T) {
	avatar := "guild-avatar"
	profile := &DiscordBotGuildProfile{UserID: "123", Avatar: &avatar, AvatarGuildProfile: true}
	got := botProfileAvatarURL(456, profile)
	want := "https://cdn.discordapp.com/guilds/456/users/123/avatars/guild-avatar.png?size=256"
	if got != want {
		t.Fatalf("botProfileAvatarURL() = %q, want %q", got, want)
	}
}
