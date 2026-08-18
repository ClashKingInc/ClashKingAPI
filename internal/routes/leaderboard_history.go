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
// @Summary Get a clan's leaderboard history
// @Description Returns typed dated placements for clan Home Village, Builder Base, or Capital leaderboards.
// @Tags Leaderboard
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param leaderboard_type path string true "Canonical clan leaderboard type" Enums(clan_home_points,clan_builder_base_points,clan_capital_points)
// @Success 200 {object} modelsv2.ClanLeaderboardHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/leaderboard-history/{leaderboard_type} [get]
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
		leaderboardType, ok := clanLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan leaderboard_type")
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
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanLeaderboardHistoryResponse{
			Type:    leaderboardType,
			ClanTag: tag,
			Items:   items,
		})
	}
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
