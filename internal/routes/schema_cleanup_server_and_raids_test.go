package routes

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestRetiredRaidAndServerSchemaSourcesAreAbsent(t *testing.T) {
	root := routesSourceDirectory(t)
	stale := []string{
		"raid_" + "weekends",
		"server_" + "blacklisted_roles",
		"server_" + "clan_settings",
		"server_" + "link_parse_channels",
		"server_" + "settings",
		"clan_" + "channel_id",
		"blacklisted_" + "roles",
		"auto_" + "greet_option",
		"ban_" + "alert_channel",
		"use_" + "api_token",
		"banlist_" + "channel_id",
		"strike_" + "log_channel_id",
		"reddit_" + "feed_channel_id",
	}

	for _, scanRoot := range []string{root, filepath.Join(root, "..", "models")} {
		if err := filepath.WalkDir(scanRoot, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			if filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			source := strings.ToLower(string(raw))
			for _, term := range stale {
				if strings.Contains(source, term) {
					t.Errorf("%s retains retired schema reference %q", path, term)
				}
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	}
}

func TestServerClanQueriesResolveNamesFromBasicClan(t *testing.T) {
	root := routesSourceDirectory(t)
	directNameRead := regexp.MustCompile(`(?is)(?:select|order\s+by|insert\s+into\s+server_clans[^;]*)[^;]*\b(?:sc|server_clans)\.name\b`)
	for _, relative := range []string{
		"activity.go",
		"search.go",
		filepath.Join("server", "clans.go"),
		filepath.Join("server", "countdowns.go"),
		filepath.Join("server", "leaderboards.go"),
		filepath.Join("server", "settings.go"),
	} {
		source := readCleanupSource(t, filepath.Join(root, relative))
		if directNameRead.MatchString(source) {
			t.Fatalf("%s still reads or writes the dropped server_clans.name column", relative)
		}
		if strings.Contains(source, "clan.name") && !strings.Contains(source, "basic_clan") {
			t.Fatalf("%s resolves a clan name without joining basic_clan", relative)
		}
	}
}

func TestCanonicalWebhookLogTypesExposeCorrectScopes(t *testing.T) {
	for _, testCase := range []struct {
		value string
		scope string
	}{
		{value: "ban_alert", scope: "clan"},
		{value: "reddit_feed", scope: "server"},
	} {
		if !modelsv2.HasEnumValue(modelsv2.LogTypeEnums, testCase.value) {
			t.Fatalf("canonical log type %q is missing", testCase.value)
		}
		if actual := modelsv2.EnumScope(modelsv2.LogTypeEnums, testCase.value); actual != testCase.scope {
			t.Fatalf("canonical log type %q scope = %q, want %q", testCase.value, actual, testCase.scope)
		}
	}
}
