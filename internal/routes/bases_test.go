package routes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	disgorest "github.com/disgoorg/disgo/rest"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeBasesDB struct {
	queryRowSQL  string
	queryRowArgs []any
	row          pgx.Row
	querySQL     string
	queryArgs    []any
	rows         pgx.Rows
	execSQL      string
	execArgs     []any
	execTag      pgconn.CommandTag
	execErr      error
}

func (db *fakeBasesDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	db.execSQL = sql
	db.execArgs = args
	if db.execTag.String() == "" {
		db.execTag = pgconn.NewCommandTag("DELETE 1")
	}
	return db.execTag, db.execErr
}

func (db *fakeBasesDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	db.querySQL = sql
	db.queryArgs = args
	if db.rows == nil {
		return nil, errors.New("unexpected Query")
	}
	return db.rows, nil
}

func (db *fakeBasesDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	db.queryRowSQL = sql
	db.queryRowArgs = args
	return db.row
}

type fakeBaseRow struct {
	scan func(...any) error
}

func (row fakeBaseRow) Scan(dest ...any) error {
	return row.scan(dest...)
}

type emptyBaseRows struct {
	pgx.Rows
}

func (emptyBaseRows) Close()     {}
func (emptyBaseRows) Err() error { return nil }
func (emptyBaseRows) Next() bool { return false }

type fakeBaseMessageDeleter struct {
	channelID int64
	messageID int64
	err       error
	calls     int
}

func (deleter *fakeBaseMessageDeleter) DeleteMessage(_ context.Context, channelID, messageID int64) error {
	deleter.calls++
	deleter.channelID = channelID
	deleter.messageID = messageID
	return deleter.err
}

type fakeBaseMessageIntegration struct {
	createGuildID   int64
	createChannelID int64
	createBaseLink  string
	createDesc      string
	createImages    []string
	createMessageID string
	createErr       error
	createCalls     int
	deleteChannelID int64
	deleteMessageID int64
	deleteErr       error
	deleteCalls     int
}

func (integration *fakeBaseMessageIntegration) CreateBaseMessage(
	_ context.Context,
	guildID, channelID int64,
	baseLink, description string,
	images []string,
) (string, error) {
	integration.createCalls++
	integration.createGuildID = guildID
	integration.createChannelID = channelID
	integration.createBaseLink = baseLink
	integration.createDesc = description
	integration.createImages = append([]string(nil), images...)
	return integration.createMessageID, integration.createErr
}

func (integration *fakeBaseMessageIntegration) DeleteMessage(
	_ context.Context,
	channelID, messageID int64,
) error {
	integration.deleteCalls++
	integration.deleteChannelID = channelID
	integration.deleteMessageID = messageID
	return integration.deleteErr
}

