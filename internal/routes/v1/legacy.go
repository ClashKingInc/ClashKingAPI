package v1

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var staticDataPath = filepath.Join(".venv", "lib", "python3.13", "site-packages", "coc", "static", "static_data.json")
var translationsPath = filepath.Join(".venv", "lib", "python3.13", "site-packages", "coc", "static", "translations.json")
var superTroops = []string{
	"Super Barbarian", "Super Archer", "Super Giant", "Sneaky Goblin", "Super Wall Breaker",
	"Rocket Balloon", "Super Wizard", "Inferno Dragon", "Super Minion", "Super Valkyrie",
	"Super Witch", "Ice Hound", "Super Bowler", "Super Dragon", "Super Miner", "Super Hog Rider",
	"Druid", "Thrower",
}

func assets() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"download-link": "https://cdn.clashking.xyz/Out-Sprites.zip",
		})
	}
}

func jsonData() fiber.Handler {
	return func(c *fiber.Ctx) error {
		dataType := c.Params("data_type")
		if dataType == "list" {
			return apptypes.JSON(c, http.StatusOK, map[string]any{
				"types": []string{"troops", "heroes", "hero_equipment", "spells", "buildings", "pets", "supers", "townhalls", "translations"},
			})
		}
		if dataType == "translations" {
			return sendJSONFile(c, translationsPath)
		}

		data, err := loadStaticData()
		if err != nil {
			return err
		}
		switch dataType {
		case "hero_equipment":
			return apptypes.JSON(c, http.StatusOK, data["equipment"])
		case "supers":
			items := make([]map[string]any, 0)
			for _, item := range asMapSlice(data["troops"]) {
				name := stringValue(item["name"])
				for _, super := range superTroops {
					if name == super {
						items = append(items, item)
						break
					}
				}
			}
			return apptypes.JSON(c, http.StatusOK, items)
		case "townhalls":
			items := make([]map[string]any, 0)
			for _, item := range asMapSlice(data["buildings"]) {
				if stringValue(item["name"]) == "Town Hall" {
					items = append(items, item)
				}
			}
			return apptypes.JSON(c, http.StatusOK, items)
		default:
			if value, ok := data[dataType]; ok {
				return apptypes.JSON(c, http.StatusOK, value)
			}
		}
		return apptypes.Error(http.StatusNotFound, "data type not found")
	}
}

