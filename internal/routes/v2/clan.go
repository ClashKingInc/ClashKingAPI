package v2

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// clanRanking godoc
// @Summary Get ranking of a clan
// @Description Returns the cached ranking document for a clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/ranking [get]
func clanRanking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		var countryCode, countryName pgtype.Text
		var rank, globalRank, localRank pgtype.Int4
		var rawData []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT country_code, country_name, rank, global_rank, local_rank, data
			FROM clan_rankings_current
			WHERE clan_tag = $1
		`, tag).Scan(&countryCode, &countryName, &rank, &globalRank, &localRank, &rawData)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanRankingResponse{Tag: tag})
			}
			return err
		}
		row := clanDecodeJSONObject(rawData)
		row["tag"] = tag
		if countryCode.Valid {
			row["country_code"] = countryCode.String
		}
		if countryName.Valid {
			row["country_name"] = countryName.String
		}
		if rank.Valid {
			row["rank"] = rank.Int32
		}
		if globalRank.Valid {
			row["global_rank"] = globalRank.Int32
		}
		if localRank.Valid {
			row["local_rank"] = localRank.Int32
		}
		return apptypes.JSON(c, fiber.StatusOK, row)
	}
}

// boardTotals godoc
// @Summary Get aggregated board totals for a clan
// @Description Returns aggregate board totals for one or more player tags.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param body body modelsv2.ClanPlayerTagsBody false "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/board/totals [get]
func boardTotals(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanPlayerTagsBody
		if len(c.Body()) > 0 {
			_ = apptypes.DecodeJSON(c, &body)
		}
		if len(body.PlayerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}
		var count int
		if err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT count(*)
			FROM player_current_stats
			WHERE player_tag = ANY($1)
		`, clanFixTags(body.PlayerTags)).Scan(&count); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BoardTotalsResponse{
			Tag:                clanFixTag(c.Params("clan_tag")),
			TrackedPlayerCount: count,
			Activity:           count,
		})
	}
}

