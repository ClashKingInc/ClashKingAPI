package routes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// clanWars godoc
// @Summary Get stored clan wars
// @Description Returns previous wars for a clan rebuilt from SQL war rows, attacks, and missed attacks.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to all history."
// @Param timestamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of wars. Max 250."
// @Param war_type query string false "War type filter. Repeatable. Values: random, friendly, cwl, all."
// @Param war_types query string false "Comma-separated war type filter. Values: random,friendly,cwl."
// @Success 200 {object} modelsv2.WarListResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/wars [get]
func clanWars(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		start := time.Unix(queryInt64(c, "timestamp_start", 0), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		limit := clamp(warParseIntDefault(c.Query("limit"), 50), 1, 250)
		types := warTypesFromQuery(c, true)
		wars, err := sqlClanWars(c, a, clanTag, start, end, types, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": wars})
	}
}

// clanRanking godoc
// @Summary Get rankings of a clan
// @Description Returns Home Village, Builder Base, and Clan Capital current points with every stored global/location placement.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.ClanRankingsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/rankings [get]
func clanRanking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		response, err := queryClanRankings(c.UserContext(), a.Store.SQL, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

const clanRankingProfileQuery = `
	SELECT name, badge_token, clan_points, builder_base_points, capital_points
	FROM basic_clan
	WHERE tag = $1
`

const clanRankingPlacementsQuery = `
	SELECT ranking_type, location_id, rank, points
	FROM clan_rankings_current
	WHERE clan_tag = $1
	ORDER BY
		CASE ranking_type
			WHEN 'home' THEN 1
			WHEN 'builder_base' THEN 2
			WHEN 'capital' THEN 3
		END,
		CASE WHEN location_id = 'global' THEN 0 ELSE 1 END,
		location_id
`

type clanRankingsDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func queryClanRankings(ctx context.Context, db clanRankingsDB, tag string) (modelsv2.ClanRankingsResponse, error) {
	response := modelsv2.ClanRankingsResponse{
		Tag:         tag,
		HomeVillage: emptyClanRankingCategory(),
		BuilderBase: emptyClanRankingCategory(),
		ClanCapital: emptyClanRankingCategory(),
	}

	var name, badgeToken *string
	err := db.QueryRow(ctx, clanRankingProfileQuery, tag).Scan(
		&name,
		&badgeToken,
		&response.HomeVillage.Points,
		&response.BuilderBase.Points,
		&response.ClanCapital.Points,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return modelsv2.ClanRankingsResponse{}, err
	}
	response.Name = name
	response.Badge = badgeURLPtr(badgeToken, 512)

	rows, err := db.Query(ctx, clanRankingPlacementsQuery, tag)
	if err != nil {
		return modelsv2.ClanRankingsResponse{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var rankingType string
		var placement modelsv2.ClanRankingPlacement
		if err := rows.Scan(
			&rankingType,
			&placement.LocationID,
			&placement.Rank,
			&placement.Points,
		); err != nil {
			return modelsv2.ClanRankingsResponse{}, err
		}
		switch rankingType {
		case "home":
			response.HomeVillage.Placements = append(response.HomeVillage.Placements, placement)
		case "builder_base":
			response.BuilderBase.Placements = append(response.BuilderBase.Placements, placement)
		case "capital":
			response.ClanCapital.Placements = append(response.ClanCapital.Placements, placement)
		}
	}
	if err := rows.Err(); err != nil {
		return modelsv2.ClanRankingsResponse{}, err
	}
	return response, nil
}

func emptyClanRankingCategory() modelsv2.ClanRankingCategory {
	return modelsv2.ClanRankingCategory{
		Placements: make([]modelsv2.ClanRankingPlacement, 0),
	}
}

// clanComposition godoc
// @Summary Get composition of a clan or clans
// @Description Returns town hall, role, and league composition for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param clan_tags query []string false "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func clanComposition(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tags := clanFixTags(apptypes.QueryValues(c, "clan_tags"))
		if len(tags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags is required")
		}
		buckets := map[string]map[string]int{
			"townhall": {},
			"role":     {},
			"league":   {},
		}
		totalMembers := 0
		for _, tag := range tags {
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || clan == nil {
				continue
			}
			totalMembers += len(clan.Members)
			for _, member := range clan.Members {
				buckets["townhall"]["unknown"]++
				buckets["role"][string(member.Role)]++
				league := "Unranked"
				if member.League != nil && member.League.Name != "" {
					league = member.League.Name
				}
				buckets["league"][league]++
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanCompositionResponse{
			Townhall:     buckets["townhall"],
			Role:         buckets["role"],
			League:       buckets["league"],
			TotalMembers: totalMembers,
			ClanCount:    len(tags),
		})
	}
}

// clanDonationsMany godoc
// @Summary Get donations for many clans
// @Description Returns donation totals for multiple clans in a season.
// @Tags Clan
// @Produce json
// @Param season path string true "Season"
// @Param clan_tags query []string false "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func clanDonationsMany(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := c.Params("season")
		tags := clanFixTags(apptypes.QueryValues(c, "clan_tags"))
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, clan_tag, season, name, townhall_level, donations, clan_games, activity, data
			FROM player_season_stats
			WHERE season = $1
			  AND (cardinality($2::text[]) = 0 OR clan_tag = ANY($2))
			ORDER BY clan_tag, player_tag
		`, season, tags)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var playerTag, clanTag, rowSeason, name string
			var townhall pgtype.Int4
			var donationsRaw, clanGamesRaw, activityRaw, dataRaw []byte
			if err := rows.Scan(&playerTag, &clanTag, &rowSeason, &name, &townhall, &donationsRaw, &clanGamesRaw, &activityRaw, &dataRaw); err != nil {
				return err
			}
			item := clanDecodeJSONObject(dataRaw)
			item["tag"] = playerTag
			item["clan_tag"] = clanTag
			item["season"] = rowSeason
			item["name"] = name
			if townhall.Valid {
				item["townhall"] = townhall.Int32
			}
			item["donations"] = clanDecodeJSONObject(donationsRaw)
			item["clan_games"] = clanDecodeJSONObject(clanGamesRaw)
			item["activity"] = clanDecodeJSONObject(activityRaw)
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, items)
	}
}

// clansDetails godoc
// @Summary Get full stats for a list of clans
// @Description Returns detailed clan objects for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func clansDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.ClanTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		icons := leagueIconLookup(a)
		items := make([]any, 0, len(body.ClanTags))
		for _, tag := range body.ClanTags {
			clan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil {
				items = append(items, nil)
				continue
			}
			items = append(items, enrichClanLeagueIcons(clan, icons))
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// clanDetails godoc
// @Summary Get full stats for a single clan
// @Description Returns the live clan object for a clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func clanDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clan, err := a.Clash.GetClan(c.UserContext(), c.Params("clan_tag"))
		if err != nil || clan == nil {
			return apptypes.Error(fiber.StatusNotFound, "Clan not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, enrichClanLeagueIcons(clan, leagueIconLookup(a)))
	}
}

func clanParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func clanParseInt64Default(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func clanFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, clanFixTag(tag))
	}
	return out
}

func clanFixTag(tag string) string {
	tag = decodeRouteTag(tag)
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func clanDecodeJSONObject(raw []byte) map[string]any {
	value := clanDecodeJSONValue(raw, map[string]any{})
	if obj, ok := value.(map[string]any); ok {
		return obj
	}
	return map[string]any{}
}

func clanDecodeJSONValue(raw []byte, fallback any) any {
	if len(raw) == 0 {
		return fallback
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fallback
	}
	if value == nil {
		return fallback
	}
	return value
}
