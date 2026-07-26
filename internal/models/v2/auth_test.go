package modelsv2

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAuthDiscordOAuthRequestOmitsRemovedDeviceName(t *testing.T) {
	payload, err := json.Marshal(AuthDiscordOAuthRequest{
		Code:         "oauth-code",
		CodeVerifier: "pkce-verifier",
		DeviceID:     "device-1",
		RedirectURI:  "clashking://oauth",
	})
	if err != nil {
		t.Fatalf("marshal Discord OAuth request: %v", err)
	}
	if strings.Contains(string(payload), "device_name") {
		t.Fatalf("Discord OAuth request still exposes removed device_name: %s", payload)
	}
}

func TestAuthResponseDoesNotExposeDiscordOAuthCredentials(t *testing.T) {
	payload, err := json.Marshal(AuthResponse{
		AccessToken:  "clashking-access-token",
		RefreshToken: "clashking-refresh-token",
		User: AuthUserInfo{
			UserID:      "user-1",
			Username:    "User",
			AvatarURL:   "https://example.com/avatar.png",
			AuthMethods: []string{"discord"},
		},
	})
	if err != nil {
		t.Fatalf("marshal auth response: %v", err)
	}
	for _, forbidden := range []string{
		"access_token_ciphertext",
		"refresh_token_ciphertext",
		"discord_access_token",
		"discord_refresh_token",
		"email",
	} {
		if strings.Contains(string(payload), forbidden) {
			t.Fatalf("auth response exposes Discord OAuth credential field %q: %s", forbidden, payload)
		}
	}
}
