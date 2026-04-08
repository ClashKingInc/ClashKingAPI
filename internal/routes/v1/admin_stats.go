package v1

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func proxyGet() fiber.Handler {
	return func(c *fiber.Ctx) error {
		url := strings.ReplaceAll(c.Params("*"), "#", "%23")
		url = strings.ReplaceAll(url, "!", "%23")
		resp, err := http.Get("https://proxy.clashk.ing/v1/" + url)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			return apptypes.Error(resp.StatusCode, string(body))
		}
		c.Type("json")
		return c.Send(body)
	}
}

func proxyPost() fiber.Handler {
	return func(c *fiber.Ctx) error {
		url := strings.ReplaceAll(c.Params("*"), "#", "%23")
		url = strings.ReplaceAll(url, "!", "%23")
		req, err := http.NewRequest(http.MethodPost, "https://proxy.clashk.ing/v1/"+url, bytes.NewReader(c.Body()))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			return apptypes.Error(resp.StatusCode, string(body))
		}
		c.Type("json")
		return c.Send(body)
	}
}

func botConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		botToken := c.Get("bot_token")
		if botToken == "" {
			botToken = c.Get("Bot-Token")
		}
		var configData bson.M
		err := a.Store.DB.Bot.Collection("settings").FindOne(c.UserContext(), bson.M{"type": "bot"}, options.FindOne().SetProjection(bson.M{"_id": 0})).Decode(&configData)
		if err != nil {
			return err
		}
		isMain := botToken == stringValue(configData["prod_token"])
		isBeta := slices.Contains(stringSlice(configData["beta_tokens"]), botToken)
		if !isMain && !isBeta {
			return apptypes.Error(http.StatusUnauthorized, "Invalid or missing token")
		}
		configData["is_main"] = isMain
		configData["is_beta"] = isBeta
		configData["is_custom"] = false
		return apptypes.JSON(c, http.StatusOK, configData)
	}
}

func permalink(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := fixTag(c.Params("clan_tag"))
		var imageLink string
		var clan bson.M
		_ = a.Store.C.BasicClan.FindOne(c.UserContext(), bson.M{"tag": clanTag}).Decode(&clan)
		if badge := nestedMap(clan["badgeUrls"]); badge != nil {
			imageLink = stringValue(badge["large"])
		}
		if imageLink == "" {
			liveClan, err := a.Clash.GetClan(c.UserContext(), clanTag)
			if err != nil || liveClan == nil || liveClan.Badge.Large == "" {
				return apptypes.Error(http.StatusNotFound, "Clan badge not found")
			}
			imageLink = liveClan.Badge.Large
		}
		resp, err := http.Get(imageLink)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		c.Set("Content-Type", "image/png")
		return c.Send(data)
	}
}

func ckBulkProxy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if c.Get("Authorization") != "Bearer "+a.Config.InternalAPIToken {
			return apptypes.Error(http.StatusUnauthorized, "Invalid token")
		}
		var urls []string
		if err := apptypes.DecodeJSON(c, &urls); err != nil {
			return err
		}
		results := make([]any, 0, len(urls))
		for _, raw := range urls {
			url := strings.ReplaceAll(raw, "#", "%23")
			resp, err := http.Get("https://proxy.clashk.ing/v1/" + url)
			if err != nil {
				continue
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				continue
			}
			var item any
			if json.Unmarshal(body, &item) == nil && item != nil {
				results = append(results, item)
			}
		}
		return apptypes.JSON(c, http.StatusOK, results)
	}
}

