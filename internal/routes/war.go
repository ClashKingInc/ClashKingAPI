package routes

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

// warTownhallWeeklyHitrate godoc
// @Summary Get weekly town hall war hitrate
// @Description Returns weekly hitrate and average attack quality for a town hall level.
// @Tags War & CWL
// @Produce json
// @Param townhall_level path int true "Town hall level"
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to 90 days ago."
// @Param timestamp_end query int false "End Unix timestamp"
// @Param war_type query string false "War type filter. Repeatable. Values: random, friendly, all. CWL is not included for this endpoint."
// @Param war_types query string false "Comma-separated war type filter. Values: random,friendly."
// @Param same_townhall query bool false "Only include same town hall attacks"
// @Success 200 {object} modelsv2.WarWeeklyHitrateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func warTownhallWeeklyHitrate(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		townhall := warParseIntDefault(c.Params("townhall_level"), 0)
		if townhall <= 0 {
			return apptypes.Error(http.StatusBadRequest, "invalid townhall_level")
		}
		start := time.Unix(queryInt64(c, "timestamp_start", time.Now().UTC().AddDate(0, 0, -90).Unix()), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		types := warTypesFromQuery(c, false)
		sameTownhall, err := apptypes.QueryBool(c, "same_townhall", false)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT stats #> '{attacks,byWeekTypeMatchup}'
			FROM war_archive_packs
			WHERE status = 'uploaded' AND last_end_time >= $1 AND first_end_time <= $2
		`, start, end)
		if err != nil {
			return err
		}
		defer rows.Close()
		type aggregate struct {
			attacks, triples, stars int
			destruction             int64
		}
		grouped := map[string]*aggregate{}
		allowedTypes := map[string]struct{}{}
		for _, warType := range types {
			allowedTypes[warType] = struct{}{}
		}
		for rows.Next() {
			var raw []byte
			if err := rows.Scan(&raw); err != nil {
				return err
			}
			var weeklyMatchups map[string]wararchive.AttackAggregate
			if err := json.Unmarshal(raw, &weeklyMatchups); err != nil {
				return err
			}
			for key, value := range weeklyMatchups {
				parts := strings.Split(key, "|")
				if len(parts) != 4 || parts[2] != strconv.Itoa(townhall) {
					continue
				}
				if _, exists := allowedTypes[parts[1]]; !exists {
					continue
				}
				if sameTownhall && parts[3] != parts[2] {
					continue
				}
				groupKey := parts[0] + "|" + parts[1]
				current := grouped[groupKey]
				if current == nil {
					current = &aggregate{}
					grouped[groupKey] = current
				}
				current.attacks += value.Attacks
				current.triples += value.Triples
				current.stars += value.Stars
				current.destruction += value.DestructionPercent
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}
		pending, err := a.Store.SQL.Query(c.UserContext(), `SELECT payload FROM war_archive_pending WHERE end_time >= $1 AND end_time <= $2`, start, end)
		if err != nil {
			return err
		}
		defer pending.Close()
		for pending.Next() {
			var raw []byte
			if err := pending.Scan(&raw); err != nil {
				return err
			}
			var war wararchive.War
			if err := json.Unmarshal(raw, &war); err != nil {
				return err
			}
			if _, exists := allowedTypes[war.Type]; !exists {
				continue
			}
			week := war.EndTime.UTC().AddDate(0, 0, -int(war.EndTime.UTC().Weekday()+6)%7).Format("2006-01-02")
			groupKey := week + "|" + war.Type
			for _, attack := range wararchive.Attacks("", war) {
				if attack.AttackerTownhall != townhall || (sameTownhall && attack.DefenderTownhall != townhall) {
					continue
				}
				current := grouped[groupKey]
				if current == nil {
					current = &aggregate{}
					grouped[groupKey] = current
				}
				current.attacks++
				current.stars += attack.Stars
				current.destruction += int64(attack.DestructionPercentage)
				if attack.Stars == 3 {
					current.triples++
				}
			}
		}
		if err := pending.Err(); err != nil {
			return err
		}
		keys := make([]string, 0, len(grouped))
		for key := range grouped {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		items := make([]map[string]any, 0, len(keys))
		for _, key := range keys {
			parts := strings.Split(key, "|")
			value := grouped[key]
			items = append(items, map[string]any{
				"week":               parts[0],
				"warType":            parts[1],
				"townhallLevel":      townhall,
				"attacks":            value.attacks,
				"triples":            value.triples,
				"hitrate":            rate(value.triples, value.attacks),
				"averageStars":       round2(float64(value.stars) / float64(value.attacks)),
				"averageDestruction": round2(float64(value.destruction) / float64(value.attacks)),
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// warCompletedDaily godoc
// @Summary Get daily completed war counts
// @Description Returns completed war counts per day and war type.
// @Tags War & CWL
// @Produce json
// @Param timestamp_start query int false "Start Unix timestamp. Defaults to 90 days ago."
// @Param timestamp_end query int false "End Unix timestamp"
// @Param war_type query string false "War type filter. Repeatable. Values: random, friendly, cwl, all."
// @Param war_types query string false "Comma-separated war type filter. Values: random,friendly,cwl."
// @Success 200 {object} modelsv2.WarCompletedDailyResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func warCompletedDaily(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Unix(queryInt64(c, "timestamp_start", time.Now().UTC().AddDate(0, 0, -90).Unix()), 0).UTC()
		end := time.Unix(queryInt64(c, "timestamp_end", 9999999999), 0).UTC()
		types := warTypesFromQuery(c, true)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT end_time::date AS day, war_type, count(*)::int
			FROM wars
			WHERE end_time >= $1 AND end_time <= $2 AND war_type = ANY($3)
			GROUP BY day, war_type
			ORDER BY day, war_type
		`, start, end, types)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var day time.Time
			var warType string
			var count int
			if err := rows.Scan(&day, &warType, &count); err != nil {
				return err
			}
			items = append(items, map[string]any{"day": day.Format("2006-01-02"), "warType": warType, "warsCompleted": count})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// cwlClanHistory godoc
// @Summary Browse a clan's stored CWL groups
// @Description Returns every stored CWL group containing the clan. Rosters and rounds are historical snapshots; rankings appear only when separately saved.
// @Tags War & CWL
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.CWLClanHistoryResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/{clan_tag}/ranking-history [get]
func cwlClanHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		items, err := cwlHistoryForClan(c, a, clanTag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CWLClanHistoryResponse{ClanTag: clanTag, Items: items})
	}
}

