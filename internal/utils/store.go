package utils

import (
	"context"
	"errors"

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
	return &Store{SQL: sqlPool}, nil
}

func (s *Store) Close(ctx context.Context) error {
	_ = ctx
	if s.SQL != nil {
		s.SQL.Close()
	}
	return nil
}
