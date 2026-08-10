package routes

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type clanWarLogResponse struct {
	Items         []clanWarLogItem `json:"items"`
	IsPrivate     bool             `json:"isPrivate"`
	Reconstructed bool             `json:"reconstructed"`
}

type clanWarLogItem struct {
	Result           string             `json:"result"`
	EndTime          string             `json:"endTime"`
	TeamSize         int                `json:"teamSize"`
	AttacksPerMember int                `json:"attacksPerMember"`
	Clan             clanWarLogClanSide `json:"clan"`
	Opponent         clanWarLogClanSide `json:"opponent"`
}

type clanWarLogClanSide struct {
	Tag                   string            `json:"tag"`
	Name                  string            `json:"name"`
	BadgeURLs             officialBadgeURLs `json:"badgeUrls"`
	ClanLevel             int               `json:"clanLevel"`
	Attacks               int               `json:"attacks"`
	Stars                 int               `json:"stars"`
	DestructionPercentage float64           `json:"destructionPercentage"`
}

// clanWarLog godoc
// @Summary Get a clan war log
// @Description Returns the official war log when public. Private logs are reconstructed from stored wars with the same item shape and are marked with isPrivate and reconstructed.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param limit query int false "Maximum wars to return" default(50)
// @Security ApiKeyAuth
// @Success 200 {object} clanWarLogResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/war-log [get]
func clanWarLog(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		if clanTag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tag cannot be empty")
		}
		limit := clamp(warParseIntDefault(c.Query("limit"), 50), 1, 250)
		baseURL := strings.TrimRight(strings.TrimSpace(a.Config.ProxyBaseURL), "/")
		upstreamURL := baseURL + "/v1/clans/" + url.PathEscape(clanTag) + "/warlog?limit=" + strconv.Itoa(limit)
		req, err := http.NewRequestWithContext(c.UserContext(), http.MethodGet, upstreamURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/json")
		resp, err := proxyHTTPClient.Do(req)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Proxy upstream request failed: "+err.Error())
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		if resp.StatusCode == fiber.StatusOK {
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				return err
			}
			payload["isPrivate"] = false
			payload["reconstructed"] = false
			return apptypes.JSON(c, fiber.StatusOK, payload)
		}
		if resp.StatusCode != fiber.StatusForbidden {
			return c.Status(resp.StatusCode).Send(body)
		}

		wars, err := sqlClanWars(c, a, clanTag, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC(), []string{"random", "friendly"}, limit)
		if err != nil {
			return err
		}
		items := make([]clanWarLogItem, 0, len(wars))
		for _, war := range wars {
			if war.State != "warEnded" {
				continue
			}
			items = append(items, buildClanWarLogItem(war))
		}
		return apptypes.JSON(c, fiber.StatusOK, clanWarLogResponse{
			Items: items, IsPrivate: true, Reconstructed: true,
		})
	}
}

func buildClanWarLogItem(war officialWarResponse) clanWarLogItem {
	return clanWarLogItem{
		Result:           clanWarLogResult(war.Clan, war.Opponent),
		EndTime:          war.EndTime,
		TeamSize:         war.TeamSize,
		AttacksPerMember: valueOrDefault(war.AttacksPerMember, 1),
		Clan:             buildClanWarLogSide(war.Clan),
		Opponent:         buildClanWarLogSide(war.Opponent),
	}
}

func buildClanWarLogSide(side officialWarClan) clanWarLogClanSide {
	return clanWarLogClanSide{
		Tag: side.Tag, Name: side.Name, BadgeURLs: side.BadgeURLs, ClanLevel: side.ClanLevel,
		Attacks: side.Attacks, Stars: side.Stars, DestructionPercentage: side.DestructionPercentage,
	}
}

func clanWarLogResult(clan officialWarClan, opponent officialWarClan) string {
	if clan.Stars > opponent.Stars || (clan.Stars == opponent.Stars && clan.DestructionPercentage > opponent.DestructionPercentage) {
		return "win"
	}
	if clan.Stars < opponent.Stars || (clan.Stars == opponent.Stars && clan.DestructionPercentage < opponent.DestructionPercentage) {
		return "lose"
	}
	return "tie"
}

func valueOrDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

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
