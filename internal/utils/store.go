package utils

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	SQL *pgxpool.Pool
}

func NewStore(ctx context.Context, cfg Config) (*Store, error) {
	if cfg.TimescaleURL == "" {
		return nil, errors.New("TIMESCALE_URL or DATABASE_URL is required")
	}
	sqlPool, err := pgxpool.New(ctx, cfg.TimescaleURL)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := sqlPool.Ping(pingCtx); err != nil {
		sqlPool.Close()
		return nil, err
	}
	return &Store{SQL: sqlPool}, nil
}

func (s *Store) RefreshAPIMaterializedViews(ctx context.Context) error {
	conn, err := s.SQL.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	const lockID int64 = 489127743
	var acquired bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, lockID).Scan(&acquired); err != nil {
		return err
	}
	if !acquired {
		return nil
	}
	defer func() {
		var released bool
		_ = conn.QueryRow(context.Background(), `SELECT pg_advisory_unlock($1)`, lockID).Scan(&released)
	}()

	for _, view := range []string{"api_global_counts", "api_league_tier_counts"} {
		if _, err := conn.Exec(ctx, `REFRESH MATERIALIZED VIEW CONCURRENTLY `+view); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Close(ctx context.Context) error {
	_ = ctx
	if s.SQL != nil {
		s.SQL.Close()
	}
	return nil
}