// cwlPlayerHistory godoc
// @Summary Review a player's CWL season history
// @Description Returns each season containing the player, with their clan, league, team size, attacks, missed attacks, results, stars, and placements.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Maximum seasons to return" default(6) minimum(1)
// @Success 200 {object} modelsv2.CWLPlayerHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/cwl/history [get]
func cwlPlayerHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := warFixTag(c.Params("player_tag"))
		limit, err := v2QueryInt(c, "limit", 6)
		if err != nil || limit < 1 {
			return apptypes.Error(fiber.StatusBadRequest, "limit must be a positive integer")
		}
		items, err := cwlHistoryForPlayer(c, a, playerTag, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CWLPlayerHistoryResponse{Items: items})
	}
}

// cwlLeagueRankings godoc
// @Summary Rank CWL clans within a league
// @Description Returns the saved leaderboard for one CWL season, league, and team size, ordered by global rank and then group rank.
// @Tags Leaderboard
// @Produce json
// @Param league_id path int true "CWL league ID"
// @Param season query string true "CWL season (YYYY-MM)"
// @Param team_size query int true "CWL team size"
// @Success 200 {object} modelsv2.CWLLeagueRankingsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/cwl/{league_id} [get]
func cwlLeagueRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		leagueID, err := strconv.Atoi(c.Params("league_id"))
		if err != nil || leagueID <= 0 {
			return apptypes.Error(fiber.StatusBadRequest, "league_id must be a positive integer")
		}
		season := strings.TrimSpace(c.Query("season"))
		if season == "" {
			return apptypes.Error(fiber.StatusBadRequest, "season is required")
		}
		warSize, err := strconv.Atoi(c.Query("team_size"))
		if err != nil || warSize <= 0 {
			return apptypes.Error(fiber.StatusBadRequest, "team_size must be a positive integer")
		}
		items, err := cwlStandingsForLeague(c, a, season, leagueID, warSize)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CWLLeagueRankingsResponse{Season: season, CWLLeagueID: leagueID, WarSize: warSize, Items: items})
	}
}

const cwlHistorySelect = `
	SELECT g.season, g.cwl_league_id, g.state, g.war_size, g.rounds,
	       gc.clan_tag, gc.name, gc.clan_level, gc.badge_token,
	       COALESCE((
	           SELECT jsonb_agg(jsonb_build_object(
	               'tag', member.tag,
	               'name', member.name,
	               'townHallLevel', member.town_hall
	           ) ORDER BY member.tag)
	           FROM cwl_group_members AS member
	           WHERE member.cwl_id = gc.cwl_id AND member.clan_tag = gc.clan_tag
	       ), '[]'::jsonb) AS members,
	       s.season, s.cwl_league_id, s.war_size, s.stars, s.destruction::float8,
	       s.wins, s.losses, s.ties, s.wars_finished, s.total_clans_in_group,
	       s.group_rank, s.global_rank, s.updated_at
	FROM cwl_groups AS g
	JOIN cwl_group_clans AS gc ON gc.cwl_id = g.cwl_id
	LEFT JOIN cwl_standings AS s ON s.cwl_id = gc.cwl_id AND s.clan_tag = gc.clan_tag
`

func cwlHistoryForClan(c *fiber.Ctx, a apptypes.Deps, clanTag string) ([]modelsv2.CWLHistoryItem, error) {
	return cwlHistoryQuery(c, a, cwlHistorySelect+`
		WHERE gc.clan_tag = $1
		ORDER BY g.season DESC, g.cwl_id DESC
	`, clanTag)
}

