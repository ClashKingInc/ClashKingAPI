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

func (fn roundTripFunc) Do(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestReaderUsesPendingPayloadWithoutHTTP(t *testing.T) {
	want := testWar()
	payload, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	reader := NewReader("https://archive.example", roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("pending payload unexpectedly made an HTTP request")
		return nil, nil
	}))

	got, err := reader.Read(context.Background(), Locator{}, payload)
	if err != nil {
		t.Fatal(err)
	}
	if got.Clan.Tag != want.Clan.Tag || got.Clan.Members[0].Attacks[0].Stars != 3 {
		t.Fatalf("decoded pending war = %#v", got)
	}
}

func TestReaderFetchesOneDictionaryCompressedRange(t *testing.T) {
	want := testWar()
	raw, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	encoder, err := zstd.NewWriter(nil,
		zstd.WithEncoderConcurrency(1),
		zstd.WithEncoderDict(dictionary),
	)
	if err != nil {
		t.Fatal(err)
	}
	frame := encoder.EncodeAll(raw, nil)
	encoder.Close()
	locator := Locator{PackID: 42, Offset: 1234, CompressedBytes: len(frame)}

	reader := NewReader("https://archive.example/", roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://archive.example/packs/000042.pack" {
			t.Fatalf("archive URL = %q", request.URL)
		}
		if got, want := request.Header.Get("Range"), rangeHeader(locator); got != want {
			t.Fatalf("Range = %q, want %q", got, want)
		}
		if got := request.Header.Get("Accept-Encoding"); got != "identity" {
			t.Fatalf("Accept-Encoding = %q", got)
		}
		return &http.Response{
			StatusCode: http.StatusPartialContent,
			Body:       io.NopCloser(bytes.NewReader(frame)),
			Header:     make(http.Header),
		}, nil
	}))

	got, err := reader.Read(context.Background(), locator, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.EndTime != want.EndTime || got.Clan.Members[0].Attacks[0].DefenderTag != "#D1" {
		t.Fatalf("decoded archived war = %#v", got)
	}
}

func TestReaderRejectsArchiveThatIgnoresRange(t *testing.T) {
	reader := NewReader("https://archive.example", roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("whole pack")),
			Header:     make(http.Header),
		}, nil
	}))
	_, err := reader.Read(context.Background(), Locator{PackID: 1, CompressedBytes: 10}, nil)
	if err == nil || !strings.Contains(err.Error(), "expected 206") {
		t.Fatalf("range response error = %v", err)
	}
}

func rangeHeader(locator Locator) string {
	end := locator.Offset + int64(locator.CompressedBytes) - 1
	return "bytes=" + strconv.FormatInt(locator.Offset, 10) + "-" + strconv.FormatInt(end, 10)
}

func testWar() War {
	return War{
		State:            "warEnded",
		TeamSize:         15,
		AttacksPerMember: 2,
		StartTime:        time.Unix(10, 0).UTC(),
		EndTime:          time.Unix(20, 0).UTC(),
		Clan: Clan{Tag: "#CLAN", Members: []Member{{
			Tag: "#P1", TownhallLevel: 17,
			Attacks: []Attack{{DefenderTag: "#D1", Stars: 3, DestructionPercentage: 100, Duration: 90, Order: 1}},
		}}},
		Opponent: Clan{Tag: "#OTHER", Members: []Member{{Tag: "#D1", TownhallLevel: 17}}},
	}
}
