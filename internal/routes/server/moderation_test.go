package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

type moderationBanTestRow struct{}

func (moderationBanTestRow) Scan(dest ...any) error {
	image := "https://example.com/ban-evidence.png"
	*dest[0].(*string) = "#PLAYER"
	*dest[1].(*string) = "Player"
	*dest[2].(*string) = "Reason"
	*dest[3].(*string) = "123"
	*dest[4].(*[]byte) = []byte(`[]`)
	*dest[5].(**string) = &image
	*dest[6].(*time.Time) = time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	return nil
}

func TestAddStrikeRejectsWeightOutsidePostgresInteger(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Post("/v2/server/:server_id/strikes/:player_tag", addStrike(apptypes.Deps{}))
	req := httptest.NewRequest(
		http.MethodPost,
		"/v2/server/123/strikes/%23PLAYER",
		strings.NewReader(`{"reason":"Reason","added_by":"456","strike_weight":1344445667899}`),
	)
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusBadRequest)
	}
}

type moderationStrikeTestRow struct{}

func (moderationStrikeTestRow) Scan(dest ...any) error {
	rollover := time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC)
	image := "https://example.com/strike-evidence.png"
	*dest[0].(*string) = "ABCDE"
	*dest[1].(*string) = "#PLAYER"
	*dest[2].(*time.Time) = time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	*dest[3].(*string) = "Reason"
	*dest[4].(*string) = "123"
	*dest[5].(*int) = 2
	*dest[6].(**time.Time) = &rollover
	*dest[7].(**string) = &image
	return nil
}

func TestModerationScansUseTypedEvidence(t *testing.T) {
	ban, err := scanSQLBan(moderationBanTestRow{}, 456)
	if err != nil {
		t.Fatalf("scan ban: %v", err)
	}
	if ban["image"] != "https://example.com/ban-evidence.png" {
		t.Fatalf("ban image = %#v", ban["image"])
	}
	if _, found := ban["data"]; found {
		t.Fatal("ban scan recreated removed data payload")
	}

	strike, err := scanSQLStrike(moderationStrikeTestRow{}, 456)
	if err != nil {
		t.Fatalf("scan strike: %v", err)
	}
	if strike["image"] != "https://example.com/strike-evidence.png" || strike["strike_weight"] != 2 {
		t.Fatalf("unexpected strike: %#v", strike)
	}
	if _, found := strike["data"]; found {
		t.Fatal("strike scan recreated removed data payload")
	}
}

func TestValidateStrikeWeightFitsPostgresInteger(t *testing.T) {
	for _, testCase := range []struct {
		value int
		want  int
	}{
		{value: 0, want: 1},
		{value: 1, want: 1},
		{value: 1<<31 - 1, want: 1<<31 - 1},
	} {
		got, err := validateStrikeWeight(testCase.value)
		if err != nil || got != testCase.want {
			t.Fatalf("validateStrikeWeight(%d) = %d, %v", testCase.value, got, err)
		}
	}
	for _, value := range []int{-1, 1 << 31, 1344445667899} {
		if _, err := validateStrikeWeight(value); err == nil {
			t.Fatalf("validateStrikeWeight(%d) accepted out-of-range value", value)
		}
	}
}

func TestModerationSQLDoesNotUseRemovedDataColumns(t *testing.T) {
	for _, filename := range []string{"bans.go", "strikes.go"} {
		payload, err := os.ReadFile(filename)
		if err != nil {
			t.Fatal(err)
		}
		text := string(payload)
		if filename == "bans.go" && !strings.Contains(text, "image = COALESCE(NULLIF($5, ''), image)") {
			t.Error("ban updates must preserve existing evidence when no replacement is supplied")
		}
		for _, obsolete := range []string{"data = data", "data ||", "data::jsonb", "dataRaw"} {
			if strings.Contains(text, obsolete) {
				t.Errorf("%s still depends on removed data column via %q", filename, obsolete)
			}
		}
	}
}
