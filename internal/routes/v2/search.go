package v2

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	searchTypeBookmarked = "bookmarked"
	searchTypeRecent     = "recent_search"
	searchTypeGuild      = "guild_search"
	searchTypeResult     = "search_result"
)

var searchTypeFieldMap = map[int64]string{0: "player", 1: "clan"}

// searchClan godoc
// @Summary Search for a clan by name or tag
// @Description Returns clans from recent searches, bookmarks, guild-linked clans, and CoC API.
// @Tags Search
// @Produce json
// @Param query query string false "Search query (clan name or tag)"
// @Param user_id query int false "Discord user ID for personalised results"
// @Param guild_id query int false "Discord guild ID for guild clan filtering"
// @Success 200 {object} map[string]interface{}
// @Router /v2/search/clan [get]
func searchClan(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		query := c.Query("query")
		userID, _ := strconv.ParseInt(c.Query("user_id"), 10, 64)
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)

		// Fetch user's bookmarks and recent searches
		recentTags, bookmarkedTags := searchFetchUserData(c, a, userID)

		// Fetch guild-linked clan tags
		guildTags := searchFetchGuildClans(c, a, guildID, query)

		// Combine all tags (deduplicated)
		allTagsSet := make(map[string]struct{})
		for _, t := range recentTags {
			allTagsSet[t] = struct{}{}
		}
		for _, t := range bookmarkedTags {
			allTagsSet[t] = struct{}{}
		}
		for _, t := range guildTags {
			allTagsSet[t] = struct{}{}
		}
		allTags := make([]string, 0, len(allTagsSet))
		for t := range allTagsSet {
			allTags = append(allTags, t)
		}

		// Fetch from local BasicClan DB
		localClans := searchFetchLocalClans(c, a, allTags)
		finalData := make([]map[string]any, 0, len(localClans)+5)
		foundTags := make(map[string]struct{}, len(localClans))

		for _, doc := range localClans {
			tag := searchGetString(doc, "tag")
			findType := searchDetermineType(tag, bookmarkedTags, recentTags)
			finalData = append(finalData, searchBuildClanFromDB(doc, findType))
			foundTags[tag] = struct{}{}
		}

		// Fetch remaining tags from CoC API
		for _, tag := range allTags {
			if _, exists := foundTags[tag]; exists {
				continue
			}
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || clan == nil {
				continue
			}
			findType := searchDetermineType(clan.Tag, bookmarkedTags, recentTags)
			finalData = append(finalData, map[string]any{
				"name":        clan.Name,
				"tag":         clan.Tag,
				"memberCount": len(clan.Members),
				"level":       0,
				"warLeague":   "Unknown",
				"type":        findType,
			})
			foundTags[clan.Tag] = struct{}{}
		}

		// Filter by query
		if query != "" {
			queryLower := strings.ToLower(query)
			filtered := finalData[:0]
			for _, clan := range finalData {
				name := strings.ToLower(searchGetString(clan, "name"))
				tag := strings.ToLower(searchGetString(clan, "tag"))
				if strings.Contains(name, queryLower) || tag == queryLower {
					filtered = append(filtered, clan)
				}
			}
			finalData = filtered
		}

		// Sort by type priority
		searchSortByType(finalData)

		// TODO: add CoC API name search results when SearchClans is available on ClashAdapter

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": finalData})
	}
}

// searchBannedPlayers godoc
// @Summary Search for banned players in a guild
// @Description Returns banned players matching the query in the given guild.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id path int true "Discord guild ID"
// @Param query query string false "Player name search query"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/{guild_id}/banned-players [get]
func searchBannedPlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, err := strconv.ParseInt(c.Params("guild_id"), 10, 64)
		if err != nil || guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid guild_id")
		}
		query := c.Query("query")

		var filter bson.M
		if query == "" {
			filter = bson.M{"server": guildID}
		} else {
			escaped := regexp.QuoteMeta(query)
			filter = bson.M{
				"$and": bson.A{
					bson.M{"server": guildID},
					bson.M{"VillageName": bson.M{"$regex": "(?i).*" + escaped + ".*"}},
				},
			}
		}

		cur, err := a.Store.C.Banlist.Find(c.UserContext(), filter, options.Find().SetLimit(25))
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return err
		}

		items := make([]map[string]any, 0, len(docs))
		for _, doc := range docs {
			name := "Missing"
			if v, ok := doc["VillageName"].(string); ok && v != "" {
				name = v
			}
			items = append(items, map[string]any{
				"tag":  searchGetString(doc, "VillageTag"),
				"name": name,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// bookmarkSearch godoc
// @Summary Add or update a bookmark for a user
// @Description Adds or moves the tag to the front of the user's bookmarks (limit 20).
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param user_id path int true "Discord user ID"
// @Param search_type path int true "Type (0=player, 1=clan)"
// @Param tag path string true "Tag to bookmark"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/bookmark/{user_id}/{search_type}/{tag} [post]
func bookmarkSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := strconv.ParseInt(c.Params("user_id"), 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid user_id")
		}
		searchType, _ := strconv.ParseInt(c.Params("search_type"), 10, 64)
		typeField := searchTypeFieldMap[searchType]
		if typeField == "" {
			typeField = "clan"
		}
		tag := accountsNormalizeTag(c.Params("tag"))
		ctx := c.UserContext()

		// Remove if already exists
		_, _ = a.Store.C.UserSettings.UpdateOne(ctx,
			bson.M{"discord_user": userID},
			bson.M{"$pull": bson.M{fmt.Sprintf("search.%s.bookmarked", typeField): tag}},
		)
		// Add to front with limit of 20
		_, err = a.Store.C.UserSettings.UpdateOne(ctx,
			bson.M{"discord_user": userID},
			bson.M{"$push": bson.M{
				fmt.Sprintf("search.%s.bookmarked", typeField): bson.M{
					"$each":     bson.A{tag},
					"$position": 0,
					"$slice":    20,
				},
			}},
			options.UpdateOne().SetUpsert(true),
		)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true})
	}
}

