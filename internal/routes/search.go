package routes

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

const (
	searchDefaultLimit = 25
	searchMaximumLimit = 200
	searchPITKeepAlive = "2m"
	searchCursorTTL    = 2 * time.Minute
)

var searchTagPattern = regexp.MustCompile(`^[PYLQGRJCUV0289]{3,15}$`)

// search_locations.json is a checked-in snapshot of the official Clash of
// Clans location catalog. Search enrichment must never make a Clash API call.
//
//go:embed search_locations.json
var searchLocationsJSON []byte

var searchLocationsCache struct {
	sync.Once
	items map[int]modelsv2.SearchLocation
}

type searchCursor struct {
	Version       int    `json:"v"`
	Entity        string `json:"entity"`
	PITID         string `json:"pit_id"`
	SearchAfter   []any  `json:"search_after"`
	RequestHash   string `json:"request_hash"`
	ExpiresAtUnix int64  `json:"expires_at"`
}

type elasticsearchPITResponse struct {
	ID string `json:"id"`
}

type elasticsearchSearchResponse struct {
	PITID string `json:"pit_id"`
	Hits  struct {
		Hits []elasticsearchHit `json:"hits"`
	} `json:"hits"`
}

type elasticsearchHit struct {
	Source json.RawMessage `json:"_source"`
	Sort   []any           `json:"sort"`
}

type elasticsearchClanSource struct {
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	ClanLevel   int    `json:"clan_level"`
	BadgeToken  string `json:"badge_token"`
	LocationID  int    `json:"location_id"`
	CWLLeagueID int    `json:"cwl_league_id"`
	MemberCount int    `json:"member_count"`
}

type elasticsearchPlayerSource struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	LeagueID      int    `json:"league_id"`
	ClanTag       string `json:"clan_tag"`
	TownhallLevel int    `json:"townhall_level"`
}

type elasticsearchMGetResponse struct {
	Docs []struct {
		ID     string                  `json:"_id"`
		Found  bool                    `json:"found"`
		Source elasticsearchClanSource `json:"_source"`
	} `json:"docs"`
}

// searchClans searches the stable clan Elasticsearch alias.
//
// @Summary Search clans
// @Description Finds clans by name or exact tag with comma-separated filters, range bounds, and cursor pagination.
// @Tags Clan
// @Produce json
// @Param query query string true "Clan name or exact tag" minlength(2) maxlength(100)
// @Param locationIds query []int false "Comma-separated location IDs" collectionFormat(csv)
// @Param warLeagueIds query []int false "Comma-separated war league IDs" collectionFormat(csv)
// @Param clanLevel[min] query int false "Minimum clan level" minimum(1)
// @Param clanLevel[max] query int false "Maximum clan level" minimum(1)
// @Param members[min] query int false "Minimum member count" minimum(0) maximum(50)
// @Param members[max] query int false "Maximum member count" minimum(0) maximum(50)
// @Param limit query int false "Maximum results to return" default(25) minimum(1) maximum(200)
// @Param cursor query string false "Cursor returned by the previous page"
// @Success 200 {object} modelsv2.SearchClanResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/search [get]
func searchClans(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		request, err := clanSearchQueryFromURL(c)
		if err != nil {
			return err
		}
		limit, err := normalizeClanSearchQuery(request)
		if err != nil {
			return err
		}
		if a.Search == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Elasticsearch is not configured")
		}
		fingerprint, err := searchRequestFingerprint("clan", request.Query, request.Filters)
		if err != nil {
			return err
		}
		hits, nextCursor, hasMore, err := executeSearchPage(c, a, "clan", a.Search.ClansAlias, request.Query, request.Filters, limit, request.Cursor, fingerprint)
		if err != nil {
			return err
		}

		references := newReferenceCatalog(a)
		locations := searchLocations()
		items := make([]modelsv2.SearchClanResult, 0, len(hits))
		for _, hit := range hits {
			var source elasticsearchClanSource
			if err := json.Unmarshal(hit.Source, &source); err != nil {
				return searchUpstreamError(err)
			}
			items = append(items, searchClanResult(source, references, locations))
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.SearchClanResponse{
			Items:      items,
			Pagination: modelsv2.SearchCursorPage{Limit: limit, HasMore: hasMore, NextCursor: nextCursor},
		})
	}
}

