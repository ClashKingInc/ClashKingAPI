package routes

import (
	"context"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	legendHistoryDefaultLimit     = 25
	legendHistoryMaximumLimit     = 200
	clanLegendHistoryDefaultLimit = 50
	clanLegendHistoryMaximumLimit = 250
)

const legendHistoryColumns = `
	season,
	player_tag,
	player_name,
	exp_level,
	trophies,
	attack_wins,
	defense_wins,
	rank,
	clan_tag,
	clan_name,
	clan_badge_token,
	league_tier_id
`

const legendSeasonHistoryQuery = `
	SELECT ` + legendHistoryColumns + `
	FROM legend_history
	WHERE season = $1
	ORDER BY rank
	LIMIT $2
`

const legendPlayerHistoryQuery = `
	SELECT ` + legendHistoryColumns + `
	FROM legend_history
	WHERE player_tag = $1
	ORDER BY season DESC
`

const legendClanHistoryQuery = `
	SELECT season, player_tag, player_name, exp_level, trophies, attack_wins, defense_wins, rank
	FROM (
		SELECT *, CASE
			WHEN season ~ '^v2-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$'
			 AND pg_input_is_valid(substring(season FROM 4), 'timestamp with time zone')
				THEN substring(season FROM 4)::timestamptz
			WHEN season ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
				THEN (season || '-01')::timestamptz
			ELSE NULL
		END AS season_time
		FROM legend_history
		WHERE clan_tag = $1
	) AS history
	WHERE season_time >= $2 AND season_time <= $3
	ORDER BY season_time DESC, rank
	LIMIT $4
`

type legendHistoryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type legendLeagueTierLookup map[int]modelsv2.LegendHistoryLeagueTier

func configuredLegendHistoryDB(a apptypes.Deps) legendHistoryDB {
	if a.Store == nil {
		return nil
	}
	return a.Store.SQL
}

func parseLegendHistorySeason(raw string) (string, bool) {
	return raw, strings.TrimSpace(raw) != "" && len(raw) <= 128
}

func legendHistoryLimit(raw string) (int, bool) {
	return boundedLegendHistoryLimit(raw, legendHistoryDefaultLimit, legendHistoryMaximumLimit)
}

func clanLegendHistoryLimit(raw string) (int, bool) {
	return boundedLegendHistoryLimit(raw, clanLegendHistoryDefaultLimit, clanLegendHistoryMaximumLimit)
}

func boundedLegendHistoryLimit(raw string, defaultLimit, maximum int) (int, bool) {
	if raw == "" {
		return defaultLimit, true
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > maximum {
		return 0, false
	}
	return limit, true
}

func legendLeagueTiers(a apptypes.Deps) legendLeagueTierLookup {
	if a.Clash == nil || a.Clash.Client() == nil {
		return nil
	}
	return buildLegendLeagueTierLookup(a.Clash.StaticSection("league_tiers"))
}

func buildLegendLeagueTierLookup(items []map[string]any) legendLeagueTierLookup {
	lookup := make(legendLeagueTierLookup, len(items))
	for _, item := range items {
		id := legendStaticInt(item["_id"])
		if id <= 0 {
			continue
		}
		tier := modelsv2.LegendHistoryLeagueTier{
			ID:   id,
			Name: strings.TrimSpace(staticDataAsString(item["name"])),
		}
		if iconURL := appItemIconURL(item); iconURL != "" {
			tier.IconURLs = &modelsv2.PublicIconURLs{
				Tiny: iconURL, Small: iconURL, Medium: iconURL, Large: iconURL,
			}
		}
		lookup[id] = tier
	}
	return lookup
}

func legendStaticInt(value any) int {
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

// legendSeasonHistory godoc
// @Summary Get a final Legend season leaderboard
// @Description Returns the normalized final official Legend leaderboard for one season, ordered by rank.
// @Tags Leaderboard
// @Produce json
// @Param season path string true "Authoritative official Legend season ID"
// @Param limit query int false "Result limit" default(25) minimum(1) maximum(200)
// @Success 200 {object} modelsv2.LegendSeasonHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/legends/history/{season} [get]
func legendSeasonHistory(a apptypes.Deps) fiber.Handler {
	return legendSeasonHistoryHandler(configuredLegendHistoryDB(a), legendLeagueTiers(a))
}

func legendSeasonHistoryHandler(db legendHistoryDB, leagues legendLeagueTierLookup) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season, ok := parseLegendHistorySeason(c.Params("season"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid season")
		}
		limit, ok := legendHistoryLimit(c.Query("limit"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "limit must be between 1 and 200")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Legend history is unavailable")
		}
		items, err := queryLegendHistory(c.UserContext(), db, leagues, legendSeasonHistoryQuery, season, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.LegendSeasonHistoryResponse{Items: items})
	}
}

// playerLegendHistory godoc
// @Summary Get a player's final Legend history
// @Description Returns every normalized final Legend season placement for one player in descending season order.
// @Tags Leaderboard
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerLegendHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/legend-history [get]
func playerLegendHistory(a apptypes.Deps) fiber.Handler {
	return playerLegendHistoryHandler(configuredLegendHistoryDB(a), legendLeagueTiers(a))
}

func playerLegendHistoryHandler(db legendHistoryDB, leagues legendLeagueTierLookup) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Legend history is unavailable")
		}
		items, err := queryLegendHistory(c.UserContext(), db, leagues, legendPlayerHistoryQuery, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerLegendHistoryResponse{Items: items})
	}
}

