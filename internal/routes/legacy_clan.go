package routes

import (
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// clanBasic godoc
// @Summary Get basic clan data
// @Description Returns tracked basic clan data for a clan tag.
// @Tags Legacy Clans
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/basic [get]
func clanBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		row, err := v1BasicClan(c, a, legacyClanFixTag(c.Params("clan_tag")))
		if err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.JSON(c, fiber.StatusOK, nil)
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, row)
	}
}

// legacyClanJoinLeave godoc
// @Summary Get clan join-leave history
// @Description Returns tracked join and leave events for a clan.
// @Tags Legacy Clans
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param time_stamp_end query int false "End Unix timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/join-leave [get]
func legacyClanJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Unix(legacyClanParseInt64Default(c.Query("timestamp_start"), 0), 0).UTC()
		end := time.Unix(legacyClanParseInt64Default(c.Query("time_stamp_end"), 9999999999), 0).UTC()
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT event_time, event_type, clan_tag, player_tag, player_name, townhall_level, clan_role, data
			FROM join_leave_history
			WHERE clan_tag = $1 AND event_time >= $2 AND event_time <= $3
			ORDER BY event_time DESC
		`, legacyClanFixTag(c.Params("clan_tag")), start, end)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			item, err := scanJoinLeaveRow(rows)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
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
// @Failure 500 {object} map[string]interface{}
// @Router /clan/search [get]
func clanSearch(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit := clamp(legacyClanParseIntDefault(c.Query("limit"), 100), 1, 500)
		locationID := c.Query("location_id")
		query := `
			SELECT tag, name, description, clan_level, location_id, cwl_league_id, capital_league_id,
				public_war_log, war_wins, member_count, badge_url, troops_donated, troops_received, member_tags, last_active
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
				item["memberList"] = memberTagsToList(stringSlice(item["member_tags"]))
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

// clanHistorical godoc
// @Summary Get clan historical events
// @Description Returns tracked player history events for a clan.
// @Tags Legacy Clans
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param time_stamp_end query int false "End Unix timestamp"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /clan/{clan_tag}/historical [get]
func clanHistorical(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Unix(legacyClanParseInt64Default(c.Query("timestamp_start"), 0), 0).UTC()
		end := time.Unix(legacyClanParseInt64Default(c.Query("time_stamp_end"), 9999999999), 0).UTC()
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT event_time, player_tag, clan_tag, season, event_type, value, data
			FROM player_history_events
			WHERE clan_tag = $1 AND event_time >= $2 AND event_time <= $3
			ORDER BY event_time
		`, legacyClanFixTag(c.Params("clan_tag")), start, end)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var eventTime time.Time
			var playerTag, clanTag, season, eventType string
			var value pgtype.Int4
			var raw []byte
			if err := rows.Scan(&eventTime, &playerTag, &clanTag, &season, &eventType, &value, &raw); err != nil {
				return err
			}
			item := jsonObject(raw)
			item["time"] = eventTime
			item["tag"] = playerTag
			item["clan"] = clanTag
			item["season"] = season
			item["type"] = eventType
			if value.Valid {
				item["value"] = value.Int32
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
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
			public_war_log, war_wins, member_count, badge_url, troops_donated, troops_received, member_tags, last_active
		FROM basic_clan
		WHERE tag = $1
	`, tag)
	return scanBasicClan(row)
}

type basicClanScanner interface {
	Scan(dest ...any) error
}

func scanBasicClan(row basicClanScanner) (map[string]any, error) {
	var tag, name, desc, badge string
	var level, cwlLeague, warWins, memberCount, donated, received int
	var locationID, capitalLeague pgtype.Int4
	var publicWarLog bool
	var memberTags []string
	var lastActive pgtype.Timestamptz
	if err := row.Scan(&tag, &name, &desc, &level, &locationID, &cwlLeague, &capitalLeague, &publicWarLog, &warWins, &memberCount, &badge, &donated, &received, &memberTags, &lastActive); err != nil {
		return nil, err
	}
	item := map[string]any{
		"tag":            tag,
		"name":           name,
		"description":    desc,
		"clanLevel":      level,
		"warWins":        warWins,
		"members":        memberCount,
		"member_count":   memberCount,
		"badgeUrls":      map[string]any{"large": badge, "medium": badge, "small": badge},
		"troopsDonated":  donated,
		"troopsReceived": received,
		"publicWarLog":   publicWarLog,
		"warLeague":      map[string]any{"id": cwlLeague},
		"member_tags":    memberTags,
	}
	if locationID.Valid {
		item["location"] = map[string]any{"id": locationID.Int32}
	}
	if capitalLeague.Valid {
		item["capitalLeague"] = map[string]any{"id": capitalLeague.Int32}
	}
	if lastActive.Valid {
		item["last_active"] = lastActive.Time
	}
	return item, nil
}

func scanJoinLeaveRow(row basicClanScanner) (map[string]any, error) {
	var eventTime time.Time
	var eventType, clanTag, playerTag string
	var playerName, clanRole pgtype.Text
	var townhall int16
	var raw []byte
	if err := row.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall, &clanRole, &raw); err != nil {
		return nil, err
	}
	item := jsonObject(raw)
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
	return item, nil
}

func memberTagsToList(tags []string) []map[string]any {
	out := make([]map[string]any, 0, len(tags))
	for _, tag := range tags {
		out = append(out, map[string]any{"tag": tag})
	}
	return out
}
