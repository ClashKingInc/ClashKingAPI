package routes

import (
	"context"
	"regexp"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const playerTrophyHistoryColumns = `
	player_tag,
	player_name,
	exp_level,
	trophies,
	attack_wins,
	defense_wins,
	rank,
	previous_rank,
	clan_tag,
	clan_name,
	clan_badge_token,
	league_id
`

const playerBuilderBaseTrophyHistoryColumns = `
	player_tag,
	player_name,
	exp_level,
	builder_base_trophies,
	builder_base_battle_wins,
	rank,
	previous_rank,
	clan_tag,
	clan_name,
	clan_badge_token,
	league_id
`

const clanTrophyHistoryColumns = `
	clan_tag,
	clan_name,
	clan_badge_token,
	clan_level,
	clan_points,
	members,
	clan_location_id,
	rank,
	previous_rank
`

const clanBuilderBaseTrophyHistoryColumns = `
	clan_tag,
	clan_name,
	clan_badge_token,
	clan_level,
	builder_base_points,
	members,
	clan_location_id,
	rank,
	previous_rank
`

const clanCapitalHistoryColumns = `
	clan_tag,
	clan_name,
	clan_badge_token,
	clan_level,
	capital_points,
	members,
	clan_location_id,
	rank,
	previous_rank
`

const playerTrophyHistorySnapshotQuery = `
	SELECT ` + playerTrophyHistoryColumns + `
	FROM leaderboard_history_player_home
	WHERE location_id = $1 AND date = $2
	ORDER BY rank
`

const playerBuilderBaseTrophyHistorySnapshotQuery = `
	SELECT ` + playerBuilderBaseTrophyHistoryColumns + `
	FROM leaderboard_history_player_builder_base
	WHERE location_id = $1 AND date = $2
	ORDER BY rank
`

const clanTrophyHistorySnapshotQuery = `
	SELECT ` + clanTrophyHistoryColumns + `
	FROM leaderboard_history_clan_home
	WHERE location_id = $1 AND date = $2
	ORDER BY rank
`

const clanBuilderBaseTrophyHistorySnapshotQuery = `
	SELECT ` + clanBuilderBaseTrophyHistoryColumns + `
	FROM leaderboard_history_clan_builder_base
	WHERE location_id = $1 AND date = $2
	ORDER BY rank
`

const clanCapitalHistorySnapshotQuery = `
	SELECT ` + clanCapitalHistoryColumns + `
	FROM leaderboard_history_clan_capital
	WHERE location_id = $1 AND date = $2
	ORDER BY rank
`

const playerTrophyHistoryEntityQuery = `
	SELECT date, location_id, ` + playerTrophyHistoryColumns + `
	FROM leaderboard_history_player_home
	WHERE player_tag = $1
	ORDER BY date DESC, location_id, rank
`

const playerBuilderBaseTrophyHistoryEntityQuery = `
	SELECT date, location_id, ` + playerBuilderBaseTrophyHistoryColumns + `
	FROM leaderboard_history_player_builder_base
	WHERE player_tag = $1
	ORDER BY date DESC, location_id, rank
`

const clanTrophyHistoryEntityQuery = `
	SELECT date, location_id, ` + clanTrophyHistoryColumns + `
	FROM leaderboard_history_clan_home
	WHERE clan_tag = $1
	ORDER BY date DESC, location_id, rank
`

const clanBuilderBaseTrophyHistoryEntityQuery = `
	SELECT date, location_id, ` + clanBuilderBaseTrophyHistoryColumns + `
	FROM leaderboard_history_clan_builder_base
	WHERE clan_tag = $1
	ORDER BY date DESC, location_id, rank
`

const clanCapitalHistoryEntityQuery = `
	SELECT date, location_id, ` + clanCapitalHistoryColumns + `
	FROM leaderboard_history_clan_capital
	WHERE clan_tag = $1
	ORDER BY date DESC, location_id, rank
`

var leaderboardHistoryLocationPattern = regexp.MustCompile(`^(global|[0-9]+)$`)

var playerLeaderboardHistoryTypes = map[modelsv2.LeaderboardHistoryType]struct{}{
	modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:        {},
	modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies: {},
}

var clanLeaderboardHistoryTypes = map[modelsv2.LeaderboardHistoryType]struct{}{
	modelsv2.LeaderboardHistoryTypeClanHomePoints:        {},
	modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints: {},
	modelsv2.LeaderboardHistoryTypeClanCapitalPoints:     {},
}

type leaderboardHistoryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type leaderboardHistoryMetadata struct {
	homeLeagues    map[int]modelsv2.LeaderboardHistoryLeagueReference
	leagueTiers    map[int]modelsv2.LeaderboardHistoryLeagueReference
	builderLeagues map[int]modelsv2.LeaderboardHistoryLeagueReference
	locations      map[int]modelsv2.LeaderboardHistoryLocationReference
}

func parseLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType := modelsv2.LeaderboardHistoryType(raw)
	if _, ok := playerLeaderboardHistoryTypes[leaderboardType]; ok {
		return leaderboardType, true
	}
	if _, ok := clanLeaderboardHistoryTypes[leaderboardType]; ok {
		return leaderboardType, true
	}
	return "", false
}

func playerLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType, ok := parseLeaderboardHistoryType(raw)
	if !ok {
		return "", false
	}
	_, ok = playerLeaderboardHistoryTypes[leaderboardType]
	return leaderboardType, ok
}

func clanLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType, ok := parseLeaderboardHistoryType(raw)
	if !ok {
		return "", false
	}
	_, ok = clanLeaderboardHistoryTypes[leaderboardType]
	return leaderboardType, ok
}

func configuredLeaderboardHistoryDB(a apptypes.Deps) leaderboardHistoryDB {
	if a.Store == nil {
		return nil
	}
	return a.Store.SQL
}

func leaderboardHistoryMetadataFor(
	ctx context.Context,
	a apptypes.Deps,
	leaderboardType modelsv2.LeaderboardHistoryType,
) leaderboardHistoryMetadata {
	metadata := leaderboardHistoryMetadata{}
	if a.Clash == nil || a.Clash.Client() == nil {
		return metadata
	}

	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:
		metadata.leagueTiers = leaderboardHistoryStaticLeagues(a.Clash.StaticSection("league_tiers"))
		if leagues, err := a.Clash.Client().SearchLeagues(ctx, clashy.PageOptions{}); err == nil {
			metadata.homeLeagues = leaderboardHistoryOfficialLeagues(leagues)
		}
	case modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies:
		metadata.builderLeagues = leaderboardHistoryStaticLeagues(a.Clash.StaticSection("builder_leagues"))
	case modelsv2.LeaderboardHistoryTypeClanHomePoints,
		modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints,
		modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		locations, err := a.Clash.SearchLocations(ctx)
		if err != nil {
			return metadata
		}
		metadata.locations = make(map[int]modelsv2.LeaderboardHistoryLocationReference, len(locations))
		for _, location := range locations {
			metadata.locations[location.ID] = modelsv2.LeaderboardHistoryLocationReference{
				ID:            location.ID,
				Name:          location.Name,
				IsCountry:     location.IsCountry,
				CountryCode:   location.CountryCode,
				LocalizedName: location.Localised,
			}
		}
	}
	return metadata
}

func leaderboardHistoryStaticLeagues(items []map[string]any) map[int]modelsv2.LeaderboardHistoryLeagueReference {
	out := make(map[int]modelsv2.LeaderboardHistoryLeagueReference, len(items))
	for _, item := range items {
		id := legendStaticInt(item["_id"])
		if id <= 0 {
			continue
		}
		reference := modelsv2.LeaderboardHistoryLeagueReference{
			ID:   id,
			Name: staticDataAsString(item["name"]),
		}
		if iconURL := appItemIconURL(item); iconURL != "" {
			reference.IconURLs = &modelsv2.PublicIconURLs{
				Tiny: iconURL, Small: iconURL, Medium: iconURL, Large: iconURL,
			}
		}
		out[id] = reference
	}
	return out
}

