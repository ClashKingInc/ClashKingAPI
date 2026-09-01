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
	for _, test := range []struct {
		name    string
		request modelsv2.SharedLinksLookupRequest
	}{
		{name: "empty", request: modelsv2.SharedLinksLookupRequest{}},
		{name: "short Discord ID", request: modelsv2.SharedLinksLookupRequest{DiscordIDs: []string{"123"}}},
		{name: "leading-zero Discord ID", request: modelsv2.SharedLinksLookupRequest{DiscordIDs: []string{"012345678901234567"}}},
		{name: "invalid player alphabet", request: modelsv2.SharedLinksLookupRequest{PlayerTags: []string{"#ABC"}}},
		{name: "short player tag", request: modelsv2.SharedLinksLookupRequest{PlayerTags: []string{"#2P"}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := validateSharedLinksLookupRequest(test.request)
			assertSharedLinksAppErrorStatus(t, err, 400)
		})
	}
}

func TestValidateSharedLinksGrantRequestKeepsReadModesExplicit(t *testing.T) {
	selected, err := validateSharedLinksGrantRequest(modelsv2.SharedLinksGrantRequest{
		AccessMode: modelsv2.SharedLinksAccessSelected,
		PlayerTags: []string{"#2PP", "2pp", "#P0Y"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"#2PP", "#P0Y"}; !reflect.DeepEqual(selected, want) {
		t.Fatalf("selected tags = %#v, want %#v", selected, want)
	}

	all, err := validateSharedLinksGrantRequest(modelsv2.SharedLinksGrantRequest{
		AccessMode: modelsv2.SharedLinksAccessAllCurrentAndFuture,
	})
	if err != nil {
		t.Fatal(err)
	}
	if all == nil || len(all) != 0 {
		t.Fatalf("dynamic grant tags = %#v, want non-nil empty list", all)
	}

	_, err = validateSharedLinksGrantRequest(modelsv2.SharedLinksGrantRequest{
		AccessMode: modelsv2.SharedLinksAccessAllCurrentAndFuture,
		PlayerTags: []string{"#2PP"},
	})
	assertSharedLinksAppErrorStatus(t, err, 400)
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

func TestAuthenticateSharedLinksApplicationHashesTokenAndRejectsRevokedApps(t *testing.T) {
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
	if !strings.Contains(query, "token_last_used_at = now()") || !strings.Contains(query, "revoked_at IS NULL") {
		t.Fatalf("authentication query does not atomically enforce active app and last use: %s", query)
	}
	if len(args) != 1 || !reflect.DeepEqual(args[0], wantHash[:]) {
		t.Fatalf("token hash argument = %#v, want SHA-256 digest", args)
	}
}

func TestReplaceSharedLinksGrantChecksCurrentVerifiedOwnership(t *testing.T) {
	applicationID := uuid.MustParse("019d0000-0000-7000-8000-000000000001")
	grantID := uuid.MustParse("019d0000-0000-7000-8000-000000000002")
	tx := &sharedLinksTestTx{
		queryRows: []pgx.Row{
			sharedLinksTestRow{scan: func(dest ...any) error {
				*dest[0].(*uuid.UUID) = applicationID
				return nil
			}},
			sharedLinksTestRow{scan: func(dest ...any) error {
				*dest[0].(*int) = 2
				return nil
			}},
			sharedLinksTestRow{scan: func(dest ...any) error {
				*dest[0].(*uuid.UUID) = grantID
				return nil
			}},
		},
	}
	db := &sharedLinksTestDB{begin: func(context.Context) (pgx.Tx, error) { return tx, nil }}
	err := replaceSharedLinksGrant(
		context.Background(), db, applicationID, "123456789012345678",
		modelsv2.SharedLinksAccessSelected, []string{"#2PP", "#P0Y"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !tx.committed {
		t.Fatal("grant transaction was not committed")
	}
	if len(tx.querySQL) < 2 || !strings.Contains(tx.querySQL[1], "user_id = $1") || !strings.Contains(tx.querySQL[1], "is_verified = true") {
		t.Fatalf("ownership query must require current user and verification: %#v", tx.querySQL)
	}
	if len(tx.execSQL) != 2 || !strings.Contains(tx.execSQL[0], "DELETE FROM developer_link_grant_accounts") || !strings.Contains(tx.execSQL[1], "INSERT INTO developer_link_grant_accounts") {
		t.Fatalf("selected rows were not replaced transactionally: %#v", tx.execSQL)
	}
}

func TestQuerySharedLinksRequiresActiveGrantVerificationAndSelectedMembership(t *testing.T) {
	var query string
	db := &sharedLinksTestDB{
		query: func(_ context.Context, sql string, _ ...any) (pgx.Rows, error) {
			query = sql
			return &sharedLinksTestRows{links: []modelsv2.SharedLink{{DiscordID: "123456789012345678", PlayerTag: "#2PP"}}}, nil
		},
	}
	links, err := querySharedLinks(
		context.Background(), db, "019d0000-0000-7000-8000-000000000001",
		[]string{"123456789012345678"}, []string{"#2PP"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(links) != 1 || links[0].PlayerTag != "#2PP" {
		t.Fatalf("links = %#v", links)
	}
	for _, required := range []string{
		"grants.revoked_at IS NULL",
		"links.is_verified = true",
		"grants.access_mode = 'all_current_and_future'",
		"developer_link_grant_accounts",
		"accounts.player_tag = links.tag",
	} {
		if !strings.Contains(query, required) {
			t.Fatalf("shared lookup query missing %q: %s", required, query)
		}
	}
	if strings.Contains(query, "links.hidden = false") {
		t.Fatal("explicit connected-app consent should not inherit the public hidden filter")
	}
}

func TestRevokeSharedLinksGrantDeletesRowsForRevokedGrantIDs(t *testing.T) {
	var query string
	db := &sharedLinksTestDB{
		exec: func(_ context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
			query = sql
			return pgconn.NewCommandTag("DELETE 2"), nil
		},
	}
	err := revokeSharedLinksGrant(
		context.Background(), db,
		uuid.MustParse("019d0000-0000-7000-8000-000000000001"),
		"123456789012345678",
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(query, "RETURNING grant_id") || !strings.Contains(query, "accounts.grant_id = revoked.grant_id") {
		t.Fatalf("revocation does not delete selected rows by returned grant ID: %s", query)
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
	begin    func(context.Context) (pgx.Tx, error)
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

func (db *sharedLinksTestDB) Begin(ctx context.Context) (pgx.Tx, error) {
	if db.begin == nil {
		return nil, errors.New("unexpected Begin")
	}
	return db.begin(ctx)
}

type sharedLinksTestRow struct {
	scan func(...any) error
}

func (row sharedLinksTestRow) Scan(dest ...any) error { return row.scan(dest...) }

type sharedLinksTestRows struct {
	pgx.Rows
	links  []modelsv2.SharedLink
	cursor int
}

func (rows *sharedLinksTestRows) Close()     {}
func (rows *sharedLinksTestRows) Err() error { return nil }
func (rows *sharedLinksTestRows) Next() bool {
	if rows.cursor >= len(rows.links) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *sharedLinksTestRows) Scan(dest ...any) error {
	link := rows.links[rows.cursor-1]
	*dest[0].(*string) = link.DiscordID
	*dest[1].(*string) = link.PlayerTag
	return nil
}

type sharedLinksTestTx struct {
	pgx.Tx
	queryRows  []pgx.Row
	querySQL   []string
	execSQL    []string
	committed  bool
	rolledBack bool
}

func (tx *sharedLinksTestTx) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	tx.querySQL = append(tx.querySQL, sql)
	if len(tx.queryRows) == 0 {
		return sharedLinksTestRow{scan: func(...any) error { return errors.New("unexpected QueryRow") }}
	}
	row := tx.queryRows[0]
	tx.queryRows = tx.queryRows[1:]
	return row
}

func (tx *sharedLinksTestTx) Exec(_ context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
	tx.execSQL = append(tx.execSQL, sql)
	return pgconn.NewCommandTag("INSERT 1"), nil
}

func (tx *sharedLinksTestTx) Commit(context.Context) error {
	tx.committed = true
	return nil
}

func (tx *sharedLinksTestTx) Rollback(context.Context) error {
	tx.rolledBack = true
	return nil
}
