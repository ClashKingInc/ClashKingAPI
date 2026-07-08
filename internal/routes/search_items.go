package routes

import (
	"encoding/json"
	"net/url"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

const recentSearchRetention = "90 days"

// listBookmarks returns saved bookmarks.
//
// @Summary List bookmarks
// @Description Returns saved search items.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param type query string true "player or clan" Enums(player, clan)
// @Success 200 {object} modelsv2.SearchBookmarkListResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Router /v2/links/{id}/bookmarks [get]
func listBookmarks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		entityType, err := searchEntityType(c.Query("type"))
		if err != nil {
			return err
		}
		items, err := sqlBookmarkItems(c, a, userID, entityType)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.SearchBookmarkListResponse{Items: items})
	}
}

// addBookmark saves a bookmark.
//
// @Summary Save bookmark
// @Description Saves a search item.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param body body modelsv2.SearchBookmarkRequest true "Bookmark payload"
// @Success 200 {object} modelsv2.SearchBookmarkItem
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Router /v2/links/{id}/bookmarks [post]
func addBookmark(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		var body modelsv2.SearchBookmarkRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		entityType, tag, err := bookmarkRequestTypeTag(body)
		if err != nil {
			return err
		}
		item, err := sqlAddBookmark(c, a, userID, entityType, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// deleteBookmark removes a bookmark.
//
// @Summary Delete bookmark
// @Description Deletes a saved search item.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param type path string true "player or clan" Enums(player, clan)
// @Param tag path string true "Tag"
// @Success 200 {object} modelsv2.AccountsMessageResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/links/{id}/bookmarks/{type}/{tag} [delete]
func deleteBookmark(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		entityType, err := searchEntityType(c.Params("type"))
		if err != nil {
			return err
		}
		tag := clashy.CorrectTag(decodeRouteTag(c.Params("tag")))
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		result, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM user_bookmarks
			WHERE user_id = $1 AND entity_type = $2 AND tag = $3
		`, userID, entityType, tag)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Bookmark not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsMessageResponse{Message: "Bookmark deleted"})
	}
}

// reorderBookmarks reorders bookmarks.
//
// @Summary Reorder bookmarks
// @Description Reorders saved search items.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Param body body modelsv2.SearchBookmarkOrderRequest true "Bookmark order"
// @Success 200 {object} modelsv2.AccountsMessageResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Router /v2/links/{id}/bookmarks/order [put]
func reorderBookmarks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		var body modelsv2.SearchBookmarkOrderRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		entityType, err := searchEntityType(body.Type)
		if err != nil {
			return err
		}
		if len(body.OrderedTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Ordered tags list cannot be empty")
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		tags := make([]string, 0, len(body.OrderedTags))
		for _, tag := range body.OrderedTags {
			tags = append(tags, clashy.CorrectTag(tag))
		}
		var count int
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT count(*)
			FROM user_bookmarks
			WHERE user_id = $1 AND entity_type = $2 AND tag = ANY($3)
		`, userID, entityType, tags).Scan(&count)
		if err != nil {
			return err
		}
		if count != len(tags) {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid bookmark tags provided")
		}
		for index, tag := range tags {
			if _, err := a.Store.SQL.Exec(c.UserContext(), `
				UPDATE user_bookmarks
				SET order_index = $1
				WHERE user_id = $2 AND entity_type = $3 AND tag = $4
			`, index, userID, entityType, tag); err != nil {
				return err
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AccountsMessageResponse{Message: "Bookmarks reordered"})
	}
}

// listRecentSearches returns recent searches grouped by entity type.
//
// @Summary List recent searches
// @Description Returns recent search items.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "user id"
// @Success 200 {object} modelsv2.SearchRecentGroupedResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Router /v2/links/{id}/searches [get]
func listRecentSearches(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := resolveLinkSubject(c.UserContext(), a, c, c.Params("id"))
		if err != nil {
			return err
		}
		players, err := sqlRecentPlayerItems(c, a, userID)
		if err != nil {
			return err
		}
		clans, err := sqlRecentClanItems(c, a, userID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.SearchRecentGroupedResponse{
			Players: players,
			Clans:   clans,
		})
	}
}

