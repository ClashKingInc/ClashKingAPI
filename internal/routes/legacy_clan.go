package routes

import (
	"encoding/json"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// clanCached godoc
// @Summary Read a recently cached clan profile
// @Description Returns a stored clan profile when live data is unnecessary. Values may be several hours behind the official API.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.ClanCachedResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/cached [get]
func clanCached(a apptypes.Deps) fiber.Handler {
	return clanCachedHandler(a, v2CachedClan)
}

type clanCachedLoader func(*fiber.Ctx, apptypes.Deps, string) (modelsv2.ClanCachedResponse, error)

func clanCachedHandler(a apptypes.Deps, load clanCachedLoader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		row, err := load(c, a, legacyClanFixTag(c.Params("clan_tag")))
		if err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.JSON(c, fiber.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, row)
	}
}

// clanRecords godoc
// @Summary View a clan's tracked records
// @Description Returns the clan's highest tracked points and longest war win streak, including when each record was reached.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.ClanBasicRecords
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/records [get]
func clanRecords(a apptypes.Deps) fiber.Handler {
	return clanRecordsHandler(a, v2BasicClanRecords)
}

type clanRecordsLoader func(*fiber.Ctx, apptypes.Deps, string) (*modelsv2.ClanBasicRecords, error)

func clanRecordsHandler(a apptypes.Deps, load clanRecordsLoader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		records, err := load(c, a, legacyClanFixTag(c.Params("clan_tag")))
		if err != nil {
			return err
		}
		if records == nil {
			records = &modelsv2.ClanBasicRecords{}
		}
		return apptypes.JSON(c, fiber.StatusOK, records)
	}
}

// clanSearch godoc
// @Summary Search tracked clans
// @Description Returns tracked clans with optional location filtering.
// @Tags Legacy Clans
// @Produce json
// @Param location_id query int false "Location ID"
// @Param limit query int false "Maximum number of clans"
// @Param member_list query bool false "Include member tags"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func clanSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit := clamp(legacyClanParseIntDefault(c.Query("limit"), 100), 1, 500)
		locationID := c.Query("location_id")
		query := `
			SELECT tag, name, description, clan_level, location_id, cwl_league_id, capital_league_id,
				public_war_log, war_wins, war_win_streak, clan_points, member_count, badge_token,
				troops_donated, troops_received, members, last_active
			FROM basic_clan
		`
		args := []any{}
		if locationID != "" {
			query += ` WHERE location_id = $1`
			args = append(args, legacyClanParseIntDefault(locationID, 0))
		}
		query += ` ORDER BY member_count DESC LIMIT $` + strconv.Itoa(len(args)+1)
		args = append(args, limit)
		rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		memberList, _ := apptypes.QueryBool(c, "member_list", true)
		items := []map[string]any{}
		for rows.Next() {
			item, err := scanBasicClan(rows)
			if err != nil {
				return err
			}
			if memberList {
				item["memberList"] = item["members"]
			}
			items = append(items, item)
		}
		resp := map[string]any{"items": items, "before": "", "after": ""}
		if len(items) > 0 {
			resp["before"] = items[0]["tag"]
			resp["after"] = items[len(items)-1]["tag"]
		}
		return apptypes.JSON(c, fiber.StatusOK, resp)
	}
}

func legacyClanParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func legacyClanParseInt64Default(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func legacyClanFixTag(tag string) string {
	tag = decodeRouteTag(tag)
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func v1BasicClan(c *fiber.Ctx, a apptypes.Deps, tag string) (map[string]any, error) {
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT tag, name, description, clan_level, location_id, cwl_league_id, capital_league_id,
			public_war_log, war_wins, war_win_streak, clan_points, member_count, badge_token,
			troops_donated, troops_received, members, last_active
		FROM basic_clan
		WHERE tag = $1
	`, tag)
	return scanBasicClan(row)
}

func v2CachedClan(c *fiber.Ctx, a apptypes.Deps, tag string) (modelsv2.ClanCachedResponse, error) {
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT tag, name, description, clan_level, location_id, cwl_league_id, capital_league_id,
			public_war_log, war_wins, war_win_streak, clan_points, member_count, badge_token,
			troops_donated, troops_received, members, last_active
		FROM basic_clan
		WHERE tag = $1
	`, tag)
	data, err := scanBasicClanData(row)
	if err != nil {
		return modelsv2.ClanCachedResponse{}, err
	}
	return cachedClanResponse(data, a), nil
}

type basicClanScanner interface {
	Scan(dest ...any) error
}

type basicClanData struct {
	tag           string
	name          string
	description   string
	level         int
	locationID    pgtype.Int4
	cwlLeague     int
	capitalLeague pgtype.Int4
	publicWarLog  bool
	warWins       int
	warWinStreak  int
	clanPoints    int
	memberCount   int
	badge         string
	donated       int
	received      int
	members       any
	lastActive    pgtype.Timestamptz
}

func clanDecodeJSONValue(raw []byte, fallback any) any {
	if len(raw) == 0 {
		return fallback
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil || value == nil {
		return fallback
	}
	return value
}

func scanBasicClanData(row basicClanScanner) (basicClanData, error) {
	var data basicClanData
	var locationID, capitalLeague pgtype.Int4
	var membersRaw []byte
	var lastActive pgtype.Timestamptz
	if err := row.Scan(&data.tag, &data.name, &data.description, &data.level, &locationID, &data.cwlLeague, &capitalLeague, &data.publicWarLog, &data.warWins, &data.warWinStreak, &data.clanPoints, &data.memberCount, &data.badge, &data.donated, &data.received, &membersRaw, &lastActive); err != nil {
		return basicClanData{}, err
	}
	data.locationID = locationID
	data.capitalLeague = capitalLeague
	data.members = clanDecodeJSONValue(membersRaw, []any{})
	data.lastActive = lastActive
	return data, nil
}

func scanBasicClan(row basicClanScanner) (map[string]any, error) {
	data, err := scanBasicClanData(row)
	if err != nil {
		return nil, err
	}
	return basicClanMap(data), nil
}

func basicClanMap(data basicClanData) map[string]any {
	item := map[string]any{
		"tag":             data.tag,
		"name":            data.name,
		"description":     data.description,
		"clan_level":      data.level,
		"clanLevel":       data.level,
		"cwl_league_id":   data.cwlLeague,
		"public_war_log":  data.publicWarLog,
		"publicWarLog":    data.publicWarLog,
		"war_wins":        data.warWins,
		"warWins":         data.warWins,
		"war_win_streak":  data.warWinStreak,
		"warWinStreak":    data.warWinStreak,
		"clan_points":     data.clanPoints,
		"clanPoints":      data.clanPoints,
		"member_count":    data.memberCount,
		"memberCount":     data.memberCount,
		"badge_token":     data.badge,
		"badge_url":       badgeURL(data.badge, 512),
		"badgeUrls":       badgeURLs(data.badge),
		"troops_donated":  data.donated,
		"troopsDonated":   data.donated,
		"troops_received": data.received,
		"troopsReceived":  data.received,
		"members":         data.members,
		"warLeague":       map[string]any{"id": data.cwlLeague},
	}
	if data.locationID.Valid {
		item["location_id"] = data.locationID.Int32
		item["location"] = map[string]any{"id": data.locationID.Int32}
	}
	if data.capitalLeague.Valid {
		item["capital_league_id"] = data.capitalLeague.Int32
		item["capitalLeague"] = map[string]any{"id": data.capitalLeague.Int32}
	}
	if data.lastActive.Valid {
		item["last_active"] = data.lastActive.Time
		item["lastActive"] = data.lastActive.Time
	}
	return item
}

func cachedClanResponse(data basicClanData, a apptypes.Deps) modelsv2.ClanCachedResponse {
	references := newReferenceCatalog(a)
	warLeague := modelsv2.ClanLeagueRef{ID: data.cwlLeague}
	if league := references.warLeague(data.cwlLeague); league != nil {
		warLeague.Name = league.Name
	}
	resp := modelsv2.ClanCachedResponse{
		Name: data.name,
		Tag:  data.tag,
		BadgeURLs: modelsv2.ClanBadgeURLs{
			Small:  badgeURL(data.badge, 70),
			Medium: badgeURL(data.badge, 200),
			Large:  badgeURL(data.badge, 512),
		},
		Description:    data.description,
		ClanLevel:      data.level,
		ClanPoints:     data.clanPoints,
		WarLeague:      warLeague,
		PublicWarLog:   data.publicWarLog,
		WarWins:        data.warWins,
		WarWinStreak:   data.warWinStreak,
		MemberCount:    data.memberCount,
		TroopsDonated:  data.donated,
		TroopsReceived: data.received,
		Members:        cachedClanMembers(data.members),
	}
	if data.locationID.Valid {
		if location, ok := searchLocations()[int(data.locationID.Int32)]; ok {
			copy := location
			resp.Location = &copy
		} else {
			resp.Location = &modelsv2.SearchLocation{ID: int(data.locationID.Int32)}
		}
	}
	if data.capitalLeague.Valid {
		capitalLeague := modelsv2.ClanLeagueRef{ID: int(data.capitalLeague.Int32)}
		if league := references.capitalLeague(capitalLeague.ID); league != nil {
			capitalLeague.Name = league.Name
		}
		resp.CapitalLeague = &capitalLeague
	}
	if data.lastActive.Valid {
		lastActive := data.lastActive.Time
		resp.LastActive = &lastActive
	}
	return resp
}

func cachedClanMembers(value any) []modelsv2.ClanCachedMember {
	rawMembers, ok := value.([]any)
	if !ok {
		return []modelsv2.ClanCachedMember{}
	}
	members := make([]modelsv2.ClanCachedMember, 0, len(rawMembers))
	for _, raw := range rawMembers {
		member, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		members = append(members, modelsv2.ClanCachedMember{
			Tag: staticDataAsString(member["tag"]), Name: staticDataAsString(member["name"]),
			TownHallLevel: int(asFloat(member["town_hall"])),
		})
	}
	return members
}

func v2BasicClanRecords(c *fiber.Ctx, a apptypes.Deps, tag string) (*modelsv2.ClanBasicRecords, error) {
	var clanPoints int
	var clanPointsAt pgtype.Timestamptz
	var warWinStreak int
	var warWinStreakAt pgtype.Timestamptz
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT clan_points, clan_points_at, war_win_streak, war_win_streak_at
		FROM clan_records
		WHERE tag = $1
	`, tag).Scan(&clanPoints, &clanPointsAt, &warWinStreak, &warWinStreakAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	records := modelsv2.ClanBasicRecords{}
	if clanPointsAt.Valid {
		records.ClanPoints = &modelsv2.ClanRecordEntry{Value: clanPoints, Time: clanPointsAt.Time}
	}
	if warWinStreakAt.Valid {
		records.WarWinStreak = &modelsv2.ClanRecordEntry{Value: warWinStreak, Time: warWinStreakAt.Time}
	}
	if records.ClanPoints == nil && records.WarWinStreak == nil {
		return nil, nil
	}
	return &records, nil
}

func memberTagsToList(tags []string) []map[string]any {
	out := make([]map[string]any, 0, len(tags))
	for _, tag := range tags {
		out = append(out, map[string]any{"tag": tag})
	}
	return out
}