// searchPlayers searches the stable player Elasticsearch alias.
//
// @Summary Search players
// @Description Finds players by name or exact tag with comma-separated filters and cursor pagination.
// @Tags Player
// @Produce json
// @Param query query string true "Player name or exact tag" minlength(2) maxlength(100)
// @Param clanTags query []string false "Comma-separated clan tags" collectionFormat(csv)
// @Param leagueIds query []int false "Comma-separated league tier IDs" collectionFormat(csv)
// @Param townhallLevels query []int false "Comma-separated town hall levels" collectionFormat(csv)
// @Param limit query int false "Maximum results to return" default(25) minimum(1) maximum(200)
// @Param cursor query string false "Cursor returned by the previous page"
// @Success 200 {object} modelsv2.SearchPlayerResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/search [get]
func searchPlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		request, err := playerSearchQueryFromURL(c)
		if err != nil {
			return err
		}
		limit, err := normalizePlayerSearchQuery(request)
		if err != nil {
			return err
		}
		if a.Search == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Elasticsearch is not configured")
		}
		fingerprint, err := searchRequestFingerprint("player", request.Query, request.Filters)
		if err != nil {
			return err
		}
		hits, nextCursor, hasMore, err := executeSearchPage(c, a, "player", a.Search.PlayersAlias, request.Query, request.Filters, limit, request.Cursor, fingerprint)
		if err != nil {
			return err
		}

		players := make([]elasticsearchPlayerSource, 0, len(hits))
		clanTags := make([]string, 0, len(hits))
		seenClans := make(map[string]struct{}, len(hits))
		for _, hit := range hits {
			var source elasticsearchPlayerSource
			if err := json.Unmarshal(hit.Source, &source); err != nil {
				return searchUpstreamError(err)
			}
			players = append(players, source)
			if source.ClanTag != "" {
				tag := clashy.CorrectTag(source.ClanTag)
				if _, exists := seenClans[tag]; !exists {
					seenClans[tag] = struct{}{}
					clanTags = append(clanTags, tag)
				}
			}
		}
		clans, err := searchFetchClans(c, a, clanTags)
		if err != nil {
			return err
		}
		references := newReferenceCatalog(a)
		items := make([]modelsv2.SearchPlayerResult, 0, len(players))
		for _, player := range players {
			items = append(items, searchPlayerResult(player, clans, references))
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.SearchPlayerResponse{
			Items:      items,
			Pagination: modelsv2.SearchCursorPage{Limit: limit, HasMore: hasMore, NextCursor: nextCursor},
		})
	}
}

func clanSearchQueryFromURL(c *fiber.Ctx) (*modelsv2.SearchClanQuery, error) {
	locationIDs, err := searchQueryInts(c, "locationIds")
	if err != nil {
		return nil, err
	}
	warLeagueIDs, err := searchQueryInts(c, "warLeagueIds")
	if err != nil {
		return nil, err
	}
	clanLevel, err := searchQueryRange(c, "clanLevel")
	if err != nil {
		return nil, err
	}
	members, err := searchQueryRange(c, "members")
	if err != nil {
		return nil, err
	}
	limit, err := searchQueryOptionalInt(c, "limit")
	if err != nil {
		return nil, err
	}
	return &modelsv2.SearchClanQuery{
		Query: c.Query("query"),
		Filters: modelsv2.SearchClanFilters{
			LocationIDs: locationIDs, CWLLeagueIDs: warLeagueIDs,
			ClanLevel: clanLevel, Members: members,
		},
		Limit: limit, Cursor: strings.TrimSpace(c.Query("cursor")),
	}, nil
}

func playerSearchQueryFromURL(c *fiber.Ctx) (*modelsv2.SearchPlayerQuery, error) {
	leagueIDs, err := searchQueryInts(c, "leagueIds")
	if err != nil {
		return nil, err
	}
	townhallLevels, err := searchQueryInts(c, "townhallLevels")
	if err != nil {
		return nil, err
	}
	limit, err := searchQueryOptionalInt(c, "limit")
	if err != nil {
		return nil, err
	}
	return &modelsv2.SearchPlayerQuery{
		Query: c.Query("query"),
		Filters: modelsv2.SearchPlayerFilters{
			ClanTags: apptypes.QueryValues(c, "clanTags"), LeagueIDs: leagueIDs,
			TownhallLevels: townhallLevels,
		},
		Limit: limit, Cursor: strings.TrimSpace(c.Query("cursor")),
	}, nil
}

