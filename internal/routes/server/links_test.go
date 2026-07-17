package server

import (
	"testing"

	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
)

func TestParseServerLinksQuery(t *testing.T) {
	t.Run("multiple role mentions and member text", func(t *testing.T) {
		query := parseServerLinksQuery("<@&123> <@&456> Matthew")
		if len(query.roleIDs) != 2 || query.roleIDs[0] != "123" || query.roleIDs[1] != "456" {
			t.Fatalf("unexpected roles: %#v", query.roleIDs)
		}
		if query.text != "matthew" || query.playerTag != "" {
			t.Fatalf("unexpected text query: %#v", query)
		}
	})

	t.Run("player tag", func(t *testing.T) {
		query := parseServerLinksQuery("#2PPQ8L0")
		if query.playerTag != "#2PPQ8L0" || query.text != "" {
			t.Fatalf("unexpected player query: %#v", query)
		}
	})
}

func TestServerMemberMatchesAnySelectedRole(t *testing.T) {
	member := discord.Member{
		User:    discord.User{Username: "Matthew"},
		RoleIDs: []snowflake.ID{123},
	}
	if !serverMemberMatchesQuery(member, nil, serverLinksQuery{roleIDs: []string{"123", "456"}}) {
		t.Fatal("expected member with any selected role to match")
	}
	if serverMemberMatchesQuery(member, nil, serverLinksQuery{roleIDs: []string{"456", "789"}}) {
		t.Fatal("expected member without any selected role not to match")
	}
}

func TestServerMemberPlayerTagSearchIsExact(t *testing.T) {
	member := discord.Member{User: discord.User{Username: "Matthew"}}
	links := []serverLinkRow{{playerTag: "#2PPQ8L0"}}
	if !serverMemberMatchesQuery(member, links, serverLinksQuery{playerTag: "#2PPQ8L0"}) {
		t.Fatal("expected exact player tag to match")
	}
	if serverMemberMatchesQuery(member, links, serverLinksQuery{playerTag: "#2PPQ8L"}) {
		t.Fatal("expected partial player tag not to match")
	}
}

func TestServerAccountFilter(t *testing.T) {
	for _, value := range []string{"", "none"} {
		if parsed, err := serverAccountFilter(value); err != nil || parsed != value {
			t.Fatalf("expected %q to be accepted, got %q, %v", value, parsed, err)
		}
	}
	if _, err := serverAccountFilter("linked"); err == nil {
		t.Fatal("expected unknown account filter to be rejected")
	}
}
