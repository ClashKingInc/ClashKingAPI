package routes

import (
	"context"
	"crypto/sha256"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestValidateSharedLinksLookupRequestNormalizesAndDeduplicates(t *testing.T) {
	discordIDs, playerTags, err := validateSharedLinksLookupRequest(modelsv2.SharedLinksLookupRequest{
		DiscordIDs: []string{" 123456789012345678 ", "123456789012345678"},
		PlayerTags: []string{" 2pp ", "#2PP", "#P0Y"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"123456789012345678"}; !reflect.DeepEqual(discordIDs, want) {
		t.Fatalf("discord IDs = %#v, want %#v", discordIDs, want)
	}
	if want := []string{"#2PP", "#P0Y"}; !reflect.DeepEqual(playerTags, want) {
		t.Fatalf("player tags = %#v, want %#v", playerTags, want)
	}
}

func TestValidateSharedLinksLookupRequestRejectsInvalidIdentifiers(t *testing.T) {
	tooMany := make([]string, sharedLinksMaxIdentifiers+1)
	for index := range tooMany {
		tooMany[index] = "123456789012345678"
	}
	for _, test := range []struct {
		name    string
		request modelsv2.SharedLinksLookupRequest
	}{
		{name: "empty", request: modelsv2.SharedLinksLookupRequest{}},
		{name: "short Discord ID", request: modelsv2.SharedLinksLookupRequest{DiscordIDs: []string{"123"}}},
		{name: "leading-zero Discord ID", request: modelsv2.SharedLinksLookupRequest{DiscordIDs: []string{"012345678901234567"}}},
		{name: "invalid player alphabet", request: modelsv2.SharedLinksLookupRequest{PlayerTags: []string{"#ABC"}}},
		{name: "short player tag", request: modelsv2.SharedLinksLookupRequest{PlayerTags: []string{"#2P"}}},
		{name: "too many identifiers", request: modelsv2.SharedLinksLookupRequest{DiscordIDs: tooMany}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := validateSharedLinksLookupRequest(test.request)
			assertSharedLinksAppErrorStatus(t, err, 400)
		})
	}
}

func TestSharedLinksBearerTokenRequiresBearerScheme(t *testing.T) {
	if got := sharedLinksBearerToken("Bearer ck_dev_secret"); got != "ck_dev_secret" {
		t.Fatalf("token = %q", got)
	}
	for _, invalid := range []string{"", "ck_dev_secret", "Basic ck_dev_secret", "Bearer", "Bearer one two"} {
		if got := sharedLinksBearerToken(invalid); got != "" {
			t.Fatalf("sharedLinksBearerToken(%q) = %q, want empty", invalid, got)
		}
	}
}

func TestAuthenticateSharedLinksApplicationRecordsRequestUsage(t *testing.T) {
	applicationID := uuid.MustParse("019d0000-0000-7000-8000-000000000001")
	wantHash := sha256.Sum256([]byte("ck_dev_secret"))
	var query string
	var args []any
	db := &sharedLinksTestDB{
		queryRow: func(_ context.Context, sql string, values ...any) pgx.Row {
			query = sql
			args = values
			return sharedLinksTestRow{scan: func(dest ...any) error {
				*dest[0].(*uuid.UUID) = applicationID
				return nil
			}}
		},
	}
	got, err := authenticateSharedLinksApplication(context.Background(), db, "Bearer ck_dev_secret")
	if err != nil {
		t.Fatal(err)
	}
	if got != applicationID.String() {
		t.Fatalf("application ID = %q, want %q", got, applicationID)
	}
	for _, required := range []string{"token_last_used_at = now()", "api_request_count = api_request_count + 1", "revoked_at IS NULL"} {
		if !strings.Contains(query, required) {
			t.Fatalf("authentication query missing %q: %s", required, query)
		}
	}
	if len(args) != 1 || !reflect.DeepEqual(args[0], wantHash[:]) {
		t.Fatalf("token hash argument = %#v, want SHA-256 digest", args)
	}
}

func TestAuthenticateSharedLinksApplicationRejectsUnknownOrRevokedToken(t *testing.T) {
	db := &sharedLinksTestDB{
		queryRow: func(context.Context, string, ...any) pgx.Row {
			return sharedLinksTestRow{scan: func(...any) error { return pgx.ErrNoRows }}
		},
	}
	_, err := authenticateSharedLinksApplication(context.Background(), db, "Bearer ck_dev_revoked")
	assertSharedLinksAppErrorStatus(t, err, 401)
}

func TestRecordSharedLinksLookupAddsAcceptedIdentifierCount(t *testing.T) {
	var query string
	var args []any
	db := &sharedLinksTestDB{
		exec: func(_ context.Context, sql string, values ...any) (pgconn.CommandTag, error) {
			query = sql
			args = values
			return pgconn.NewCommandTag("UPDATE 1"), nil
		},
	}
	if err := recordSharedLinksLookup(context.Background(), db, "019d0000-0000-7000-8000-000000000001", 3); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(query, "links_lookup_count = links_lookup_count + $2") || !strings.Contains(query, "revoked_at IS NULL") {
		t.Fatalf("lookup usage query = %s", query)
	}
	if want := []any{"019d0000-0000-7000-8000-000000000001", 3}; !reflect.DeepEqual(args, want) {
		t.Fatalf("lookup usage args = %#v, want %#v", args, want)
	}
}

func TestRecordSharedLinksLookupRejectsApplicationRevokedAfterAuthentication(t *testing.T) {
	db := &sharedLinksTestDB{
		exec: func(context.Context, string, ...any) (pgconn.CommandTag, error) {
			return pgconn.NewCommandTag("UPDATE 0"), nil
		},
	}
	err := recordSharedLinksLookup(context.Background(), db, "019d0000-0000-7000-8000-000000000001", 1)
	assertSharedLinksAppErrorStatus(t, err, 401)
}

func TestQuerySharedLinksReturnsOnlyVisibleLinks(t *testing.T) {
	var query string
	var args []any
	db := &sharedLinksTestDB{
		query: func(_ context.Context, sql string, values ...any) (pgx.Rows, error) {
			query = sql
			args = values
			return &sharedLinksTestRows{items: []modelsv2.SharedLink{{
				IsVerified: false,
				PlayerTag:  "#2PP",
				UserID:     "123456789012345678",
			}}}, nil
		},
	}
	items, err := querySharedLinks(
		context.Background(), db,
		[]string{"123456789012345678"}, []string{"#2PP"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].PlayerTag != "#2PP" || items[0].IsVerified || items[0].UserID != "123456789012345678" {
		t.Fatalf("items = %#v", items)
	}
	for _, required := range []string{
		"links.hidden = false",
		"links.is_verified",
		"links.user_id = ANY($1::text[])",
		"links.tag = ANY($2::text[])",
		"links.order_index ASC",
	} {
		if !strings.Contains(query, required) {
			t.Fatalf("shared lookup query missing %q: %s", required, query)
		}
	}
	for _, forbidden := range []string{"developer_link_grants", "developer_link_grant_accounts", "links.hidden,"} {
		if strings.Contains(query, forbidden) {
			t.Fatalf("shared lookup query contains obsolete or exposed field %q: %s", forbidden, query)
		}
	}
	if want := []any{[]string{"123456789012345678"}, []string{"#2PP"}}; !reflect.DeepEqual(args, want) {
		t.Fatalf("lookup args = %#v, want %#v", args, want)
	}
}

func TestSharedLinksRateLimitIsPerApplicationAndResets(t *testing.T) {
	sharedLinksRateLimits.Lock()
	sharedLinksRateLimits.windows = make(map[string]sharedLinksRateWindow)
	sharedLinksRateLimits.Unlock()
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	for index := 0; index < sharedLinksRequestsPerMinute; index++ {
		if !allowSharedLinksRequest("app-one", now) {
			t.Fatalf("request %d was unexpectedly limited", index+1)
		}
	}
	if allowSharedLinksRequest("app-one", now) {
		t.Fatal("request above the per-minute limit was allowed")
	}
	if !allowSharedLinksRequest("app-two", now) {
		t.Fatal("one application exhausted another application's limit")
	}
	if !allowSharedLinksRequest("app-one", now.Add(time.Minute)) {
		t.Fatal("application limit did not reset after one minute")
	}
}

func assertSharedLinksAppErrorStatus(t *testing.T, err error, status int) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected status %d error", status)
	}
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) || appErr.Status != status {
		t.Fatalf("error = %#v, want AppError status %d", err, status)
	}
}