func leaderboardHistoryOfficialLeagues(items []clashy.League) map[int]modelsv2.LeaderboardHistoryLeagueReference {
	out := make(map[int]modelsv2.LeaderboardHistoryLeagueReference, len(items))
	for _, item := range items {
		reference := modelsv2.LeaderboardHistoryLeagueReference{ID: item.ID, Name: item.Name}
		if item.Icon != nil {
			reference.IconURLs = &modelsv2.PublicIconURLs{
				Tiny: item.Icon.Tiny, Small: item.Icon.Small, Medium: item.Icon.Medium,
			}
		}
		out[item.ID] = reference
	}
	return out
}

// leaderboardSnapshotHistory godoc
// @Summary Get a historical leaderboard snapshot
// @Description Reconstructs one typed official leaderboard response from its canonical history table, ordered by rank.
// @Tags Leaderboard
// @Produce json
// @Param leaderboard_type path string true "Canonical leaderboard type" Enums(player_home_trophies,player_builder_base_trophies,clan_home_points,clan_builder_base_points,clan_capital_points)
// @Param location_id path string true "Global or official numeric location ID"
// @Param date path string true "Snapshot date YYYY-MM-DD"
// @Success 200 {object} modelsv2.LeaderboardSnapshotHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/history/{leaderboard_type}/{location_id}/{date} [get]
func leaderboardSnapshotHistory(a apptypes.Deps) fiber.Handler {
	return leaderboardSnapshotHistoryHandler(configuredLeaderboardHistoryDB(a), func(
		ctx context.Context,
		leaderboardType modelsv2.LeaderboardHistoryType,
	) leaderboardHistoryMetadata {
		return leaderboardHistoryMetadataFor(ctx, a, leaderboardType)
	})
}

func leaderboardSnapshotHistoryHandler(
	db leaderboardHistoryDB,
	metadataLoader ...func(context.Context, modelsv2.LeaderboardHistoryType) leaderboardHistoryMetadata,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		leaderboardType, ok := parseLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid leaderboard_type")
		}
		locationID := c.Params("location_id")
		if !leaderboardHistoryLocationPattern.MatchString(locationID) {
			return apptypes.Error(fiber.StatusBadRequest, "invalid location_id")
		}
		date, err := time.Parse("2006-01-02", c.Params("date"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid date")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		metadata := leaderboardHistoryMetadata{}
		if len(metadataLoader) != 0 && metadataLoader[0] != nil {
			metadata = metadataLoader[0](c.UserContext(), leaderboardType)
		}
		items, err := queryLeaderboardSnapshotHistory(c.UserContext(), db, metadata, leaderboardType, locationID, date)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.LeaderboardSnapshotHistoryResponse{
			Type:       leaderboardType,
			LocationID: locationID,
			Date:       date.Format("2006-01-02"),
			Items:      items,
		})
	}
}

// playerLeaderboardHistory godoc
// @Summary Get a player's leaderboard history
// @Description Returns typed dated placements for player Home Village or Builder Base leaderboards.
// @Tags Leaderboard
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param leaderboard_type path string true "Canonical player leaderboard type" Enums(player_home_trophies,player_builder_base_trophies)
// @Success 200 {object} modelsv2.PlayerLeaderboardHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/leaderboard-history/{leaderboard_type} [get]
func playerLeaderboardHistory(a apptypes.Deps) fiber.Handler {
	return playerLeaderboardHistoryHandler(configuredLeaderboardHistoryDB(a), func(
		ctx context.Context,
		leaderboardType modelsv2.LeaderboardHistoryType,
	) leaderboardHistoryMetadata {
		return leaderboardHistoryMetadataFor(ctx, a, leaderboardType)
	})
}

func playerLeaderboardHistoryHandler(
	db leaderboardHistoryDB,
	metadataLoader ...func(context.Context, modelsv2.LeaderboardHistoryType) leaderboardHistoryMetadata,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag")
		}
		leaderboardType, ok := playerLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player leaderboard_type")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		metadata := leaderboardHistoryMetadata{}
		if len(metadataLoader) != 0 && metadataLoader[0] != nil {
			metadata = metadataLoader[0](c.UserContext(), leaderboardType)
		}
		items, err := queryLeaderboardEntityHistory(c.UserContext(), db, metadata, leaderboardType, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerLeaderboardHistoryResponse{
			Type:      leaderboardType,
			PlayerTag: tag,
			Items:     items,
		})
	}
}