func TestValidateCreateBaseRequest(t *testing.T) {
	valid := func() modelsv2.CreateBaseRequest {
		return modelsv2.CreateBaseRequest{
			ChannelID:   "123456789012345678",
			BaseLink:    "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
			Images:      []string{"https://cdn.clashk.ing/base_one.webp"},
			Description: "Anti-three-star layout",
		}
	}

	tests := []struct {
		name   string
		mutate func(*modelsv2.CreateBaseRequest)
	}{
		{"invalid channel", func(body *modelsv2.CreateBaseRequest) { body.ChannelID = "channel" }},
		{"invalid base link", func(body *modelsv2.CreateBaseRequest) { body.BaseLink = "http://example.com" }},
		{"too many images", func(body *modelsv2.CreateBaseRequest) {
			body.Images = []string{
				"https://cdn.clashk.ing/1.webp",
				"https://cdn.clashk.ing/2.webp",
				"https://cdn.clashk.ing/3.webp",
				"https://cdn.clashk.ing/4.webp",
				"https://cdn.clashk.ing/5.webp",
			}
		}},
		{"non CDN image", func(body *modelsv2.CreateBaseRequest) {
			body.Images = []string{"https://example.com/base.webp"}
		}},
		{"description over 1000 characters", func(body *modelsv2.CreateBaseRequest) {
			body.Description = strings.Repeat("界", maxBaseDescription+1)
		}},
	}

	body := valid()
	if err := validateCreateBaseRequest(&body); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body := valid()
			test.mutate(&body)
			if err := validateCreateBaseRequest(&body); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestInsertBaseControlsOwnershipAndEngagementState(t *testing.T) {
	createdAt := time.Date(2026, time.July, 24, 5, 30, 0, 0, time.UTC)
	db := &fakeBasesDB{row: fakeBaseRow{scan: func(dest ...any) error {
		*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
		*dest[1].(*string) = "111111111111111111"
		*dest[2].(*string) = "222222222222222222"
		*dest[3].(*string) = "333333333333333333"
		*dest[4].(*string) = "https://link.clashofclans.com/en?action=OpenLayout&id=TH17"
		*dest[5].(*[]string) = []string{"https://cdn.clashk.ing/base.webp"}
		*dest[6].(*string) = "Layout"
		*dest[7].(*int) = 0
		*dest[8].(*int) = 0
		*dest[9].(*int) = 0
		*dest[10].(*[]string) = []string{}
		*dest[11].(*time.Time) = createdAt
		return nil
	}}}
	body := modelsv2.CreateBaseRequest{
		ChannelID: "222222222222222222",
		BaseLink:  "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
		Images:    []string{"https://cdn.clashk.ing/base.webp"}, Description: "Layout",
	}

	item, err := insertBase(
		context.Background(), db,
		"111111111111111111", "333333333333333333", body,
	)
	if err != nil {
		t.Fatalf("insert base: %v", err)
	}
	for _, required := range []string{
		"server_id, channel_id, message_id, base_link, images, description",
		"downloaders, upvoter_ids, downvoter_ids",
		"$6, '{}'::text[], '{}'::text[], '{}'::text[]",
		"cardinality(downloaders)::int AS download_count",
		"cardinality(upvoter_ids)::int AS upvotes",
		"cardinality(downvoter_ids)::int AS downvotes",
	} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("insert query missing %q: %s", required, db.queryRowSQL)
		}
	}
	if len(db.queryRowArgs) != 6 || db.queryRowArgs[0] != "111111111111111111" {
		t.Fatalf("unexpected insert args: %#v", db.queryRowArgs)
	}
	if db.queryRowArgs[2] != "333333333333333333" {
		t.Fatalf("insert did not use the generated Discord message ID: %#v", db.queryRowArgs)
	}
	for _, removed := range []string{" downloads,", "b.upvotes", "b.downvotes"} {
		if strings.Contains(db.queryRowSQL, removed) {
			t.Fatalf("insert query references removed counter column %q: %s", removed, db.queryRowSQL)
		}
	}
	if item.DiscordMessageURL != "https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333" {
		t.Fatalf("unexpected Discord message URL: %s", item.DiscordMessageURL)
	}
}

func TestCreateManagedBaseSendsDiscordMessageBeforePersistingGeneratedID(t *testing.T) {
	body := validCreateBaseRequest()
	db := &fakeBasesDB{row: successfulBaseRow(
		"111111111111111111",
		body.ChannelID,
		"333333333333333333",
	)}
	integration := &fakeBaseMessageIntegration{createMessageID: "333333333333333333"}

	item, err := createManagedBase(
		context.Background(), db, integration,
		"111111111111111111", body,
	)
	if err != nil {
		t.Fatalf("create managed base: %v", err)
	}
	if integration.createCalls != 1 ||
		integration.createGuildID != 111111111111111111 ||
		integration.createChannelID != 222222222222222222 {
		t.Fatalf("unexpected Discord create call: %#v", integration)
	}
	if integration.createBaseLink != body.BaseLink ||
		integration.createDesc != body.Description ||
		len(integration.createImages) != 1 ||
		integration.createImages[0] != body.Images[0] {
		t.Fatalf("Discord message did not receive the base content: %#v", integration)
	}
	if integration.deleteCalls != 0 {
		t.Fatalf("successful create attempted compensation: %#v", integration)
	}
	if len(db.queryRowArgs) != 6 || db.queryRowArgs[2] != "333333333333333333" {
		t.Fatalf("database insert did not use returned message ID: %#v", db.queryRowArgs)
	}
	if item.MessageID != "333333333333333333" {
		t.Fatalf("response message ID = %q", item.MessageID)
	}
}

