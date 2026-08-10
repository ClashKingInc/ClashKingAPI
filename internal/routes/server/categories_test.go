package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type clanCategorySQLCall struct {
	sql  string
	args []any
}

type fakeClanCategoryDB struct {
	tx       *fakeClanCategoryTx
	beginErr error
	query    clanCategorySQLCall
	rows     pgx.Rows
	row      pgx.Row
}

func (db *fakeClanCategoryDB) Begin(context.Context) (pgx.Tx, error) {
	return db.tx, db.beginErr
}

func (db *fakeClanCategoryDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	db.query = clanCategorySQLCall{sql: sql, args: args}
	if db.rows == nil {
		return nil, errors.New("unexpected Query")
	}
	return db.rows, nil
}

func (db *fakeClanCategoryDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	db.query = clanCategorySQLCall{sql: sql, args: args}
	return db.row
}

type fakeClanCategoryTx struct {
	pgx.Tx
	queryCalls    []clanCategorySQLCall
	rows          []pgx.Row
	execCalls     []clanCategorySQLCall
	execTags      []pgconn.CommandTag
	execErrors    []error
	commitErr     error
	commitCalls   int
	rollbackCalls int
}

func (tx *fakeClanCategoryTx) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	tx.queryCalls = append(tx.queryCalls, clanCategorySQLCall{sql: sql, args: args})
	index := len(tx.queryCalls) - 1
	if index >= len(tx.rows) {
		return fakeClanCategoryRow{scan: func(...any) error {
			return errors.New("unexpected QueryRow")
		}}
	}
	return tx.rows[index]
}

func (tx *fakeClanCategoryTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	tx.execCalls = append(tx.execCalls, clanCategorySQLCall{sql: sql, args: args})
	index := len(tx.execCalls) - 1
	var tag pgconn.CommandTag
	if index < len(tx.execTags) {
		tag = tx.execTags[index]
	}
	var err error
	if index < len(tx.execErrors) {
		err = tx.execErrors[index]
	}
	return tag, err
}

func (tx *fakeClanCategoryTx) Commit(context.Context) error {
	tx.commitCalls++
	return tx.commitErr
}

func (tx *fakeClanCategoryTx) Rollback(context.Context) error {
	tx.rollbackCalls++
	return nil
}

type fakeClanCategoryRow struct {
	scan func(...any) error
}

func (row fakeClanCategoryRow) Scan(dest ...any) error {
	return row.scan(dest...)
}

type fakeClanCategoryRows struct {
	pgx.Rows
	scans  []func(...any) error
	cursor int
}

func (rows *fakeClanCategoryRows) Close() {}

func (rows *fakeClanCategoryRows) Err() error { return nil }

func (rows *fakeClanCategoryRows) Next() bool {
	if rows.cursor >= len(rows.scans) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *fakeClanCategoryRows) Scan(dest ...any) error {
	return rows.scans[rows.cursor-1](dest...)
}

func TestNormalizeClanCategoryName(t *testing.T) {
	name, err := normalizeClanCategoryName(" \tCWL   Clans\n ")
	if err != nil {
		t.Fatalf("normalize valid category: %v", err)
	}
	if name != "CWL Clans" {
		t.Fatalf("normalized name = %q, want CWL Clans", name)
	}
	assignedName, err := normalizeClanCategoryAssignment(" \tCWL   Clans\n ")
	if err != nil || assignedName != name {
		t.Fatalf("assignment normalization = %q, %v; want %q", assignedName, err, name)
	}
	clearedName, err := normalizeClanCategoryAssignment(" \t\n ")
	if err != nil || clearedName != "" {
		t.Fatalf("clear assignment normalization = %q, %v; want empty", clearedName, err)
	}

	for testName, value := range map[string]string{
		"empty":    " \t\n ",
		"too long": strings.Repeat("界", maxClanCategoryNameRunes+1),
		"control":  "Main\x00Family",
	} {
		t.Run(testName, func(t *testing.T) {
			if _, err := normalizeClanCategoryName(value); err == nil {
				t.Fatal("expected invalid category name")
			}
		})
	}
}