func sqlRecentPlayerItems(c *fiber.Ctx, a apptypes.Deps, userID string) ([]modelsv2.SearchRecentPlayerItem, error) {
	items, err := sqlRecentItems(c, a, userID, "player")
	if err != nil {
		return nil, err
	}
	out := make([]modelsv2.SearchRecentPlayerItem, 0, len(items))
	for _, item := range items {
		out = append(out, modelsv2.SearchRecentPlayerItem{
			Name:          item.Name,
			Tag:           item.Tag,
			TownHallLevel: item.TownHallLevel,
			Clan:          item.Clan,
			League:        item.League,
			CreatedAt:     item.CreatedAt,
		})
	}
	return out, nil
}

func sqlRecentClanItems(c *fiber.Ctx, a apptypes.Deps, userID string) ([]modelsv2.SearchRecentClanItem, error) {
	items, err := sqlRecentItems(c, a, userID, "clan")
	if err != nil {
		return nil, err
	}
	out := make([]modelsv2.SearchRecentClanItem, 0, len(items))
	for _, item := range items {
		out = append(out, modelsv2.SearchRecentClanItem{
			Name:      item.Name,
			Tag:       item.Tag,
			BadgeURLs: item.BadgeURLs,
			Members:   item.Members,
			CreatedAt: item.CreatedAt,
		})
	}
	return out, nil
}

func sqlBookmarkItems(c *fiber.Ctx, a apptypes.Deps, userID, entityType string) ([]modelsv2.SearchBookmarkItem, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT entity_type, tag, order_index, created_at
		FROM user_bookmarks
		WHERE user_id = $1 AND entity_type = $2
		ORDER BY order_index ASC, created_at ASC
	`, userID, entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []modelsv2.SearchBookmarkItem{}
	for rows.Next() {
		item, err := scanBookmarkItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func sqlAddBookmark(c *fiber.Ctx, a apptypes.Deps, userID, entityType, tag string) (modelsv2.SearchBookmarkItem, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.SearchBookmarkItem{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var orderIndex int
	if err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT count(*)
		FROM user_bookmarks
		WHERE user_id = $1 AND entity_type = $2
	`, userID, entityType).Scan(&orderIndex); err != nil {
		return modelsv2.SearchBookmarkItem{}, err
	}
	if _, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO user_bookmarks (user_id, entity_type, tag, order_index, created_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id, entity_type, tag) DO NOTHING
	`, userID, entityType, tag, orderIndex); err != nil {
		return modelsv2.SearchBookmarkItem{}, err
	}
	var item modelsv2.SearchBookmarkItem
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT entity_type, tag, order_index, created_at
		FROM user_bookmarks
		WHERE user_id = $1 AND entity_type = $2 AND tag = $3
	`, userID, entityType, tag)
	var err error
	item, err = scanBookmarkItem(row)
	return item, err
}

type recentSearchItem struct {
	Name          string
	Tag           string
	TownHallLevel int
	Clan          *modelsv2.SearchRecentClan
	League        *modelsv2.SearchRecentLeague
	BadgeURLs     *modelsv2.SearchRecentBadgeURLs
	Members       int
	CreatedAt     time.Time
}

func sqlRecentItems(c *fiber.Ctx, a apptypes.Deps, userID, entityType string) ([]recentSearchItem, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	if _, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM user_recent_searches
		WHERE created_at < now() - $1::interval
	`, recentSearchRetention); err != nil {
		return nil, err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT entity_type, tag, data, created_at
		FROM user_recent_searches
		WHERE user_id = $1 AND entity_type = $2
		ORDER BY created_at DESC
	`, userID, entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []recentSearchItem{}
	for rows.Next() {
		var entityType, tag string
		var raw []byte
		var createdAt time.Time
		if err := rows.Scan(&entityType, &tag, &raw, &createdAt); err != nil {
			return nil, err
		}
		item := recentItemFromData(entityType, tag, raw, createdAt)
		items = append(items, item)
	}
	return items, rows.Err()
}

