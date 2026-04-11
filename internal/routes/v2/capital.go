package v2

import (
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// playerStats godoc
// @Summary Get capital player statistics
// @Description Returns raid weekend player rows for the requested guild and clan tags.
// @Tags Capital Raids
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param clan_tags query []string false "Clan tags (defaults to all guild clans)"
// @Param season query string false "Season filter (YYYY-MM)"
// @Param limit query int false "Maximum number of rows"
// @Param offset query int false "Number of rows to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/capital/player-stats [get]
func playerStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		clanTags := capitalFixTags(apptypes.QueryValues(c, "clan_tags"))
		season := c.Query("season")
		limit := capitalParseIntDefault(c.Query("limit"), 100)
		offset := capitalParseIntDefault(c.Query("offset"), 0)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		var serverDoc bson.M
		if err := a.Store.C.ServerDB.FindOne(c.UserContext(), bson.M{"server": guildID}).Decode(&serverDoc); err != nil {
			if err == mongo.ErrNoDocuments {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		// Build the clan name map and fill clanTags if not provided.
		clanNameMap := make(map[string]string)
		{
			fillClanTags := len(clanTags) == 0
			clanFilter := bson.M{"server": guildID}
			if !fillClanTags {
				clanFilter["tag"] = bson.M{"$in": clanTags}
			}
			clanCur, err := a.Store.C.ClanDB.Find(c.UserContext(), clanFilter)
			if err == nil {
				var clanDocs []bson.M
				if err := clanCur.All(c.UserContext(), &clanDocs); err == nil {
					for _, clan := range clanDocs {
						tag, _ := clan["tag"].(string)
						name, _ := clan["name"].(string)
						if tag != "" {
							clanNameMap[tag] = name
							if fillClanTags {
								clanTags = append(clanTags, tag)
							}
						}
					}
				}
			}
		}

		if len(clanTags) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalPlayerStatsResponse{
				Season: season, Players: []modelsv2.CapitalPlayerItem{}, Limit: limit, Offset: offset,
			})
		}

		matchFilter := bson.M{"clan_tag": bson.M{"$in": clanTags}}
		if season != "" {
			matchFilter["data.startTime"] = bson.M{"$regex": strings.ReplaceAll(season, "-", "")}
		}

		// Count distinct players for total.
		totalCount := 0
		countPipeline := bson.A{
			bson.M{"$match": matchFilter},
			bson.M{"$unwind": "$data.members"},
			bson.M{"$group": bson.M{"_id": "$data.members.tag"}},
			bson.M{"$count": "total"},
		}
		if countCur, err := a.Store.C.RaidWeekendDB.Aggregate(c.UserContext(), countPipeline); err == nil {
			var countResult []bson.M
			if err := countCur.All(c.UserContext(), &countResult); err == nil && len(countResult) > 0 {
				totalCount = capitalAsInt(countResult[0]["total"])
			}
		}

		// Aggregate player stats grouped by player tag.
		pipeline := bson.A{
			bson.M{"$match": matchFilter},
			bson.M{"$unwind": "$data.members"},
			bson.M{"$group": bson.M{
				"_id":                       "$data.members.tag",
				"player_name":               bson.M{"$first": "$data.members.name"},
				"clan_tag":                  bson.M{"$first": "$clan_tag"},
				"total_attacks":             bson.M{"$sum": "$data.members.attacks"},
				"total_capital_gold_looted": bson.M{"$sum": "$data.members.capitalResourcesLooted"},
				"attack_logs":               bson.M{"$push": "$data.members.attackLog"},
			}},
			bson.M{"$sort": bson.M{"total_capital_gold_looted": -1}},
			bson.M{"$skip": offset},
			bson.M{"$limit": limit},
		}
		aggCur, err := a.Store.C.RaidWeekendDB.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var aggResults []bson.M
		if err := aggCur.All(c.UserContext(), &aggResults); err != nil {
			return err
		}

		rows := make([]modelsv2.CapitalPlayerItem, 0, len(aggResults))
		for _, result := range aggResults {
			pTag := capitalAsString(result["_id"])
			pName := capitalAsString(result["player_name"])
			ct := capitalAsString(result["clan_tag"])
			totalAttacks := capitalAsInt(result["total_attacks"])
			totalGold := capitalAsInt64(result["total_capital_gold_looted"])

			attacks := make([]modelsv2.RaidAttack, 0)
			totalDestruction := 0.0
			if attackLogsRaw, ok := result["attack_logs"].(bson.A); ok {
				for _, attackLogRaw := range attackLogsRaw {
					if attackLog, ok := attackLogRaw.(bson.A); ok {
						for _, atkRaw := range attackLog {
							if atk, ok := atkRaw.(bson.M); ok {
								d := capitalAsFloat64(atk["destructionPercent"])
								totalDestruction += d
								attacks = append(attacks, modelsv2.RaidAttack{
									AttackerTag:  pTag,
									AttackerName: pName,
									DefenderTag:  capitalAsString(atk["defenderTag"]),
									DefenderName: capitalAsString(atk["defenderName"]),
									Destruction:  d,
									Stars:        capitalAsInt(atk["stars"]),
								})
							}
						}
					}
				}
			}
			avgDestruction := 0.0
			if len(attacks) > 0 {
				avgDestruction = totalDestruction / float64(len(attacks))
			}
			rows = append(rows, modelsv2.CapitalPlayerItem{
				PlayerTag:              pTag,
				PlayerName:             pName,
				ClanTag:                ct,
				ClanName:               clanNameMap[ct],
				TotalAttacks:           totalAttacks,
				TotalCapitalGoldLooted: totalGold,
				TotalDestruction:       totalDestruction,
				AverageDestruction:     avgDestruction,
				Attacks:                attacks,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalPlayerStatsResponse{
			Season:     season,
			Players:    rows,
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
		})
	}
}

// guildLeaderboard godoc
// @Summary Get capital guild leaderboard
// @Description Returns a capital leaderboard for all clans attached to the requested guild.
// @Tags Capital Raids
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param season query string false "Season filter (YYYY-MM)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/capital/guild-leaderboard [get]
func guildLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		season := c.Query("season")
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		var serverDoc bson.M
		if err := a.Store.C.ServerDB.FindOne(c.UserContext(), bson.M{"server": guildID}).Decode(&serverDoc); err != nil {
			if err == mongo.ErrNoDocuments {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		clanCur, err := a.Store.C.ClanDB.Find(c.UserContext(), bson.M{"server": guildID})
		if err != nil {
			return err
		}
		var clans []bson.M
		if err := clanCur.All(c.UserContext(), &clans); err != nil {
			return err
		}
		if len(clans) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalLeaderboardResponse{
				GuildID: guildID, Season: season, Clans: []modelsv2.CapitalClanLeaderboardItem{}, TotalCount: 0,
			})
		}

		clanTags := make([]string, 0, len(clans))
		clanNameMap := make(map[string]string, len(clans))
		for _, clan := range clans {
			tag, _ := clan["tag"].(string)
			name, _ := clan["name"].(string)
			if tag != "" {
				clanTags = append(clanTags, tag)
				clanNameMap[tag] = name
			}
		}

		matchFilter := bson.M{"clan_tag": bson.M{"$in": clanTags}}
		if season != "" {
			matchFilter["data.startTime"] = bson.M{"$regex": strings.ReplaceAll(season, "-", "")}
		}

		pipeline := bson.A{
			bson.M{"$match": matchFilter},
			bson.M{"$group": bson.M{
				"_id":                       "$clan_tag",
				"total_raids":               bson.M{"$sum": 1},
				"total_capital_gold_looted": bson.M{"$sum": "$data.capitalTotalLoot"},
				"total_raid_medals":         bson.M{"$sum": "$data.totalRaidMedals"},
				"total_attacks":             bson.M{"$sum": "$data.totalAttacks"},
				"total_destruction":         bson.M{"$sum": "$data.destructionPercent"},
			}},
			bson.M{"$sort": bson.M{"total_capital_gold_looted": -1}},
		}
		aggCur, err := a.Store.C.RaidWeekendDB.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var aggResults []bson.M
		if err := aggCur.All(c.UserContext(), &aggResults); err != nil {
			return err
		}

		clanItems := make([]modelsv2.CapitalClanLeaderboardItem, 0, len(aggResults))
		for _, result := range aggResults {
			clanTag := capitalAsString(result["_id"])
			totalRaids := capitalAsInt(result["total_raids"])
			totalGold := capitalAsInt64(result["total_capital_gold_looted"])
			totalMedals := capitalAsInt64(result["total_raid_medals"])
			totalAttacks := capitalAsInt(result["total_attacks"])
			totalDestruction := capitalAsFloat64(result["total_destruction"])

			avgGold, avgMedals, avgDestruction := 0.0, 0.0, 0.0
			if totalRaids > 0 {
				avgGold = float64(totalGold) / float64(totalRaids)
				avgMedals = float64(totalMedals) / float64(totalRaids)
			}
			if totalAttacks > 0 {
				avgDestruction = totalDestruction / float64(totalAttacks)
			}
			clanItems = append(clanItems, modelsv2.CapitalClanLeaderboardItem{
				ClanTag:                   clanTag,
				ClanName:                  clanNameMap[clanTag],
				TotalRaids:                totalRaids,
				TotalCapitalGoldLooted:    totalGold,
				TotalRaidMedals:           totalMedals,
				AverageCapitalGoldPerRaid: avgGold,
				AverageRaidMedalsPerRaid:  avgMedals,
				TotalAttacks:              totalAttacks,
				AverageDestruction:        avgDestruction,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalLeaderboardResponse{
			GuildID:    guildID,
			Season:     season,
			Clans:      clanItems,
			TotalCount: len(clanItems),
		})
	}
}

func capitalParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func capitalFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(strings.ToUpper(tag))
		tag = strings.TrimPrefix(tag, "#")
		if tag != "" {
			out = append(out, "#"+tag)
		}
	}
	return out
}

func capitalAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func capitalAsInt(v any) int {
	switch x := v.(type) {
	case int32:
		return int(x)
	case int64:
		return int(x)
	case int:
		return x
	case float64:
		return int(x)
	}
	return 0
}

func capitalAsInt64(v any) int64 {
	switch x := v.(type) {
	case int32:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	}
	return 0
}

func capitalAsFloat64(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case int:
		return float64(x)
	}
	return 0
}

func asDocs(value any) []bson.M {
	switch rows := value.(type) {
	case []bson.M:
		return rows
	case bson.A:
		out := make([]bson.M, 0, len(rows))
		for _, row := range rows {
			if doc, ok := row.(bson.M); ok {
				out = append(out, doc)
			}
		}
		return out
	default:
		return nil
	}
}


