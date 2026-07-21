package server

import (
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestServerClanBadgeToken(t *testing.T) {
	got := serverClanBadgeToken("https://api-assets.clashofclans.com/badges/512/example-token.png?size=512")
	if got != "example-token" {
		t.Fatalf("serverClanBadgeToken() = %q, want example-token", got)
	}
}

func TestServerClanBadgeURL(t *testing.T) {
	got := serverClanBadgeURL("example-token.png")
	if got == nil || *got != "https://api-assets.clashofclans.com/badges/200/example-token.png" {
		t.Fatalf("serverClanBadgeURL() = %v", got)
	}
	if got := serverClanBadgeURL(""); got != nil {
		t.Fatalf("serverClanBadgeURL(\"\") = %v, want nil", got)
	}
}

func TestValidClanTag(t *testing.T) {
	for _, tag := range []string{"#2PP", "#2Y0LQ8J9"} {
		if !validClanTag(tag) {
			t.Fatalf("validClanTag(%q) = false, want true", tag)
		}
	}
	for _, tag := range []string{"", "#12", "#ABC", "#2PP!"} {
		if validClanTag(tag) {
			t.Fatalf("validClanTag(%q) = true, want false", tag)
		}
	}
}

func TestNormalizedClanSettingUpdatesSkipsAbsentFields(t *testing.T) {
	category := "Main"
	updates := normalizedClanSettingUpdates(modelsv2.ClanSettingsUpdate{Category: &category})
	if len(updates) != 0 {
		t.Fatalf("normalizedClanSettingUpdates() = %#v, want no server_clan_settings updates", updates)
	}
}

func TestNormalizedClanSettingUpdatesDereferencesPresentFields(t *testing.T) {
	greeting := "Welcome"
	autoGreetOption := "Always"
	banAlertChannel := "123"
	updates := normalizedClanSettingUpdates(modelsv2.ClanSettingsUpdate{
		Greeting:        &greeting,
		AutoGreetOption: &autoGreetOption,
		BanAlertChannel: &banAlertChannel,
	})
	want := []normalizedClanSettingUpdate{
		{column: "greeting", value: greeting},
		{column: "auto_greet_option", value: autoGreetOption},
		{column: "ban_alert_channel_id", value: banAlertChannel},
	}
	if len(updates) != len(want) {
		t.Fatalf("normalizedClanSettingUpdates() = %#v, want %#v", updates, want)
	}
	for index := range want {
		if updates[index] != want[index] {
			t.Fatalf("normalizedClanSettingUpdates()[%d] = %#v, want %#v", index, updates[index], want[index])
		}
	}
}