func builderBaseLeagues() fiber.Handler {
	return func(c *fiber.Ctx) error {
		data, err := loadStaticData()
		if err != nil {
			return err
		}
		items := asMapSlice(data["league_tiers"])
		results := make([]map[string]any, 0)
		for _, item := range items {
			name := stringValue(item["name"])
			if !strings.Contains(strings.ToLower(name), "wood") &&
				!strings.Contains(strings.ToLower(name), "clay") &&
				!strings.Contains(strings.ToLower(name), "stone") &&
				!strings.Contains(strings.ToLower(name), "copper") &&
				!strings.Contains(strings.ToLower(name), "brass") &&
				!strings.Contains(strings.ToLower(name), "iron") &&
				!strings.Contains(strings.ToLower(name), "steel") &&
				!strings.Contains(strings.ToLower(name), "titanium") &&
				!strings.Contains(strings.ToLower(name), "platinum") &&
				!strings.Contains(strings.ToLower(name), "emerald") &&
				!strings.Contains(strings.ToLower(name), "ruby") &&
				!strings.Contains(strings.ToLower(name), "diamond") {
				continue
			}
			copyItem := cloneMap(item)
			parts := strings.Fields(strings.ToLower(name))
			if len(parts) >= 2 {
				tier := 1
				if len(parts) == 3 {
					switch parts[2] {
					case "iv":
						tier = 4
					case "v":
						tier = 5
					default:
						tier = len(parts[2])
					}
				}
				copyItem["iconUrls"] = map[string]any{
					"medium": fmt.Sprintf("https://assets.clashk.ing/bot/builder-base-leagues/builder_base_%s_%s_%d.png", parts[0], parts[1], tier),
				}
			}
			results = append(results, copyItem)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

func listTownhalls(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var items []any
		if err := a.Store.C.BasicClan.Distinct(c.UserContext(), "memberList.townhall", bson.M{}).Decode(&items); err != nil {
			return err
		}
		out := make([]int, 0)
		for _, item := range items {
			value := intValue(item)
			if value != 0 {
				out = append(out, value)
			}
		}
		sort.Ints(out)
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

func listSeasons() fiber.Handler {
	return func(c *fiber.Ctx) error {
		last, _ := strconv.Atoi(c.Query("last", "12"))
		if last > 1000 {
			last = 1000
		}
		if last < 0 {
			last = 12
		}
		now := time.Now().UTC()
		results := make([]string, 0, last+1)
		for i := 0; i <= last; i++ {
			t := now.AddDate(0, -i, 0)
			results = append(results, fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month())))
		}
		return apptypes.JSON(c, http.StatusOK, results)
	}
}

func superTroopBoostRate(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startSeason := c.Query("start_season")
		endSeason := c.Query("end_season")
		start, end, err := parseSeasonWindow(startSeason, endSeason)
		if err != nil {
			return err
		}
		pipeline := bson.A{
			bson.M{"$match": bson.M{
				"$and": bson.A{
					bson.M{"type": bson.M{"$in": superTroops}},
					bson.M{"time": bson.M{"$gte": start.Unix()}},
					bson.M{"time": bson.M{"$lte": end.Unix()}},
				},
			}},
			bson.M{"$facet": bson.M{
				"grouped": bson.A{bson.M{"$group": bson.M{"_id": "$type", "boosts": bson.M{"$sum": 1}}}},
				"total":   bson.A{bson.M{"$count": "count"}},
			}},
			bson.M{"$unwind": "$grouped"},
			bson.M{"$unwind": "$total"},
			bson.M{"$set": bson.M{
				"usagePercent": bson.M{"$multiply": bson.A{bson.M{"$divide": bson.A{"$grouped.boosts", "$total.count"}}, 100}},
			}},
			bson.M{"$set": bson.M{"name": "$grouped._id", "boosts": "$grouped.boosts"}},
			bson.M{"$unset": bson.A{"grouped", "total"}},
		}
		cur, err := a.Store.C.PlayerHistory.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var out []bson.M
		if err := cur.All(c.UserContext(), &out); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

func globalCounts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		timerCounts, _ := a.Store.C.WarTimer.EstimatedDocumentCount(ctx)
		now := time.Now().UTC().Unix()
		warCounts, _ := a.Store.C.ClanWars.CountDocuments(ctx, bson.M{"endTime": bson.M{"$gte": float64(now)}})
		legendCount, _ := a.Store.C.LegendRankings.EstimatedDocumentCount(ctx)
		playerCount, _ := a.Store.C.PlayerStats.EstimatedDocumentCount(ctx)
		clanCount, _ := a.Store.C.BasicClan.EstimatedDocumentCount(ctx)
		warsStored, _ := a.Store.C.ClanWars.EstimatedDocumentCount(ctx)
		joinLeavesTotal, _ := a.Store.C.JoinLeaveHistory.EstimatedDocumentCount(ctx)
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"players_in_war":     timerCounts,
			"clans_in_war":       warCounts * 2,
			"total_join_leaves":  joinLeavesTotal,
			"players_in_legends": legendCount,
			"player_count":       playerCount,
			"clan_count":         clanCount,
			"wars_stored":        warsStored,
		})
	}
}

