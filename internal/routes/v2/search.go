package v2

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
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

		_ = regexp.QuoteMeta(query)
		docs, err := searchBans(c, a, guildID, query)
		if err != nil {
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
		err = searchUpsertTag(c, a, userID, typeField, "bookmarked", tag)
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
		err = searchUpsertTag(c, a, userID, typeField, "recent", tag)
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

		count, err := searchGroupCount(c, a, userID, typeField, name)
		if err != nil {
			return err
		}
		if count > 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Group already exists")
		}

		// Generate a unique group ID
		groupID := strconv.FormatInt(time.Now().UnixNano(), 36) + strconv.FormatInt(userID, 36)

		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO search_groups (group_id, user_id, type, name, tags, created_at, updated_at)
			VALUES ($1, $2, $3, $4, '{}', now(), now())
		`, groupID, strconv.FormatInt(userID, 10), typeField, name); err != nil {
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
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE search_groups
			SET tags = (
				SELECT array_agg(DISTINCT value)
				FROM unnest(tags || $2::text[]) AS value
			), updated_at = now()
			WHERE group_id = $1
		`, groupID, []string{tag}); err != nil {
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
		if _, err := a.Store.SQL.Exec(c.UserContext(), `UPDATE search_groups SET tags = array_remove(tags, $2), updated_at = now() WHERE group_id = $1`, groupID, tag); err != nil {
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
		doc, err := searchGroup(c, a, groupID)
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
		groups, err := searchGroups(c, a, userID)
		if err != nil {
			return err
		}
		if groups == nil {
			groups = []map[string]any{}
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
		if _, err := a.Store.SQL.Exec(c.UserContext(), `DELETE FROM search_groups WHERE group_id = $1`, groupID); err != nil {
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
	searchData, err := searchUserSettings(c, a, userID)
	if err != nil {
		return nil, nil
	}
	clan, _ := searchData["clan"].(map[string]any)
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
	sqlQuery := `
		SELECT tag
		FROM server_clans
		WHERE server_id = $1
	`
	args := []any{strconv.FormatInt(guildID, 10)}
	if len(query) > 1 {
		sqlQuery += ` AND (name ILIKE $2 OR tag = $3)`
		args = append(args, "%"+query+"%", accountsNormalizeTag(query))
	}
	sqlQuery += ` ORDER BY name ASC LIMIT 25`
	rows, err := a.Store.SQL.Query(c.UserContext(), sqlQuery, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	tags := []string{}
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil
		}
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func searchFetchLocalClans(c *fiber.Ctx, a apptypes.Deps, tags []string) []map[string]any {
	if len(tags) == 0 {
		return nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, member_count, clan_level, data
		FROM basic_clan
		WHERE tag = ANY($1)
	`, tags)
	if err != nil {
		return nil
	}
	defer rows.Close()
	docs := []map[string]any{}
	for rows.Next() {
		var tag, name string
		var members, level int
		var raw []byte
		if err := rows.Scan(&tag, &name, &members, &level, &raw); err != nil {
			return nil
		}
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		doc["tag"] = tag
		doc["name"] = name
		doc["members"] = members
		doc["level"] = level
		docs = append(docs, doc)
	}
	return docs
}

func searchBuildClanFromDB(doc map[string]any, findType string) map[string]any {
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

func searchBans(c *fiber.Ctx, a apptypes.Deps, guildID int64, query string) ([]map[string]any, error) {
	sqlQuery := `
		SELECT player_tag, player_name
		FROM server_bans
		WHERE server_id = $1
	`
	args := []any{strconv.FormatInt(guildID, 10)}
	if query != "" {
		sqlQuery += ` AND player_name ILIKE $2`
		args = append(args, "%"+query+"%")
	}
	sqlQuery += ` ORDER BY player_name ASC LIMIT 25`
	rows, err := a.Store.SQL.Query(c.UserContext(), sqlQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, name string
		if err := rows.Scan(&tag, &name); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"VillageTag": tag, "VillageName": name})
	}
	return out, rows.Err()
}

func searchUserSettings(c *fiber.Ctx, a apptypes.Deps, userID int64) (map[string]any, error) {
	var raw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT search FROM user_settings WHERE user_id = $1`, strconv.FormatInt(userID, 10)).Scan(&raw)
	if err != nil {
		return map[string]any{}, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return out, nil
}

func searchSaveUserSettings(c *fiber.Ctx, a apptypes.Deps, userID int64, searchData map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO user_settings (user_id, search, updated_at)
		VALUES ($1, $2::jsonb, now())
		ON CONFLICT (user_id) DO UPDATE SET search = EXCLUDED.search, updated_at = now()
	`, strconv.FormatInt(userID, 10), apptypes.Marshal(searchData))
	return err
}

func searchUpsertTag(c *fiber.Ctx, a apptypes.Deps, userID int64, typeField, listName, tag string) error {
	searchData, _ := searchUserSettings(c, a, userID)
	typeData, _ := searchData[typeField].(map[string]any)
	if typeData == nil {
		typeData = map[string]any{}
	}
	current := searchExtractStringSlice(typeData[listName])
	next := []string{tag}
	for _, item := range current {
		if item != tag {
			next = append(next, item)
		}
		if len(next) == 20 {
			break
		}
	}
	typeData[listName] = next
	searchData[typeField] = typeData
	return searchSaveUserSettings(c, a, userID, searchData)
}

func searchGroupCount(c *fiber.Ctx, a apptypes.Deps, userID int64, groupType, name string) (int, error) {
	var count int
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT count(*) FROM search_groups WHERE user_id = $1 AND type = $2 AND name = $3
	`, strconv.FormatInt(userID, 10), groupType, name).Scan(&count)
	return count, err
}

func searchGroup(c *fiber.Ctx, a apptypes.Deps, groupID string) (map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT group_id, user_id, type, name, tags
		FROM search_groups
		WHERE group_id = $1
		LIMIT 1
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("group not found")
	}
	var userID, groupType, name string
	var tags []string
	if err := rows.Scan(&groupID, &userID, &groupType, &name, &tags); err != nil {
		return nil, err
	}
	return map[string]any{"group_id": groupID, "user_id": userID, "type": groupType, "name": name, "tags": tags}, nil
}

func searchGroups(c *fiber.Ctx, a apptypes.Deps, userID int64) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT group_id, user_id, type, name, tags
		FROM search_groups
		WHERE user_id = $1
		ORDER BY name ASC
	`, strconv.FormatInt(userID, 10))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := []map[string]any{}
	for rows.Next() {
		var groupID, rawUserID, groupType, name string
		var tags []string
		if err := rows.Scan(&groupID, &rawUserID, &groupType, &name, &tags); err != nil {
			return nil, err
		}
		groups = append(groups, map[string]any{"group_id": groupID, "user_id": rawUserID, "type": groupType, "name": name, "tags": tags})
	}
	return groups, rows.Err()
}
