package server

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type serverPlayerSnapshot struct {
	Name     *string
	TownHall *int
	ClanTag  *string
	ClanName *string
	ClanRole *string
	Trophies *int
}

func fetchPlayerSnapshots(ctx context.Context, coll, clanColl *mongo.Collection, tags []string) map[string]serverPlayerSnapshot {
	out := map[string]serverPlayerSnapshot{}
	if coll == nil || len(tags) == 0 {
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

	cur, err := coll.Find(ctx, bson.M{"tag": bson.M{"$in": queryTags}},
		options.Find().SetProjection(bson.M{
			"_id":       0,
			"tag":       1,
			"name":      1,
			"town_hall": 1,
			"townhall":  1,
			"trophies":  1,
			"role":      1,
			"clan":      1,
			"clan_tag":  1,
			"clan_name": 1,
		}))
	if err != nil {
		return out
	}

	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return out
	}

	for _, doc := range docs {
		tag := serverNormalizeTag(serverAsString(doc["tag"]))
		if tag == "" {
			continue
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

	if clanColl == nil {
		return out
	}

	missingClanNameTags := make([]string, 0)
	missingClanNameSet := map[string]struct{}{}
	for _, snapshot := range out {
		if snapshot.ClanTag == nil || snapshot.ClanName != nil {
			continue
		}
		if _, seen := missingClanNameSet[*snapshot.ClanTag]; seen {
			continue
		}
		missingClanNameSet[*snapshot.ClanTag] = struct{}{}
		missingClanNameTags = append(missingClanNameTags, *snapshot.ClanTag)
	}
	if len(missingClanNameTags) == 0 {
		return out
	}

	clanCur, err := clanColl.Find(ctx, bson.M{"tag": bson.M{"$in": missingClanNameTags}},
		options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "name": 1}))
	if err != nil {
		return out
	}

	var clanDocs []bson.M
	if err := clanCur.All(ctx, &clanDocs); err != nil {
		return out
	}

	clanNameByTag := map[string]string{}
	for _, doc := range clanDocs {
		clanTag := serverNormalizeTag(serverAsString(doc["tag"]))
		clanName := serverAsString(doc["name"])
		if clanTag == "" || clanName == "" {
			continue
		}
		clanNameByTag[clanTag] = clanName
	}

	for tag, snapshot := range out {
		if snapshot.ClanTag == nil || snapshot.ClanName != nil {
			continue
		}
		clanName := clanNameByTag[*snapshot.ClanTag]
		if clanName == "" {
			continue
		}
		snapshot.ClanName = &clanName
		out[tag] = snapshot
	}

	return out
}
