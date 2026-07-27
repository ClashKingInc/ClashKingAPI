package server

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type serverPlayerSnapshot struct {
	Name     *string
	TownHall *int
	ClanTag  *string
	ClanName *string
	ClanRole *string
	Trophies *int
}

func fetchPlayerSnapshots(ctx context.Context, sql *pgxpool.Pool, tags []string) map[string]serverPlayerSnapshot {
	out := map[string]serverPlayerSnapshot{}
	if sql == nil || len(tags) == 0 {
		return out
	}

	tagSet := map[string]struct{}{}
	queryTags := make([]string, 0, len(tags))
	for _, tag := range tags {
		normalized := serverNormalizeTag(tag)
		if normalized == "" {
			continue
		}
		if _, seen := tagSet[normalized]; seen {
			continue
		}
		tagSet[normalized] = struct{}{}
		queryTags = append(queryTags, normalized)
	}
	if len(queryTags) == 0 {
		return out
	}

	rows, err := sql.Query(ctx, `
		SELECT p.tag, p.name, p.townhall_level, p.clan_tag, b.name, p.trophies
		FROM basic_player p
		LEFT JOIN basic_clan b ON b.tag = p.clan_tag
		WHERE p.tag = ANY($1)
	`, queryTags)
	if err != nil {
		return out
	}
	defer rows.Close()

	for rows.Next() {
		var tag, name string
		var townhall, trophies int
		var clanTag, clanName *string
		if err := rows.Scan(&tag, &name, &townhall, &clanTag, &clanName, &trophies); err != nil {
			return out
		}
		tag = serverNormalizeTag(tag)
		if tag == "" {
			continue
		}

		snapshot := serverPlayerSnapshot{}
		if name != "" {
			snapshot.Name = &name
		}
		snapshot.TownHall = &townhall
		snapshot.Trophies = &trophies
		if clanTag != nil {
			normalizedClanTag := serverNormalizeTag(*clanTag)
			if normalizedClanTag != "" {
				snapshot.ClanTag = &normalizedClanTag
			}
		}
		snapshot.ClanName = clanName

		out[tag] = snapshot
	}

	return out
}