func searchQueryInts(c *fiber.Ctx, key string) ([]int, error) {
	values := apptypes.QueryValues(c, key)
	out := make([]int, 0, len(values))
	for _, raw := range values {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return nil, apptypes.Error(fiber.StatusBadRequest, key+" must contain comma-separated integers")
		}
		out = append(out, value)
	}
	return out, nil
}

func searchQueryRange(c *fiber.Ctx, key string) (*modelsv2.SearchIntegerRange, error) {
	minimum, hasMinimum, err := searchQueryBound(c, key+"[min]")
	if err != nil {
		return nil, err
	}
	maximum, hasMaximum, err := searchQueryBound(c, key+"[max]")
	if err != nil {
		return nil, err
	}
	if !hasMinimum && !hasMaximum {
		return nil, nil
	}
	rangeValue := &modelsv2.SearchIntegerRange{}
	if hasMinimum {
		rangeValue.Min = &minimum
	}
	if hasMaximum {
		rangeValue.Max = &maximum
	}
	return rangeValue, nil
}

func searchQueryOptionalInt(c *fiber.Ctx, key string) (int, error) {
	value, exists, err := searchQueryBound(c, key)
	if err != nil || !exists {
		return 0, err
	}
	return value, nil
}

func searchQueryBound(c *fiber.Ctx, key string) (int, bool, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, false, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, false, apptypes.Error(fiber.StatusBadRequest, key+" must be an integer")
	}
	return value, true, nil
}

func normalizeClanSearchQuery(request *modelsv2.SearchClanQuery) (int, error) {
	request.Query = strings.TrimSpace(request.Query)
	if len([]rune(request.Query)) < 2 || len([]rune(request.Query)) > 100 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "query must contain between 2 and 100 characters")
	}
	limit, err := normalizeSearchLimit(request.Limit)
	if err != nil {
		return 0, err
	}
	request.Limit = limit
	if len(request.Filters.LocationIDs) > 5 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "location_ids cannot contain more than 5 values")
	}
	if len(request.Filters.CWLLeagueIDs) > 5 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "cwl_league_ids cannot contain more than 5 values")
	}
	request.Filters.LocationIDs, err = normalizePositiveIDs(request.Filters.LocationIDs, "location_ids")
	if err != nil {
		return 0, err
	}
	request.Filters.CWLLeagueIDs, err = normalizePositiveIDs(request.Filters.CWLLeagueIDs, "cwl_league_ids")
	if err != nil {
		return 0, err
	}
	if err := validateSearchRange(request.Filters.ClanLevel, "clan_level", 1, 0); err != nil {
		return 0, err
	}
	if err := validateSearchRange(request.Filters.Members, "members", 0, 50); err != nil {
		return 0, err
	}
	return limit, nil
}

func normalizePlayerSearchQuery(request *modelsv2.SearchPlayerQuery) (int, error) {
	request.Query = strings.TrimSpace(request.Query)
	if len([]rune(request.Query)) < 2 || len([]rune(request.Query)) > 100 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "query must contain between 2 and 100 characters")
	}
	limit, err := normalizeSearchLimit(request.Limit)
	if err != nil {
		return 0, err
	}
	request.Limit = limit
	if len(request.Filters.ClanTags) > 100 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot contain more than 100 values")
	}
	if len(request.Filters.LeagueIDs) > 5 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "league_ids cannot contain more than 5 values")
	}
	if len(request.Filters.TownhallLevels) > 100 {
		return 0, apptypes.Error(fiber.StatusBadRequest, "townhall_levels cannot contain more than 100 values")
	}
	request.Filters.ClanTags, err = normalizeSearchTags(request.Filters.ClanTags)
	if err != nil {
		return 0, err
	}
	request.Filters.LeagueIDs, err = normalizePositiveIDs(request.Filters.LeagueIDs, "league_ids")
	if err != nil {
		return 0, err
	}
	request.Filters.TownhallLevels, err = normalizeBoundedIDs(request.Filters.TownhallLevels, "townhall_levels", 1, 100)
	if err != nil {
		return 0, err
	}
	return limit, nil
}