// clanLeaderboardHistory godoc
// @Summary Review a clan's leaderboard history
// @Description Returns dated clan placements and points for one required leaderboard type, with optional inclusive time bounds.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param type query string true "Leaderboard type" Enums(clan_home_points,clan_builder_base_points,clan_capital_points)
// @Param time[after] query string false "Only include snapshots at or after this ISO-8601 time"
// @Param time[before] query string false "Only include snapshots at or before this ISO-8601 time"
// @Param limit query int false "Maximum snapshots to return" default(50) minimum(1) maximum(250)
// @Success 200 {object} modelsv2.ClanLeaderboardHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/history/leaderboards [get]
func clanLeaderboardHistory(a apptypes.Deps) fiber.Handler {
	return clanLeaderboardHistoryHandler(configuredLeaderboardHistoryDB(a), func(
		ctx context.Context,
		leaderboardType modelsv2.LeaderboardHistoryType,
	) leaderboardHistoryMetadata {
		return leaderboardHistoryMetadataFor(ctx, a, leaderboardType)
	})
}

func clanLeaderboardHistoryHandler(
	db leaderboardHistoryDB,
	metadataLoader ...func(context.Context, modelsv2.LeaderboardHistoryType) leaderboardHistoryMetadata,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan_tag")
		}
		leaderboardType, ok := clanLeaderboardHistoryType(c.Query("type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid type")
		}
		after, before, err := v2TimeWindowFromQuery(c, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC())
		if err != nil {
			return err
		}
		limit, err := v2QueryInt(c, "limit", 50)
		if err != nil || limit < 1 || limit > 250 {
			return apptypes.Error(fiber.StatusBadRequest, "limit must be between 1 and 250")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		metadata := leaderboardHistoryMetadata{}
		if len(metadataLoader) != 0 && metadataLoader[0] != nil {
			metadata = metadataLoader[0](c.UserContext(), leaderboardType)
		}
		items, err := queryClanLeaderboardHistory(c.UserContext(), db, metadata, leaderboardType, tag, after, before, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanLeaderboardHistoryResponse{Items: items})
	}
}

// clanLeaderboardHistorySummary godoc
// @Summary Summarize a clan's leaderboard history
// @Description Returns selectable Clash seasons with exact history bounds and performance summaries for Home, Builder, or Capital leaderboards.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param type query string true "Leaderboard type" Enums(clan_home_points,clan_builder_base_points,clan_capital_points)
// @Success 200 {object} modelsv2.ClanLeaderboardHistorySummaryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/history/leaderboards/summary [get]
func clanLeaderboardHistorySummary(a apptypes.Deps) fiber.Handler {
	return clanLeaderboardHistorySummaryHandler(configuredLeaderboardHistoryDB(a))
}