func cwlHistoryQuery(c *fiber.Ctx, a apptypes.Deps, query, tag string) ([]modelsv2.CWLHistoryItem, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), query, tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.CWLHistoryItem, 0)
	for rows.Next() {
		item, err := scanCWLHistoryRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const cwlPlayerHistorySelect = `
	SELECT g.cwl_id, g.season, player_member.town_hall, g.cwl_league_id,
	       COALESCE(g.war_size, s.war_size),
	       gc.clan_tag, gc.name, gc.badge_token,
	       s.stars, s.wins, s.losses, s.ties, s.group_rank, s.global_rank
	FROM cwl_group_members AS player_member
	JOIN cwl_groups AS g ON g.cwl_id = player_member.cwl_id
	JOIN cwl_group_clans AS gc
	  ON gc.cwl_id = player_member.cwl_id
	 AND gc.clan_tag = player_member.clan_tag
	LEFT JOIN cwl_standings AS s
	  ON s.cwl_id = player_member.cwl_id
	 AND s.clan_tag = player_member.clan_tag
	WHERE player_member.tag = $1
	ORDER BY g.season DESC, g.cwl_id DESC, gc.clan_tag
	LIMIT $2
`

type cwlPlayerHistorySeed struct {
	CWLID    string
	LeagueID int
	Item     modelsv2.CWLPlayerHistoryItem
}

func cwlHistoryForPlayer(c *fiber.Ctx, a apptypes.Deps, playerTag string, limit int) ([]modelsv2.CWLPlayerHistoryItem, error) {
	seeds, err := loadCWLPlayerHistorySeeds(c, a, playerTag, limit)
	if err != nil {
		return nil, err
	}
	missingClans := make(map[string]struct{})
	for _, seed := range seeds {
		if seed.LeagueID == 0 {
			missingClans[seed.Item.Clan.Tag] = struct{}{}
		}
	}
	for clanTag := range missingClans {
		if err := ensureCWLLeagueIDs(c, a, clanTag); err != nil {
			return nil, err
		}
	}
	if len(missingClans) > 0 {
		seeds, err = loadCWLPlayerHistorySeeds(c, a, playerTag, limit)
		if err != nil {
			return nil, err
		}
	}

	items := make([]modelsv2.CWLPlayerHistoryItem, 0, len(seeds))
	catalog := newReferenceCatalog(a)
	for _, seed := range seeds {
		if seed.LeagueID > 0 {
			seed.Item.Clan.WarLeague = catalog.warLeague(seed.LeagueID)
			if seed.Item.Clan.WarLeague == nil {
				seed.Item.Clan.WarLeague = &modelsv2.LeagueReference{ID: seed.LeagueID}
			}
		}
		facts, err := cwlPlayerWarFacts(c, a, seed.CWLID, playerTag, seed.Item.Clan.Tag)
		if err != nil {
			return nil, err
		}
		seed.Item.Attacks = facts.attacks
		seed.Item.MissedAttacks = facts.missedAttacks
		if seed.Item.TeamSize == nil {
			seed.Item.TeamSize = facts.actualTeamSize
		}
		if facts.summary != nil {
			totalStars := facts.summary.stars
			seed.Item.Clan.TotalStars = &totalStars
			seed.Item.Clan.Wars = &modelsv2.CWLPlayerHistoryWarRecord{Won: facts.summary.wins, Lost: facts.summary.losses, Tied: facts.summary.ties}
			if seed.Item.Clan.Placement == nil {
				seed.Item.Clan.Placement = &modelsv2.CWLPlayerClanPlacement{}
			}
			groupRank := facts.summary.rank
			seed.Item.Clan.Placement.Group = &groupRank
		}
		if facts.placementAvailable {
			seed.Item.Placement = cwlPlayerEarnedStarsPlacement(facts.wars, playerTag, seed.Item.Clan.Tag)
		}
		items = append(items, seed.Item)
	}
	return items, nil
}

func loadCWLPlayerHistorySeeds(c *fiber.Ctx, a apptypes.Deps, playerTag string, limit int) ([]cwlPlayerHistorySeed, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), cwlPlayerHistorySelect, playerTag, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seeds := make([]cwlPlayerHistorySeed, 0)
	for rows.Next() {
		seed, err := scanCWLPlayerHistorySeed(rows)
		if err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return seeds, nil
}

func scanCWLPlayerHistorySeed(row cwlHistoryScanner) (cwlPlayerHistorySeed, error) {
	var seed cwlPlayerHistorySeed
	var leagueID, totalStars, wins, losses, ties, groupRank, globalRank pgtype.Int4
	var warSize pgtype.Int2
	var badgeToken string
	if err := row.Scan(
		&seed.CWLID, &seed.Item.Season, &seed.Item.TownHallLevel, &leagueID, &warSize,
		&seed.Item.Clan.Tag, &seed.Item.Clan.Name, &badgeToken,
		&totalStars, &wins, &losses, &ties, &groupRank, &globalRank,
	); err != nil {
		return cwlPlayerHistorySeed{}, err
	}
	seed.Item.Attacks = []modelsv2.CWLPlayerHistoryAttack{}
	seed.Item.Clan.BadgeURLs = modelsv2.WarBadgeURLs{
		Small: badgeURL(badgeToken, 70), Medium: badgeURL(badgeToken, 200), Large: badgeURL(badgeToken, 512),
	}
	if leagueID.Valid {
		seed.LeagueID = int(leagueID.Int32)
	}
	if warSize.Valid {
		value := int(warSize.Int16)
		seed.Item.TeamSize = &value
	}
	if totalStars.Valid && wins.Valid && losses.Valid && ties.Valid {
		value := int(totalStars.Int32)
		seed.Item.Clan.TotalStars = &value
		seed.Item.Clan.Wars = &modelsv2.CWLPlayerHistoryWarRecord{
			Won: int(wins.Int32), Lost: int(losses.Int32), Tied: int(ties.Int32),
		}
	}
	if groupRank.Valid || globalRank.Valid {
		seed.Item.Clan.Placement = &modelsv2.CWLPlayerClanPlacement{}
		if groupRank.Valid {
			value := int(groupRank.Int32)
			seed.Item.Clan.Placement.Group = &value
		}
		if globalRank.Valid {
			value := int(globalRank.Int32)
			seed.Item.Clan.Placement.Global = &value
		}
	}
	return seed, nil
}

type cwlPlayerSeasonFacts struct {
	attacks            []modelsv2.CWLPlayerHistoryAttack
	missedAttacks      int
	actualTeamSize     *int
	summary            *cwlSeasonSummary
	wars               map[string]wararchive.War
	placementAvailable bool
}

func cwlPlayerWarFacts(c *fiber.Ctx, a apptypes.Deps, cwlID, playerTag, clanTag string) (cwlPlayerSeasonFacts, error) {
	var state string
	var roundsJSON []byte
	var clanTags []string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT g.state, g.rounds, array_agg(clan.clan_tag ORDER BY clan.clan_tag)
		FROM cwl_groups AS g
		JOIN cwl_group_clans AS clan ON clan.cwl_id = g.cwl_id
		WHERE g.cwl_id = $1
		GROUP BY g.cwl_id, g.state, g.rounds
	`, cwlID).Scan(&state, &roundsJSON, &clanTags)
	if err != nil {
		return cwlPlayerSeasonFacts{}, err
	}
	roundTags := decodeCWLRoundTags(roundsJSON)
	roundByTag := make(map[string]int)
	warTags := make([]string, 0)
	for roundIndex, tags := range roundTags {
		for _, tag := range tags {
			if tag == "" || tag == "#0" {
				continue
			}
			roundByTag[tag] = roundIndex + 1
			warTags = append(warTags, tag)
		}
	}
	if len(warTags) == 0 {
		return cwlPlayerSeasonFacts{attacks: []modelsv2.CWLPlayerHistoryAttack{}}, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT war_id::text, war_tag, state, size, clan_tag, opponent_tag,
		       clan_stars, opponent_stars,
		       clan_destruction_percentage::float8, opponent_destruction_percentage::float8
		FROM wars
		WHERE war_type = 'cwl' AND war_tag = ANY($1)
		  AND lower(state) IN ('warended', 'ended')
	`, warTags)
	if err != nil {
		return cwlPlayerSeasonFacts{}, err
	}
	defer rows.Close()
	rounds := make(map[string]int)
	warIDs := make([]string, 0, len(warTags))
	normalizedWars := make(map[string]cwlLeagueBackfillWar, len(warTags))
	for rows.Next() {
		var warID string
		var war cwlLeagueBackfillWar
		if err := rows.Scan(
			&warID, &war.tag, &war.state, &war.size, &war.clanTag, &war.opponentTag,
			&war.clanStars, &war.opponentStars, &war.clanDestruction, &war.opponentDestruction,
		); err != nil {
			return cwlPlayerSeasonFacts{}, err
		}
		rounds[warID] = roundByTag[war.tag]
		warIDs = append(warIDs, warID)
		normalizedWars[war.tag] = war
	}
	if err := rows.Err(); err != nil {
		return cwlPlayerSeasonFacts{}, err
	}
	wars, err := sqlArchiveWarsContext(c.UserContext(), a, warIDs)
	if err != nil {
		return cwlPlayerSeasonFacts{}, err
	}
	var summary *cwlSeasonSummary
	if value, ok := calculateCWLSeasonSummary(clanTag, cwlLeagueBackfillGroup{
		cwlID: cwlID, state: state, clanTags: clanTags, roundTags: roundTags,
	}, normalizedWars); ok {
		summary = &value
	}
	attacks := make([]modelsv2.CWLPlayerHistoryAttack, 0)
	missedAttacks := 0
	var actualTeamSize *int
	teamSizeConflict := false
	for warID, war := range wars {
		var own, opponent *wararchive.Clan
		if war.Clan.Tag == clanTag {
			own, opponent = &war.Clan, &war.Opponent
		} else if war.Opponent.Tag == clanTag {
			own, opponent = &war.Opponent, &war.Clan
		} else {
			continue
		}
		var member *wararchive.Member
		for index := range own.Members {
			if own.Members[index].Tag == playerTag {
				member = &own.Members[index]
				break
			}
		}
		if member == nil {
			continue
		}
		if !teamSizeConflict {
			if actualTeamSize == nil {
				value := war.TeamSize
				actualTeamSize = &value
			} else if *actualTeamSize != war.TeamSize {
				actualTeamSize = nil
				teamSizeConflict = true
			}
		}
		missedAttacks += max(0, war.AttacksPerMember-len(member.Attacks))
		defenders := map[string]wararchive.Member{}
		for _, defender := range opponent.Members {
			defenders[defender.Tag] = defender
		}
		for _, attack := range member.Attacks {
			defender := defenders[attack.DefenderTag]
			attacks = append(attacks, modelsv2.CWLPlayerHistoryAttack{
				WarTag: war.WarTag, Round: rounds[warID],
				Opponent: modelsv2.CWLPlayerHistoryAttackOpponent{Tag: opponent.Tag, Name: opponent.Name},
				Defender: modelsv2.CWLPlayerHistoryAttackDefender{Tag: defender.Tag, Name: defender.Name, TownHallLevel: defender.TownhallLevel, MapPosition: defender.MapPosition},
				Stars:    attack.Stars, DestructionPercentage: attack.DestructionPercentage, Order: attack.Order, Duration: attack.Duration,
			})
		}
	}
	sort.Slice(attacks, func(i, j int) bool {
		if attacks[i].Round == attacks[j].Round {
			return attacks[i].Order < attacks[j].Order
		}
		return attacks[i].Round < attacks[j].Round
	})
	return cwlPlayerSeasonFacts{
		attacks:            attacks,
		missedAttacks:      missedAttacks,
		actualTeamSize:     actualTeamSize,
		summary:            summary,
		wars:               wars,
		placementAvailable: strings.EqualFold(state, "ended") && len(warIDs) == len(warTags),
	}, nil
}

