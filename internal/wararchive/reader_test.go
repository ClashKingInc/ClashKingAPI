package wararchive

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/klauspost/compress/zstd"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return f(request) }

func TestReaderUsesExactRangeAndReconstructsWar(t *testing.T) {
	war := War{
		State: "warended", TeamSize: 5, AttacksPerMember: 2,
		PreparationStartTime: time.Unix(1, 0).UTC(), EndTime: time.Unix(2, 0).UTC(),
		Clan: Clan{Tag: "#A", Members: []Member{}}, Opponent: Clan{Tag: "#B", Members: []Member{}},
	}
	raw, err := jsonMarshal(war)
	if err != nil {
		t.Fatal(err)
	}
	encoder, err := zstd.NewWriter(nil, zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(3)), zstd.WithEncoderDict(dictionary))
	if err != nil {
		t.Fatal(err)
	}
	frame := encoder.EncodeAll(raw, nil)
	encoder.Close()
	prefix := []byte("unused-prefix")
	object := append(append([]byte{}, prefix...), frame...)
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/packs/000042.pack" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		wantRange := "bytes=" + strconv.Itoa(len(prefix)) + "-" + strconv.Itoa(len(object)-1)
		if request.Header.Get("Range") != wantRange {
			t.Fatalf("range = %q, want %q", request.Header.Get("Range"), wantRange)
		}
		return &http.Response{StatusCode: http.StatusPartialContent, Body: io.NopCloser(bytes.NewReader(frame)), Header: make(http.Header)}, nil
	})}
	reader, err := NewReader("https://wars.example", client, 2)
	if err != nil {
		t.Fatal(err)
	}
	packID, offset, length := int64(42), int64(len(prefix)), len(frame)
	result, err := reader.Load(context.Background(), []Ref{{WarID: "war-one", WarType: "cwl", PackID: &packID, Offset: &offset, CompressedBytes: &length}})
	if err != nil {
		t.Fatal(err)
	}
	if result["war-one"].Clan.Tag != "#A" || result["war-one"].Opponent.Tag != "#B" {
		t.Fatalf("unexpected result: %#v", result)
	}
	if result["war-one"].Type != "cwl" {
		t.Fatalf("archive metadata type = %q, want cwl", result["war-one"].Type)
	}
}

func TestReaderPrefersPendingPayloadWithoutHTTP(t *testing.T) {
	payload := `{"type":"cwl","state":"warended","teamSize":15,"attacksPerMember":1,"preparationStartTime":"2026-08-01T00:00:00Z","endTime":"2026-08-03T00:00:00Z","clan":{"tag":"#A","members":[]},"opponent":{"tag":"#B","members":[]}}`
	reader, err := NewReader("https://wars.example", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("pending payload should not make an HTTP request")
		return nil, nil
	})}, 1)
	if err != nil {
		t.Fatal(err)
	}
	result, err := reader.Load(context.Background(), []Ref{{WarID: "pending", WarType: "random", Pending: []byte(payload)}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(result["pending"].Type, "random") {
		t.Fatalf("unexpected pending war: %#v", result)
	}
}

func TestPlayerWarHistoryQueryMatchesConsolidatedSchema(t *testing.T) {
	query := strings.ToLower(playerWarHistoryQuery)
	if strings.Contains(query, "period_start") {
		t.Fatal("player war history query references removed period_start column")
	}
	for _, required := range []string{
		"unnest(history.war_ids)",
		"history.player_tag = any($1::text[])",
		"w.end_time >= $2",
		"w.end_time <= $3",
	} {
		if !strings.Contains(query, required) {
			t.Errorf("player war history query missing %q", required)
		}
	}
}

func jsonMarshal(value any) ([]byte, error) {
	return json.Marshal(value)
}