func legendsClan(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := fixTag(c.Params("clan_tag"))
		date := c.Params("date")
		ctx := c.UserContext()

		var clan bson.M
		err := a.Store.C.BasicClan.FindOne(ctx, bson.M{"tag": clanTag}, options.FindOne().SetProjection(bson.M{
			"_id": 0, "tag": 1, "name": 1, "members": 1, "memberList": 1, "level": 1, "location": 1,
		})).Decode(&clan)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Clan not found")
		}

		memberList := asMapSlice(clan["memberList"])
		tags := make([]string, 0, len(memberList))
		for _, member := range memberList {
			tags = append(tags, stringValue(member["tag"]))
		}
		cur, err := a.Store.C.PlayerStats.Find(ctx, bson.M{"tag": bson.M{"$in": tags}}, options.Find().SetProjection(bson.M{
			"name": 1, "townhall": 1, "legends": 1, "tag": 1, "_id": 0,
		}))
		if err != nil {
			return err
		}
		var stats []bson.M
		if err := cur.All(ctx, &stats); err != nil {
			return err
		}
		byTag := make(map[string]bson.M, len(stats))
		for _, stat := range stats {
			byTag[stringValue(stat["tag"])] = stat
		}
		filtered := make([]map[string]any, 0)
		for _, member := range memberList {
			if stringValue(member["league"]) != "Legend League" {
				continue
			}
			legendData := map[string]any{}
			if stat, ok := byTag[stringValue(member["tag"])]; ok {
				if legends, ok := stat["legends"].(bson.M); ok {
					if day, ok := legends[date].(bson.M); ok {
						legendData = cloneMap(day)
						delete(legendData, "attacks")
						delete(legendData, "defenses")
					}
				}
			}
			filtered = append(filtered, map[string]any{
				"name":     member["name"],
				"tag":      member["tag"],
				"league":   member["league"],
				"townhall": member["townhall"],
				"legends":  legendData,
			})
		}
		clan["memberList"] = filtered
		return apptypes.JSON(c, http.StatusOK, clan)
	}
}

func legendStreaks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit, _ := strconv.Atoi(c.Query("limit", "50"))
		if limit < 1 {
			limit = 50
		}
		if limit > 500 {
			limit = 500
		}
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{}, options.Find().
			SetProjection(bson.M{"name": 1, "tag": 1, "legends.streak": 1, "_id": 0}).
			SetSort(bson.M{"legends.streak": -1}).
			SetLimit(int64(limit)))
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		for i := range results {
			results[i]["rank"] = i + 1
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

func legendTrophyBuckets(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		pipeline := bson.A{
			bson.M{"$bucket": bson.M{
				"groupBy":    "$trophies",
				"boundaries": bson.A{4500, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000, 6100, 6200, 6300, 6400, 6500, 6600, 6700, 8500},
				"output":     bson.M{"count": bson.M{"$sum": 1}},
			}},
		}
		cur, err := a.Store.C.LegendRankings.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

func legendEOSWinners(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		cur, err := a.Store.C.LegendHistory.Find(c.UserContext(), bson.M{"rank": 1},
			options.Find().SetProjection(bson.M{"_id": 0}).SetSort(bson.M{"season": -1}))
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
	}
}

func liveLegendRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		topRanking, _ := strconv.Atoi(c.Query("top_ranking", "1"))
		lowerRanking, _ := strconv.Atoi(c.Query("lower_ranking", "200"))
		if abs((lowerRanking+1)-topRanking) >= 5000 {
			return apptypes.Error(http.StatusBadRequest, "Max 5000 rankings can be pulled at one time")
		}
		cur, err := a.Store.C.LegendRankings.Find(c.UserContext(),
			bson.M{"rank": bson.M{"$gte": topRanking, "$lte": lowerRanking}},
			options.Find().SetProjection(bson.M{"_id": 0}))
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, results)
	}
}