func normalizeSearchLimit(limit int) (int, error) {
	if limit == 0 {
		return searchDefaultLimit, nil
	}
	if limit < 1 || limit > searchMaximumLimit {
		return 0, apptypes.Error(fiber.StatusBadRequest, "limit must be between 1 and 200")
	}
	return limit, nil
}

func normalizePositiveIDs(values []int, field string) ([]int, error) {
	return normalizeBoundedIDs(values, field, 1, 0)
}

func normalizeBoundedIDs(values []int, field string, minimum, maximum int) ([]int, error) {
	seen := make(map[int]struct{}, len(values))
	out := make([]int, 0, len(values))
	for _, value := range values {
		if value < minimum || maximum > 0 && value > maximum {
			return nil, apptypes.Error(fiber.StatusBadRequest, field+" contains an unsupported value")
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Ints(out)
	return out, nil
}

func normalizeSearchTags(values []string) ([]string, error) {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, raw := range values {
		tag := clashy.CorrectTag(raw)
		trimmed := strings.TrimPrefix(tag, "#")
		if !searchTagPattern.MatchString(trimmed) {
			return nil, apptypes.Error(fiber.StatusBadRequest, "clan_tags contains an invalid tag")
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	sort.Strings(out)
	return out, nil
}

func validateSearchRange(value *modelsv2.SearchIntegerRange, field string, minimum, maximum int) error {
	if value == nil {
		return nil
	}
	for _, bound := range []*int{value.Min, value.Max} {
		if bound == nil {
			continue
		}
		if *bound < minimum || maximum > 0 && *bound > maximum {
			return apptypes.Error(fiber.StatusBadRequest, field+" contains an unsupported bound")
		}
	}
	if value.Min != nil && value.Max != nil && *value.Min > *value.Max {
		return apptypes.Error(fiber.StatusBadRequest, field+" minimum cannot exceed maximum")
	}
	return nil
}

func searchRequestFingerprint(entity, query string, filters any) (string, error) {
	raw, err := json.Marshal(struct {
		Entity  string `json:"entity"`
		Query   string `json:"query"`
		Filters any    `json:"filters"`
	}{Entity: entity, Query: query, Filters: filters})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func executeSearchPage(c *fiber.Ctx, a apptypes.Deps, entity, alias, query string, filters any, limit int, encodedCursor, fingerprint string) ([]elasticsearchHit, *string, bool, error) {
	pitID := ""
	var searchAfter []any
	if encodedCursor == "" {
		var pit elasticsearchPITResponse
		if err := a.Search.DoJSON(c.UserContext(), http.MethodPost, "/"+alias+"/_pit", url.Values{"keep_alive": {searchPITKeepAlive}}, nil, &pit); err != nil || pit.ID == "" {
			return nil, nil, false, searchUpstreamError(err)
		}
		pitID = pit.ID
	} else {
		cursor, err := decodeSearchCursor(encodedCursor, entity, fingerprint)
		if err != nil {
			return nil, nil, false, err
		}
		pitID = cursor.PITID
		searchAfter = cursor.SearchAfter
	}

	body := map[string]any{
		"size":             limit + 1,
		"track_total_hits": false,
		"pit":              map[string]any{"id": pitID, "keep_alive": searchPITKeepAlive},
		"query":            buildElasticsearchSearchQuery(query, filters),
		"sort":             []any{map[string]any{"_score": "desc"}, map[string]any{"tag": "asc"}},
	}
	if entity == "clan" {
		body["_source"] = []string{"tag", "name", "clan_level", "badge_token", "location_id", "cwl_league_id", "member_count"}
	} else {
		body["_source"] = []string{"tag", "name", "league_id", "clan_tag", "townhall_level"}
	}
	if len(searchAfter) > 0 {
		body["search_after"] = searchAfter
	}
	var result elasticsearchSearchResponse
	if err := a.Search.DoJSON(c.UserContext(), http.MethodPost, "/_search", nil, body, &result); err != nil {
		closeSearchPIT(c, a, pitID)
		return nil, nil, false, searchUpstreamError(err)
	}
	if result.PITID != "" {
		pitID = result.PITID
	}
	hasMore := len(result.Hits.Hits) > limit
	hits := result.Hits.Hits
	if hasMore {
		hits = hits[:limit]
	}
	if !hasMore || len(hits) == 0 {
		closeSearchPIT(c, a, pitID)
		return hits, nil, false, nil
	}
	lastSort := hits[len(hits)-1].Sort
	if len(lastSort) == 0 {
		closeSearchPIT(c, a, pitID)
		return nil, nil, false, searchUpstreamError(nil)
	}
	next, err := encodeSearchCursor(searchCursor{
		Version: 1, Entity: entity, PITID: pitID, SearchAfter: lastSort,
		RequestHash: fingerprint, ExpiresAtUnix: time.Now().Add(searchCursorTTL).Unix(),
	})
	if err != nil {
		closeSearchPIT(c, a, pitID)
		return nil, nil, false, err
	}
	return hits, &next, true, nil
}

func buildElasticsearchSearchQuery(query string, filters any) map[string]any {
	boolQuery := map[string]any{
		"should": []any{
			map[string]any{"match": map[string]any{"name": map[string]any{"query": query, "operator": "and"}}},
		},
		"minimum_should_match": 1,
	}
	if normalizedTag, ok := searchExactTag(query); ok {
		boolQuery["should"] = append(boolQuery["should"].([]any), map[string]any{
			"term": map[string]any{"tag": map[string]any{"value": strings.ToLower(normalizedTag), "boost": 100}},
		})
	}
	filterClauses := buildElasticsearchFilters(filters)
	if len(filterClauses) > 0 {
		boolQuery["filter"] = filterClauses
	}
	return map[string]any{"bool": boolQuery}
}

func buildElasticsearchFilters(filters any) []any {
	out := []any{}
	switch typed := filters.(type) {
	case modelsv2.SearchClanFilters:
		out = appendTermsFilter(out, "location_id", intsToAny(typed.LocationIDs))
		out = appendTermsFilter(out, "cwl_league_id", intsToAny(typed.CWLLeagueIDs))
		out = appendRangeFilter(out, "clan_level", typed.ClanLevel)
		out = appendRangeFilter(out, "member_count", typed.Members)
	case modelsv2.SearchPlayerFilters:
		clanTags := make([]any, 0, len(typed.ClanTags))
		for _, tag := range typed.ClanTags {
			clanTags = append(clanTags, strings.ToLower(tag))
		}
		out = appendTermsFilter(out, "clan_tag", clanTags)
		out = appendTermsFilter(out, "league_id", intsToAny(typed.LeagueIDs))
		out = appendTermsFilter(out, "townhall_level", intsToAny(typed.TownhallLevels))
	}
	return out
}

func appendTermsFilter(filters []any, field string, values []any) []any {
	if len(values) == 0 {
		return filters
	}
	return append(filters, map[string]any{"terms": map[string]any{field: values}})
}

func appendRangeFilter(filters []any, field string, value *modelsv2.SearchIntegerRange) []any {
	if value == nil || value.Min == nil && value.Max == nil {
		return filters
	}
	bounds := map[string]any{}
	if value.Min != nil {
		bounds["gte"] = *value.Min
	}
	if value.Max != nil {
		bounds["lte"] = *value.Max
	}
	return append(filters, map[string]any{"range": map[string]any{field: bounds}})
}

func intsToAny(values []int) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}

func searchExactTag(query string) (string, bool) {
	tag := clashy.CorrectTag(query)
	if !searchTagPattern.MatchString(strings.TrimPrefix(tag, "#")) {
		return "", false
	}
	return tag, true
}

func encodeSearchCursor(cursor searchCursor) (string, error) {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return apptypes.EncryptToString(string(raw)), nil
}

func decodeSearchCursor(value, entity, fingerprint string) (searchCursor, error) {
	plaintext, err := apptypes.DecryptString(value)
	if err != nil {
		return searchCursor{}, apptypes.Error(fiber.StatusBadRequest, "Invalid or expired search cursor")
	}
	var cursor searchCursor
	if err := json.Unmarshal([]byte(plaintext), &cursor); err != nil || cursor.Version != 1 || cursor.PITID == "" || len(cursor.SearchAfter) == 0 {
		return searchCursor{}, apptypes.Error(fiber.StatusBadRequest, "Invalid or expired search cursor")
	}
	if cursor.Entity != entity || cursor.RequestHash != fingerprint {
		return searchCursor{}, apptypes.Error(fiber.StatusBadRequest, "Search cursor does not match the query and filters")
	}
	if time.Now().Unix() >= cursor.ExpiresAtUnix {
		return searchCursor{}, apptypes.Error(fiber.StatusBadRequest, "Invalid or expired search cursor")
	}
	return cursor, nil
}

func closeSearchPIT(c *fiber.Ctx, a apptypes.Deps, pitID string) {
	if a.Search == nil || pitID == "" {
		return
	}
	_ = a.Search.DoJSON(c.UserContext(), http.MethodDelete, "/_pit", nil, map[string]any{"id": pitID}, nil)
}

func searchFetchClans(c *fiber.Ctx, a apptypes.Deps, tags []string) (map[string]elasticsearchClanSource, error) {
	if len(tags) == 0 {
		return map[string]elasticsearchClanSource{}, nil
	}
	var response elasticsearchMGetResponse
	body := map[string]any{"ids": tags}
	query := url.Values{"_source_includes": {"tag,name,clan_level,badge_token"}}
	if err := a.Search.DoJSON(c.UserContext(), http.MethodPost, "/"+a.Search.ClansAlias+"/_mget", query, body, &response); err != nil {
		return nil, searchUpstreamError(err)
	}
	out := make(map[string]elasticsearchClanSource, len(response.Docs))
	for _, doc := range response.Docs {
		if !doc.Found {
			continue
		}
		tag := doc.Source.Tag
		if tag == "" {
			tag = doc.ID
		}
		out[clashy.CorrectTag(tag)] = doc.Source
	}
	return out, nil
}

func searchClanResult(source elasticsearchClanSource, references referenceCatalog, locations map[int]modelsv2.SearchLocation) modelsv2.SearchClanResult {
	item := modelsv2.SearchClanResult{
		Name: source.Name, Tag: source.Tag, ClanLevel: source.ClanLevel,
		Members: source.MemberCount,
	}
	if source.BadgeToken != "" {
		item.Badge = badgeURL(source.BadgeToken, 512)
	}
	if location, ok := locations[source.LocationID]; ok {
		copy := location
		item.Location = &copy
	}
	if league := references.warLeague(source.CWLLeagueID); league != nil {
		item.WarLeague = &modelsv2.SearchLeagueReference{ID: league.ID, Name: league.Name}
	}
	return item
}

func searchPlayerResult(source elasticsearchPlayerSource, clans map[string]elasticsearchClanSource, references referenceCatalog) modelsv2.SearchPlayerResult {
	item := modelsv2.SearchPlayerResult{Name: source.Name, Tag: source.Tag, TownHallLevel: source.TownhallLevel}
	if league := references.leagueTier(source.LeagueID); league != nil {
		item.LeagueTier = &modelsv2.SearchLeagueReference{ID: league.ID, Name: league.Name}
	}
	if source.ClanTag == "" {
		return item
	}
	tag := clashy.CorrectTag(source.ClanTag)
	item.Clan = &modelsv2.SearchPlayerClan{Tag: tag}
	if clan, ok := clans[tag]; ok {
		item.Clan.Name = clan.Name
		item.Clan.ClanLevel = clan.ClanLevel
		if clan.BadgeToken != "" {
			item.Clan.Badge = badgeURL(clan.BadgeToken, 512)
		}
	}
	return item
}

func searchLocations() map[int]modelsv2.SearchLocation {
	searchLocationsCache.Do(func() {
		var items []modelsv2.SearchLocation
		if err := json.Unmarshal(searchLocationsJSON, &items); err != nil {
			searchLocationsCache.items = map[int]modelsv2.SearchLocation{}
			return
		}
		searchLocationsCache.items = make(map[int]modelsv2.SearchLocation, len(items))
		for _, item := range items {
			searchLocationsCache.items[item.ID] = item
		}
	})
	return searchLocationsCache.items
}

func searchUpstreamError(err error) error {
	if err != nil {
		apptypes.Logger().Error("elasticsearch_search_failed", "error", err)
	}
	return apptypes.Error(fiber.StatusServiceUnavailable, "Elasticsearch search is unavailable")
}
