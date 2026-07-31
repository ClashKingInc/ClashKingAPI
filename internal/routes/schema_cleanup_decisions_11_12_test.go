package routes

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func TestDecisionElevenRemovesClanSeasonStatsReader(t *testing.T) {
	routesDir := routesSourceDirectory(t)
	clanSource := readCleanupSource(t, filepath.Join(routesDir, "clan.go"))
	modelSource := readCleanupSource(t, filepath.Join(routesDir, "..", "models", "v2", "clan_responses.go"))

	for _, obsolete := range []string{"clan_season_stats", "clanDonationsSingle"} {
		if strings.Contains(clanSource, obsolete) {
			t.Fatalf("clan.go still contains removed decision 11 symbol %q", obsolete)
		}
	}
	if strings.Contains(modelSource, "type DonationEntry struct") {
		t.Fatal("dead single-clan donation response model remains after handler removal")
	}
}

func TestDecisionTwelveUsesServerCountdownsOnlyInSQL(t *testing.T) {
	routesDir := routesSourceDirectory(t)
	sources := []string{
		readCleanupSource(t, filepath.Join(routesDir, "server", "countdowns.go")),
		readCleanupSource(t, filepath.Join(routesDir, "server", "settings.go")),
	}
	bareCountdownTable := regexp.MustCompile(`(?i)\b(?:from|join|into|update|delete\s+from)\s+countdowns\b`)

	for index, source := range sources {
		if bareCountdownTable.MatchString(source) {
			t.Fatalf("countdown source %d still contains a bare SQL countdowns table reference", index)
		}
		if !strings.Contains(source, "server_countdowns") {
			t.Fatalf("countdown source %d does not reference server_countdowns", index)
		}
	}
}

func TestDecisionFourteenUsesServerCustomEmbedsOnlyInSQL(t *testing.T) {
	routesDir := routesSourceDirectory(t)
	source := readCleanupSource(t, filepath.Join(routesDir, "server", "tickets.go"))
	bareCustomEmbedsTable := regexp.MustCompile(`(?i)\b(?:from|join|into|update|delete\s+from)\s+custom_embeds\b`)

	if bareCustomEmbedsTable.MatchString(source) {
		t.Fatal("tickets.go still contains a bare SQL custom_embeds table reference")
	}
	if occurrences := strings.Count(source, "server_custom_embeds"); occurrences != 3 {
		t.Fatalf("tickets.go server_custom_embeds references = %d, want exactly 3", occurrences)
	}
}

func TestPlayerStatChangesRetireSeasonStatsReadersAndUnsupportedLeaderboards(t *testing.T) {
	routesDir := routesSourceDirectory(t)
	sources := []string{
		readCleanupSource(t, filepath.Join(routesDir, "clan.go")),
		readCleanupSource(t, filepath.Join(routesDir, "player.go")),
		readCleanupSource(t, filepath.Join(routesDir, "legacy_admin_stats.go")),
		readCleanupSource(t, filepath.Join(routesDir, "server", "leaderboards.go")),
		readCleanupSource(t, filepath.Join(routesDir, "server", "exports.go")),
		readCleanupSource(t, filepath.Join(routesDir, "register.go")),
		readCleanupSource(t, filepath.Join(routesDir, "..", "models", "v1", "player.go")),
		readCleanupSource(t, filepath.Join(routesDir, "..", "models", "v2", "leaderboards.go")),
	}
	for index, source := range sources {
		for _, obsolete := range []string{
			"player_season_stats",
			"clanDonationsMany",
			"playersSummaryTop",
			"playerSeasonStatsByTags",
			"statsFromPlayerDocs",
			"capitalLegacy",
			"GetServerActivityLeaderboard",
			"GetServerLootingLeaderboard",
			"ActivityScore",
			"PlayerStatsResponse",
		} {
			if strings.Contains(source, obsolete) {
				t.Fatalf("cleanup source %d still contains retired symbol %q", index, obsolete)
			}
		}
	}
}

func routesSourceDirectory(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve schema-cleanup test source path")
	}
	return filepath.Dir(filename)
}

func readCleanupSource(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(content)
}
