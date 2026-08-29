package routes

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestBasicWarFromStoredRowOrientsRequestedClan(t *testing.T) {
	preparation := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	end := preparation.Add(48 * time.Hour)
	response := basicWarFromStoredRow(
		"#OPPONENT", "#SOURCE", "#OPPONENT", preparation, end, "cwl",
		pgtype.Text{String: "#WAR", Valid: true},
		pgtype.Bool{Bool: true, Valid: true}, pgtype.Bool{},
	)
	if response.Clan.Tag != "#OPPONENT" || response.Clan.PublicWarLog != nil {
		t.Fatalf("requested clan = %#v", response.Clan)
	}
	if response.Opponent.Tag != "#SOURCE" || response.Opponent.PublicWarLog == nil || !*response.Opponent.PublicWarLog {
		t.Fatalf("opponent = %#v", response.Opponent)
	}
	if response.WarTag == nil || *response.WarTag != "#WAR" || response.Type != "cwl" {
		t.Fatalf("war metadata = %#v", response)
	}
	if response.PreparationStartTime != "20260829T120000.000Z" || response.EndTime != "20260831T120000.000Z" {
		t.Fatalf("war times = %#v", response)
	}
}

func TestBasicWarResponseOmitsUnknownWarTagAndKeepsWarLogNull(t *testing.T) {
	response := basicWarFromStoredRow(
		"#SOURCE", "#SOURCE", "#OPPONENT", time.Time{}, time.Time{}, "random",
		pgtype.Text{}, pgtype.Bool{}, pgtype.Bool{Bool: false, Valid: true},
	)
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if _, exists := decoded["warTag"]; exists {
		t.Fatalf("unknown warTag must be omitted: %s", raw)
	}
	clan := decoded["clan"].(map[string]any)
	if value, exists := clan["publicWarLog"]; !exists || value != nil {
		t.Fatalf("unknown publicWarLog must be explicit null: %s", raw)
	}
	opponent := decoded["opponent"].(map[string]any)
	if value, ok := opponent["publicWarLog"].(bool); !ok || value {
		t.Fatalf("known private war log must be false: %s", raw)
	}
}

func TestBasicWarQueryUsesScheduleAndOptionalClanMetadata(t *testing.T) {
	for _, fragment := range []string{
		"FROM war_schedule AS schedule",
		"LEFT JOIN basic_clan AS source",
		"LEFT JOIN basic_clan AS opponent",
		"schedule.source_clan_tag = $1 OR schedule.opponent_tag = $1",
		"ORDER BY schedule.end_time DESC",
	} {
		if !strings.Contains(basicWarQuery, fragment) {
			t.Fatalf("basic war query missing %q", fragment)
		}
	}
}
