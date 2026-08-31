package utils

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type storeTestQueryer struct{}

func (storeTestQueryer) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }
func (storeTestQueryer) QueryRow(context.Context, string, ...any) pgx.Row        { return nil }

func TestStoreQueriesFallsBackToPool(t *testing.T) {
	store := &Store{SQL: &pgxpool.Pool{}}
	if store.Queries() != store.SQL {
		t.Fatal("store should return its SQL pool when no query override is configured")
	}
}

func TestStoreQueriesUsesOverride(t *testing.T) {
	queryer := storeTestQueryer{}
	store := &Store{Queryer: queryer}
	if store.Queries() != queryer {
		t.Fatal("store should return its configured query override")
	}
}
