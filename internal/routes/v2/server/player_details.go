package server

import (
	"context"
	"encoding/json"

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
		SELECT p.player_tag, p.name, p.townhall_level, p.data, b.name
		FROM player_current_stats p
		LEFT JOIN basic_clan b ON b.tag = p.clan_tag
		WHERE p.player_tag = ANY($1)
	`, queryTags)
	if err != nil {
		return out
	}
	defer rows.Close()

	for rows.Next() {
		var tag, name string
		var townhall *int
		var raw []byte
		var basicClanName *string
		if err := rows.Scan(&tag, &name, &townhall, &raw, &basicClanName); err != nil {
			return out
		}
		tag = serverNormalizeTag(tag)
		if tag == "" {
			continue
		}
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		doc["tag"] = tag
		if name != "" {
			doc["name"] = name
		}
		if townhall != nil {
			doc["townhall"] = *townhall
			doc["town_hall"] = *townhall
		}

		snapshot := serverPlayerSnapshot{}
		if name := serverAsString(doc["name"]); name != "" {
			snapshot.Name = &name
		}
		rawTownHall := doc["town_hall"]
		if rawTownHall == nil {
			rawTownHall = doc["townhall"]
		}
		if townHall := asIntWithDefault(rawTownHall, -1); townHall >= 0 {
			snapshot.TownHall = &townHall
		}
		if trophies := asIntWithDefault(doc["trophies"], -1); trophies >= 0 {
			snapshot.Trophies = &trophies
		}

		clan := mapMaybe(doc["clan"])
		clanTag := serverNormalizeTag(serverAsString(clan["tag"]))
		if clanTag == "" {
			clanTag = serverNormalizeTag(serverAsString(doc["clan_tag"]))
		}
		if clanTag != "" {
			snapshot.ClanTag = &clanTag
		}
		clanName := serverAsString(clan["name"])
		if clanName == "" {
			clanName = serverAsString(doc["clan_name"])
		}
		if clanName == "" && basicClanName != nil {
			clanName = *basicClanName
		}
		if clanName != "" {
			snapshot.ClanName = &clanName
		}
		clanRole := serverAsString(clan["role"])
		if clanRole == "" {
			clanRole = serverAsString(doc["role"])
		}
		if clanRole != "" {
			snapshot.ClanRole = &clanRole
		}

		out[tag] = snapshot
	}

	return out
}