func TestCreateManagedBaseDoesNotInsertWhenDiscordMessageCreationFails(t *testing.T) {
	tests := []struct {
		name        string
		integration baseMessageIntegration
		wantStatus  int
		retryable   bool
	}{
		{
			name: "selected channel outside server",
			integration: &fakeBaseMessageIntegration{
				createErr: apptypes.ErrDiscordChannelOutsideGuild,
			},
			wantStatus: http.StatusConflict,
			retryable:  false,
		},
		{
			name: "permission denied",
			integration: &fakeBaseMessageIntegration{createErr: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusForbidden, Status: "403 Forbidden"},
			}},
			wantStatus: http.StatusBadGateway,
			retryable:  false,
		},
		{
			name: "channel not found",
			integration: &fakeBaseMessageIntegration{createErr: &disgorest.Error{
				Code:     disgorest.JSONErrorCodeUnknownChannel,
				Response: &http.Response{StatusCode: http.StatusNotFound, Status: "404 Not Found"},
			}},
			wantStatus: http.StatusConflict,
			retryable:  false,
		},
		{
			name: "transient Discord failure",
			integration: &fakeBaseMessageIntegration{
				createErr: errors.New("network unavailable"),
			},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name: "rate limited",
			integration: &fakeBaseMessageIntegration{createErr: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusTooManyRequests, Status: "429 Too Many Requests"},
			}},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name: "Discord server error",
			integration: &fakeBaseMessageIntegration{createErr: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusBadGateway, Status: "502 Bad Gateway"},
			}},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name: "non-transient Discord rejection",
			integration: &fakeBaseMessageIntegration{createErr: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusBadRequest, Status: "400 Bad Request"},
			}},
			wantStatus: http.StatusBadGateway,
			retryable:  false,
		},
		{
			name:        "integration unavailable",
			integration: nil,
			wantStatus:  http.StatusServiceUnavailable,
			retryable:   true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := &fakeBasesDB{}
			_, err := createManagedBase(
				context.Background(), db, test.integration,
				"111111111111111111", validCreateBaseRequest(),
			)
			var failure *baseCreateFailure
			if !errors.As(err, &failure) {
				t.Fatalf("expected baseCreateFailure, got %v", err)
			}
			if failure.status != test.wantStatus ||
				failure.messageCreated ||
				failure.cleanup != baseMessageCleanupNotNeeded ||
				failure.retryable != test.retryable {
				t.Fatalf("unexpected failure: %#v", failure)
			}
			if db.queryRowSQL != "" {
				t.Fatalf("database insert ran after Discord create failure: %s", db.queryRowSQL)
			}
		})
	}
}

func TestCreateManagedBaseTreatsMissingReturnedMessageIDAsOrphanRisk(t *testing.T) {
	db := &fakeBasesDB{}
	integration := &fakeBaseMessageIntegration{
		createErr: apptypes.ErrDiscordCreatedMessageNoID,
	}
	_, err := createManagedBase(
		context.Background(), db, integration,
		"111111111111111111", validCreateBaseRequest(),
	)
	var failure *baseCreateFailure
	if !errors.As(err, &failure) {
		t.Fatalf("expected baseCreateFailure, got %v", err)
	}
	if failure.status != http.StatusBadGateway ||
		!failure.messageCreated ||
		failure.messageID != nil ||
		failure.cleanup != baseMessageCleanupFailed ||
		failure.retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
	if db.queryRowSQL != "" || integration.deleteCalls != 0 {
		t.Fatalf("missing returned ID reached persistence or unsafe cleanup: db=%q integration=%#v", db.queryRowSQL, integration)
	}
}

func TestCreateManagedBaseRejectsInvalidReturnedMessageIDWithoutInsert(t *testing.T) {
	db := &fakeBasesDB{}
	integration := &fakeBaseMessageIntegration{createMessageID: "invalid-message-id"}
	_, err := createManagedBase(
		context.Background(), db, integration,
		"111111111111111111", validCreateBaseRequest(),
	)
	var failure *baseCreateFailure
	if !errors.As(err, &failure) {
		t.Fatalf("expected baseCreateFailure, got %v", err)
	}
	if failure.status != http.StatusBadGateway ||
		!failure.messageCreated ||
		failure.cleanup != baseMessageCleanupFailed ||
		failure.retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
	if db.queryRowSQL != "" || integration.deleteCalls != 0 {
		t.Fatalf("invalid returned message ID reached persistence or unsafe cleanup: db=%q integration=%#v", db.queryRowSQL, integration)
	}
}