func TestParseClanCategoryID(t *testing.T) {
	parsed, err := parseClanCategoryID(" 019c95ab-f582-79a6-a309-6ea9202878cd ")
	if err != nil || parsed != "019c95ab-f582-79a6-a309-6ea9202878cd" {
		t.Fatalf("parse category ID: parsed=%q err=%v", parsed, err)
	}
	if _, err := parseClanCategoryID("not-a-uuid"); err == nil {
		t.Fatal("expected invalid category UUID to fail")
	}
}

func TestQueryClanCategoriesIsServerScopedAndIncludesCounts(t *testing.T) {
	rows := &fakeClanCategoryRows{scans: []func(...any) error{
		categoryScan("019c95ab-f582-79a6-a309-6ea9202878cd", "111111111111111111", "CWL", 10),
	}}
	db := &fakeClanCategoryDB{rows: rows}
	items, err := queryClanCategories(context.Background(), db, "111111111111111111")
	if err != nil {
		t.Fatalf("query categories: %v", err)
	}
	if len(items) != 1 || items[0].Name != "CWL" || items[0].ClanCount != 10 {
		t.Fatalf("unexpected categories: %#v", items)
	}
	for _, required := range []string{
		"category.server_id = $1",
		"clan.server_id = category.server_id",
		"clan.category_id = category.id",
		"count(clan.tag)::int AS clan_count",
	} {
		if !strings.Contains(db.query.sql, required) {
			t.Fatalf("list query missing %q: %s", required, db.query.sql)
		}
	}
	if len(db.query.args) != 1 || db.query.args[0] != "111111111111111111" {
		t.Fatalf("list query is not server scoped: %#v", db.query.args)
	}
}

func TestInsertAndRenameClanCategoryUseNormalizedServerScopedContract(t *testing.T) {
	insertTx := &fakeClanCategoryTx{rows: []pgx.Row{
		fakeClanCategoryRow{scan: categoryScan(
			"019c95ab-f582-79a6-a309-6ea9202878cd",
			"111111111111111111", "CWL Clans", 0,
		)},
	}}
	inserted, err := insertClanCategory(
		context.Background(),
		&fakeClanCategoryDB{tx: insertTx},
		"111111111111111111",
		"CWL Clans",
	)
	if err != nil {
		t.Fatalf("insert category: %v", err)
	}
	if inserted.Name != "CWL Clans" || inserted.ClanCount != 0 {
		t.Fatalf("unexpected inserted category: %#v", inserted)
	}
	if insertTx.commitCalls != 1 || insertTx.rollbackCalls != 1 {
		t.Fatalf("unexpected insert transaction lifecycle: commit=%d rollback=%d", insertTx.commitCalls, insertTx.rollbackCalls)
	}
	insertCall := insertTx.queryCalls[0]
	for _, required := range []string{
		"INSERT INTO server_clan_categories (server_id, name, position)",
		"COALESCE(max(position) + 1, 0)",
		"RETURNING id::text, server_id, name, position, 0::int",
	} {
		if !strings.Contains(insertCall.sql, required) {
			t.Fatalf("insert query missing %q: %s", required, insertCall.sql)
		}
	}
	if len(insertCall.args) != 2 ||
		insertCall.args[0] != "111111111111111111" ||
		insertCall.args[1] != "CWL Clans" {
		t.Fatalf("unexpected insert args: %#v", insertCall.args)
	}

	renameTx := &fakeClanCategoryTx{rows: []pgx.Row{
		fakeClanCategoryRow{scan: categoryScan(
			"019c95ab-f582-79a6-a309-6ea9202878cd",
			"111111111111111111", "Events", 7,
		)},
	}}
	renamed, err := updateClanCategoryName(
		context.Background(),
		&fakeClanCategoryDB{tx: renameTx},
		"111111111111111111",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
		"Events",
	)
	if err != nil {
		t.Fatalf("rename category: %v", err)
	}
	if renamed.Name != "Events" || renamed.ClanCount != 7 {
		t.Fatalf("unexpected renamed category: %#v", renamed)
	}
	renameCall := renameTx.queryCalls[0]
	for _, required := range []string{
		"category.server_id = $1",
		"category.id = $2::uuid",
		"SET name = $3",
		"clan.server_id = category.server_id",
		"clan.category_id = category.id",
	} {
		if !strings.Contains(renameCall.sql, required) {
			t.Fatalf("rename query missing %q: %s", required, renameCall.sql)
		}
	}
}

