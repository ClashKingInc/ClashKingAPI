package server

import "testing"

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
