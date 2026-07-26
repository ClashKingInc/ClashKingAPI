package routes

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type clanRankingsTestDB struct {
	profileRow pgx.Row
	rows       pgx.Rows
	rowQuery   string
	rowsQuery  string
	rowArgs    []any
	rowsArgs   []any
}

func (db *clanRankingsTestDB) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	db.rowQuery = query
	db.rowArgs = args
	return db.profileRow
}

func (db *clanRankingsTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.rowsQuery = query
	db.rowsArgs = args
	return db.rows, nil
}

type clanRankingsProfileRow struct {
	name              *string
	badgeToken        *string
	homePoints        int
	builderBasePoints int
	capitalPoints     int
	err               error
}

func (row clanRankingsProfileRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	*dest[0].(**string) = row.name
	*dest[1].(**string) = row.badgeToken
	*dest[2].(*int) = row.homePoints
	*dest[3].(*int) = row.builderBasePoints
	*dest[4].(*int) = row.capitalPoints
	return nil
}

type clanRankingsPlacementRow struct {
	rankingType string
	locationID  string
	rank        int
	points      int
	updatedAt   time.Time
}

type clanRankingsPlacementRows struct {
	pgx.Rows
	items  []clanRankingsPlacementRow
	cursor int
	err    error
}

func (rows *clanRankingsPlacementRows) Close() {}

func (rows *clanRankingsPlacementRows) Err() error { return rows.err }

func (rows *clanRankingsPlacementRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *clanRankingsPlacementRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*string) = row.rankingType
	*dest[1].(*string) = row.locationID
	*dest[2].(*int) = row.rank
	*dest[3].(*int) = row.points
	*dest[4].(*time.Time) = row.updatedAt
	return nil
}

func TestQueryClanRankingsBuildsThreeExactCategories(t *testing.T) {
	name := "Example Clan"
	badgeToken := "badge-token"
	updatedAt := time.Date(2026, time.July, 24, 12, 30, 0, 0, time.UTC)
	db := &clanRankingsTestDB{
		profileRow: clanRankingsProfileRow{
			name:              &name,
			badgeToken:        &badgeToken,
			homePoints:        53123,
			builderBasePoints: 49876,
			capitalPoints:     3124,
		},
		rows: &clanRankingsPlacementRows{items: []clanRankingsPlacementRow{
			{rankingType: "home", locationID: "global", rank: 18, points: 53100, updatedAt: updatedAt},
			{rankingType: "home", locationID: "32000006", rank: 3, points: 53110, updatedAt: updatedAt},
			{rankingType: "builder_base", locationID: "global", rank: 41, points: 49870, updatedAt: updatedAt},
			{rankingType: "capital", locationID: "global", rank: 9, points: 3120, updatedAt: updatedAt},
		}},
	}

	response, err := queryClanRankings(context.Background(), db, "#2PP")
	if err != nil {
		t.Fatalf("queryClanRankings() error = %v", err)
	}
	if response.Tag != "#2PP" || response.Name == nil || *response.Name != name {
		t.Fatalf("unexpected clan identity: %#v", response)
	}
	if response.Badge == nil ||
		*response.Badge != "https://api-assets.clashofclans.com/badges/512/badge-token.png" {
		t.Fatalf("unexpected badge URL: %v", response.Badge)
	}
	if response.HomeVillage.Points != 53123 ||
		response.BuilderBase.Points != 49876 ||
		response.ClanCapital.Points != 3124 {
		t.Fatalf("unexpected current category points: %#v", response)
	}
	if len(response.HomeVillage.Placements) != 2 ||
		response.HomeVillage.Placements[0].LocationID != "global" ||
		response.HomeVillage.Placements[1].LocationID != "32000006" {
		t.Fatalf("unexpected Home Village placements: %#v", response.HomeVillage.Placements)
	}
	if len(response.BuilderBase.Placements) != 1 ||
		response.BuilderBase.Placements[0].Rank != 41 ||
		response.BuilderBase.Placements[0].Points != 49870 {
		t.Fatalf("unexpected Builder Base placements: %#v", response.BuilderBase.Placements)
	}
	if len(response.ClanCapital.Placements) != 1 ||
		!response.ClanCapital.Placements[0].UpdatedAt.Equal(updatedAt) {
		t.Fatalf("unexpected Clan Capital placements: %#v", response.ClanCapital.Placements)
	}
	if len(db.rowArgs) != 1 || db.rowArgs[0] != "#2PP" ||
		len(db.rowsArgs) != 1 || db.rowsArgs[0] != "#2PP" {
		t.Fatalf("ranking queries were not tag-scoped: row=%#v rows=%#v", db.rowArgs, db.rowsArgs)
	}
}

func TestQueryClanRankingsReturnsEmptyCategoriesForUnknownClan(t *testing.T) {
	db := &clanRankingsTestDB{
		profileRow: clanRankingsProfileRow{err: pgx.ErrNoRows},
		rows:       &clanRankingsPlacementRows{},
	}
	response, err := queryClanRankings(context.Background(), db, "#UNKNOWN")
	if err != nil {
		t.Fatalf("queryClanRankings() error = %v", err)
	}
	if response.Name != nil || response.Badge != nil {
		t.Fatalf("unexpected unknown-clan identity: %#v", response)
	}
	if response.HomeVillage.Placements == nil ||
		response.BuilderBase.Placements == nil ||
		response.ClanCapital.Placements == nil {
		t.Fatalf("empty placement arrays must serialize as []: %#v", response)
	}
}

func TestClanRankingQueriesUseOnlyDecisionTenColumns(t *testing.T) {
	for _, required := range []string{
		"clan_points",
		"builder_base_points",
		"capital_points",
	} {
		if !strings.Contains(clanRankingProfileQuery, required) {
			t.Fatalf("profile query missing %q", required)
		}
	}
	for _, required := range []string{
		"ranking_type",
		"location_id",
		"rank",
		"points",
		"updated_at",
		"FROM clan_rankings_current",
		"WHERE clan_tag = $1",
	} {
		if !strings.Contains(clanRankingPlacementsQuery, required) {
			t.Fatalf("placements query missing %q", required)
		}
	}
	for _, obsolete := range []string{
		"country_code",
		"country_name",
		"global_rank",
		"local_rank",
		" data",
		"clan_leaderboards",
	} {
		if strings.Contains(clanRankingPlacementsQuery, obsolete) {
			t.Fatalf("placements query still references obsolete field/source %q", obsolete)
		}
	}
}

func TestQueryClanRankingsPropagatesPlacementErrors(t *testing.T) {
	profileErr := errors.New("profile unavailable")
	db := &clanRankingsTestDB{
		profileRow: clanRankingsProfileRow{err: profileErr},
		rows:       &clanRankingsPlacementRows{},
	}
	if _, err := queryClanRankings(context.Background(), db, "#2PP"); !errors.Is(err, profileErr) {
		t.Fatalf("queryClanRankings() error = %v, want %v", err, profileErr)
	}
}
