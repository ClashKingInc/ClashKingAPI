package routes

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestDecodeNotificationDeviceUnregistrationAllowsEmptyBody(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Delete("/devices", func(c *fiber.Ctx) error {
		request, err := decodeNotificationDeviceUnregistration(c)
		if err != nil {
			return err
		}
		if request.DeviceID != "" || request.Environment != "" {
			t.Fatalf("unexpected request: %#v", request)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	response, err := app.Test(httptest.NewRequest(http.MethodDelete, "/devices", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
	}
}

func TestNotificationTagsNormalizesAndDeduplicates(t *testing.T) {
	got := notificationTags([]string{" #abc ", "ABC", "#def"})
	want := []string{"#ABC", "#DEF"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("notificationTags() = %#v, want %#v", got, want)
	}
}

func TestDefaultNotificationPreferencesUsesStableEmptyLists(t *testing.T) {
	got := defaultNotificationPreferences("device-1", "sandbox")
	if got.DeviceID != "device-1" || got.Environment != "sandbox" || got.NotificationsEnabled {
		t.Fatalf("unexpected defaults: %#v", got)
	}
	if got.ReminderTimings == nil || got.Accounts == nil {
		t.Fatal("default preference lists must serialize as [] instead of null")
	}
}

func TestNotificationReminderTimingsValidateAndDeduplicate(t *testing.T) {
	got, err := notificationReminderTimings([]int{60, 30, 60, 15})
	if err != nil {
		t.Fatal(err)
	}
	if want := []int{60, 30, 15}; !reflect.DeepEqual(got, want) {
		t.Fatalf("notificationReminderTimings() = %#v, want %#v", got, want)
	}
	for _, invalid := range [][]int{
		{0},
		{2821},
		{15, 30, 60, 120},
	} {
		if _, err := notificationReminderTimings(invalid); err == nil {
			t.Fatalf("notificationReminderTimings(%v) succeeded", invalid)
		}
	}
}

type notificationPreferencesTestDB struct {
	tx pgx.Tx
}

func (db *notificationPreferencesTestDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return nil
}

func (db *notificationPreferencesTestDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, nil
}

func (db *notificationPreferencesTestDB) Begin(context.Context) (pgx.Tx, error) {
	return db.tx, nil
}

type notificationPreferencesTestTx struct {
	pgx.Tx
	deviceRows int64
	execSQL    []string
	querySQL   string
	queryArgs  []any
	accounts   []modelsv2.NotificationAccount
	committed  bool
	rolledBack bool
}

type notificationPreferencesTestRow struct{ err error }

func (row notificationPreferencesTestRow) Scan(...any) error { return row.err }

func (tx *notificationPreferencesTestTx) QueryRow(context.Context, string, ...any) pgx.Row {
	return notificationPreferencesTestRow{err: pgx.ErrNoRows}
}

func (tx *notificationPreferencesTestTx) Exec(_ context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
	tx.execSQL = append(tx.execSQL, sql)
	if strings.Contains(sql, "UPDATE mobile_push_devices") {
		if tx.deviceRows == 0 {
			return pgconn.NewCommandTag("UPDATE 0"), nil
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}
	return pgconn.NewCommandTag("INSERT 1"), nil
}

func (tx *notificationPreferencesTestTx) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	tx.querySQL = sql
	tx.queryArgs = args
	return &notificationAccountTestRows{accounts: tx.accounts}, nil
}

func (tx *notificationPreferencesTestTx) Commit(context.Context) error {
	tx.committed = true
	return nil
}

func (tx *notificationPreferencesTestTx) Rollback(context.Context) error {
	tx.rolledBack = true
	return nil
}

type notificationAccountTestRows struct {
	pgx.Rows
	accounts []modelsv2.NotificationAccount
	cursor   int
}

func (rows *notificationAccountTestRows) Close()     {}
func (rows *notificationAccountTestRows) Err() error { return nil }
func (rows *notificationAccountTestRows) Next() bool {
	if rows.cursor >= len(rows.accounts) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *notificationAccountTestRows) Scan(dest ...any) error {
	account := rows.accounts[rows.cursor-1]
	*dest[0].(*string) = account.PlayerTag
	*dest[1].(*string) = account.Source
	*dest[2].(*bool) = account.Active
	return nil
}

func TestReplaceNotificationPreferencesPreservesPerAccountSelections(t *testing.T) {
	tx := &notificationPreferencesTestTx{
		deviceRows: 1,
		accounts: []modelsv2.NotificationAccount{
			{PlayerTag: "#VERIFIED", Source: "verified", Active: true},
		},
	}
	body := modelsv2.NotificationPreferencesRequest{
		DeviceID:             "device-1",
		Environment:          "production",
		NotificationsEnabled: true,
		AnnouncementsEnabled: true,
		ReminderTimings:      []int{15, 60},
	}

	response, err := replaceNotificationPreferences(
		context.Background(),
		&notificationPreferencesTestDB{tx: tx},
		"user-1",
		body,
	)
	if err != nil {
		t.Fatalf("replaceNotificationPreferences() error = %v", err)
	}
	if !tx.committed {
		t.Fatal("preference update did not commit")
	}
	joinedSQL := strings.Join(tx.execSQL, "\n")
	for _, required := range []string{"UPDATE mobile_push_devices"} {
		if !strings.Contains(joinedSQL, required) {
			t.Fatalf("transaction missing %q: %s", required, joinedSQL)
		}
	}
	if strings.Contains(joinedSQL, "DELETE FROM mobile_notification_accounts") {
		t.Fatalf("category save must preserve per-account selections: %s", joinedSQL)
	}
	for _, retired := range []string{"mobile_notification_preferences", "mobile_notification_settings"} {
		if strings.Contains(joinedSQL, retired) {
			t.Fatalf("preference update still uses retired table %q: %s", retired, joinedSQL)
		}
	}
	if !strings.Contains(tx.querySQL, "SELECT player_tag, source, active") {
		t.Fatalf("account response query missing: %s", tx.querySQL)
	}
	if len(response.Accounts) != 1 || response.Accounts[0].Source != "verified" {
		t.Fatalf("unexpected authoritative account response: %#v", response.Accounts)
	}
	if !response.NotificationsEnabled {
		t.Fatal("device master switch must come from mobile_push_devices.enabled")
	}
}

func TestReplaceNotificationPreferencesRejectsUnregisteredDeviceBeforeWritingPreferences(t *testing.T) {
	tx := &notificationPreferencesTestTx{deviceRows: 0}
	_, err := replaceNotificationPreferences(
		context.Background(),
		&notificationPreferencesTestDB{tx: tx},
		"user-1",
		modelsv2.NotificationPreferencesRequest{DeviceID: "missing", Environment: "production"},
	)
	if err == nil {
		t.Fatal("replaceNotificationPreferences() succeeded for an unregistered device")
	}
	if tx.committed {
		t.Fatal("unregistered device replacement committed")
	}
	if len(tx.execSQL) != 1 || !strings.Contains(tx.execSQL[0], "UPDATE mobile_push_devices") {
		t.Fatalf("unexpected writes after missing device: %#v", tx.execSQL)
	}
}

type notificationAccountPreferenceTx struct {
	pgx.Tx
	queryRows []func(...any) error
	queries   []string
	execSQL   []string
	committed bool
}

func (tx *notificationAccountPreferenceTx) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	tx.queries = append(tx.queries, sql)
	index := len(tx.queries) - 1
	return notificationAccountPreferenceRow{scan: tx.queryRows[index]}
}

func (tx *notificationAccountPreferenceTx) Exec(_ context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
	tx.execSQL = append(tx.execSQL, sql)
	return pgconn.NewCommandTag("INSERT 1"), nil
}

func (tx *notificationAccountPreferenceTx) Commit(context.Context) error {
	tx.committed = true
	return nil
}

func (tx *notificationAccountPreferenceTx) Rollback(context.Context) error { return nil }

type notificationAccountPreferenceRow struct{ scan func(...any) error }

func (row notificationAccountPreferenceRow) Scan(dest ...any) error { return row.scan(dest...) }

func TestSetNotificationAccountAcceptsVerifiedPlayer(t *testing.T) {
	tx := &notificationAccountPreferenceTx{queryRows: []func(...any) error{
		func(dest ...any) error {
			*dest[0].(*bool) = true
			return nil
		},
	}}
	account, err := setNotificationAccount(
		context.Background(),
		&notificationPreferencesTestDB{tx: tx},
		"user-1",
		"#VERIFIED",
		true,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !account.Active || account.Source != "verified" || !tx.committed {
		t.Fatalf("unexpected account result: %#v committed=%v", account, tx.committed)
	}
	if len(tx.queries) != 1 || !strings.Contains(tx.queries[0], "player_links") {
		t.Fatal("notification account must be verified through player_links")
	}
	if len(tx.execSQL) != 1 || !strings.Contains(tx.execSQL[0], "INSERT INTO mobile_notification_accounts") {
		t.Fatalf("unexpected account writes: %#v", tx.execSQL)
	}
}

func TestSetNotificationAccountDisableDeletesSelection(t *testing.T) {
	tx := &notificationAccountPreferenceTx{}
	account, err := setNotificationAccount(
		context.Background(),
		&notificationPreferencesTestDB{tx: tx},
		"user-1",
		"#PLAYER",
		false,
	)
	if err != nil {
		t.Fatal(err)
	}
	if account.Active || !tx.committed || len(tx.execSQL) != 1 ||
		!strings.Contains(tx.execSQL[0], "DELETE FROM mobile_notification_accounts") {
		t.Fatalf("disable result=%#v committed=%v writes=%#v", account, tx.committed, tx.execSQL)
	}
}