func cwlPlayerEarnedStarsPlacement(wars map[string]wararchive.War, playerTag, clanTag string) *modelsv2.CWLPlayerAttackPlacement {
	type entry struct {
		clan, player string
		stars        int
	}
	stars := map[string]*entry{}
	for _, war := range wars {
		for _, clan := range []wararchive.Clan{war.Clan, war.Opponent} {
			for _, member := range clan.Members {
				key := clan.Tag + "\x00" + member.Tag
				value := stars[key]
				if value == nil {
					value = &entry{clan: clan.Tag, player: member.Tag}
					stars[key] = value
				}
				for _, attack := range member.Attacks {
					value.stars += attack.Stars
				}
			}
		}
	}
	entries := make([]*entry, 0, len(stars))
	for _, value := range stars {
		entries = append(entries, value)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].stars > entries[j].stars })
	groupRank, clanRank := 0, 0
	lastGroupStars, lastClanStars := -1, -1
	groupPosition, clanPosition := 0, 0
	for _, value := range entries {
		groupPosition++
		if value.stars != lastGroupStars {
			groupRank = groupPosition
			lastGroupStars = value.stars
		}
		if value.clan == clanTag {
			clanPosition++
			if value.stars != lastClanStars {
				clanRank = clanPosition
				lastClanStars = value.stars
			}
		}
		if value.clan == clanTag && value.player == playerTag {
			return &modelsv2.CWLPlayerAttackPlacement{Clan: clanRank, Group: groupRank}
		}
	}
	return nil
}

type cwlHistoryScanner interface {
	Scan(dest ...any) error
}

func scanCWLHistoryRow(row cwlHistoryScanner) (modelsv2.CWLHistoryItem, error) {
	var season, state, clanTag, name, badgeToken string
	var leagueID, standingLeagueID, stars, wins, losses, ties, warsFinished, totalClans, groupRank, globalRank pgtype.Int4
	var warSize, standingWarSize pgtype.Int2
	var standingUpdatedAt pgtype.Timestamptz
	var clanLevel int
	var roundsRaw, membersRaw []byte
	var standingSeason pgtype.Text
	var destruction pgtype.Float8
	if err := row.Scan(
		&season, &leagueID, &state, &warSize, &roundsRaw,
		&clanTag, &name, &clanLevel, &badgeToken, &membersRaw,
		&standingSeason, &standingLeagueID, &standingWarSize, &stars, &destruction,
		&wins, &losses, &ties, &warsFinished, &totalClans, &groupRank, &globalRank, &standingUpdatedAt,
	); err != nil {
		return modelsv2.CWLHistoryItem{}, err
	}
	item := modelsv2.CWLHistoryItem{
		Season: season, State: state, Rounds: cwlRounds(roundsRaw),
		Clan: modelsv2.CWLGroupClan{ClanTag: clanTag, Name: name, ClanLevel: clanLevel, BadgeToken: badgeToken, Members: cwlRosterMembers(membersRaw)},
	}
	if leagueID.Valid {
		value := int(leagueID.Int32)
		item.CWLLeagueID = &value
	}
	if warSize.Valid {
		value := int(warSize.Int16)
		item.WarSize = &value
	}
	if standingSeason.Valid {
		item.Standing = cwlStandingFromValues(clanTag, standingSeason.String, standingLeagueID, standingWarSize, stars, destruction, wins, losses, ties, warsFinished, totalClans, groupRank, globalRank, standingUpdatedAt)
	}
	return item, nil
}