func TestClanCategoryDuplicateAndNotFoundErrorsAreExplicit(t *testing.T) {
	duplicate := clanCategoryOperationError(
		&pgconn.PgError{Code: "23505"},
		"fallback",
	)
	assertClanCategoryAppError(t, duplicate, http.StatusConflict)

	notFound := clanCategoryOperationError(pgx.ErrNoRows, "fallback")
	assertClanCategoryAppError(t, notFound, http.StatusNotFound)
}

func TestClanCategoryCreateAndRenameFailuresRollBack(t *testing.T) {
	duplicateErr := &pgconn.PgError{Code: "23505"}
	createTx := &fakeClanCategoryTx{rows: []pgx.Row{
		fakeClanCategoryRow{scan: func(...any) error { return duplicateErr }},
	}}
	_, err := insertClanCategory(
		context.Background(),
		&fakeClanCategoryDB{tx: createTx},
		"111111111111111111",
		"CWL",
	)
	if !errors.Is(err, duplicateErr) {
		t.Fatalf("create error = %v, want duplicate error", err)
	}
	if createTx.commitCalls != 0 || createTx.rollbackCalls != 1 {
		t.Fatalf("duplicate create transaction lifecycle: %#v", createTx)
	}
	assertClanCategoryAppError(
		t,
		clanCategoryOperationError(err, "fallback"),
		http.StatusConflict,
	)

	renameTx := &fakeClanCategoryTx{rows: []pgx.Row{
		fakeClanCategoryRow{scan: func(...any) error { return pgx.ErrNoRows }},
	}}
	_, err = updateClanCategoryName(
		context.Background(),
		&fakeClanCategoryDB{tx: renameTx},
		"222222222222222222",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
		"Events",
	)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-server rename error = %v, want pgx.ErrNoRows", err)
	}
	if renameTx.commitCalls != 0 || renameTx.rollbackCalls != 1 {
		t.Fatalf("cross-server rename transaction lifecycle: %#v", renameTx)
	}
}

