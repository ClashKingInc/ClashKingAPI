package server

import (
	"testing"

	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
)

func TestSelectableDiscordRolesExcludesEveryoneAndManagedRoles(t *testing.T) {
	const serverID = 1317858645349765150
	roles := []discord.Role{
		{ID: snowflake.ID(serverID), Name: "@everyone"},
		{ID: 2, Name: "ClashKing", Managed: true},
		{ID: 3, Name: "Integration", Managed: true},
		{ID: 4, Name: "Admin"},
		{ID: 5, Name: "Contributor"},
	}

	available := selectableDiscordRoles(roles, serverID)
	if len(available) != 2 || available[0].Name != "Admin" || available[1].Name != "Contributor" {
		t.Fatalf("selectableDiscordRoles() = %#v", available)
	}
}

func TestDiscordChannelTypeNameIncludesForumForDestinationSelectors(t *testing.T) {
	for _, testCase := range []struct {
		channelType discord.ChannelType
		want        string
		wantOK      bool
	}{
		{channelType: discord.ChannelTypeGuildCategory, want: "category", wantOK: true},
		{channelType: discord.ChannelTypeGuildText, want: "text", wantOK: true},
		{channelType: discord.ChannelTypeGuildNews, want: "news", wantOK: true},
		{channelType: discord.ChannelTypeGuildForum, want: "forum", wantOK: true},
		{channelType: discord.ChannelTypeGuildVoice},
	} {
		got, ok := discordChannelTypeName(testCase.channelType)
		if got != testCase.want || ok != testCase.wantOK {
			t.Fatalf("discordChannelTypeName(%d) = %q, %v; want %q, %v", testCase.channelType, got, ok, testCase.want, testCase.wantOK)
		}
	}
}