type sharedLinksTestDB struct {
	query    func(context.Context, string, ...any) (pgx.Rows, error)
	queryRow func(context.Context, string, ...any) pgx.Row
	exec     func(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func (db *sharedLinksTestDB) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if db.query == nil {
		return nil, errors.New("unexpected Query")
	}
	return db.query(ctx, sql, args...)
}

func (db *sharedLinksTestDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if db.queryRow == nil {
		return sharedLinksTestRow{scan: func(...any) error { return errors.New("unexpected QueryRow") }}
	}
	return db.queryRow(ctx, sql, args...)
}

func (db *sharedLinksTestDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if db.exec == nil {
		return pgconn.CommandTag{}, errors.New("unexpected Exec")
	}
	return db.exec(ctx, sql, args...)
}

type sharedLinksTestRow struct {
	scan func(...any) error
}

func (row sharedLinksTestRow) Scan(dest ...any) error { return row.scan(dest...) }

type sharedLinksTestRows struct {
	pgx.Rows
	items  []modelsv2.SharedLink
	cursor int
}

func (rows *sharedLinksTestRows) Close()     {}
func (rows *sharedLinksTestRows) Err() error { return nil }
func (rows *sharedLinksTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *sharedLinksTestRows) Scan(dest ...any) error {
	item := rows.items[rows.cursor-1]
	*dest[0].(*bool) = item.IsVerified
	*dest[1].(*string) = item.PlayerTag
	*dest[2].(*string) = item.UserID
	return nil
}