// recentSearch godoc
// @Summary Add a recent search for a user
// @Description Adds or moves the tag to the front of the user's recent searches (limit 20).
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param user_id path int true "Discord user ID"
// @Param search_type path int true "Type (0=player, 1=clan)"
// @Param tag path string true "Tag to add"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/recent/{user_id}/{search_type}/{tag} [post]
func recentSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := strconv.ParseInt(c.Params("user_id"), 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid user_id")
		}
		searchType, _ := strconv.ParseInt(c.Params("search_type"), 10, 64)
		typeField := searchTypeFieldMap[searchType]
		if typeField == "" {
			typeField = "clan"
		}
		tag := accountsNormalizeTag(c.Params("tag"))
		ctx := c.UserContext()

		// Remove if already exists
		_, _ = a.Store.C.UserSettings.UpdateOne(ctx,
			bson.M{"discord_user": userID},
			bson.M{"$pull": bson.M{fmt.Sprintf("search.%s.recent", typeField): tag}},
		)
		// Add to front with limit of 20
		_, err = a.Store.C.UserSettings.UpdateOne(ctx,
			bson.M{"discord_user": userID},
			bson.M{"$push": bson.M{
				fmt.Sprintf("search.%s.recent", typeField): bson.M{
					"$each":     bson.A{tag},
					"$position": 0,
					"$slice":    20,
				},
			}},
			options.UpdateOne().SetUpsert(true),
		)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true})
	}
}

// groupCreate godoc
// @Summary Create a player or clan group
// @Description Creates a new group for organising clans or players for a user.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param user_id path int true "Discord user ID"
// @Param name path string true "Group name"
// @Param search_type path int true "Type (0=player, 1=clan)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/create/{user_id}/{name}/{search_type} [post]
func groupCreate(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := strconv.ParseInt(c.Params("user_id"), 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid user_id")
		}
		name := c.Params("name")
		searchType, _ := strconv.ParseInt(c.Params("search_type"), 10, 64)
		typeField := searchTypeFieldMap[searchType]
		if typeField == "" {
			typeField = "clan"
		}

		// Check if group already exists
		count, err := a.Store.C.Groups.CountDocuments(c.UserContext(), bson.M{
			"$and": bson.A{
				bson.M{"user_id": userID},
				bson.M{"type": typeField},
				bson.M{"name": name},
			},
		})
		if err != nil {
			return err
		}
		if count > 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Group already exists")
		}

		// Generate a unique group ID
		groupID := strconv.FormatInt(time.Now().UnixNano(), 36) + strconv.FormatInt(userID, 36)

		if _, err := a.Store.C.Groups.InsertOne(c.UserContext(), bson.M{
			"group_id": groupID,
			"user_id":  userID,
			"type":     typeField,
			"name":     name,
			"tags":     bson.A{},
		}); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true, "group_id": groupID})
	}
}

// groupAdd godoc
// @Summary Add a tag to a group
// @Description Adds a clan or player tag to the specified group.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Param tag path string true "Tag to add"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/{group_id}/add/{tag} [post]
func groupAdd(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		groupID := c.Params("group_id")
		tag := accountsNormalizeTag(c.Params("tag"))
		if _, err := a.Store.C.Groups.UpdateOne(c.UserContext(),
			bson.M{"group_id": groupID},
			bson.M{"$addToSet": bson.M{"tags": tag}},
		); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true})
	}
}

// groupRemove godoc
// @Summary Remove a tag from a group
// @Description Removes a clan or player tag from the specified group.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Param tag path string true "Tag to remove"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/{group_id}/remove/{tag} [post]
func groupRemove(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		groupID := c.Params("group_id")
		tag := accountsNormalizeTag(c.Params("tag"))
		if _, err := a.Store.C.Groups.UpdateOne(c.UserContext(),
			bson.M{"group_id": groupID},
			bson.M{"$pull": bson.M{"tags": tag}},
		); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true})
	}
}