// clanDonationsSingle godoc
// @Summary Get clan donations
// @Description Returns donation totals for a single clan and season.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/donations/{season} [get]
func clanDonationsSingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := clanFixTag(c.Params("clan_tag"))
		season := c.Params("season")
		var rawDonations []byte
		if err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT donations
			FROM clan_season_stats
			WHERE clan_tag = $1 AND season = $2
		`, clanTag, season).Scan(&rawDonations); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []modelsv2.DonationEntry{}})
			}
			return err
		}
		seasonData := clanDecodeJSONObject(rawDonations)
		items := make([]modelsv2.DonationEntry, 0, len(seasonData))
		for tag, raw := range seasonData {
			doc, _ := raw.(map[string]any)
			items = append(items, modelsv2.DonationEntry{Tag: tag, Donated: doc["donated"], Received: doc["received"]})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// clanComposition godoc
// @Summary Get composition of a clan or clans
// @Description Returns town hall, role, and league composition for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param clan_tags query []string false "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/compo [get]
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
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/donations/{season} [get]
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
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/details [post]
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
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/details [get]
func clanDetails(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clan, err := a.Clash.GetClan(c.UserContext(), c.Params("clan_tag"))
		if err != nil || clan == nil {
			return apptypes.Error(fiber.StatusNotFound, "Clan not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, enrichClanLeagueIcons(clan, leagueIconLookup(a)))
	}
}

// clanJoinLeaveSingle godoc
// @Summary Join Leaves in a season
// @Description Returns join and leave history for a single clan tag.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param limit query int false "Maximum number of results"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/join-leave [get]
func clanJoinLeaveSingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := joinLeaveSingleResponse(c, a, clanFixTag(c.Params("clan_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// clansJoinLeave godoc
// @Summary Join leaves for many clans
// @Description Returns join and leave history for multiple clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Param limit query int false "Maximum number of results"
// @Param timestamp_start query int false "Start timestamp"
// @Param time_stamp_end query int false "End timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/join-leave [post]
func clansJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.ClanTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "clan_tags cannot be empty")
		}
		items, err := joinLeaveManyResponse(c, a, clanFixTags(body.ClanTags))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": mobileMapsToAny(items)})
	}
}

type joinLeaveWindow struct {
	start       time.Time
	end         time.Time
	startUnix   int64
	endUnix     int64
	limitEvents bool
}

func joinLeaveSingleResponse(c *fiber.Ctx, a apptypes.Deps, clanTag string) (map[string]any, error) {
	items, err := joinLeaveManyResponse(c, a, []string{clanTag})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return map[string]any{}, nil
	}
	return items[0], nil
}

func joinLeaveManyResponse(c *fiber.Ctx, a apptypes.Deps, clanTags []string) ([]map[string]any, error) {
	window, err := joinLeaveWindowFromQuery(c)
	if err != nil {
		return nil, err
	}
	limit := clanParseIntDefault(c.Query("limit"), 50)
	if limit <= 0 {
		limit = 50
	}
	args := []any{clanTags, window.start, window.end}
	typeFilter := ""
	if joinLeaveType := strings.TrimSpace(c.Query("type")); joinLeaveType != "" {
		args = append(args, joinLeaveType)
		typeFilter = "AND event_type = $4"
	}
	rows, err := a.Store.SQL.Query(
		c.UserContext(),
		`
			SELECT event_time, event_type, clan_tag, player_tag, player_name, townhall_level, clan_role, data
			FROM join_leave_history
			WHERE clan_tag = ANY($1)
			  AND event_time >= $2
			  AND event_time <= $3
			  `+typeFilter+`
			ORDER BY event_time DESC
		`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var eventTime time.Time
		var eventType, clanTag, playerTag string
		var playerName, clanRole pgtype.Text
		var townhall int16
		var dataRaw []byte
		if err := rows.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall, &clanRole, &dataRaw); err != nil {
			return nil, err
		}
		item := clanDecodeJSONObject(dataRaw)
		item["time"] = eventTime
		item["type"] = eventType
		item["clan"] = clanTag
		item["tag"] = playerTag
		item["th"] = townhall
		if playerName.Valid {
			item["name"] = playerName.String
		}
		if clanRole.Valid {
			item["role"] = clanRole.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return joinLeaveItemsFromRows(items, clanTags, window, limit), nil
}

func joinLeaveWindowFromQuery(c *fiber.Ctx) (joinLeaveWindow, error) {
	season := strings.TrimSpace(c.Query("season"))
	currentSeason := strings.EqualFold(strings.TrimSpace(c.Query("current_season")), "true")
	if season == "" && currentSeason {
		season = genSeasonDate(0, false).(string)
	}
	if season != "" {
		start, end, err := joinLeaveSeasonBounds(season)
		if err != nil {
			return joinLeaveWindow{}, err
		}
		return joinLeaveWindow{
			start:       start,
			end:         end,
			startUnix:   start.Unix(),
			endUnix:     end.Unix(),
			limitEvents: false,
		}, nil
	}
	startUnix := clanParseInt64Default(c.Query("timestamp_start"), 0)
	endUnix := clanParseInt64Default(c.Query("time_stamp_end"), 9999999999)
	return joinLeaveWindow{
		start:       time.Unix(startUnix, 0).UTC(),
		end:         time.Unix(endUnix, 0).UTC(),
		startUnix:   startUnix,
		endUnix:     endUnix,
		limitEvents: true,
	}, nil
}

func joinLeaveSeasonBounds(season string) (time.Time, time.Time, error) {
	startRaw, endRaw, err := resolveSeasonBounds(season, false)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start, err := time.Parse(time.RFC3339, startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := time.Parse(time.RFC3339, endRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start.UTC(), end.UTC(), nil
}

func joinLeaveItemsFromRows(rows []map[string]any, clanTags []string, window joinLeaveWindow, limit int) []map[string]any {
	groupedDocs := map[string][]map[string]any{}
	groupedStats := map[string][]mobileJoinLeaveEvent{}
	for _, row := range rows {
		clean, ok := sanitize(row).(map[string]any)
		if !ok {
			continue
		}
		clanTag := mobileString(clean["clan"])
		if clanTag == "" {
			continue
		}
		if window.limitEvents && len(groupedDocs[clanTag]) >= limit {
			continue
		}
		eventTime, ok := mobileTime(clean["time"])
		if !ok {
			continue
		}
		clean["time"] = eventTime.UTC().Format(time.RFC3339)
		groupedDocs[clanTag] = append(groupedDocs[clanTag], clean)
		groupedStats[clanTag] = append(groupedStats[clanTag], mobileJoinLeaveEvent{
			Tag:  mobileString(clean["tag"]),
			Name: mobileString(clean["name"]),
			Type: mobileString(clean["type"]),
			Time: eventTime,
		})
	}

	items := make([]map[string]any, 0, len(clanTags))
	for _, clanTag := range clanTags {
		items = append(items, map[string]any{
			"clan_tag":        clanTag,
			"timestamp_start": window.startUnix,
			"timestamp_end":   window.endUnix,
			"stats":           mobileBuildJoinLeaveStats(groupedStats[clanTag]),
			"join_leave_list": mobileMapsToAny(groupedDocs[clanTag]),
		})
	}
	return items
}

// clansCapitalRaids godoc
// @Summary Get capital raids for a list of clans
// @Description Returns raid weekend documents for the requested clan tags.
// @Tags Clan
// @Produce json
// @Param body body modelsv2.ClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clans/capital-raids [post]
func clansCapitalRaids(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.ClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT clan_tag, start_time, end_time, state, total_attacks, capital_total_loot,
			       raids_completed, offensive_reward, defensive_reward, members, attack_log, defense_log, data
			FROM raid_weekends
			WHERE clan_tag = ANY($1)
			ORDER BY clan_tag, start_time DESC
		`, clanFixTags(body.ClanTags))
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var clanTag, state string
			var startTime, endTime time.Time
			var totalAttacks, capitalLoot, raidsCompleted, offensiveReward, defensiveReward int
			var membersRaw, attackRaw, defenseRaw, dataRaw []byte
			if err := rows.Scan(&clanTag, &startTime, &endTime, &state, &totalAttacks, &capitalLoot, &raidsCompleted, &offensiveReward, &defensiveReward, &membersRaw, &attackRaw, &defenseRaw, &dataRaw); err != nil {
				return err
			}
			item := clanDecodeJSONObject(dataRaw)
			item["clan_tag"] = clanTag
			item["start_time"] = startTime.UTC().Format(time.RFC3339)
			item["end_time"] = endTime.UTC().Format(time.RFC3339)
			item["state"] = state
			item["total_attacks"] = totalAttacks
			item["capital_total_loot"] = capitalLoot
			item["raids_completed"] = raidsCompleted
			item["offensive_reward"] = offensiveReward
			item["defensive_reward"] = defensiveReward
			item["members"] = clanDecodeJSONValue(membersRaw, []any{})
			item["attack_log"] = clanDecodeJSONValue(attackRaw, []any{})
			item["defense_log"] = clanDecodeJSONValue(defenseRaw, []any{})
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
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