func cwlStandingFromValues(clanTag, season string, leagueID pgtype.Int4, warSize pgtype.Int2, stars pgtype.Int4, destruction pgtype.Float8, wins, losses, ties, warsFinished, totalClans, groupRank, globalRank pgtype.Int4, updatedAt pgtype.Timestamptz) *modelsv2.CWLStanding {
	if !leagueID.Valid || !warSize.Valid || !stars.Valid || !destruction.Valid || !wins.Valid || !losses.Valid || !ties.Valid || !warsFinished.Valid || !totalClans.Valid || !updatedAt.Valid {
		return nil
	}
	standing := &modelsv2.CWLStanding{ClanTag: clanTag, Season: season, CWLLeagueID: int(leagueID.Int32), WarSize: int(warSize.Int16), Stars: int(stars.Int32), Destruction: destruction.Float64, Wins: int(wins.Int32), Losses: int(losses.Int32), Ties: int(ties.Int32), WarsFinished: int(warsFinished.Int32), TotalClansInGroup: int(totalClans.Int32), UpdatedAt: updatedAt.Time.UTC().Format(time.RFC3339)}
	if groupRank.Valid {
		value := int(groupRank.Int32)
		standing.GroupRank = &value
	}
	if globalRank.Valid {
		value := int(globalRank.Int32)
		standing.GlobalRank = &value
	}
	return standing
}

func cwlRounds(raw []byte) []modelsv2.CWLRound {
	var source []struct {
		WarTags []string `json:"warTags"`
	}
	_ = json.Unmarshal(raw, &source)
	items := make([]modelsv2.CWLRound, 0, len(source))
	for _, round := range source {
		items = append(items, modelsv2.CWLRound{WarTags: round.WarTags})
	}
	return items
}

func cwlRosterMembers(raw []byte) []modelsv2.CWLMember {
	var members []modelsv2.CWLMember
	_ = json.Unmarshal(raw, &members)
	if members == nil {
		return []modelsv2.CWLMember{}
	}
	return members
}

