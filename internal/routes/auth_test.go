package routes

import (
	"context"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
	"github.com/golang-jwt/jwt/v5"
)

func TestUpsertAuthUserRejectsCombinedIdentity(t *testing.T) {
	err := upsertAuthUser(context.Background(), apptypes.Deps{}, map[string]any{
		"user_id":         "user-1",
		"email_hash":      "email-hash",
		"discord_user_id": "123456789",
		"auth_methods":    []string{"email", "discord"},
	})
	if err == nil || err.Error() != "auth user cannot combine email and Discord identities" {
		t.Fatalf("expected combined identity rejection, got %v", err)
	}
}

func TestParseRefreshTokenRejectsUnexpectedAlgorithm(t *testing.T) {
	cfg := apptypes.Config{RefreshSecret: "refresh-secret"}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS512, apptypes.Claims{Sub: "user-1"}).SignedString([]byte(cfg.RefreshSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := parseRefreshToken(apptypes.Deps{Config: cfg}, token); err == nil {
		t.Fatal("expected refresh token signed with HS512 to be rejected")
	}
}

func TestDiscordIdentityDataIgnoresDiscordEmail(t *testing.T) {
	identity := discordIdentityData(&discord.OAuth2User{
		User: discord.User{
			ID:       snowflake.ID(123456789),
			Username: "discord-user",
		},
		Email:    "discord@example.com",
		Verified: true,
	})

	if identity["discord_user_id"] != "123456789" {
		t.Fatalf("discord_user_id = %v", identity["discord_user_id"])
	}
	for _, key := range []string{"email", "email_hash", "email_encrypted", "verified"} {
		if _, exists := identity[key]; exists {
			t.Fatalf("Discord identity unexpectedly stored %q", key)
		}
	}
}

func TestNormalizeLegacyDiscordIdentityDropsHistoricalEmail(t *testing.T) {
	user := map[string]any{
		"user_id":      "123456789",
		"email_hash":   "historical-discord-email-hash",
		"auth_methods": []string{"email", "discord"},
		"linked_accounts": map[string]any{
			"email": map[string]any{"email_hash": "historical-discord-email-hash"},
		},
	}

	normalizeLegacyDiscordIdentity(user, "123456789")

	if _, exists := user["email_hash"]; exists {
		t.Fatal("historical Discord email hash was not removed")
	}
	if slicesContains(toStringSlice(user["auth_methods"]), "email") {
		t.Fatal("legacy Discord identity still advertises email authentication")
	}
	if linked := user["linked_accounts"].(map[string]any); linked["email"] != nil {
		t.Fatal("legacy Discord email link was not removed")
	}
}
