package wararchive

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

const (
	DefaultOrigin      = "https://wars.clashk.ing"
	defaultReadTimeout = 15 * time.Second
	maxCompressedFrame = 16 * 1024 * 1024
)

// dictionary is the canonical war archive dictionary maintained by DevKit.
//
//go:embed war-json.zdict
var dictionary []byte

// War is the canonical payload stored in a single compressed archive frame.
type War struct {
	WarTag               string    `json:"warTag,omitempty"`
	State                string    `json:"state"`
	TeamSize             int       `json:"teamSize"`
	AttacksPerMember     int       `json:"attacksPerMember"`
	PreparationStartTime time.Time `json:"preparationStartTime"`
	StartTime            time.Time `json:"startTime"`
	EndTime              time.Time `json:"endTime"`
	BattleModifier       string    `json:"battleModifier"`
	Clan                 Clan      `json:"clan"`
	Opponent             Clan      `json:"opponent"`
}

type Clan struct {
	Tag                   string   `json:"tag"`
	Name                  string   `json:"name"`
	BadgeToken            string   `json:"badgeToken"`
	ClanLevel             int      `json:"clanLevel"`
	Attacks               int      `json:"attacks"`
	Stars                 int      `json:"stars"`
	DestructionPercentage float64  `json:"destructionPercentage"`
	Members               []Member `json:"members"`
}

type Member struct {
	Tag           string   `json:"tag"`
	Name          string   `json:"name"`
	TownhallLevel int      `json:"townhallLevel"`
	MapPosition   int      `json:"mapPosition"`
	Attacks       []Attack `json:"attacks"`
}

type Attack struct {
	DefenderTag           string `json:"defenderTag"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Duration              int    `json:"duration"`
	Order                 int    `json:"order"`
}

type Locator struct {
	PackID          int64
	Offset          int64
	CompressedBytes int
}

type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type Reader struct {
	origin string
	http   HTTPDoer
}

func NewReader(origin string, client HTTPDoer) *Reader {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	if origin == "" {
		origin = DefaultOrigin
	}
	if client == nil {
		client = &http.Client{Timeout: defaultReadTimeout}
	}
	return &Reader{origin: origin, http: client}
}

// Read returns an uncompressed pending payload when present, otherwise it
// fetches exactly one compressed frame from the immutable archive pack.
func (r *Reader) Read(ctx context.Context, locator Locator, pending json.RawMessage) (War, error) {
	if len(pending) > 0 && string(pending) != "null" {
		return decodeWar(pending)
	}
	if locator.PackID <= 0 || locator.Offset < 0 || locator.CompressedBytes <= 0 || locator.CompressedBytes > maxCompressedFrame {
		return War{}, fmt.Errorf("invalid war archive locator: pack=%d offset=%d bytes=%d", locator.PackID, locator.Offset, locator.CompressedBytes)
	}

	objectURL := fmt.Sprintf("%s/packs/%06d.pack", r.origin, locator.PackID)
	if _, err := url.ParseRequestURI(objectURL); err != nil {
		return War{}, fmt.Errorf("invalid war archive URL: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, objectURL, nil)
	if err != nil {
		return War{}, err
	}
	end := locator.Offset + int64(locator.CompressedBytes) - 1
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", locator.Offset, end))
	req.Header.Set("Accept-Encoding", "identity")

	resp, err := r.http.Do(req)
	if err != nil {
		return War{}, fmt.Errorf("fetch war archive frame: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent {
		return War{}, fmt.Errorf("war archive returned status %d, expected 206", resp.StatusCode)
	}
	frame, err := io.ReadAll(io.LimitReader(resp.Body, int64(locator.CompressedBytes)+1))
	if err != nil {
		return War{}, fmt.Errorf("read war archive frame: %w", err)
	}
	if len(frame) != locator.CompressedBytes {
		return War{}, fmt.Errorf("war archive frame length is %d, expected %d", len(frame), locator.CompressedBytes)
	}

	decoder, err := zstd.NewReader(nil, zstd.WithDecoderConcurrency(1), zstd.WithDecoderDicts(dictionary))
	if err != nil {
		return War{}, fmt.Errorf("initialize war archive decoder: %w", err)
	}
	defer decoder.Close()
	raw, err := decoder.DecodeAll(frame, nil)
	if err != nil {
		return War{}, fmt.Errorf("decompress war archive frame: %w", err)
	}
	return decodeWar(raw)
}

func decodeWar(raw []byte) (War, error) {
	var war War
	if err := json.Unmarshal(raw, &war); err != nil {
		return War{}, fmt.Errorf("decode war archive payload: %w", err)
	}
	return war, nil
}