// clanLegendHistory godoc
// @Summary Review a clan's final Legend finishers
// @Description Returns players who finished Legend seasons with the clan, ordered by newest season and then final rank.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param time[after] query string false "Only include seasons at or after this ISO-8601 time"
// @Param time[before] query string false "Only include seasons at or before this ISO-8601 time"
// @Param limit query int false "Maximum finishers to return" default(50) minimum(1) maximum(250)
// @Success 200 {object} modelsv2.ClanLegendHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/history/legends [get]
func clanLegendHistory(a apptypes.Deps) fiber.Handler {
	return clanLegendHistoryHandler(configuredLegendHistoryDB(a))
}

func clanLegendHistoryHandler(db legendHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan_tag")
		}
		limit, ok := clanLegendHistoryLimit(c.Query("limit"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "limit must be between 1 and 250")
		}
		after, before, err := v2TimeWindowFromQuery(c, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC())
		if err != nil {
			return err
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Legend history is unavailable")
		}
		items, err := queryClanLegendHistory(c.UserContext(), db, tag, after, before, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanLegendHistoryResponse{Items: items})
	}
}

func queryClanLegendHistory(ctx context.Context, db legendHistoryDB, tag string, after, before time.Time, limit int) ([]modelsv2.ClanLegendHistoryItem, error) {
	rows, err := db.Query(ctx, legendClanHistoryQuery, tag, after, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.ClanLegendHistoryItem{}
	for rows.Next() {
		var item modelsv2.ClanLegendHistoryItem
		if err := rows.Scan(&item.Season, &item.Tag, &item.Name, &item.ExpLevel, &item.Trophies, &item.AttackWins, &item.DefenseWins, &item.Rank); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func queryLegendHistory(
	ctx context.Context,
	db legendHistoryDB,
	leagues legendLeagueTierLookup,
	query string,
	args ...any,
) ([]modelsv2.LegendHistoryItem, error) {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.LegendHistoryItem{}
	for rows.Next() {
		item, err := scanLegendHistoryItem(rows, leagues)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type legendHistoryScanner interface {
	Scan(...any) error
}

func scanLegendHistoryItem(row legendHistoryScanner, leagues legendLeagueTierLookup) (modelsv2.LegendHistoryItem, error) {
	var item modelsv2.LegendHistoryItem
	var clanTag, clanName, clanBadgeToken *string
	var leagueTierID *int
	if err := row.Scan(
		&item.Season,
		&item.Tag,
		&item.Name,
		&item.ExpLevel,
		&item.Trophies,
		&item.AttackWins,
		&item.DefenseWins,
		&item.Rank,
		&clanTag,
		&clanName,
		&clanBadgeToken,
		&leagueTierID,
	); err != nil {
		return modelsv2.LegendHistoryItem{}, err
	}
	if clanTag != nil || clanName != nil || clanBadgeToken != nil {
		item.Clan = &modelsv2.LegendHistoryClan{}
		if clanTag != nil {
			item.Clan.Tag = *clanTag
		}
		if clanName != nil {
			item.Clan.Name = *clanName
		}
		if clanBadgeToken != nil && *clanBadgeToken != "" {
			item.Clan.BadgeURLs = &modelsv2.PublicBadgeURLs{
				Small: badgeURL(*clanBadgeToken, 70), Medium: badgeURL(*clanBadgeToken, 200), Large: badgeURL(*clanBadgeToken, 512),
			}
		}
	}
	if leagueTierID != nil {
		tier := modelsv2.LegendHistoryLeagueTier{ID: *leagueTierID}
		if canonical, ok := leagues[*leagueTierID]; ok {
			tier = canonical
		}
		item.LeagueTier = &tier
	}
	return item, nil
}

func legendHistoryItemMap(item modelsv2.LegendHistoryItem) map[string]any {
	out := map[string]any{
		"season": item.Season, "tag": item.Tag, "name": item.Name,
		"expLevel": item.ExpLevel, "trophies": item.Trophies,
		"attackWins": item.AttackWins, "defenseWins": item.DefenseWins, "rank": item.Rank,
	}
	if item.Clan != nil {
		clan := map[string]any{}
		if item.Clan.Tag != "" {
			clan["tag"] = item.Clan.Tag
		}
		if item.Clan.Name != "" {
			clan["name"] = item.Clan.Name
		}
		if item.Clan.BadgeURLs != nil {
			clan["badgeUrls"] = map[string]any{
				"small": item.Clan.BadgeURLs.Small, "medium": item.Clan.BadgeURLs.Medium, "large": item.Clan.BadgeURLs.Large,
			}
		}
		out["clan"] = clan
	}
	if item.LeagueTier != nil {
		tier := map[string]any{"id": item.LeagueTier.ID}
		if item.LeagueTier.Name != "" {
			tier["name"] = item.LeagueTier.Name
		}
		if item.LeagueTier.IconURLs != nil {
			tier["iconUrls"] = map[string]any{
				"tiny": item.LeagueTier.IconURLs.Tiny, "small": item.LeagueTier.IconURLs.Small,
				"medium": item.LeagueTier.IconURLs.Medium, "large": item.LeagueTier.IconURLs.Large,
			}
		}
		out["leagueTier"] = tier
	}
	return out
}