func TestCreateManagedBaseCompensatesWhenDatabaseInsertFails(t *testing.T) {
	unknownMessage := &disgorest.Error{
		Code:     disgorest.JSONErrorCodeUnknownMessage,
		Message:  "Unknown Message",
		Response: &http.Response{StatusCode: http.StatusNotFound, Status: "404 Not Found"},
	}
	tests := []struct {
		name          string
		deleteErr     error
		wantCleanup   string
		wantRetryable bool
	}{
		{
			name:          "message deleted",
			wantCleanup:   baseMessageCleanupDeleted,
			wantRetryable: true,
		},
		{
			name:          "message already missing",
			deleteErr:     unknownMessage,
			wantCleanup:   baseMessageCleanupAlreadyMissing,
			wantRetryable: true,
		},
		{
			name:          "message cleanup failed",
			deleteErr:     errors.New("Discord unavailable"),
			wantCleanup:   baseMessageCleanupFailed,
			wantRetryable: false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := &fakeBasesDB{row: fakeBaseRow{scan: func(...any) error {
				return errors.New("database unavailable")
			}}}
			integration := &fakeBaseMessageIntegration{
				createMessageID: "333333333333333333",
				deleteErr:       test.deleteErr,
			}
			_, err := createManagedBase(
				context.Background(), db, integration,
				"111111111111111111", validCreateBaseRequest(),
			)
			var failure *baseCreateFailure
			if !errors.As(err, &failure) {
				t.Fatalf("expected baseCreateFailure, got %v", err)
			}
			if failure.status != http.StatusInternalServerError ||
				!failure.messageCreated ||
				failure.messageID == nil ||
				*failure.messageID != "333333333333333333" ||
				failure.cleanup != test.wantCleanup ||
				failure.retryable != test.wantRetryable {
				t.Fatalf("unexpected failure: %#v", failure)
			}
			if integration.deleteCalls != 1 ||
				integration.deleteChannelID != 222222222222222222 ||
				integration.deleteMessageID != 333333333333333333 {
				t.Fatalf("unexpected compensation call: %#v", integration)
			}
		})
	}
}

func validCreateBaseRequest() modelsv2.CreateBaseRequest {
	return modelsv2.CreateBaseRequest{
		ChannelID:   "222222222222222222",
		BaseLink:    "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
		Images:      []string{"https://cdn.clashk.ing/base.webp"},
		Description: "Layout",
	}
}

func successfulBaseRow(serverID, channelID, messageID string) fakeBaseRow {
	return fakeBaseRow{scan: func(dest ...any) error {
		*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
		*dest[1].(*string) = serverID
		*dest[2].(*string) = channelID
		*dest[3].(*string) = messageID
		*dest[4].(*string) = "https://link.clashofclans.com/en?action=OpenLayout&id=TH17"
		*dest[5].(*[]string) = []string{"https://cdn.clashk.ing/base.webp"}
		*dest[6].(*string) = "Layout"
		*dest[7].(*int) = 0
		*dest[8].(*int) = 0
		*dest[9].(*int) = 0
		*dest[10].(*[]string) = []string{}
		*dest[11].(*time.Time) = time.Date(2026, time.July, 24, 5, 30, 0, 0, time.UTC)
		return nil
	}}
}

func TestBaseReadsAndDownloaderLookupAreServerScoped(t *testing.T) {
	db := &fakeBasesDB{row: fakeBaseRow{scan: func(...any) error { return pgx.ErrNoRows }}}
	_, _ = queryBase(context.Background(), db, "server-one", "019c95ab-f582-79a6-a309-6ea9202878cd")
	for _, required := range []string{"b.id = $1::uuid", "b.server_id = $2", "b.channel_id IS NOT NULL"} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("detail query missing %q: %s", required, db.queryRowSQL)
		}
	}
	for _, removed := range []string{" downloads,", "b.upvotes", "b.downvotes"} {
		if strings.Contains(db.queryRowSQL, removed) {
			t.Fatalf("detail query references removed counter column %q: %s", removed, db.queryRowSQL)
		}
	}
	if !strings.Contains(db.queryRowSQL, "cardinality(b.downloaders)::int AS download_count") {
		t.Fatalf("detail query does not derive download count: %s", db.queryRowSQL)
	}
	for _, derived := range []string{
		"cardinality(b.upvoter_ids)::int AS upvotes",
		"cardinality(b.downvoter_ids)::int AS downvotes",
	} {
		if !strings.Contains(db.queryRowSQL, derived) {
			t.Fatalf("detail query does not derive %s: %s", derived, db.queryRowSQL)
		}
	}

	db.row = fakeBaseRow{scan: func(dest ...any) error {
		*dest[0].(*bool) = true
		return nil
	}}
	exists, err := baseHasDownloader(
		context.Background(), db, "server-one",
		"019c95ab-f582-79a6-a309-6ea9202878cd", "user-one",
	)
	if err != nil || !exists {
		t.Fatalf("downloader lookup: exists=%v err=%v", exists, err)
	}
	for _, required := range []string{"id = $1::uuid", "server_id = $2", "channel_id IS NOT NULL", "$3 = ANY(downloaders)"} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("downloader query missing %q: %s", required, db.queryRowSQL)
		}
	}
}

