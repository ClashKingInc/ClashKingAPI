package routes

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type playerRankingsTestDB struct {
	rows  pgx.Rows
	query string
	args  []any
}

func (db *playerRankingsTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

type playerRankingTestRow struct {
	rankingType string
	locationID  string
	rank        *int
	points      *int
}

type playerRankingTestRows struct {
	pgx.Rows
	items  []playerRankingTestRow
	cursor int
}

func (rows *playerRankingTestRows) Close()     {}
func (rows *playerRankingTestRows) Err() error { return nil }
func (rows *playerRankingTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *playerRankingTestRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*string) = row.rankingType
	*dest[1].(*string) = row.locationID
	*dest[2].(**int) = row.rank
	*dest[3].(**int) = row.points
	return nil
}

func intPointer(value int) *int { return &value }

func TestQueryPlayerRankingsReturnsVillagesAndSharedLocation(t *testing.T) {
	db := &playerRankingsTestDB{rows: &playerRankingTestRows{items: []playerRankingTestRow{
		{rankingType: "home", locationID: "global", rank: intPointer(12), points: intPointer(6123)},
		{rankingType: "home", locationID: "32000087", rank: nil, points: nil},
		{rankingType: "builder_base", locationID: "global", rank: intPointer(41), points: intPointer(5200)},
	}}}

	response, err := queryPlayerRankings(context.Background(), db, "#P1")
	if err != nil {
		t.Fatalf("queryPlayerRankings() error = %v", err)
	}
	if response.HomeVillage == nil || response.HomeVillage.GlobalRank == nil || *response.HomeVillage.GlobalRank != 12 || response.HomeVillage.Trophies == nil || *response.HomeVillage.Trophies != 6123 {
		t.Fatalf("unexpected Home Village global rank: %#v", response.HomeVillage)
	}
	if response.Location == nil || response.Location.ID != 32000087 {
		t.Fatalf("retained numeric location was lost: %#v", response.Location)
	}
	if response.HomeVillage.LocalRank != nil {
		t.Fatalf("inactive retained location must keep a null local rank: %#v", response.HomeVillage)
	}
	if response.BuilderBase == nil || response.BuilderBase.GlobalRank == nil || *response.BuilderBase.GlobalRank != 41 || response.BuilderBase.Trophies == nil || *response.BuilderBase.Trophies != 5200 {
		t.Fatalf("unexpected Builder Base global rank: %#v", response.BuilderBase)
	}
	if len(db.args) != 1 || db.args[0] != "#P1" {
		t.Fatalf("query was not player scoped: %#v", db.args)
	}
}

func TestQueryPlayerRankingsDoesNotFabricateMissingGlobalPlacement(t *testing.T) {
	db := &playerRankingsTestDB{rows: &playerRankingTestRows{items: []playerRankingTestRow{
		{rankingType: "builder_base", locationID: "32000006", rank: nil, points: nil},
	}}}
	response, err := queryPlayerRankings(context.Background(), db, "#P2")
	if err != nil {
		t.Fatalf("queryPlayerRankings() error = %v", err)
	}
	if response.BuilderBase != nil {
		t.Fatalf("empty Builder Base ranking must be omitted: %#v", response.BuilderBase)
	}
	if response.Location == nil || response.Location.ID != 32000006 {
		t.Fatalf("retained location missing: %#v", response.Location)
	}
}

func TestQueryPlayerRankingsCanReturnNoHistory(t *testing.T) {
	db := &playerRankingsTestDB{rows: &playerRankingTestRows{}}
	response, err := queryPlayerRankings(context.Background(), db, "#P3")
	if err != nil {
		t.Fatalf("queryPlayerRankings() error = %v", err)
	}
	if response.HomeVillage != nil || response.BuilderBase != nil || response.Location != nil {
		t.Fatalf("empty ranking history fabricated data: %#v", response)
	}
}

func TestPlayerRankingsQueryUsesOnlyNormalizedColumns(t *testing.T) {
	for _, required := range []string{
		"ranking_type", "location_id", "rank", "points",
		"FROM player_rankings_current", "WHERE player_tag = $1",
	} {
		if !strings.Contains(playerRankingsQuery, required) {
			t.Fatalf("player rankings query missing %q", required)
		}
	}
	for _, obsolete := range []string{
		"country_code", "country_name", "global_rank", "local_rank", "updated_at", " data",
	} {
		if strings.Contains(playerRankingsQuery, obsolete) {
			t.Fatalf("player rankings query references retired field %q", obsolete)
		}
	}
}