func clanLeaderboardHistorySummaryHandler(db leaderboardHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan_tag")
		}
		leaderboardType, ok := clanLeaderboardHistoryType(c.Query("type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid type")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}

		response, err := queryClanLeaderboardHistorySummary(c.UserContext(), db, leaderboardType, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

func queryClanLeaderboardHistorySummary(
	ctx context.Context,
	db leaderboardHistoryDB,
	leaderboardType modelsv2.LeaderboardHistoryType,
	tag string,
) (modelsv2.ClanLeaderboardHistorySummaryResponse, error) {
	query := clanLeaderboardHistorySummaryQuery(leaderboardType)
	rows, err := db.Query(ctx, query, tag)
	if err != nil {
		return modelsv2.ClanLeaderboardHistorySummaryResponse{}, err
	}
	defer rows.Close()

	response := modelsv2.ClanLeaderboardHistorySummaryResponse{Seasons: []modelsv2.ClanLeaderboardSeasonSummary{}}
	bySeason := map[string]*modelsv2.ClanLeaderboardSeasonSummary{}
	seasonIndexes := map[string]int{}
	for rows.Next() {
		var date time.Time
		var bestRank, peakPoints int
		if err := rows.Scan(&date, &bestRank, &peakPoints); err != nil {
			return response, err
		}
		seasonID := clashy.GenSeasonDate(date)
		item := bySeason[seasonID]
		if item == nil {
			season, err := clashy.GetSeasonByID(seasonID)
			if err != nil {
				return response, err
			}
			item = &modelsv2.ClanLeaderboardSeasonSummary{
				Season: seasonID, After: leaderboardHistoryDateStart(season.StartTime), Before: leaderboardHistoryDateStart(season.EndTime).Add(-time.Nanosecond),
				BestRank: bestRank, PeakPoints: peakPoints,
			}
			bySeason[seasonID] = item
			seasonIndexes[seasonID] = len(response.Seasons)
			response.Seasons = append(response.Seasons, *item)
		}
		item.DaysInTop200++
		if bestRank < item.BestRank {
			item.BestRank = bestRank
		}
		if peakPoints > item.PeakPoints {
			item.PeakPoints = peakPoints
		}
		response.Seasons[seasonIndexes[seasonID]] = *item
	}
	return response, rows.Err()
}

func leaderboardHistoryDateStart(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func clanLeaderboardHistorySummaryQuery(leaderboardType modelsv2.LeaderboardHistoryType) string {
	var table, points string
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypeClanHomePoints:
		table, points = "leaderboard_history_clan_home", "clan_points"
	case modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints:
		table, points = "leaderboard_history_clan_builder_base", "builder_base_points"
	case modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		table, points = "leaderboard_history_clan_capital", "capital_points"
	default:
		return ""
	}
	return `SELECT date, MIN(rank), MAX(` + points + `)
		FROM ` + table + `
		WHERE clan_tag = $1
		GROUP BY date
		ORDER BY date DESC`
}

func queryClanLeaderboardHistory(
	ctx context.Context,
	db leaderboardHistoryDB,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	tag string,
	after, before time.Time,
	limit int,
) ([]modelsv2.ClanLeaderboardHistoryItem, error) {
	query := clanLeaderboardHistoryQuery(leaderboardType)
	rows, err := db.Query(ctx, query, tag, after, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.ClanLeaderboardHistoryItem{}
	for rows.Next() {
		var date time.Time
		var locationID string
		details, err := scanLeaderboardEntityHistoryItem(rows, metadata, leaderboardType, &date, &locationID)
		if err != nil {
			return nil, err
		}
		item := modelsv2.ClanLeaderboardHistoryItem{
			Date: date.Format("2006-01-02"), Rank: details.Rank,
			ClanPoints: details.ClanPoints, BuilderBasePoints: details.BuilderBasePoints,
			CapitalPoints: details.CapitalPoints, Location: details.Location,
		}
		if details.Members != nil {
			item.Members = *details.Members
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func clanLeaderboardHistoryQuery(leaderboardType modelsv2.LeaderboardHistoryType) string {
	var table, columns string
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypeClanHomePoints:
		table, columns = "leaderboard_history_clan_home", clanTrophyHistoryColumns
	case modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints:
		table, columns = "leaderboard_history_clan_builder_base", clanBuilderBaseTrophyHistoryColumns
	case modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		table, columns = "leaderboard_history_clan_capital", clanCapitalHistoryColumns
	default:
		return ""
	}
	return `SELECT date, location_id, ` + columns + `
		FROM ` + table + `
		WHERE clan_tag = $1 AND date >= $2 AND date <= $3
		ORDER BY date DESC, location_id, rank
		LIMIT $4`
}

func queryLeaderboardSnapshotHistory(
	ctx context.Context,
	db leaderboardHistoryDB,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	locationID string,
	date time.Time,
) ([]modelsv2.LeaderboardHistoryItem, error) {
	query := leaderboardHistorySnapshotQuery(leaderboardType)
	rows, err := db.Query(ctx, query, locationID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.LeaderboardHistoryItem{}
	for rows.Next() {
		item, err := scanLeaderboardHistoryItem(rows, metadata, leaderboardType)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func queryLeaderboardEntityHistory(
	ctx context.Context,
	db leaderboardHistoryDB,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	tag string,
) ([]modelsv2.LeaderboardEntityHistoryItem, error) {
	query := leaderboardHistoryEntityQuery(leaderboardType)
	rows, err := db.Query(ctx, query, tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.LeaderboardEntityHistoryItem{}
	for rows.Next() {
		var date time.Time
		var locationID string
		item, err := scanLeaderboardEntityHistoryItem(rows, metadata, leaderboardType, &date, &locationID)
		if err != nil {
			return nil, err
		}
		items = append(items, modelsv2.LeaderboardEntityHistoryItem{
			Date:       date.Format("2006-01-02"),
			LocationID: locationID,
			Name:       item.Name,
			Rank:       item.Rank,
			Details:    item,
		})
	}
	return items, rows.Err()
}

func leaderboardHistorySnapshotQuery(leaderboardType modelsv2.LeaderboardHistoryType) string {
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:
		return playerTrophyHistorySnapshotQuery
	case modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies:
		return playerBuilderBaseTrophyHistorySnapshotQuery
	case modelsv2.LeaderboardHistoryTypeClanHomePoints:
		return clanTrophyHistorySnapshotQuery
	case modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints:
		return clanBuilderBaseTrophyHistorySnapshotQuery
	case modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		return clanCapitalHistorySnapshotQuery
	default:
		return ""
	}
}

func leaderboardHistoryEntityQuery(leaderboardType modelsv2.LeaderboardHistoryType) string {
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:
		return playerTrophyHistoryEntityQuery
	case modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies:
		return playerBuilderBaseTrophyHistoryEntityQuery
	case modelsv2.LeaderboardHistoryTypeClanHomePoints:
		return clanTrophyHistoryEntityQuery
	case modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints:
		return clanBuilderBaseTrophyHistoryEntityQuery
	case modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		return clanCapitalHistoryEntityQuery
	default:
		return ""
	}
}

type leaderboardHistoryScanner interface {
	Scan(...any) error
}

func scanLeaderboardEntityHistoryItem(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	date *time.Time,
	locationID *string,
) (modelsv2.LeaderboardHistoryItem, error) {
	return scanLeaderboardHistoryItemWithPrefix(row, metadata, leaderboardType, []any{date, locationID})
}

func scanLeaderboardHistoryItem(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
) (modelsv2.LeaderboardHistoryItem, error) {
	return scanLeaderboardHistoryItemWithPrefix(row, metadata, leaderboardType, nil)
}

func scanLeaderboardHistoryItemWithPrefix(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	prefix []any,
) (modelsv2.LeaderboardHistoryItem, error) {
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:
		return scanPlayerTrophyHistoryItem(row, metadata, prefix)
	case modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies:
		return scanPlayerBuilderBaseTrophyHistoryItem(row, metadata, prefix)
	case modelsv2.LeaderboardHistoryTypeClanHomePoints,
		modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints,
		modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		return scanClanLeaderboardHistoryItem(row, metadata, leaderboardType, prefix)
	default:
		return modelsv2.LeaderboardHistoryItem{}, nil
	}
}

func scanPlayerTrophyHistoryItem(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	prefix []any,
) (modelsv2.LeaderboardHistoryItem, error) {
	var item modelsv2.LeaderboardHistoryItem
	var expLevel, trophies, attackWins, defenseWins int
	var clanTag, clanName, clanBadgeToken *string
	var leagueID *int
	destinations := append(prefix,
		&item.Tag, &item.Name, &expLevel, &trophies, &attackWins, &defenseWins,
		&item.Rank, &item.PreviousRank, &clanTag, &clanName, &clanBadgeToken, &leagueID,
	)
	if err := row.Scan(destinations...); err != nil {
		return modelsv2.LeaderboardHistoryItem{}, err
	}
	item.ExpLevel = &expLevel
	item.Trophies = &trophies
	item.AttackWins = &attackWins
	item.DefenseWins = &defenseWins
	item.Clan = leaderboardHistoryClanReference(clanTag, clanName, clanBadgeToken)
	if leagueID != nil {
		reference := modelsv2.LeaderboardHistoryLeagueReference{ID: *leagueID}
		switch {
		case *leagueID >= 105000000 && *leagueID < 106000000:
			if canonical, ok := metadata.leagueTiers[*leagueID]; ok {
				reference = canonical
			}
			item.LeagueTier = &reference
		case *leagueID >= 29000000 && *leagueID < 30000000:
			if canonical, ok := metadata.homeLeagues[*leagueID]; ok {
				reference = canonical
			}
			item.League = &reference
		}
	}
	return item, nil
}

func scanPlayerBuilderBaseTrophyHistoryItem(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	prefix []any,
) (modelsv2.LeaderboardHistoryItem, error) {
	var item modelsv2.LeaderboardHistoryItem
	var expLevel, trophies int
	var battleWins *int
	var clanTag, clanName, clanBadgeToken *string
	var leagueID *int
	destinations := append(prefix,
		&item.Tag, &item.Name, &expLevel, &trophies, &battleWins,
		&item.Rank, &item.PreviousRank, &clanTag, &clanName, &clanBadgeToken, &leagueID,
	)
	if err := row.Scan(destinations...); err != nil {
		return modelsv2.LeaderboardHistoryItem{}, err
	}
	item.ExpLevel = &expLevel
	item.BuilderBaseTrophies = &trophies
	item.BuilderBaseBattleWins = battleWins
	item.Clan = leaderboardHistoryClanReference(clanTag, clanName, clanBadgeToken)
	if leagueID != nil {
		reference := modelsv2.LeaderboardHistoryLeagueReference{ID: *leagueID}
		if canonical, ok := metadata.builderLeagues[*leagueID]; ok {
			reference = canonical
		}
		item.BuilderBaseLeague = &reference
	}
	return item, nil
}

func scanClanLeaderboardHistoryItem(
	row leaderboardHistoryScanner,
	metadata leaderboardHistoryMetadata,
	leaderboardType modelsv2.LeaderboardHistoryType,
	prefix []any,
) (modelsv2.LeaderboardHistoryItem, error) {
	var item modelsv2.LeaderboardHistoryItem
	var badgeToken string
	var clanLevel, points, members int
	var locationID *int
	destinations := append(prefix,
		&item.Tag, &item.Name, &badgeToken, &clanLevel, &points, &members,
		&locationID, &item.Rank, &item.PreviousRank,
	)
	if err := row.Scan(destinations...); err != nil {
		return modelsv2.LeaderboardHistoryItem{}, err
	}
	item.BadgeURLs = &modelsv2.PublicBadgeURLs{
		Small: badgeURL(badgeToken, 70), Medium: badgeURL(badgeToken, 200), Large: badgeURL(badgeToken, 512),
	}
	item.ClanLevel = &clanLevel
	item.Members = &members
	switch leaderboardType {
	case modelsv2.LeaderboardHistoryTypeClanHomePoints:
		item.ClanPoints = &points
	case modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints:
		item.BuilderBasePoints = &points
	case modelsv2.LeaderboardHistoryTypeClanCapitalPoints:
		item.CapitalPoints = &points
	}
	if locationID != nil {
		reference := modelsv2.LeaderboardHistoryLocationReference{ID: *locationID}
		if canonical, ok := metadata.locations[*locationID]; ok {
			reference = canonical
		}
		item.Location = &reference
	}
	return item, nil
}

func leaderboardHistoryClanReference(tag, name, badgeToken *string) *modelsv2.LeaderboardHistoryClanReference {
	if tag == nil || name == nil || badgeToken == nil {
		return nil
	}
	return &modelsv2.LeaderboardHistoryClanReference{
		Tag:  *tag,
		Name: *name,
		BadgeURLs: modelsv2.PublicBadgeURLs{
			Small: badgeURL(*badgeToken, 70), Medium: badgeURL(*badgeToken, 200), Large: badgeURL(*badgeToken, 512),
		},
	}
}