func TestBaseListExcludesUnownedLegacyRowsAndDerivesCounts(t *testing.T) {
	db := &fakeBasesDB{
		row: fakeBaseRow{scan: func(dest ...any) error {
			*dest[0].(*int) = 0
			return nil
		}},
		rows: emptyBaseRows{},
	}
	items, total, err := queryBases(context.Background(), db, "server-one", 50, 0)
	if err != nil {
		t.Fatalf("query bases: %v", err)
	}
	if total != 0 || len(items) != 0 {
		t.Fatalf("unexpected empty result: total=%d items=%d", total, len(items))
	}
	for _, required := range []string{
		"b.server_id = $1",
		"b.channel_id IS NOT NULL",
		"cardinality(b.downloaders)::int AS download_count",
		"cardinality(b.upvoter_ids)::int AS upvotes",
		"cardinality(b.downvoter_ids)::int AS downvotes",
	} {
		if !strings.Contains(db.querySQL, required) {
			t.Fatalf("list query missing %q: %s", required, db.querySQL)
		}
	}
	for _, removed := range []string{" downloads,", "b.upvotes", "b.downvotes"} {
		if strings.Contains(db.querySQL, removed) {
			t.Fatalf("list query references removed storage %q: %s", removed, db.querySQL)
		}
	}
}

func TestDeleteManagedBaseDeletesDiscordMessageBeforeScopedDatabaseRow(t *testing.T) {
	db := baseDeleteTestDB("111111111111111111", "222222222222222222", "333333333333333333")
	deleter := &fakeBaseMessageDeleter{}

	cleanup, err := deleteManagedBase(
		context.Background(), db, deleter,
		"111111111111111111", "019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if err != nil {
		t.Fatalf("delete managed base: %v", err)
	}
	if cleanup != baseMessageCleanupDeleted {
		t.Fatalf("cleanup = %q, want %q", cleanup, baseMessageCleanupDeleted)
	}
	if deleter.calls != 1 || deleter.channelID != 222222222222222222 || deleter.messageID != 333333333333333333 {
		t.Fatalf("unexpected Discord delete: calls=%d channel=%d message=%d", deleter.calls, deleter.channelID, deleter.messageID)
	}
	for _, required := range []string{"id = $1::uuid", "server_id = $2", "channel_id IS NOT NULL"} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("location query missing %q: %s", required, db.queryRowSQL)
		}
	}
	for _, required := range []string{"DELETE FROM bases", "id = $1::uuid AND server_id = $2"} {
		if !strings.Contains(db.execSQL, required) {
			t.Fatalf("delete query missing %q: %s", required, db.execSQL)
		}
	}
	if len(db.execArgs) != 2 || db.execArgs[1] != "111111111111111111" {
		t.Fatalf("database delete is not server-scoped: %#v", db.execArgs)
	}
}

func TestDeleteManagedBaseTreatsMissingDiscordMessageAsSatisfied(t *testing.T) {
	for name, discordErr := range map[string]error{
		"unknown message": &disgorest.Error{
			Code:     disgorest.JSONErrorCodeUnknownMessage,
			Message:  "Unknown Message",
			Response: &http.Response{StatusCode: http.StatusNotFound, Status: "404 Not Found"},
		},
		"not found": &disgorest.Error{
			Response: &http.Response{StatusCode: http.StatusNotFound, Status: "404 Not Found"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			db := baseDeleteTestDB("111111111111111111", "222222222222222222", "333333333333333333")
			deleter := &fakeBaseMessageDeleter{err: discordErr}
			cleanup, err := deleteManagedBase(
				context.Background(), db, deleter,
				"111111111111111111", "019c95ab-f582-79a6-a309-6ea9202878cd",
			)
			if err != nil {
				t.Fatalf("delete managed base: %v", err)
			}
			if cleanup != baseMessageCleanupAlreadyMissing {
				t.Fatalf("cleanup = %q, want %q", cleanup, baseMessageCleanupAlreadyMissing)
			}
			if !strings.Contains(db.execSQL, "DELETE FROM bases") {
				t.Fatal("expected database row deletion after missing Discord message")
			}
		})
	}
}