func serverSettingsLegacy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := strconv.ParseInt(c.Params("server_id"), 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		if err := verifyServerToken(c, a, serverID, false); err != nil {
			return err
		}
		pipeline := bson.A{
			bson.M{"$match": bson.M{"server": serverID}},
			bson.M{"$lookup": bson.M{"from": "legendleagueroles", "localField": "server", "foreignField": "server", "as": "eval.league_roles"}},
			bson.M{"$lookup": bson.M{"from": "evalignore", "localField": "server", "foreignField": "server", "as": "eval.ignored_roles"}},
			bson.M{"$lookup": bson.M{"from": "generalrole", "localField": "server", "foreignField": "server", "as": "eval.family_roles"}},
			bson.M{"$lookup": bson.M{"from": "linkrole", "localField": "server", "foreignField": "server", "as": "eval.not_family_roles"}},
			bson.M{"$lookup": bson.M{"from": "townhallroles", "localField": "server", "foreignField": "server", "as": "eval.townhall_roles"}},
			bson.M{"$lookup": bson.M{"from": "builderhallroles", "localField": "server", "foreignField": "server", "as": "eval.builderhall_roles"}},
			bson.M{"$lookup": bson.M{"from": "achievementroles", "localField": "server", "foreignField": "server", "as": "eval.achievement_roles"}},
			bson.M{"$lookup": bson.M{"from": "statusroles", "localField": "server", "foreignField": "server", "as": "eval.status_roles"}},
			bson.M{"$lookup": bson.M{"from": "builderleagueroles", "localField": "server", "foreignField": "server", "as": "eval.builder_league_roles"}},
			bson.M{"$lookup": bson.M{"from": "clans", "localField": "server", "foreignField": "server", "as": "clans"}},
		}
		cur, err := a.Store.C.ServerDB.Aggregate(c.UserContext(), pipeline)
		if err != nil {
			return err
		}
		var results []bson.M
		if err := cur.All(c.UserContext(), &results); err != nil {
			return err
		}
		if len(results) == 0 {
			return apptypes.Error(http.StatusNotFound, "Server Not Found")
		}
		return apptypes.JSON(c, http.StatusOK, sanitizeAny(results[0]))
	}
}

func guildLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{})
	}
}

func shortener(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		url := c.Query("url")
		if strings.TrimSpace(url) == "" {
			return apptypes.Error(http.StatusBadRequest, "url is required")
		}
		linkID := uuid.NewString()
		if _, err := a.Store.DB.ClashKing.Collection("short_links").InsertOne(c.UserContext(), bson.M{"_id": linkID, "url": url}); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"url": "https://api.clashk.ing/shortlink?id=" + linkID})
	}
}

func shortlink(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		linkID := c.Query("id")
		if linkID == "" {
			linkID = c.Query("link_id")
		}
		var result bson.M
		if err := a.Store.DB.ClashKing.Collection("short_links").FindOne(c.UserContext(), bson.M{"_id": linkID}).Decode(&result); err != nil {
			return apptypes.Error(http.StatusNotFound, "short link not found")
		}
		return c.Redirect(stringValue(result["url"]), http.StatusTemporaryRedirect)
	}
}

func discordLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var playerTags []string
		if err := apptypes.DecodeJSON(c, &playerTags); err != nil {
			return err
		}
		filtered := make([]string, 0, len(playerTags))
		for _, tag := range playerTags {
			filtered = append(filtered, fixTag(tag))
		}
		cur, err := a.Store.C.Links.Find(c.UserContext(), bson.M{"player_tag": bson.M{"$in": filtered}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		result := map[string]any{}
		for _, row := range rows {
			tag := stringValue(row["player_tag"])
			if tag == "" {
				continue
			}
			userID := stringValue(row["discord_user"])
			if userID == "" {
				userID = stringValue(row["user_id"])
			}
			result[tag] = userID
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

func donationsLegacy(a apptypes.Deps) fiber.Handler {
	return statsFromPlayerDocs(a, "donations", func(doc bson.M, season string) map[string]any {
		don := nestedMap(nestedMap(doc["donations"])[season])
		return map[string]any{
			"donations":         intValue(don["donated"]),
			"donationsReceived": intValue(don["received"]),
		}
	}, map[string]any{"donations": 0, "donationsReceived": 0})
}

func activityLegacy(a apptypes.Deps) fiber.Handler {
	return statsFromPlayerDocs(a, "activity", func(doc bson.M, season string) map[string]any {
		return map[string]any{
			"activity":    intValue(nestedMap(doc["activity"])[season]),
			"last_online": doc["last_online"],
		}
	}, map[string]any{"activity": 0})
}

func clanGamesLegacy(a apptypes.Deps) fiber.Handler {
	return statsFromPlayerDocs(a, "points", func(doc bson.M, season string) map[string]any {
		games := nestedMap(nestedMap(doc["clan_games"])[season])
		return map[string]any{
			"points": intValue(games["points"]),
		}
	}, map[string]any{"points": 0})
}

func capitalLegacy(a apptypes.Deps) fiber.Handler {
	return statsFromPlayerDocs(a, "raided", func(doc bson.M, season string) map[string]any {
		totalDonated := 0
		for _, v := range nestedMap(doc["capital_gold"]) {
			day := nestedMap(v)
			for _, amount := range asAnySlice(day["donate"]) {
				totalDonated += intValue(amount)
			}
		}
		return map[string]any{
			"donated": totalDonated,
			"raided":  0,
			"attacks": 0,
			"medals":  0,
		}
	}, map[string]any{"donated": 0, "raided": 0, "attacks": 0, "medals": 0})
}

func warStatsLegacy(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, names, err := scopedPlayerTags(c, a)
		if err != nil {
			return err
		}
		playerSet := map[string]bool{}
		for _, tag := range tags {
			playerSet[tag] = true
		}
		ctx := c.UserContext()
		cur, err := a.Store.C.ClanWars.Find(ctx, bson.M{}, options.Find().SetProjection(bson.M{"data": 1}))
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(ctx, &rows); err != nil {
			return err
		}
		items := []map[string]any{}
		for tag := range playerSet {
			attacks := 0
			stars := 0
			destruction := 0.0
			for _, row := range rows {
				data := nestedMap(row["data"])
				for _, sideKey := range []string{"clan", "opponent"} {
					side := nestedMap(data[sideKey])
					for _, member := range asMapSlice(side["members"]) {
						if stringValue(member["tag"]) != tag {
							continue
						}
						for _, attack := range asMapSlice(member["attacks"]) {
							attacks++
							stars += intValue(attack["stars"])
							destruction += floatValue(attack["destructionPercentage"])
						}
					}
				}
			}
			if attacks == 0 {
				continue
			}
			items = append(items, map[string]any{
				"name": names[tag],
				"tag":  tag,
				"hit_rates": []map[string]any{{
					"type":              "All",
					"value":             "All",
					"total_attacks":     attacks,
					"total_stars":       stars,
					"total_destruction": destruction,
					"three_stars":       0,
					"hitrate":           0,
				}},
				"defense_rates": []map[string]any{},
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "totals": map[string]any{}, "clan_totals": []any{}, "metadata": map[string]any{}})
	}
}

func statsFromPlayerDocs(a apptypes.Deps, defaultSort string, extractor func(bson.M, string) map[string]any, totalsSeed map[string]any) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags, names, err := scopedPlayerTags(c, a)
		if err != nil {
			return err
		}
		sortField := c.Query("sort_field", defaultSort)
		descending := c.Query("descending", "true") != "false"
		limit, _ := strconv.Atoi(c.Query("limit", "50"))
		if limit <= 0 {
			limit = 50
		}
		if limit > 500 {
			limit = 500
		}
		season := c.Query("season")
		if season == "" {
			if defaultSort == "points" {
				season = currentGamesSeason()
			} else {
				season = currentGamesSeason()
			}
		}
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}})
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return err
		}
		clanTotals := map[string]map[string]any{}
		items := make([]map[string]any, 0, len(docs))
		totals := cloneMap(totalsSeed)
		for _, doc := range docs {
			item := map[string]any{
				"name":     names[stringValue(doc["tag"])],
				"tag":      doc["tag"],
				"townhall": doc["townhall"],
				"clan_tag": doc["clan_tag"],
			}
			for k, v := range extractor(doc, season) {
				item[k] = v
				if _, ok := totals[k]; ok {
					totals[k] = intValue(totals[k]) + intValue(v)
				}
			}
			clanTag := stringValue(doc["clan_tag"])
			if clanTag != "" {
				if clanTotals[clanTag] == nil {
					clanTotals[clanTag] = map[string]any{"tag": clanTag}
				}
				for k, v := range extractor(doc, season) {
					clanTotals[clanTag][k] = intValue(clanTotals[clanTag][k]) + intValue(v)
				}
			}
			items = append(items, item)
		}
		sort.SliceStable(items, func(i, j int) bool {
			iv := floatValue(items[i][sortField])
			jv := floatValue(items[j][sortField])
			if descending {
				return iv > jv
			}
			return iv < jv
		})
		if len(items) > limit {
			items = items[:limit]
		}
		for i := range items {
			items[i]["rank"] = i + 1
		}
		byClan := make([]map[string]any, 0, len(clanTotals))
		for _, v := range clanTotals {
			byClan = append(byClan, v)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"items":       items,
			"totals":      totals,
			"clan_totals": byClan,
			"metadata": map[string]any{
				"sort_order": cond(descending, "descending", "ascending"),
				"sort_field": sortField,
				"season":     season,
			},
		})
	}
}