func cwlStandingsForLeague(c *fiber.Ctx, a apptypes.Deps, season string, leagueID, warSize int) ([]modelsv2.CWLStanding, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT clan_tag, season, cwl_league_id, war_size, stars, destruction::float8,
		       wins, losses, ties, wars_finished, total_clans_in_group, group_rank, global_rank, updated_at
		FROM cwl_standings
		WHERE season = $1 AND cwl_league_id = $2 AND war_size = $3
		ORDER BY global_rank NULLS LAST, group_rank NULLS LAST, clan_tag
	`, season, leagueID, warSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.CWLStanding, 0)
	for rows.Next() {
		var clanTag, standingSeason string
		var standingLeagueID, stars, wins, losses, ties, warsFinished, totalClans, groupRank, globalRank pgtype.Int4
		var standingWarSize pgtype.Int2
		var destruction pgtype.Float8
		var updatedAt pgtype.Timestamptz
		if err := rows.Scan(&clanTag, &standingSeason, &standingLeagueID, &standingWarSize, &stars, &destruction, &wins, &losses, &ties, &warsFinished, &totalClans, &groupRank, &globalRank, &updatedAt); err != nil {
			return nil, err
		}
		if standing := cwlStandingFromValues(clanTag, standingSeason, standingLeagueID, standingWarSize, stars, destruction, wins, losses, ties, warsFinished, totalClans, groupRank, globalRank, updatedAt); standing != nil {
			items = append(items, *standing)
		}
	}
	return items, rows.Err()
}

func warTimestampToTime(value string) time.Time {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err == nil {
		return time.Unix(parsed, 0).UTC()
	}
	if parsedTime, err := time.Parse("20060102T150405.000Z", value); err == nil {
		return parsedTime.UTC()
	}
	return time.Unix(0, 0).UTC()
}

func currentWarSummary(ctx context.Context, a apptypes.Deps, tag string) map[string]any {
	tag = warFixTag(tag)

	war, err := a.Clash.Client().GetCurrentWar(ctx, tag)

	isInWar := false
	var warInfo any
	if err != nil || war == nil || war.State == "" || war.State == clashy.WarStateNotInWar {
		warInfo = map[string]any{"state": "notInWar"}
	} else {
		isInWar = true
		currentWarInfo := mobileHTTPGetJSON("https://proxy.clashk.ing/v1/clans/" + url.PathEscape(tag) + "/currentwar")
		if currentWarInfo == nil {
			currentWarInfo = playerStructToMap(war)
		}
		warInfo = map[string]any{
			"state":          "war",
			"currentWarInfo": currentWarInfo,
			"bypass":         false,
		}
	}

	isInCwl := false
	var leagueInfo any
	warLeagueInfos := []any{}

	if isCWLWindow() {
		lg := fetchLeagueGroupProxy(tag)
		if lg != nil && warAsString(lg["state"]) != "notInWar" && warAsString(lg["state"]) != "" {
			leagueWars := fetchLeagueWarsProxy(extractLeagueWarTags(lg))
			leagueInfo = enrichLeagueInfoIcons(enrichLeagueInfo(lg, leagueWars), leagueIconLookup(a))
			warLeagueInfos = mobileMapsToAny(leagueWars)

			if !isInWar {
				isInCwl = true
			}
		}
	}

	return warSummaryResponse(tag, isInWar, isInCwl, warInfo, leagueInfo, warLeagueInfos)
}

func warSummaryResponse(tag string, isInWar bool, isInCwl bool, warInfo any, leagueInfo any, warLeagueInfos []any) map[string]any {
	return map[string]any{
		"clan_tag":         warFixTag(tag),
		"isInWar":          isInWar,
		"isInCwl":          isInCwl,
		"war_info":         warSummaryInfoMap(warInfo),
		"league_info":      warSummaryMapOrNil(leagueInfo),
		"war_league_infos": warSummarySlice(warLeagueInfos),
	}
}

func warSummaryInfoMap(warInfo any) map[string]any {
	info := warSummaryMapOrNil(warInfo)
	if info == nil {
		return map[string]any{"state": "notInWar"}
	}
	if strings.TrimSpace(warAsString(info["state"])) == "" {
		info["state"] = "unknown"
	}
	if currentWarInfo := warSummaryMapOrNil(info["currentWarInfo"]); currentWarInfo != nil {
		info["currentWarInfo"] = currentWarInfo
	} else {
		delete(info, "currentWarInfo")
	}
	return info
}

func warSummarySlice(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		if mapped := warSummaryMapOrNil(item); mapped != nil {
			out = append(out, mapped)
		}
	}
	return out
}

func warSummaryMapOrNil(value any) map[string]any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return mapsClone(typed)
	case map[string]string:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = item
		}
		return out
	}
	return nil
}

func mapsClone(value map[string]any) map[string]any {
	out := make(map[string]any, len(value))
	for key, item := range value {
		out[key] = item
	}
	return out
}

// isCWLWindow returns true during the Clan War League event window.
// CWL runs from the 1st at 08:00 UTC through the 11th at 07:59 UTC each month.
func isCWLWindow() bool {
	now := time.Now().UTC()
	d, h := now.Day(), now.Hour()
	if d < 1 || d > 12 {
		return false
	}
	if d == 1 && h < 8 {
		return false
	}
	if d == 11 && h >= 8 {
		return false
	}
	return true
}

type cwlClanStats struct {
	totalStars                int
	attackCount               int
	missedAttacks             int
	missedDefenses            int
	totalDestruction          float64
	totalDestructionInflicted float64
	warsPlayed                int
	members                   map[string]*cwlMemberStats
}

type cwlMemberStats struct {
	name                       string
	avgTownHallLevel           float64
	mapPositionList            []float64
	opponentPositionList       []float64
	attackOrderList            []float64
	opponentTHLevelList        []float64
	attackerPositionList       []float64
	defenseOrderList           []float64
	attackerTHLevelList        []float64
	ownTHLevelListAttack       []int
	opponentTHLevelListAttack  []int
	ownTHLevelListDefense      []int
	attackerTHLevelListDefense []int
	stars                      int
	starsByTH                  map[int]map[int]int
	totalDestruction           float64
	attackCount                int
	missedAttacks              int
	defenseStarsTaken          int
	defenseStarsByTH           map[int]map[int]int
	defenseTotalDestruction    float64
	defenseCount               int
	missedDefenses             int
}

func initCWLClanStats(leagueInfo map[string]any) map[string]*cwlClanStats {
	statsMap := make(map[string]*cwlClanStats)
	for _, rawClan := range mobileList(leagueInfo["clans"]) {
		clan := mobileMap(rawClan)
		tag := warAsString(clan["tag"])
		if tag == "" {
			continue
		}
		summary := &cwlClanStats{
			members: make(map[string]*cwlMemberStats),
		}
		for _, rawMember := range mobileList(clan["members"]) {
			member := mobileMap(rawMember)
			memberTag := warAsString(member["tag"])
			if memberTag == "" {
				continue
			}
			summary.members[memberTag] = newCWLMemberStats(member)
		}
		statsMap[tag] = summary
	}
	return statsMap
}

func newCWLMemberStats(member map[string]any) *cwlMemberStats {
	stats := &cwlMemberStats{
		name:             warAsString(member["name"]),
		starsByTH:        make(map[int]map[int]int),
		defenseStarsByTH: make(map[int]map[int]int),
	}
	if townHallLevel := cwlTownHallLevel(member); townHallLevel > 0 {
		stats.avgTownHallLevel = float64(townHallLevel)
	}
	return stats
}

func cwlTownHallLevel(member map[string]any) int {
	if value, ok := member["townHallLevel"]; ok {
		return mobileInt(value)
	}
	return mobileInt(member["townhallLevel"])
}

func cwlMembersByTag(value any) map[string]map[string]any {
	out := make(map[string]map[string]any)
	for _, rawMember := range mobileList(value) {
		member := mobileMap(rawMember)
		tag := warAsString(member["tag"])
		if tag == "" {
			continue
		}
		out[tag] = member
	}
	return out
}

func cwlEnsureMemberStats(summary *cwlClanStats, member map[string]any) *cwlMemberStats {
	tag := warAsString(member["tag"])
	if tag == "" {
		return newCWLMemberStats(member)
	}
	stats, ok := summary.members[tag]
	if !ok {
		stats = newCWLMemberStats(member)
		summary.members[tag] = stats
	}
	if name := warAsString(member["name"]); name != "" {
		stats.name = name
	}
	if townHallLevel := cwlTownHallLevel(member); townHallLevel > 0 {
		stats.avgTownHallLevel = float64(townHallLevel)
	}
	return stats
}

func cwlAppendMemberContext(stats *cwlMemberStats, member map[string]any) {
	if position, ok := member["mapPosition"]; ok {
		stats.mapPositionList = append(stats.mapPositionList, float64(mobileInt(position)))
	}
}

func cwlFirstMap(value any) map[string]any {
	if mapped := mobileMap(value); len(mapped) > 0 {
		return mapped
	}
	items := mobileList(value)
	if len(items) == 0 {
		return nil
	}
	mapped := mobileMap(items[0])
	if len(mapped) == 0 {
		return nil
	}
	return mapped
}

func cwlIncrementTownHallBucket(buckets map[int]map[int]int, stars int, townHallLevel int) {
	if townHallLevel <= 0 {
		return
	}
	if buckets[stars] == nil {
		buckets[stars] = make(map[int]int)
	}
	buckets[stars][townHallLevel]++
}

func cwlProcessMemberAttack(stats *cwlMemberStats, summary *cwlClanStats, member map[string]any, opponentMembers map[string]map[string]any, warState string) {
	attack := cwlFirstMap(member["attacks"])
	if attack == nil {
		if warState == "warEnded" {
			stats.missedAttacks++
			summary.missedAttacks++
		}
		return
	}

	stars := mobileInt(attack["stars"])
	destruction := mobileFloat(attack["destructionPercentage"])
	stats.stars += stars
	stats.totalDestruction += destruction
	stats.attackCount++
	summary.totalDestructionInflicted += destruction
	summary.attackCount++

	if order, ok := attack["order"]; ok {
		stats.attackOrderList = append(stats.attackOrderList, float64(mobileInt(order)))
	}

	defenderTag := warAsString(attack["defenderTag"])
	defender, ok := opponentMembers[defenderTag]
	if !ok {
		return
	}

	if position, ok := defender["mapPosition"]; ok {
		stats.opponentPositionList = append(stats.opponentPositionList, float64(mobileInt(position)))
	}

	ownTownHallLevel := cwlTownHallLevel(member)
	defenderTownHallLevel := cwlTownHallLevel(defender)
	if defenderTownHallLevel <= 0 {
		return
	}

	cwlIncrementTownHallBucket(stats.starsByTH, stars, defenderTownHallLevel)
	if ownTownHallLevel > 0 {
		stats.ownTHLevelListAttack = append(stats.ownTHLevelListAttack, ownTownHallLevel)
	}
	stats.opponentTHLevelListAttack = append(stats.opponentTHLevelListAttack, defenderTownHallLevel)
	stats.opponentTHLevelList = append(stats.opponentTHLevelList, float64(defenderTownHallLevel))
}

func cwlProcessMemberDefense(stats *cwlMemberStats, summary *cwlClanStats, member map[string]any, opponentMembers map[string]map[string]any) {
	defense := mobileMap(member["bestOpponentAttack"])
	if len(defense) == 0 {
		stats.missedDefenses++
		summary.missedDefenses++
		return
	}

	stars := mobileInt(defense["stars"])
	destruction := mobileFloat(defense["destructionPercentage"])
	stats.defenseStarsTaken += stars
	stats.defenseTotalDestruction += destruction
	stats.defenseCount++
	summary.totalDestruction += destruction

	if order, ok := defense["order"]; ok {
		stats.defenseOrderList = append(stats.defenseOrderList, float64(mobileInt(order)))
	}

	attackerTag := warAsString(defense["attackerTag"])
	attacker, ok := opponentMembers[attackerTag]
	if !ok {
		return
	}

	if position, ok := attacker["mapPosition"]; ok {
		stats.attackerPositionList = append(stats.attackerPositionList, float64(mobileInt(position)))
	}

	defenderTownHallLevel := cwlTownHallLevel(member)
	attackerTownHallLevel := cwlTownHallLevel(attacker)
	if attackerTownHallLevel <= 0 {
		return
	}

	cwlIncrementTownHallBucket(stats.defenseStarsByTH, stars, attackerTownHallLevel)
	if defenderTownHallLevel > 0 {
		stats.ownTHLevelListDefense = append(stats.ownTHLevelListDefense, defenderTownHallLevel)
	}
	stats.attackerTHLevelListDefense = append(stats.attackerTHLevelListDefense, attackerTownHallLevel)
	stats.attackerTHLevelList = append(stats.attackerTHLevelList, float64(attackerTownHallLevel))
}

func cwlAverage(values []float64) any {
	if len(values) == 0 {
		return nil
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return math.Round((total/float64(len(values)))*10) / 10
}

func cwlCountTownHallMatchups(ownLevels []int, opponentLevels []int, comparator func(int, int) bool) int {
	limit := len(ownLevels)
	if len(opponentLevels) < limit {
		limit = len(opponentLevels)
	}
	total := 0
	for index := 0; index < limit; index++ {
		if comparator(opponentLevels[index], ownLevels[index]) {
			total++
		}
	}
	return total
}

func cwlTownHallBucketJSON(buckets map[int]map[int]int, stars int) map[string]int {
	out := make(map[string]int)
	for townHallLevel, count := range buckets[stars] {
		out[strconv.Itoa(townHallLevel)] = count
	}
	return out
}

func cwlRoundToTwo(value float64) float64 {
	return math.Round(value*100) / 100
}

func cwlBuildMemberEnrichment(stats *cwlMemberStats) map[string]any {
	var avgTownHallLevel any
	if stats.avgTownHallLevel > 0 {
		avgTownHallLevel = stats.avgTownHallLevel
	}

	return map[string]any{
		"avgMapPosition":           cwlAverage(stats.mapPositionList),
		"avgOpponentPosition":      cwlAverage(stats.opponentPositionList),
		"avgAttackOrder":           cwlAverage(stats.attackOrderList),
		"avgTownHallLevel":         avgTownHallLevel,
		"avgOpponentTownHallLevel": cwlAverage(stats.opponentTHLevelList),
		"avgAttackerPosition":      cwlAverage(stats.attackerPositionList),
		"avgDefenseOrder":          cwlAverage(stats.defenseOrderList),
		"avgAttackerTownHallLevel": cwlAverage(stats.attackerTHLevelList),
		"attackLowerTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListAttack,
			stats.opponentTHLevelListAttack,
			func(opponent int, own int) bool { return opponent < own },
		),
		"attackUpperTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListAttack,
			stats.opponentTHLevelListAttack,
			func(opponent int, own int) bool { return opponent > own },
		),
		"defenseLowerTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListDefense,
			stats.attackerTHLevelListDefense,
			func(opponent int, own int) bool { return opponent < own },
		),
		"defenseUpperTHLevel": cwlCountTownHallMatchups(
			stats.ownTHLevelListDefense,
			stats.attackerTHLevelListDefense,
			func(opponent int, own int) bool { return opponent > own },
		),
		"attacks": map[string]any{
			"stars":             stats.stars,
			"3_stars":           cwlTownHallBucketJSON(stats.starsByTH, 3),
			"2_stars":           cwlTownHallBucketJSON(stats.starsByTH, 2),
			"1_star":            cwlTownHallBucketJSON(stats.starsByTH, 1),
			"0_star":            cwlTownHallBucketJSON(stats.starsByTH, 0),
			"total_destruction": cwlRoundToTwo(stats.totalDestruction),
			"attack_count":      stats.attackCount,
			"missed_attacks":    stats.missedAttacks,
		},
		"defense": map[string]any{
			"stars":             stats.defenseStarsTaken,
			"3_stars":           cwlTownHallBucketJSON(stats.defenseStarsByTH, 3),
			"2_stars":           cwlTownHallBucketJSON(stats.defenseStarsByTH, 2),
			"1_star":            cwlTownHallBucketJSON(stats.defenseStarsByTH, 1),
			"0_star":            cwlTownHallBucketJSON(stats.defenseStarsByTH, 0),
			"total_destruction": cwlRoundToTwo(stats.defenseTotalDestruction),
			"defense_count":     stats.defenseCount,
			"missed_defenses":   stats.missedDefenses,
		},
	}
}

func cwlBuildTownHallLevels(members []any) map[string]int {
	out := make(map[string]int)
	for _, rawMember := range members {
		townHallLevel := cwlTownHallLevel(mobileMap(rawMember))
		if townHallLevel <= 0 {
			continue
		}
		out[strconv.Itoa(townHallLevel)]++
	}
	return out
}

// enrichLeagueInfo adds per-clan CWL stats derived from the individual league wars.
func enrichLeagueInfo(leagueInfo map[string]any, wars []map[string]any) map[string]any {
	result := mapsClone(leagueInfo)

	statsMap := initCWLClanStats(result)

	for _, war := range wars {
		state := warAsString(war["state"])
		if state != "inWar" && state != "warEnded" {
			continue
		}
		for _, sideKey := range []string{"clan", "opponent"} {
			clan := mobileMap(war[sideKey])
			tag := warAsString(clan["tag"])
			summary, ok := statsMap[tag]
			if !ok {
				continue
			}

			summary.totalStars += mobileInt(clan["stars"])
			summary.warsPlayed++

			opponentKey := "opponent"
			if sideKey == "opponent" {
				opponentKey = "clan"
			}
			opponentMembers := cwlMembersByTag(mobileMap(war[opponentKey])["members"])
			for _, rawMember := range mobileList(clan["members"]) {
				member := mobileMap(rawMember)
				stats := cwlEnsureMemberStats(summary, member)
				cwlAppendMemberContext(stats, member)
				cwlProcessMemberAttack(stats, summary, member, opponentMembers, state)
				cwlProcessMemberDefense(stats, summary, member, opponentMembers)
			}
		}
	}

	type rankEntry struct {
		tag         string
		stars       int
		destruction float64
	}
	ranking := make([]rankEntry, 0, len(statsMap))
	for tag, s := range statsMap {
		ranking = append(ranking, rankEntry{tag: tag, stars: s.totalStars, destruction: s.totalDestructionInflicted})
	}
	sort.Slice(ranking, func(i, j int) bool {
		if ranking[i].stars != ranking[j].stars {
			return ranking[i].stars > ranking[j].stars
		}
		return ranking[i].destruction > ranking[j].destruction
	})
	rankMap := make(map[string]int, len(ranking))
	for i, r := range ranking {
		rankMap[r.tag] = i + 1
	}

	clans := mobileList(result["clans"])
	totalStars := 0
	totalDestruction := 0.0
	warLeagueName := warAsString(result["war_league"])
	for _, rawClan := range clans {
		clan := mobileMap(rawClan)
		tag := warAsString(clan["tag"])
		summary, ok := statsMap[tag]
		if !ok {
			continue
		}

		clan["total_stars"] = summary.totalStars
		clan["attack_count"] = summary.attackCount
		clan["missed_attacks"] = summary.missedAttacks
		clan["total_destruction"] = cwlRoundToTwo(summary.totalDestruction)
		clan["total_destruction_inflicted"] = cwlRoundToTwo(summary.totalDestructionInflicted)
		clan["wars_played"] = summary.warsPlayed
		clan["rank"] = rankMap[tag]

		members := mobileList(clan["members"])
		clan["town_hall_levels"] = cwlBuildTownHallLevels(members)
		if warLeagueName == "" {
			warLeagueName = warAsString(mobileMap(clan["warLeague"])["name"])
		}
		for _, rawMember := range members {
			member := mobileMap(rawMember)
			stats, ok := summary.members[warAsString(member["tag"])]
			if !ok {
				continue
			}
			for key, value := range cwlBuildMemberEnrichment(stats) {
				member[key] = value
			}
		}
		totalStars += summary.totalStars
		totalDestruction += summary.totalDestructionInflicted
	}
	result["clans"] = clans
	result["total_stars"] = totalStars
	result["total_destruction"] = cwlRoundToTwo(totalDestruction)
	if warLeagueName != "" {
		result["war_league"] = warLeagueName
	}

	return result
}

func fetchLeagueGroupProxy(tag string) map[string]any {
	url := "https://proxy.clashk.ing/v1/clans/" + url.PathEscape(tag) + "/currentwar/leaguegroup"
	data := mobileHTTPGetJSON(url)
	if len(data) == 0 {
		return nil
	}
	return data
}

func extractLeagueWarTags(leagueInfo map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, rawRound := range mobileList(leagueInfo["rounds"]) {
		round := mobileMap(rawRound)
		for _, rawTag := range mobileList(round["warTags"]) {
			tag := warFixTag(warAsString(rawTag))
			if tag == "" || tag == "#0" || seen[tag] {
				continue
			}
			seen[tag] = true
			out = append(out, tag)
		}
	}
	return out
}

func fetchLeagueWarsProxy(warTags []string) []map[string]any {
	if len(warTags) == 0 {
		return nil
	}

	results := make([]map[string]any, len(warTags))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)

	for idx, warTag := range warTags {
		wg.Add(1)
		go func(i int, tag string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			url := "https://proxy.clashk.ing/v1/clanwarleagues/wars/" + url.PathEscape(tag)
			data := mobileHTTPGetJSON(url)
			if len(data) == 0 || warAsString(data["state"]) == "notInWar" {
				return
			}
			data["war_tag"] = tag
			results[i] = data
		}(idx, warTag)
	}

	wg.Wait()

	out := make([]map[string]any, 0, len(results))
	for _, item := range results {
		if item != nil {
			out = append(out, item)
		}
	}
	return out
}

func timestampString(raw string, fallback int64) string {
	value := fallback
	if raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			value = parsed
		}
	}
	return time.Unix(value, 0).UTC().Format("20060102T150405.000Z")
}

func warParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func warMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitCSV(list []string, single string) []string {
	out := make([]string, 0, len(list)+1)
	for _, raw := range list {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, warFixTag(trimmed))
			}
		}
	}
	if single != "" {
		out = append(out, warFixTag(single))
	}
	return out
}

func warAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asArray(v any) []any {
	if arr, ok := v.([]any); ok {
		return arr
	}
	return nil
}

func nestedString(data map[string]any, path ...string) string {
	current := any(data)
	for _, part := range path {
		if idx, err := strconv.Atoi(part); err == nil {
			items := asArray(current)
			if idx < 0 || idx >= len(items) {
				return ""
			}
			current = items[idx]
			continue
		}
		mapped := warMap(current)
		if mapped == nil {
			return ""
		}
		current = mapped[part]
	}
	return warAsString(current)
}

func warFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, warFixTag(tag))
	}
	return out
}

func warMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	default:
		return nil
	}
}

func warFixTag(tag string) string {
	if decoded, err := url.PathUnescape(tag); err == nil {
		tag = decoded
	}
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimLeft(tag, "#!")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}