func TestDeleteManagedBaseRetainsRowOnDiscordFailure(t *testing.T) {
	tests := []struct {
		name       string
		deleter    baseMessageDeleter
		wantStatus int
		retryable  bool
	}{
		{
			name: "permission",
			deleter: &fakeBaseMessageDeleter{err: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusForbidden, Status: "403 Forbidden"},
			}},
			wantStatus: http.StatusBadGateway,
			retryable:  false,
		},
		{
			name:       "network",
			deleter:    &fakeBaseMessageDeleter{err: errors.New("network unavailable")},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name: "rate limited",
			deleter: &fakeBaseMessageDeleter{err: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusTooManyRequests, Status: "429 Too Many Requests"},
			}},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name: "Discord server error",
			deleter: &fakeBaseMessageDeleter{err: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusBadGateway, Status: "502 Bad Gateway"},
			}},
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
		{
			name:       "integration unavailable",
			deleter:    nil,
			wantStatus: http.StatusServiceUnavailable,
			retryable:  true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := baseDeleteTestDB("111111111111111111", "222222222222222222", "333333333333333333")
			_, err := deleteManagedBase(
				context.Background(), db, test.deleter,
				"111111111111111111", "019c95ab-f582-79a6-a309-6ea9202878cd",
			)
			var failure *baseDeleteFailure
			if !errors.As(err, &failure) {
				t.Fatalf("expected baseDeleteFailure, got %v", err)
			}
			if failure.status != test.wantStatus || failure.cleanup != baseMessageCleanupFailed || failure.retryable != test.retryable {
				t.Fatalf("unexpected failure: %#v", failure)
			}
			if db.execSQL != "" {
				t.Fatalf("database row was deleted after Discord failure: %s", db.execSQL)
			}
		})
	}
}

func TestDeleteManagedBaseRetainsRowForInvalidStoredDiscordLocation(t *testing.T) {
	db := baseDeleteTestDB("111111111111111111", "invalid-channel", "333333333333333333")
	deleter := &fakeBaseMessageDeleter{}
	_, err := deleteManagedBase(
		context.Background(), db, deleter,
		"111111111111111111", "019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	var failure *baseDeleteFailure
	if !errors.As(err, &failure) {
		t.Fatalf("expected baseDeleteFailure, got %v", err)
	}
	if failure.status != http.StatusConflict ||
		failure.cleanup != baseMessageCleanupFailed ||
		failure.retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
	if deleter.calls != 0 || db.execSQL != "" {
		t.Fatalf("invalid location reached side effects: calls=%d sql=%s", deleter.calls, db.execSQL)
	}
}

func TestDeleteManagedBaseReportsCompletedDiscordCleanupWhenDatabaseDeleteFails(t *testing.T) {
	db := baseDeleteTestDB("111111111111111111", "222222222222222222", "333333333333333333")
	db.execErr = errors.New("database unavailable")
	deleter := &fakeBaseMessageDeleter{}

	_, err := deleteManagedBase(
		context.Background(), db, deleter,
		"111111111111111111", "019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	var failure *baseDeleteFailure
	if !errors.As(err, &failure) {
		t.Fatalf("expected baseDeleteFailure, got %v", err)
	}
	if failure.status != http.StatusInternalServerError ||
		failure.cleanup != baseMessageCleanupDeleted ||
		!failure.retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
}

func TestDeleteManagedBaseRejectsCrossServerBeforeDiscordCall(t *testing.T) {
	db := &fakeBasesDB{row: fakeBaseRow{scan: func(...any) error { return pgx.ErrNoRows }}}
	deleter := &fakeBaseMessageDeleter{}
	_, err := deleteManagedBase(
		context.Background(), db, deleter,
		"other-server", "019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("expected not found, got %v", err)
	}
	if deleter.calls != 0 || db.execSQL != "" {
		t.Fatalf("cross-server delete reached side effects: calls=%d sql=%s", deleter.calls, db.execSQL)
	}
}

func baseDeleteTestDB(serverID, channelID, messageID string) *fakeBasesDB {
	return &fakeBasesDB{row: fakeBaseRow{scan: func(dest ...any) error {
		*dest[0].(*string) = serverID
		*dest[1].(*string) = channelID
		*dest[2].(*string) = messageID
		return nil
	}}}
}

func TestBaseBotVoteAndDownloadMutationsAreAtomicAndIdempotent(t *testing.T) {
	db := &fakeBasesDB{row: fakeBaseRow{scan: func(dest ...any) error {
		switch len(dest) {
		case 3:
			*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
			*dest[1].(*string) = "123456789012345678"
			*dest[2].(*string) = "down"
		case 1:
			*dest[0].(*int) = 1
		default:
			return errors.New("unexpected scan")
		}
		return nil
	}}}

	vote, err := persistBaseVote(
		context.Background(), db, "019c95ab-f582-79a6-a309-6ea9202878cd",
		"123456789012345678", "down",
	)
	if err != nil {
		t.Fatalf("persist vote: %v", err)
	}
	if vote.Direction != "down" {
		t.Fatalf("vote direction = %q, want down", vote.Direction)
	}
	for _, required := range []string{
		"UPDATE bases",
		"array_append(array_remove(upvoter_ids, $2), $2)",
		"array_remove(downvoter_ids, $2)",
		"WHEN $3 = 'down' THEN array_append(array_remove(downvoter_ids, $2), $2)",
	} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("vote upsert query missing %q: %s", required, db.queryRowSQL)
		}
	}

	count, err := appendUniqueBaseDownloader(
		context.Background(), db, "019c95ab-f582-79a6-a309-6ea9202878cd",
		"123456789012345678",
	)
	if err != nil || count != 1 {
		t.Fatalf("append downloader: count=%d err=%v", count, err)
	}
	for _, required := range []string{
		"WHEN $2 = ANY(downloaders) THEN downloaders",
		"ELSE array_append(downloaders, $2)",
		"RETURNING cardinality(downloaders)::int",
	} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("download query missing %q: %s", required, db.queryRowSQL)
		}
	}

	db.row = fakeBaseRow{scan: func(dest ...any) error {
		*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
		return nil
	}}
	if err := deleteBaseVote(
		context.Background(), db, "019c95ab-f582-79a6-a309-6ea9202878cd",
		"123456789012345678",
	); err != nil {
		t.Fatalf("delete vote: %v", err)
	}
	for _, required := range []string{
		"UPDATE bases",
		"upvoter_ids = array_remove(upvoter_ids, $2)",
		"downvoter_ids = array_remove(downvoter_ids, $2)",
	} {
		if !strings.Contains(db.queryRowSQL, required) {
			t.Fatalf("vote removal query missing %q: %s", required, db.queryRowSQL)
		}
	}
}