func TestClanCategoryDeletePreviewIsServerScoped(t *testing.T) {
	db := &fakeClanCategoryDB{row: fakeClanCategoryRow{scan: categoryScan(
		"019c95ab-f582-79a6-a309-6ea9202878cd",
		"111111111111111111", "CWL", 10,
	)}}
	category, err := queryClanCategory(
		context.Background(), db,
		"111111111111111111",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if err != nil {
		t.Fatalf("query category preview: %v", err)
	}
	if category.ClanCount != 10 {
		t.Fatalf("preview count = %d, want 10", category.ClanCount)
	}
	for _, required := range []string{
		"category.server_id = $1",
		"category.id = $2::uuid",
		"clan.server_id = category.server_id",
	} {
		if !strings.Contains(db.query.sql, required) {
			t.Fatalf("preview query missing %q: %s", required, db.query.sql)
		}
	}

	crossServerDB := &fakeClanCategoryDB{row: fakeClanCategoryRow{scan: func(...any) error {
		return pgx.ErrNoRows
	}}}
	_, err = queryClanCategory(
		context.Background(), crossServerDB,
		"222222222222222222",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	assertClanCategoryAppError(
		t,
		clanCategoryOperationError(err, "fallback"),
		http.StatusNotFound,
	)
}

func TestRemoveClanCategoryLocksCountsAndDeletesInOneTransaction(t *testing.T) {
	tx := &fakeClanCategoryTx{
		rows: []pgx.Row{
			fakeClanCategoryRow{scan: func(dest ...any) error {
				*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
				*dest[1].(*string) = "CWL"
				return nil
			}},
			fakeClanCategoryRow{scan: func(dest ...any) error {
				*dest[0].(*int) = 10
				return nil
			}},
		},
		execTags: []pgconn.CommandTag{pgconn.NewCommandTag("DELETE 1")},
	}
	response, err := removeClanCategory(
		context.Background(),
		&fakeClanCategoryDB{tx: tx},
		"111111111111111111",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if err != nil {
		t.Fatalf("remove category: %v", err)
	}
	if !response.Deleted ||
		response.CategoryID != "019c95ab-f582-79a6-a309-6ea9202878cd" ||
		response.Name != "CWL" ||
		response.UncategorizedClanCount != 10 {
		t.Fatalf("unexpected delete response: %#v", response)
	}
	if tx.commitCalls != 1 || tx.rollbackCalls != 1 {
		t.Fatalf("unexpected delete transaction lifecycle: commit=%d rollback=%d", tx.commitCalls, tx.rollbackCalls)
	}
	if len(tx.queryCalls) != 2 || len(tx.execCalls) != 2 {
		t.Fatalf("unexpected delete SQL calls: query=%d exec=%d", len(tx.queryCalls), len(tx.execCalls))
	}
	for _, required := range []string{"server_id = $1", "id = $2::uuid", "FOR UPDATE"} {
		if !strings.Contains(tx.queryCalls[0].sql, required) {
			t.Fatalf("delete lock query missing %q: %s", required, tx.queryCalls[0].sql)
		}
	}
	for _, required := range []string{"server_id = $1", "category_id = $2::uuid", "count(*)::int"} {
		if !strings.Contains(tx.queryCalls[1].sql, required) {
			t.Fatalf("delete count query missing %q: %s", required, tx.queryCalls[1].sql)
		}
	}
	for _, required := range []string{"DELETE FROM server_clan_categories", "server_id = $1", "id = $2::uuid"} {
		if !strings.Contains(tx.execCalls[0].sql, required) {
			t.Fatalf("delete query missing %q: %s", required, tx.execCalls[0].sql)
		}
	}
	if strings.Contains(tx.execCalls[0].sql, "UPDATE server_clans") {
		t.Fatalf("delete bypasses the ON DELETE SET NULL foreign key: %s", tx.execCalls[0].sql)
	}
	for _, required := range []string{"SET position = position - 1", "server_id = $1", "position > $2"} {
		if !strings.Contains(tx.execCalls[1].sql, required) {
			t.Fatalf("delete position compaction missing %q: %s", required, tx.execCalls[1].sql)
		}
	}
}

func TestRemoveClanCategoryRollsBackOnCrossServerAndCommitFailure(t *testing.T) {
	crossServerTx := &fakeClanCategoryTx{rows: []pgx.Row{
		fakeClanCategoryRow{scan: func(...any) error { return pgx.ErrNoRows }},
	}}
	_, err := removeClanCategory(
		context.Background(),
		&fakeClanCategoryDB{tx: crossServerTx},
		"222222222222222222",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-server delete error = %v, want pgx.ErrNoRows", err)
	}
	if len(crossServerTx.execCalls) != 0 || crossServerTx.commitCalls != 0 || crossServerTx.rollbackCalls != 1 {
		t.Fatalf("cross-server delete reached mutation: %#v", crossServerTx)
	}

	commitFailure := errors.New("commit failed")
	commitTx := &fakeClanCategoryTx{
		rows: []pgx.Row{
			fakeClanCategoryRow{scan: func(dest ...any) error {
				*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
				*dest[1].(*string) = "CWL"
				return nil
			}},
			fakeClanCategoryRow{scan: func(dest ...any) error {
				*dest[0].(*int) = 2
				return nil
			}},
		},
		execTags:  []pgconn.CommandTag{pgconn.NewCommandTag("DELETE 1")},
		commitErr: commitFailure,
	}
	_, err = removeClanCategory(
		context.Background(),
		&fakeClanCategoryDB{tx: commitTx},
		"111111111111111111",
		"019c95ab-f582-79a6-a309-6ea9202878cd",
	)
	if !errors.Is(err, commitFailure) {
		t.Fatalf("commit failure = %v, want %v", err, commitFailure)
	}
	if commitTx.commitCalls != 1 || commitTx.rollbackCalls != 1 {
		t.Fatalf("commit failure did not preserve rollback lifecycle: %#v", commitTx)
	}
}

func TestAssignClanCategoryUsesTheSameCategoryRepresentationAndExactConflictKey(t *testing.T) {
	tx := &fakeClanCategoryTx{
		rows: []pgx.Row{
			fakeClanCategoryRow{scan: func(dest ...any) error {
				*dest[0].(*string) = "019c95ab-f582-79a6-a309-6ea9202878cd"
				return nil
			}},
			fakeClanCategoryRow{scan: categoryScan(
				"019c95ab-f582-79a6-a309-6ea9202878cd",
				"111111111111111111", "CWL Clans", 4,
			)},
		},
		execTags: []pgconn.CommandTag{pgconn.NewCommandTag("UPDATE 1")},
	}
	category, err := assignClanCategory(
		context.Background(), tx,
		"111111111111111111", "#2PP", "CWL Clans",
	)
	if err != nil {
		t.Fatalf("assign category: %v", err)
	}
	if category == nil || category.Name != "CWL Clans" || category.ClanCount != 4 {
		t.Fatalf("unexpected assigned category: %#v", category)
	}
	insert := tx.queryCalls[0]
	for _, required := range []string{
		"INSERT INTO server_clan_categories (server_id, name, position)",
		"COALESCE(max(position) + 1, 0)",
		"ON CONFLICT (server_id, name) DO UPDATE",
		"RETURNING id::text",
	} {
		if !strings.Contains(insert.sql, required) {
			t.Fatalf("assignment insert missing %q: %s", required, insert.sql)
		}
	}
	if len(insert.args) != 2 || insert.args[1] != "CWL Clans" {
		t.Fatalf("assignment did not use normalized category name: %#v", insert.args)
	}
	if len(tx.execCalls) != 1 {
		t.Fatalf("assignment update calls = %d, want 1", len(tx.execCalls))
	}
	for _, required := range []string{
		"UPDATE server_clans",
		"SET category_id = $3::uuid",
		"server_id = $1 AND tag = $2",
	} {
		if !strings.Contains(tx.execCalls[0].sql, required) {
			t.Fatalf("assignment update missing %q: %s", required, tx.execCalls[0].sql)
		}
	}
	reload := tx.queryCalls[1]
	for _, required := range []string{
		"category.id::text, category.server_id, category.name",
		"count(clan.tag)::int AS clan_count",
		"category.server_id = $1 AND category.id = $2::uuid",
	} {
		if !strings.Contains(reload.sql, required) {
			t.Fatalf("assignment reload missing %q: %s", required, reload.sql)
		}
	}

	clearTx := &fakeClanCategoryTx{
		execTags: []pgconn.CommandTag{pgconn.NewCommandTag("UPDATE 1")},
	}
	cleared, err := assignClanCategory(
		context.Background(), clearTx,
		"111111111111111111", "#2PP", "",
	)
	if err != nil || cleared != nil {
		t.Fatalf("clear category: category=%#v err=%v", cleared, err)
	}
	if len(clearTx.execCalls) != 1 ||
		!strings.Contains(clearTx.execCalls[0].sql, "SET category_id = NULL") {
		t.Fatalf("clear category query = %#v", clearTx.execCalls)
	}
}

func categoryScan(id, serverID, name string, clanCount int) func(...any) error {
	return func(dest ...any) error {
		*dest[0].(*string) = id
		*dest[1].(*string) = serverID
		*dest[2].(*string) = name
		*dest[3].(*int) = 0
		*dest[4].(*int) = clanCount
		return nil
	}
}

func TestNormalizeClanCategoryOrderRejectsInvalidAndDuplicateIDs(t *testing.T) {
	valid := "019c95ab-f582-79a6-a309-6ea9202878cd"
	if _, err := normalizeClanCategoryOrder([]string{"not-a-uuid"}); err == nil {
		t.Fatal("expected invalid UUID to fail")
	}
	if _, err := normalizeClanCategoryOrder([]string{valid, valid}); err == nil {
		t.Fatal("expected duplicate UUID to fail")
	}
	got, err := normalizeClanCategoryOrder([]string{" " + valid + " "})
	if err != nil || len(got) != 1 || got[0].String() != valid {
		t.Fatalf("normalize order = %#v, %v", got, err)
	}
}

func TestReplaceClanCategoryOrderIsCompleteServerScopedAndAtomic(t *testing.T) {
	first := "019c95ab-f582-79a6-a309-6ea9202878cd"
	second := "019c95ab-f582-79a6-a309-6ea9202878ce"
	categoryIDs, err := normalizeClanCategoryOrder([]string{second, first})
	if err != nil {
		t.Fatalf("normalize order: %v", err)
	}
	tx := &fakeClanCategoryTx{
		rows: []pgx.Row{fakeClanCategoryRow{scan: func(dest ...any) error {
			*dest[0].(*int) = 2
			*dest[1].(*int) = 2
			return nil
		}}},
		execTags: []pgconn.CommandTag{
			pgconn.NewCommandTag("SELECT 2"),
			pgconn.NewCommandTag("SET CONSTRAINTS"),
			pgconn.NewCommandTag("UPDATE 2"),
		},
	}
	if err := replaceClanCategoryOrder(context.Background(), &fakeClanCategoryDB{tx: tx}, "111111111111111111", categoryIDs); err != nil {
		t.Fatalf("replace order: %v", err)
	}
	if tx.commitCalls != 1 || tx.rollbackCalls != 1 {
		t.Fatalf("unexpected reorder lifecycle: %#v", tx)
	}
	if len(tx.execCalls) != 3 || len(tx.queryCalls) != 1 {
		t.Fatalf("unexpected reorder calls: exec=%d query=%d", len(tx.execCalls), len(tx.queryCalls))
	}
	for _, required := range []string{"server_id = $1", "FOR UPDATE"} {
		if !strings.Contains(tx.execCalls[0].sql, required) {
			t.Fatalf("reorder lock missing %q: %s", required, tx.execCalls[0].sql)
		}
	}
	if !strings.Contains(tx.execCalls[1].sql, "SET CONSTRAINTS server_clan_categories_server_id_position_key DEFERRED") {
		t.Fatalf("reorder does not defer unique order constraint: %s", tx.execCalls[1].sql)
	}
	for _, required := range []string{"WITH ORDINALITY", "SET position = (ordered.ordinality - 1)::int", "category.server_id = $1"} {
		if !strings.Contains(tx.execCalls[2].sql, required) {
			t.Fatalf("reorder update missing %q: %s", required, tx.execCalls[2].sql)
		}
	}
}

func TestReplaceClanCategoryOrderRejectsPartialList(t *testing.T) {
	categoryIDs, err := normalizeClanCategoryOrder([]string{"019c95ab-f582-79a6-a309-6ea9202878cd"})
	if err != nil {
		t.Fatalf("normalize order: %v", err)
	}
	tx := &fakeClanCategoryTx{
		rows: []pgx.Row{fakeClanCategoryRow{scan: func(dest ...any) error {
			*dest[0].(*int) = 2
			*dest[1].(*int) = 1
			return nil
		}}},
	}
	err = replaceClanCategoryOrder(context.Background(), &fakeClanCategoryDB{tx: tx}, "111111111111111111", categoryIDs)
	assertClanCategoryAppError(t, err, http.StatusBadRequest)
	if tx.commitCalls != 0 || tx.rollbackCalls != 1 || len(tx.execCalls) != 1 {
		t.Fatalf("partial reorder reached mutation: %#v", tx)
	}
}

func assertClanCategoryAppError(t *testing.T, err error, status int) {
	t.Helper()
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T: %v", err, err)
	}
	if appErr.Status != status {
		t.Fatalf("AppError status = %d, want %d", appErr.Status, status)
	}
}