func scopedPlayerTags(c *fiber.Ctx, a apptypes.Deps) ([]string, map[string]string, error) {
	playerTags := collectQueryValues(c, "players")
	clans := collectQueryValues(c, "clans")
	serverRaw := c.Query("server")
	tagSet := map[string]bool{}
	names := map[string]string{}
	addFromClans := func(clanTags []string) error {
		cur, err := a.Store.C.BasicClan.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": clanTags}})
		if err != nil {
			return err
		}
		var clans []bson.M
		if err := cur.All(c.UserContext(), &clans); err != nil {
			return err
		}
		for _, clan := range clans {
			for _, member := range asMapSlice(clan["memberList"]) {
				tag := fixTag(stringValue(member["tag"]))
				tagSet[tag] = true
				names[tag] = stringValue(member["name"])
			}
		}
		return nil
	}
	for _, tag := range playerTags {
		tag = fixTag(tag)
		tagSet[tag] = true
	}
	if len(clans) > 0 {
		fixed := make([]string, 0, len(clans))
		for _, clan := range clans {
			fixed = append(fixed, fixTag(clan))
		}
		if err := addFromClans(fixed); err != nil {
			return nil, nil, err
		}
	}
	if serverRaw != "" {
		serverID, err := strconv.ParseInt(serverRaw, 10, 64)
		if err != nil {
			return nil, nil, apptypes.Error(http.StatusBadRequest, "invalid server")
		}
		cur, err := a.Store.DB.Usafam.Collection("clans").Find(c.UserContext(), bson.M{"server": serverID})
		if err != nil {
			return nil, nil, err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return nil, nil, err
		}
		serverClans := make([]string, 0, len(rows))
		for _, row := range rows {
			serverClans = append(serverClans, fixTag(stringValue(row["tag"])))
		}
		if err := addFromClans(serverClans); err != nil {
			return nil, nil, err
		}
	}
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	if len(tags) == 0 {
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{}, options.Find().SetProjection(bson.M{"tag": 1, "name": 1, "_id": 0}).SetLimit(200))
		if err != nil {
			return nil, nil, err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return nil, nil, err
		}
		for _, doc := range docs {
			tag := stringValue(doc["tag"])
			tags = append(tags, tag)
			names[tag] = stringValue(doc["name"])
		}
	}
	if len(names) < len(tags) {
		cur, err := a.Store.C.PlayerStats.Find(c.UserContext(), bson.M{"tag": bson.M{"$in": tags}}, options.Find().SetProjection(bson.M{"tag": 1, "name": 1, "_id": 0}))
		if err == nil {
			var docs []bson.M
			if cur.All(c.UserContext(), &docs) == nil {
				for _, doc := range docs {
					names[stringValue(doc["tag"])] = stringValue(doc["name"])
				}
			}
		}
	}
	return tags, names, nil
}

func verifyServerToken(c *fiber.Ctx, a apptypes.Deps, serverID int64, onlyAdmin bool) error {
	apiToken := c.Query("api_token")
	if apiToken == "" {
		return apptypes.Error(http.StatusForbidden, "API Token is required")
	}
	lookup := []int64{1103679645439754335}
	if !onlyAdmin {
		lookup = append(lookup, serverID)
	}
	cur, err := a.Store.C.ServerDB.Find(c.UserContext(), bson.M{"server": bson.M{"$in": lookup}})
	if err != nil {
		return err
	}
	var rows []bson.M
	if err := cur.All(c.UserContext(), &rows); err != nil {
		return err
	}
	for _, row := range rows {
		if stringValue(row["ck_api_token"]) == apiToken {
			return nil
		}
	}
	return apptypes.Error(http.StatusForbidden, "Invalid API token or cannot access this resource")
}

func stringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case bson.A:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			out = append(out, stringValue(item))
		}
		return out
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			out = append(out, stringValue(item))
		}
		return out
	default:
		return nil
	}
}

func asAnySlice(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	case bson.A:
		return []any(typed)
	default:
		return nil
	}
}

func floatValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	default:
		return 0
	}
}

func cond[T any](ok bool, a, b T) T {
	if ok {
		return a
	}
	return b
}

func sanitizeAny(value any) any {
	switch typed := value.(type) {
	case bson.M:
		out := map[string]any{}
		for k, v := range typed {
			if k == "_id" {
				continue
			}
			out[k] = sanitizeAny(v)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for k, v := range typed {
			if k == "_id" {
				continue
			}
			out[k] = sanitizeAny(v)
		}
		return out
	case bson.A:
		out := make([]any, 0, len(typed))
		for _, v := range typed {
			out = append(out, sanitizeAny(v))
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, v := range typed {
			out = append(out, sanitizeAny(v))
		}
		return out
	default:
		return typed
	}
}