func recordRecentSearchFromProxy(c *fiber.Ctx, a apptypes.Deps, pathAndQuery string, status int, responseBody []byte) {
	if status != fiber.StatusOK || a.Store == nil || a.Store.SQL == nil {
		return
	}
	userID := strings.TrimSpace(c.Get("x-ck-user-id"))
	if userID == "" {
		return
	}
	entityType, tag, ok := proxyRecentTarget(pathAndQuery)
	if !ok {
		return
	}
	data := recentSnapshotData(entityType, responseBody)
	if data == nil {
		return
	}
	_, _ = a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM user_recent_searches
		WHERE created_at < now() - $1::interval
	`, recentSearchRetention)
	_, _ = a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM user_recent_searches
		WHERE user_id = $1 AND entity_type = $2 AND tag = $3
	`, userID, entityType, tag)
	_, _ = a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO user_recent_searches (user_id, entity_type, tag, data, created_at)
		VALUES ($1, $2, $3, $4::jsonb, now())
	`, userID, entityType, tag, apptypes.Marshal(data))
}

func proxyRecentTarget(pathAndQuery string) (string, string, bool) {
	rawPath := pathAndQuery
	if parsed, err := url.Parse("/" + strings.TrimLeft(pathAndQuery, "/")); err == nil {
		rawPath = parsed.EscapedPath()
	}
	parts := strings.Split(strings.Trim(rawPath, "/"), "/")
	if len(parts) != 3 || parts[0] != "v1" {
		return "", "", false
	}
	var entityType string
	switch parts[1] {
	case "players":
		entityType = "player"
	case "clans":
		entityType = "clan"
	default:
		return "", "", false
	}
	tag, err := url.PathUnescape(parts[2])
	if err != nil {
		tag = parts[2]
	}
	return entityType, clashy.CorrectTag(tag), true
}

func recentSnapshotData(entityType string, responseBody []byte) map[string]any {
	doc := map[string]any{}
	if err := json.Unmarshal(responseBody, &doc); err != nil {
		return nil
	}
	switch entityType {
	case "player":
		return playerRecentSnapshot(doc)
	case "clan":
		return clanRecentSnapshot(doc)
	default:
		return nil
	}
}

func playerRecentSnapshot(doc map[string]any) map[string]any {
	out := map[string]any{}
	if name := strings.TrimSpace(accountsStringify(doc["name"])); name != "" {
		out["name"] = name
	}
	if townHall := int(asInt64(doc["townHallLevel"])); townHall > 0 {
		out["townHallLevel"] = townHall
	}
	if clan := compactMap(doc["clan"], map[string][]string{
		"":          {"tag", "name"},
		"badgeUrls": {"large"},
	}); len(clan) > 0 {
		out["clan"] = clan
	}
	if league := compactMap(doc["league"], map[string][]string{
		"":         {"id", "name"},
		"iconUrls": {"medium"},
	}); len(league) > 0 {
		out["league"] = league
	}
	return out
}

func clanRecentSnapshot(doc map[string]any) map[string]any {
	out := map[string]any{}
	if name := strings.TrimSpace(accountsStringify(doc["name"])); name != "" {
		out["name"] = name
	}
	if badgeURLs := compactMap(doc["badgeUrls"], map[string][]string{"": {"large"}}); len(badgeURLs) > 0 {
		out["badgeUrls"] = badgeURLs
	}
	if members := int(asInt64(doc["members"])); members > 0 {
		out["members"] = members
	}
	return out
}

func compactMap(value any, fields map[string][]string) map[string]any {
	source, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	out := map[string]any{}
	for key, names := range fields {
		if key == "" {
			for _, name := range names {
				if source[name] != nil {
					out[name] = source[name]
				}
			}
			continue
		}
		child := compactMap(source[key], map[string][]string{"": names})
		if len(child) > 0 {
			out[key] = child
		}
	}
	return out
}

func recentItemFromData(entityType, tag string, raw []byte, createdAt time.Time) recentSearchItem {
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	item := recentSearchItem{
		Tag:       tag,
		CreatedAt: createdAt,
	}
	item.Name = accountsStringify(data["name"])
	switch entityType {
	case "player":
		item.TownHallLevel = int(asInt64(data["townHallLevel"]))
		item.Clan = recentClanFromData(data["clan"])
		item.League = recentLeagueFromData(data["league"])
	case "clan":
		item.BadgeURLs = recentBadgeURLsFromData(data["badgeUrls"])
		item.Members = int(asInt64(data["members"]))
	}
	return item
}

func recentClanFromData(value any) *modelsv2.SearchRecentClan {
	data, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	clan := &modelsv2.SearchRecentClan{
		Tag:       accountsStringify(data["tag"]),
		Name:      accountsStringify(data["name"]),
		BadgeURLs: recentBadgeURLsFromData(data["badgeUrls"]),
	}
	if clan.Tag == "" && clan.Name == "" && clan.BadgeURLs == nil {
		return nil
	}
	return clan
}

func recentLeagueFromData(value any) *modelsv2.SearchRecentLeague {
	data, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	league := &modelsv2.SearchRecentLeague{
		ID:       int(asInt64(data["id"])),
		Name:     accountsStringify(data["name"]),
		IconURLs: recentLeagueIconURLsFromData(data["iconUrls"]),
	}
	if league.ID == 0 && league.Name == "" && league.IconURLs == nil {
		return nil
	}
	return league
}

func recentBadgeURLsFromData(value any) *modelsv2.SearchRecentBadgeURLs {
	data, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	badgeURLs := &modelsv2.SearchRecentBadgeURLs{Large: accountsStringify(data["large"])}
	if badgeURLs.Large == "" {
		return nil
	}
	return badgeURLs
}

func recentLeagueIconURLsFromData(value any) *modelsv2.SearchRecentLeagueIconURLs {
	data, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	iconURLs := &modelsv2.SearchRecentLeagueIconURLs{Medium: accountsStringify(data["medium"])}
	if iconURLs.Medium == "" {
		return nil
	}
	return iconURLs
}

type bookmarkScanner interface {
	Scan(dest ...any) error
}

func scanBookmarkItem(row bookmarkScanner) (modelsv2.SearchBookmarkItem, error) {
	var item modelsv2.SearchBookmarkItem
	if err := row.Scan(&item.Type, &item.Tag, &item.OrderIndex, &item.CreatedAt); err != nil {
		return item, err
	}
	if item.Type == "player" {
		item.PlayerTag = item.Tag
	} else {
		item.ClanTag = item.Tag
	}
	return item, nil
}

func bookmarkRequestTypeTag(body modelsv2.SearchBookmarkRequest) (string, string, error) {
	entityType, err := searchEntityType(body.Type)
	if err != nil {
		return "", "", err
	}
	tag := body.Tag
	if tag == "" && entityType == "player" {
		tag = body.PlayerTag
	}
	if tag == "" && entityType == "clan" {
		tag = body.ClanTag
	}
	tag = clashy.CorrectTag(tag)
	if tag == "" {
		return "", "", apptypes.Error(fiber.StatusBadRequest, "Tag is required")
	}
	return entityType, tag, nil
}

func searchEntityType(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "player":
		return "player", nil
	case "clan":
		return "clan", nil
	default:
		return "", apptypes.Error(fiber.StatusBadRequest, "Invalid search item type")
	}
}