func TestBasesRoutesAreManagerProtectedAndImmutable(t *testing.T) {
	app := newRegisteredRoutesTestAppWithErrorHandler()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	expected := map[string][]string{
		fiber.MethodGet: {
			"/v2/server/:server_id/bases",
			"/v2/server/:server_id/bases/:base_id",
			"/v2/server/:server_id/bases/:base_id/downloaders/:user_id",
		},
		fiber.MethodPost: {
			"/v2/server/:server_id/bases",
			"/v2/server/:server_id/bases/images",
			"/v2/bases/:base_id/downloaders/:user_id",
		},
		fiber.MethodPut: {
			"/v2/bases/:base_id/votes/:voter_id",
		},
		fiber.MethodDelete: {
			"/v2/server/:server_id/bases/:base_id",
			"/v2/bases/:base_id/votes/:voter_id",
		},
	}
	for method, paths := range expected {
		for _, path := range paths {
			if registeredRouteIndex(app, method, path) < 0 {
				t.Fatalf("expected %s %s to be registered", method, path)
			}
		}
	}
	for _, method := range []string{fiber.MethodPatch, fiber.MethodPut} {
		if registeredRouteIndex(app, method, "/v2/server/:server_id/bases/:base_id") >= 0 {
			t.Fatalf("bases must not register %s edit route", method)
		}
	}

	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/v2/server/111111111111111111/bases", nil),
		httptest.NewRequest(http.MethodPost, "/v2/server/111111111111111111/bases", strings.NewReader(`{}`)),
		httptest.NewRequest(http.MethodDelete, "/v2/server/111111111111111111/bases/019c95ab-f582-79a6-a309-6ea9202878cd", nil),
	} {
		request.Header.Set("Content-Type", "application/json")
		response, err := app.Test(request)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s returned %d without manager auth, want 401", request.Method, response.StatusCode)
		}
	}

	botRequest := httptest.NewRequest(
		http.MethodPut,
		"/v2/bases/019c95ab-f582-79a6-a309-6ea9202878cd/votes/123456789012345678",
		strings.NewReader(`{"direction":"up"}`),
	)
	botRequest.Header.Set("Content-Type", "application/json")
	response, err := app.Test(botRequest)
	if err != nil {
		t.Fatalf("bot route request failed: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("bot vote route returned %d without bot auth, want 401", response.StatusCode)
	}

	botApp := newRegisteredRoutesTestAppWithErrorHandler()
	Register(
		botApp,
		apptypes.Deps{Config: apptypes.Config{APIBotToken: "bot-secret"}},
		func(next fiber.Handler) fiber.Handler { return next },
	)
	authorizedBotRequest := httptest.NewRequest(
		http.MethodPut,
		"/v2/bases/019c95ab-f582-79a6-a309-6ea9202878cd/votes/123456789012345678",
		strings.NewReader(`{"direction":"up"}`),
	)
	authorizedBotRequest.Header.Set("Content-Type", "application/json")
	authorizedBotRequest.Header.Set("Authorization", "Bearer bot-secret")
	response, err = botApp.Test(authorizedBotRequest)
	if err != nil {
		t.Fatalf("authorized bot route request failed: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("bot vote route returned %d with bot auth, want downstream 503", response.StatusCode)
	}
}

func TestBaseModelsUseCamelCaseJSON(t *testing.T) {
	createRequest, err := json.Marshal(modelsv2.CreateBaseRequest{
		ChannelID: "channel", BaseLink: "https://example.com",
		Images: []string{"https://cdn.clashk.ing/base.webp"}, Description: "Layout",
	})
	if err != nil {
		t.Fatalf("marshal create request: %v", err)
	}
	createRequestText := string(createRequest)
	for _, field := range []string{`"channelId"`, `"baseLink"`, `"images"`, `"description"`} {
		if !strings.Contains(createRequestText, field) {
			t.Fatalf("missing create request field %s in %s", field, createRequestText)
		}
	}
	if strings.Contains(createRequestText, "messageId") {
		t.Fatalf("create request exposes client-supplied messageId: %s", createRequestText)
	}

	body, err := json.Marshal(modelsv2.Base{
		ServerID: "server", ChannelID: "channel", MessageID: "message",
		BaseLink: "https://example.com", CreatedAt: time.Unix(0, 0).UTC(),
		DiscordMessageURL: "https://discord.com/channels/server/channel/message",
	})
	if err != nil {
		t.Fatalf("marshal base: %v", err)
	}
	text := string(body)
	for _, field := range []string{
		`"serverId"`, `"channelId"`, `"messageId"`, `"baseLink"`,
		`"downloadCount"`, `"createdAt"`, `"discordMessageUrl"`,
	} {
		if !strings.Contains(text, field) {
			t.Fatalf("missing camelCase field %s in %s", field, text)
		}
	}
	for _, stale := range []string{"server_id", "channel_id", "message_id", "base_link", "created_at", `"downloads"`} {
		if strings.Contains(text, stale) {
			t.Fatalf("unexpected snake_case field %q in %s", stale, text)
		}
	}

	deleteError, err := json.Marshal(modelsv2.BaseDeleteErrorResponse{
		Code:                  modelsv2.ErrorCodeUpstreamUnavailable,
		Message:               "Discord unavailable",
		RequestID:             "request-1",
		BaseID:                "base-1",
		DatabaseDeleted:       false,
		DiscordMessageCleanup: baseMessageCleanupFailed,
		Retryable:             true,
	})
	if err != nil {
		t.Fatalf("marshal delete error: %v", err)
	}
	deleteText := string(deleteError)
	for _, field := range []string{`"requestId"`, `"baseId"`, `"databaseDeleted"`, `"discordMessageCleanup"`, `"retryable"`} {
		if !strings.Contains(deleteText, field) {
			t.Fatalf("missing camelCase delete field %s in %s", field, deleteText)
		}
	}
	if strings.Contains(deleteText, "request_id") {
		t.Fatalf("unexpected snake_case delete field in %s", deleteText)
	}

	createError, err := json.Marshal(modelsv2.BaseCreateErrorResponse{
		Code:                  modelsv2.ErrorCodeInternal,
		Message:               "Database failed",
		RequestID:             "request-2",
		DatabaseInserted:      false,
		DiscordMessageCreated: true,
		DiscordMessageID:      stringPointer("333333333333333333"),
		DiscordMessageCleanup: baseMessageCleanupFailed,
		Retryable:             false,
	})
	if err != nil {
		t.Fatalf("marshal create error: %v", err)
	}
	createText := string(createError)
	for _, field := range []string{
		`"requestId"`, `"databaseInserted"`, `"discordMessageCreated"`,
		`"discordMessageId"`, `"discordMessageCleanup"`, `"retryable"`,
	} {
		if !strings.Contains(createText, field) {
			t.Fatalf("missing camelCase create error field %s in %s", field, createText)
		}
	}
	if strings.Contains(createText, "request_id") {
		t.Fatalf("unexpected snake_case create error field in %s", createText)
	}
}

func stringPointer(value string) *string {
	return &value
}
