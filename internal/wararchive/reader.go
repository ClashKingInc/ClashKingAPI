package wararchive

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/klauspost/compress/zstd"
)

type Reader struct {
	origin      string
	client      *http.Client
	concurrency int
	decoders    sync.Pool
}

func (r *Reader) LoadIDs(ctx context.Context, pool *pgxpool.Pool, warIDs []string) (map[string]War, error) {
	if len(warIDs) == 0 {
		return map[string]War{}, nil
	}
	numericIDs := make([]int32, 0, len(warIDs))
	for _, warID := range warIDs {
		value, err := strconv.ParseInt(warID, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid war ID %q: %w", warID, err)
		}
		numericIDs = append(numericIDs, int32(value))
	}
	rows, err := pool.Query(ctx, `
		SELECT w.war_id::text, w.archive_pack_id, w.archive_offset, w.archive_compressed_bytes, p.payload
		FROM wars AS w
		LEFT JOIN war_archive_pending AS p ON p.war_id = w.war_id AND p.end_time = w.end_time
		WHERE w.war_id = ANY($1::integer[])
	`, numericIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	refs := make([]Ref, 0, len(warIDs))
	for rows.Next() {
		var ref Ref
		if err := rows.Scan(&ref.WarID, &ref.PackID, &ref.Offset, &ref.CompressedBytes, &ref.Pending); err != nil {
			return nil, err
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.Load(ctx, refs)
}

func (r *Reader) LoadForPlayers(ctx context.Context, pool *pgxpool.Pool, playerTags []string, start, end time.Time) (map[string]War, error) {
	if len(playerTags) == 0 {
		return map[string]War{}, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT w.war_id::text
		FROM player_war_history AS history
		CROSS JOIN LATERAL unnest(history.war_ids) AS history_war_id
		JOIN wars AS w ON w.war_id = history_war_id
		WHERE history.player_tag = ANY($1)
		  AND history.period_start >= date_trunc('quarter', $2::timestamptz)::date
		  AND history.period_start <= date_trunc('quarter', $3::timestamptz)::date
		  AND w.end_time >= $2 AND w.end_time <= $3
	`, playerTags, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var warIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		warIDs = append(warIDs, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.LoadIDs(ctx, pool, warIDs)
}

func NewReader(origin string, client *http.Client, concurrency int) (*Reader, error) {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid war archive origin %q", origin)
	}
	if client == nil {
		client = http.DefaultClient
	}
	if concurrency <= 0 {
		concurrency = 12
	}
	reader := &Reader{origin: origin, client: client, concurrency: concurrency}
	reader.decoders.New = func() any {
		decoder, decoderErr := zstd.NewReader(nil, zstd.WithDecoderConcurrency(1), zstd.WithDecoderDicts(dictionary))
		if decoderErr != nil {
			panic(decoderErr)
		}
		return decoder
	}
	return reader, nil
}

func (r *Reader) Load(ctx context.Context, refs []Ref) (map[string]War, error) {
	result := make(map[string]War, len(refs))
	remote := make([]Ref, 0, len(refs))
	for _, ref := range refs {
		if len(ref.Pending) != 0 {
			var war War
			if err := json.Unmarshal(ref.Pending, &war); err != nil {
				return nil, fmt.Errorf("decode pending war %s: %w", ref.WarID, err)
			}
			result[ref.WarID] = war
			continue
		}
		if ref.PackID == nil || ref.Offset == nil || ref.CompressedBytes == nil {
			return nil, fmt.Errorf("war %s has neither pending data nor an archive locator", ref.WarID)
		}
		remote = append(remote, ref)
	}
	if len(remote) == 0 {
		return result, nil
	}

	type response struct {
		id  string
		war War
		err error
	}
	jobs := make(chan Ref)
	responses := make(chan response, len(remote))
	workers := min(r.concurrency, len(remote))
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ref := range jobs {
				war, err := r.loadOne(ctx, ref)
				responses <- response{id: ref.WarID, war: war, err: err}
			}
		}()
	}
	go func() {
		defer close(jobs)
		for _, ref := range remote {
			select {
			case jobs <- ref:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		wg.Wait()
		close(responses)
	}()
	for response := range responses {
		if response.err != nil {
			return nil, response.err
		}
		result[response.id] = response.war
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *Reader) loadOne(ctx context.Context, ref Ref) (War, error) {
	start := *ref.Offset
	end := start + int64(*ref.CompressedBytes) - 1
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/packs/%06d.pack", r.origin, *ref.PackID), nil)
	if err != nil {
		return War{}, err
	}
	request.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
	response, err := r.client.Do(request)
	if err != nil {
		return War{}, fmt.Errorf("read archived war %s: %w", ref.WarID, err)
	}
	defer response.Body.Close()
	var frame []byte
	switch response.StatusCode {
	case http.StatusPartialContent:
		frame, err = io.ReadAll(io.LimitReader(response.Body, int64(*ref.CompressedBytes)+1))
	case http.StatusOK:
		var object []byte
		object, err = io.ReadAll(response.Body)
		if err == nil {
			if start < 0 || end >= int64(len(object)) {
				return War{}, fmt.Errorf("archive object for war %s is shorter than its SQL locator", ref.WarID)
			}
			frame = object[start : end+1]
		}
	default:
		return War{}, fmt.Errorf("read archived war %s: HTTP %d", ref.WarID, response.StatusCode)
	}
	if err != nil {
		return War{}, err
	}
	if len(frame) != *ref.CompressedBytes {
		return War{}, fmt.Errorf("read archived war %s: got %d bytes, expected %d", ref.WarID, len(frame), *ref.CompressedBytes)
	}
	decoder := r.decoders.Get().(*zstd.Decoder)
	raw, err := decoder.DecodeAll(frame, nil)
	r.decoders.Put(decoder)
	if err != nil {
		return War{}, fmt.Errorf("decompress archived war %s: %w", ref.WarID, err)
	}
	var war War
	if err := json.Unmarshal(raw, &war); err != nil {
		return War{}, fmt.Errorf("decode archived war %s: %w", ref.WarID, err)
	}
	if war.Clan.Tag == "" || war.Opponent.Tag == "" || war.EndTime.IsZero() {
		return War{}, errors.New("archived war is missing required reconstruction fields")
	}
	return war, nil
}

func SortedIDs(values map[string]War) []string {
	result := make([]string, 0, len(values))
	for id := range values {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}