func liveLegendRankingByPlayer(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := fixTag(c.Params("player_tag"))
		var result bson.M
		err := a.Store.C.LegendRankings.FindOne(c.UserContext(), bson.M{"tag": playerTag},
			options.FindOne().SetProjection(bson.M{"_id": 0})).Decode(&result)
		if err != nil {
			if strings.Contains(err.Error(), "no documents") {
				return apptypes.JSON(c, http.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

func playerTrophiesRanking(a apptypes.Deps) fiber.Handler {
	return rankingByDate(a.Store.C.PlayerTrophies)
}

func playerBuilderRanking(a apptypes.Deps) fiber.Handler {
	return rankingByDate(a.Store.C.PlayerVersusTrophies)
}

func clanTrophiesRanking(a apptypes.Deps) fiber.Handler {
	return rankingByDate(a.Store.C.ClanTrophies)
}

func clanBuilderRanking(a apptypes.Deps) fiber.Handler {
	return rankingByDate(a.Store.C.ClanVersusTrophies)
}

func clanCapitalRanking(a apptypes.Deps) fiber.Handler {
	return rankingByDate(a.Store.C.CapitalTrophies)
}

func playerTodo(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		values := collectQueryValues(c, "player_tags")
		result := make([]map[string]any, 0, len(values))
		for _, value := range values {
			tag := fixTag(value)
			var player bson.M
			_ = a.Store.C.PlayerStats.FindOne(c.UserContext(), bson.M{"tag": tag}, options.FindOne().SetProjection(bson.M{
				"legends": 1, "clan_games": 1, "season_pass": 1, "last_online": 1, "clan_tag": 1, "_id": 0,
			})).Decode(&player)
			clanTag := stringValue(player["clan_tag"])
			raidData := map[string]any{}
			var raid bson.M
			if clanTag != "" {
				_ = a.Store.C.RaidWeekendDB.FindOne(c.UserContext(), bson.M{"clan_tag": clanTag, "data.members.tag": tag},
					options.FindOne().SetSort(bson.M{"data.endTime": -1})).Decode(&raid)
				if data, ok := raid["data"].(bson.M); ok {
					for _, member := range asMapSlice(data["members"]) {
						if stringValue(member["tag"]) == tag {
							raidData = map[string]any{
								"attacks_done": intValue(member["attackCount"]),
								"attack_limit": intValue(member["attackLimit"]) + intValue(member["bonusAttackLimit"]),
							}
							break
						}
					}
				}
			}
			warData := map[string]any{}
			var war bson.M
			if err := a.Store.C.WarTimer.FindOne(c.UserContext(), bson.M{"_id": tag}, options.FindOne().SetProjection(bson.M{"_id": 0})).Decode(&war); err == nil {
				warData = cloneMap(war)
			}
			result = append(result, map[string]any{
				"player_tag":   tag,
				"current_clan": clanTag,
				"legends":      nestedMap(player["legends"])[currentLegendDate()],
				"clan_games":   nestedMap(player["clan_games"])[currentGamesSeason()],
				"season_pass":  nestedMap(player["season_pass"])[currentGamesSeason()],
				"last_active":  player["last_online"],
				"raids":        raidData,
				"war":          warData,
				"cwl":          map[string]any{},
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": result})
	}
}

func playerFullSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		limit, _ := strconv.Atoi(c.Query("limit", "25"))
		if limit <= 0 {
			limit = 25
		}
		if limit > 1000 {
			limit = 1000
		}
		role := c.Query("role")
		league := c.Query("league")
		townhallRange := parseRange(c.Query("townhall"))
		expRange := parseRange(c.Query("exp"))
		trophiesRange := parseRange(c.Query("trophies"))
		donationsRange := parseRange(c.Query("donations"))
		re := regexp.MustCompile("(?i)" + regexp.QuoteMeta(name))

		cur, err := a.Store.C.BasicClan.Find(c.UserContext(), bson.M{"memberList.name": bson.M{"$regex": name, "$options": "i"}},
			options.Find().SetProjection(bson.M{"_id": 0, "name": 1, "tag": 1, "memberList": 1}))
		if err != nil {
			return err
		}
		var clans []bson.M
		if err := cur.All(c.UserContext(), &clans); err != nil {
			return err
		}
		items := make([]map[string]any, 0)
		for _, clan := range clans {
			for _, member := range asMapSlice(clan["memberList"]) {
				if !re.MatchString(stringValue(member["name"])) {
					continue
				}
				if role != "" && stringValue(member["role"]) != role {
					continue
				}
				if league != "" && stringValue(member["league"]) != league {
					continue
				}
				if !rangeOK(intValue(member["townhall"]), townhallRange) ||
					!rangeOK(intValue(member["expLevel"]), expRange) ||
					!rangeOK(intValue(member["trophies"]), trophiesRange) ||
					!rangeOK(intValue(member["donations"]), donationsRange) {
					continue
				}
				item := cloneMap(member)
				item["clan_name"] = clan["name"]
				item["clan_tag"] = clan["tag"]
				items = append(items, item)
				if len(items) >= limit {
					return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

func rankingByDate(collection *mongo.Collection) fiber.Handler {
	return func(c *fiber.Ctx) error {
		location := c.Params("location")
		date := c.Params("date")
		filter := bson.M{"$and": bson.A{
			bson.M{"location": location},
			bson.M{"date": date},
		}}
		var result bson.M
		err := collection.FindOne(c.UserContext(), filter).Decode(&result)
		if err != nil {
			if strings.Contains(err.Error(), "no documents") {
				return apptypes.JSON(c, http.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, http.StatusOK, result["data"])
	}
}

func collectQueryValues(c *fiber.Ctx, key string) []string {
	values := make([]string, 0)
	c.Context().QueryArgs().VisitAll(func(k, v []byte) {
		if string(k) == key {
			values = append(values, string(v))
		}
	})
	if len(values) == 0 {
		if raw := c.Query(key); raw != "" {
			for _, part := range strings.Split(raw, ",") {
				part = strings.TrimSpace(part)
				if part != "" {
					values = append(values, part)
				}
			}
		}
	}
	return values
}

func sendJSONFile(c *fiber.Ctx, path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return apptypes.Error(http.StatusNotFound, "file not found")
	}
	c.Type("json")
	return c.Send(content)
}

func loadStaticData() (map[string]any, error) {
	content, err := os.ReadFile(staticDataPath)
	if err != nil {
		return nil, apptypes.Error(http.StatusNotFound, "static data file not found")
	}
	var out map[string]any
	if err := json.Unmarshal(content, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func parseSeasonWindow(startSeason, endSeason string) (time.Time, time.Time, error) {
	if len(startSeason) != 7 || len(endSeason) != 7 {
		return time.Time{}, time.Time{}, apptypes.Error(http.StatusBadRequest, "invalid season format")
	}
	startYear, _ := strconv.Atoi(startSeason[:4])
	startMonth, _ := strconv.Atoi(startSeason[5:])
	endYear, _ := strconv.Atoi(endSeason[:4])
	endMonth, _ := strconv.Atoi(endSeason[5:])
	start := time.Date(startYear, time.Month(startMonth), 1, 5, 0, 0, 0, time.UTC).AddDate(0, -1, 0)
	end := time.Date(endYear, time.Month(endMonth), 1, 5, 0, 0, 0, time.UTC)
	return start, end, nil
}

func currentLegendDate() string {
	now := time.Now().UTC()
	if now.Hour() < 5 {
		now = now.AddDate(0, 0, -1)
	}
	return now.Format("2006-01-02")
}

func currentGamesSeason() string {
	now := time.Now().UTC()
	return fmt.Sprintf("%04d-%02d", now.Year(), int(now.Month()))
}

func parseRange(raw string) [2]int {
	if raw == "" {
		return [2]int{-1, -1}
	}
	parts := strings.SplitN(raw, ",", 2)
	if len(parts) != 2 {
		return [2]int{-1, -1}
	}
	a, errA := strconv.Atoi(parts[0])
	b, errB := strconv.Atoi(parts[1])
	if errA != nil || errB != nil {
		return [2]int{-1, -1}
	}
	return [2]int{a, b}
}

func rangeOK(value int, bounds [2]int) bool {
	if bounds[0] == -1 && bounds[1] == -1 {
		return true
	}
	return value >= bounds[0] && value <= bounds[1]
}

func asMapSlice(value any) []map[string]any {
	switch typed := value.(type) {
	case []map[string]any:
		return typed
	case bson.A:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if m, ok := item.(bson.M); ok {
				out = append(out, cloneMap(m))
			}
		}
		return out
	case []any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

func nestedMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case bson.M:
		return cloneMap(typed)
	default:
		return map[string]any{}
	}
}

func cloneMap(value any) map[string]any {
	out := map[string]any{}
	switch typed := value.(type) {
	case map[string]any:
		for k, v := range typed {
			out[k] = v
		}
	case bson.M:
		for k, v := range typed {
			out[k] = v
		}
	}
	return out
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