// groupGet godoc
// @Summary Get a specific group
// @Description Returns the group document for the given group ID.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/{group_id} [get]
func groupGet(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		groupID := c.Params("group_id")
		var doc bson.M
		err := a.Store.C.Groups.FindOne(c.UserContext(),
			bson.M{"group_id": groupID},
			options.FindOne().SetProjection(bson.M{"_id": 0}),
		).Decode(&doc)
		if err != nil {
			return apptypes.Error(fiber.StatusNotFound, "Group not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, doc)
	}
}

// groupList godoc
// @Summary List groups for a user
// @Description Returns all groups belonging to the given user.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param user_id path int true "Discord user ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/{user_id}/list [get]
func groupList(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := strconv.ParseInt(c.Params("user_id"), 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid user_id")
		}
		cur, err := a.Store.C.Groups.Find(c.UserContext(),
			bson.M{"user_id": userID},
			options.Find().SetProjection(bson.M{"_id": 0}),
		)
		if err != nil {
			return err
		}
		var groups []bson.M
		if err := cur.All(c.UserContext(), &groups); err != nil {
			return err
		}
		if groups == nil {
			groups = []bson.M{}
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": groups})
	}
}

// groupDelete godoc
// @Summary Delete a group
// @Description Deletes the group with the given group ID.
// @Tags Search
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/search/groups/{group_id} [delete]
func groupDelete(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		groupID := c.Params("group_id")
		if _, err := a.Store.C.Groups.DeleteOne(c.UserContext(), bson.M{"group_id": groupID}); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"success": true})
	}
}

// --- helpers ---

func searchFetchUserData(c *fiber.Ctx, a apptypes.Deps, userID int64) (recentTags, bookmarkedTags []string) {
	if userID == 0 {
		return nil, nil
	}
	var doc bson.M
	err := a.Store.C.UserSettings.FindOne(c.UserContext(),
		bson.M{"discord_user": userID},
		options.FindOne().SetProjection(bson.M{"search.clan": 1, "_id": 0}),
	).Decode(&doc)
	if err != nil {
		return nil, nil
	}
	search, _ := doc["search"].(bson.M)
	if search == nil {
		return nil, nil
	}
	clan, _ := search["clan"].(bson.M)
	if clan == nil {
		return nil, nil
	}
	recentTags = searchExtractStringSlice(clan["recent"])
	bookmarkedTags = searchExtractStringSlice(clan["bookmarked"])
	return
}

func searchFetchGuildClans(c *fiber.Ctx, a apptypes.Deps, guildID int64, query string) []string {
	if guildID == 0 {
		return nil
	}
	filter := bson.M{"server": guildID}
	opts := options.Find().SetSort(bson.M{"name": 1}).SetLimit(25)
	if len(query) > 1 {
		opts = options.Find().SetLimit(25)
	}
	cur, err := a.Store.C.ClanDB.Find(c.UserContext(), filter, opts)
	if err != nil {
		return nil
	}
	var docs []bson.M
	if err := cur.All(c.UserContext(), &docs); err != nil {
		return nil
	}
	tags := make([]string, 0, len(docs))
	for _, doc := range docs {
		if tag, ok := doc["tag"].(string); ok && tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func searchFetchLocalClans(c *fiber.Ctx, a apptypes.Deps, tags []string) []bson.M {
	if len(tags) == 0 {
		return nil
	}
	cur, err := a.Store.C.BasicClan.Find(c.UserContext(),
		bson.M{"tag": bson.M{"$in": tags}},
		options.Find().SetProjection(bson.M{"name": 1, "tag": 1, "members": 1, "level": 1, "warLeague": 1, "_id": 0}),
	)
	if err != nil {
		return nil
	}
	var docs []bson.M
	if err := cur.All(c.UserContext(), &docs); err != nil {
		return nil
	}
	return docs
}

func searchBuildClanFromDB(doc bson.M, findType string) map[string]any {
	memberCount := int(asInt64(doc["members"]))
	level := int(asInt64(doc["level"]))
	warLeague := "Unranked"
	if v, ok := doc["warLeague"].(string); ok && v != "" {
		warLeague = v
	}
	return map[string]any{
		"name":        searchGetString(doc, "name"),
		"tag":         searchGetString(doc, "tag"),
		"memberCount": memberCount,
		"level":       level,
		"warLeague":   warLeague,
		"type":        findType,
	}
}

func searchDetermineType(tag string, bookmarked, recent []string) string {
	for _, t := range bookmarked {
		if t == tag {
			return searchTypeBookmarked
		}
	}
	for _, t := range recent {
		if t == tag {
			return searchTypeRecent
		}
	}
	return searchTypeGuild
}

func searchSortByType(clans []map[string]any) {
	typeOrder := map[string]int{
		searchTypeRecent:     0,
		searchTypeBookmarked: 1,
		searchTypeGuild:      2,
		searchTypeResult:     3,
	}
	for i := 1; i < len(clans); i++ {
		for j := i; j > 0; j-- {
			a := typeOrder[searchGetString(clans[j-1], "type")]
			b := typeOrder[searchGetString(clans[j], "type")]
			if a > b {
				clans[j-1], clans[j] = clans[j], clans[j-1]
			} else {
				break
			}
		}
	}
}

func searchGetString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func searchExtractStringSlice(v any) []string {
	switch typed := v.(type) {
	case bson.A:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
