package routes

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	cwlUnrankedLeagueID      = 48000000
	cwlLowestLeagueID        = 48000001
	cwlHighestLeagueID       = 48000022
	cwlDirectHistoryEndMonth = "2025-08"
	cwlBackfillEndMonth      = "2026-09"
)

type cwlLeagueRule struct {
	promotionRank int
	demotionRank  int
	demotionCount int
}

var historicalCWLLeagueRules = map[int]cwlLeagueRule{
	// These are the promo/demote rank cutoffs from the pre-May 2026
	// clashking_bot/assets/war_leagues.json snapshot.
	48000001: {promotionRank: 3, demotionRank: 9},
	48000002: {promotionRank: 3, demotionRank: 8},
	48000003: {promotionRank: 3, demotionRank: 8},
	48000004: {promotionRank: 2, demotionRank: 8},
	48000005: {promotionRank: 2, demotionRank: 7},
	48000006: {promotionRank: 2, demotionRank: 7},
	48000007: {promotionRank: 2, demotionRank: 7},
	48000008: {promotionRank: 2, demotionRank: 7},
	48000009: {promotionRank: 2, demotionRank: 7},
	48000010: {promotionRank: 2, demotionRank: 7},
	48000011: {promotionRank: 2, demotionRank: 7},
	48000012: {promotionRank: 1, demotionRank: 7},
	48000013: {promotionRank: 1, demotionRank: 7},
	48000014: {promotionRank: 1, demotionRank: 7},
	48000015: {promotionRank: 1, demotionRank: 7},
	48000016: {promotionRank: 1, demotionRank: 7},
	48000017: {promotionRank: 1, demotionRank: 7},
	48000018: {promotionRank: 0, demotionRank: 6},
	// Titan and Legend did not exist in the historical snapshot. These entries
	// are present only so the May-August 2026 overrides can be applied.
	48000019: {promotionRank: 1, demotionRank: 7},
	48000020: {promotionRank: 1, demotionRank: 7},
	48000021: {promotionRank: 1, demotionRank: 7},
	48000022: {promotionRank: 0, demotionRank: 7},
}

var currentCWLLeagueRules = map[int]cwlLeagueRule{
	48000001: {promotionRank: 3, demotionCount: 0},
	48000002: {promotionRank: 3, demotionCount: 1},
	48000003: {promotionRank: 3, demotionCount: 1},
	48000004: {promotionRank: 2, demotionCount: 1},
	48000005: {promotionRank: 2, demotionCount: 2},
	48000006: {promotionRank: 2, demotionCount: 2},
	48000007: {promotionRank: 2, demotionCount: 2},
	48000008: {promotionRank: 2, demotionCount: 2},
	48000009: {promotionRank: 2, demotionCount: 2},
	48000010: {promotionRank: 2, demotionCount: 2},
	48000011: {promotionRank: 2, demotionCount: 2},
	48000012: {promotionRank: 2, demotionCount: 2},
	48000013: {promotionRank: 2, demotionCount: 2},
	48000014: {promotionRank: 2, demotionCount: 2},
	48000015: {promotionRank: 1, demotionCount: 2},
	48000016: {promotionRank: 1, demotionCount: 2},
	48000017: {promotionRank: 1, demotionCount: 2},
	48000018: {promotionRank: 1, demotionCount: 2},
	48000019: {promotionRank: 1, demotionCount: 2},
	48000020: {promotionRank: 1, demotionCount: 2},
	48000021: {promotionRank: 1, demotionCount: 2},
	48000022: {promotionRank: 0, demotionCount: 2},
}

type cwlLeagueBackfillGroup struct {
	cwlID     string
	season    string
	month     string
	state     string
	leagueID  int
	warSize   int
	clanTags  []string
	roundTags [][]string
	rank      int
	complete  bool
}

type cwlLeagueBackfillWar struct {
	tag                 string
	state               string
	size                int
	clanTag             string
	opponentTag         string
	clanStars           int
	opponentStars       int
	clanDestruction     float64
	opponentDestruction float64
}

type cwlLeagueStanding struct {
	tag          string
	stars        int
	destruction  float64
	wins         int
	ties         int
	losses       int
	warsFinished int
	rank         int
}

type cwlSeasonSummary struct {
	rank        int
	stars       int
	destruction float64
	wins        int
	ties        int
	losses      int
}

func ensureCWLLeagueIDs(c *fiber.Ctx, a apptypes.Deps, clanTag string) error {
	var hasMissingLeagueID bool
	var hasMissingWarSize bool
	if err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT
			COALESCE(bool_or(
				groups.cwl_league_id IS NULL AND left(groups.season, 7) < $2
			), false),
			COALESCE(bool_or(groups.war_size IS NULL), false)
		FROM cwl_groups AS groups
		JOIN cwl_group_clans AS clans ON clans.cwl_id = groups.cwl_id
		WHERE clans.clan_tag = $1
	`, clanTag, cwlBackfillEndMonth).Scan(&hasMissingLeagueID, &hasMissingWarSize); err != nil {
		return err
	}
	if !hasMissingLeagueID && !hasMissingWarSize {
		return nil
	}

	history := map[string]int{}
	hasLeagueHistory := false
	if hasMissingLeagueID {
		var historyJSON []byte
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT seasons
			FROM cwl_league_history
			WHERE clan_tag = $1
		`, clanTag).Scan(&historyJSON)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil {
			if err := json.Unmarshal(historyJSON, &history); err != nil {
				return err
			}
			hasLeagueHistory = true
		}
	}

	groups, err := loadCWLLeagueBackfillGroups(c, a, clanTag)
	if err != nil {
		return err
	}
	if len(groups) == 0 {
		return nil
	}
	peerAssignments, err := loadCWLPeerLeagueAssignments(c, a, groups)
	if err != nil {
		return err
	}
	for index := range groups {
		if groups[index].leagueID != 0 {
			continue
		}
		if leagueID, ok := peerAssignments[groups[index].cwlID]; ok {
			groups[index].leagueID = leagueID
		}
	}
	wars, err := loadCWLLeagueBackfillWars(c, a, groups)
	if err != nil {
		return err
	}
	leagueAssignments := peerAssignments
	if hasLeagueHistory || len(peerAssignments) > 0 {
		for index := range groups {
			groups[index].rank, groups[index].complete = calculateCWLLeagueBackfillRank(clanTag, groups[index], wars)
		}
		for cwlID, leagueID := range cwlLeagueAssignments(groups, history, hasLeagueHistory) {
			leagueAssignments[cwlID] = leagueID
		}
	}
	warSizeAssignments := cwlWarSizeAssignments(groups, wars)
	if len(leagueAssignments) == 0 && len(warSizeAssignments) == 0 && !hasLeagueHistory {
		return nil
	}

	tx, err := a.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.UserContext())
	for cwlID, leagueID := range leagueAssignments {
		if _, err := tx.Exec(c.UserContext(), `
			UPDATE cwl_groups
			SET cwl_league_id = $1
			WHERE cwl_id = $2 AND cwl_league_id IS NULL
		`, leagueID, cwlID); err != nil {
			return err
		}
	}
	for cwlID, warSize := range warSizeAssignments {
		if _, err := tx.Exec(c.UserContext(), `
			UPDATE cwl_groups
			SET war_size = $1
			WHERE cwl_id = $2 AND war_size IS NULL
		`, warSize, cwlID); err != nil {
			return err
		}
	}
	if hasLeagueHistory {
		var missing int
		if err := tx.QueryRow(c.UserContext(), `
			SELECT count(*)
			FROM cwl_groups AS groups
			JOIN cwl_group_clans AS clans ON clans.cwl_id = groups.cwl_id
			WHERE clans.clan_tag = $1
			  AND groups.cwl_league_id IS NULL
			  AND left(groups.season, 7) < $2
		`, clanTag, cwlBackfillEndMonth).Scan(&missing); err != nil {
			return err
		}
		if missing == 0 {
			if _, err := tx.Exec(c.UserContext(), `DELETE FROM cwl_league_history WHERE clan_tag = $1`, clanTag); err != nil {
				return err
			}
		}
	}
	return tx.Commit(c.UserContext())
}

func loadCWLPeerLeagueAssignments(
	c *fiber.Ctx,
	a apptypes.Deps,
	groups []cwlLeagueBackfillGroup,
) (map[string]int, error) {
	clanTags := make([]string, 0)
	seen := make(map[string]struct{})
	for _, group := range groups {
		for _, clanTag := range group.clanTags {
			if _, ok := seen[clanTag]; ok {
				continue
			}
			seen[clanTag] = struct{}{}
			clanTags = append(clanTags, clanTag)
		}
	}
	if len(clanTags) == 0 {
		return map[string]int{}, nil
	}

	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT clan_tag, seasons
		FROM cwl_league_history
		WHERE clan_tag = ANY($1)
	`, clanTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	histories := make(map[string]map[string]int)
	for rows.Next() {
		var clanTag string
		var historyJSON []byte
		if err := rows.Scan(&clanTag, &historyJSON); err != nil {
			return nil, err
		}
		history := map[string]int{}
		if err := json.Unmarshal(historyJSON, &history); err != nil {
			return nil, err
		}
		histories[clanTag] = history
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	assignments := make(map[string]int)
	for _, group := range groups {
		if group.leagueID != 0 || group.month == "" {
			continue
		}
		votes := make([]int, 0, len(group.clanTags))
		for _, clanTag := range group.clanTags {
			leagueID := histories[clanTag][group.month]
			if leagueID >= cwlUnrankedLeagueID && leagueID <= cwlHighestLeagueID {
				votes = append(votes, leagueID)
			}
		}
		if leagueID, ok := majorityCWLLeagueID(votes); ok {
			assignments[group.cwlID] = leagueID
		}
	}
	return assignments, nil
}

func majorityCWLLeagueID(votes []int) (int, bool) {
	counts := make(map[int]int)
	for _, leagueID := range votes {
		counts[leagueID]++
		if counts[leagueID] > len(votes)/2 {
			return leagueID, true
		}
	}
	return 0, false
}

func loadCWLLeagueBackfillGroups(c *fiber.Ctx, a apptypes.Deps, clanTag string) ([]cwlLeagueBackfillGroup, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT groups.cwl_id, groups.season, groups.state, groups.rounds, groups.cwl_league_id,
		       groups.war_size,
		       array_agg(all_clans.clan_tag ORDER BY all_clans.clan_tag)
		FROM cwl_groups AS groups
		JOIN cwl_group_clans AS requested_clan ON requested_clan.cwl_id = groups.cwl_id
		JOIN cwl_group_clans AS all_clans ON all_clans.cwl_id = groups.cwl_id
		WHERE requested_clan.clan_tag = $1
		GROUP BY groups.cwl_id, groups.season, groups.state, groups.rounds, groups.cwl_league_id
		ORDER BY CASE
			WHEN length(groups.season) = 7 THEN groups.season || '-01'
			ELSE groups.season
		END, groups.cwl_id
	`, clanTag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := make([]cwlLeagueBackfillGroup, 0)
	for rows.Next() {
		var group cwlLeagueBackfillGroup
		var roundsJSON []byte
		var leagueID pgtype.Int4
		var warSize pgtype.Int2
		if err := rows.Scan(&group.cwlID, &group.season, &group.state, &roundsJSON, &leagueID, &warSize, &group.clanTags); err != nil {
			return nil, err
		}
		group.month = cwlSeasonMonth(group.season)
		group.roundTags = decodeCWLRoundTags(roundsJSON)
		if leagueID.Valid {
			group.leagueID = int(leagueID.Int32)
		}
		if warSize.Valid {
			group.warSize = int(warSize.Int16)
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func loadCWLLeagueBackfillWars(c *fiber.Ctx, a apptypes.Deps, groups []cwlLeagueBackfillGroup) (map[string]cwlLeagueBackfillWar, error) {
	tags := make([]string, 0)
	seen := map[string]struct{}{}
	for _, group := range groups {
		for _, round := range group.roundTags {
			for _, tag := range round {
				if tag == "" || tag == "#0" {
					continue
				}
				if _, exists := seen[tag]; exists {
					continue
				}
				seen[tag] = struct{}{}
				tags = append(tags, tag)
			}
		}
	}
	if len(tags) == 0 {
		return map[string]cwlLeagueBackfillWar{}, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT war_tag, state, size, clan_tag, opponent_tag, clan_stars, opponent_stars,
		       clan_destruction_percentage::float8, opponent_destruction_percentage::float8
		FROM wars
		WHERE war_type = 'cwl' AND war_tag = ANY($1)
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	wars := make(map[string]cwlLeagueBackfillWar, len(tags))
	for rows.Next() {
		var war cwlLeagueBackfillWar
		if err := rows.Scan(
			&war.tag, &war.state, &war.size, &war.clanTag, &war.opponentTag,
			&war.clanStars, &war.opponentStars, &war.clanDestruction, &war.opponentDestruction,
		); err != nil {
			return nil, err
		}
		wars[war.tag] = war
	}
	return wars, rows.Err()
}

func cwlWarSizeAssignments(
	groups []cwlLeagueBackfillGroup,
	wars map[string]cwlLeagueBackfillWar,
) map[string]int {
	assignments := make(map[string]int)
	for _, group := range groups {
		if group.warSize > 0 {
			continue
		}
		warSize := 0
		consistent := true
		for _, round := range group.roundTags {
			for _, tag := range round {
				war, exists := wars[tag]
				if !exists || war.size <= 0 {
					continue
				}
				if warSize == 0 {
					warSize = war.size
					continue
				}
				if warSize != war.size {
					consistent = false
					break
				}
			}
			if !consistent {
				break
			}
		}
		if consistent && warSize > 0 {
			assignments[group.cwlID] = warSize
		}
	}
	return assignments
}

func calculateCWLGroupStandings(group cwlLeagueBackfillGroup, wars map[string]cwlLeagueBackfillWar) ([]cwlLeagueStanding, bool) {
	standings := make(map[string]*cwlLeagueStanding, len(group.clanTags))
	for _, tag := range group.clanTags {
		standings[tag] = &cwlLeagueStanding{tag: tag}
	}
	expected := map[string]struct{}{}
	complete := group.state == "ended"
	for _, round := range group.roundTags {
		for _, tag := range round {
			if tag == "" || tag == "#0" {
				continue
			}
			expected[tag] = struct{}{}
		}
	}
	if len(expected) == 0 {
		complete = false
	}
	for tag := range expected {
		war, ok := wars[tag]
		if !ok || officialWarState(war.state) != "warEnded" {
			complete = false
			continue
		}
		clanWon := war.clanStars > war.opponentStars ||
			(war.clanStars == war.opponentStars && war.clanDestruction > war.opponentDestruction)
		opponentWon := war.opponentStars > war.clanStars ||
			(war.opponentStars == war.clanStars && war.opponentDestruction > war.clanDestruction)
		tied := !clanWon && !opponentWon
		for _, side := range []struct {
			tag         string
			stars       int
			destruction float64
			won         bool
			lost        bool
		}{
			{tag: war.clanTag, stars: war.clanStars, destruction: war.clanDestruction, won: clanWon, lost: opponentWon},
			{tag: war.opponentTag, stars: war.opponentStars, destruction: war.opponentDestruction, won: opponentWon, lost: clanWon},
		} {
			standing, ok := standings[side.tag]
			if !ok {
				standing = &cwlLeagueStanding{tag: side.tag}
				standings[side.tag] = standing
			}
			standing.stars += side.stars
			if side.won {
				standing.stars += 10
				standing.wins++
			} else if side.lost {
				standing.losses++
			} else if tied {
				standing.ties++
			}
			standing.destruction += side.destruction
			standing.warsFinished++
		}
	}
	items := make([]cwlLeagueStanding, 0, len(standings))
	for _, standing := range standings {
		items = append(items, *standing)
	}
	sort.Slice(items, func(left, right int) bool {
		if items[left].stars != items[right].stars {
			return items[left].stars > items[right].stars
		}
		if items[left].destruction != items[right].destruction {
			return items[left].destruction > items[right].destruction
		}
		return items[left].tag < items[right].tag
	})
	rank := 0
	for index := range items {
		standing := &items[index]
		if index == 0 || standing.stars != items[index-1].stars || standing.destruction != items[index-1].destruction {
			rank = index + 1
		}
		standing.rank = rank
	}
	return items, complete
}

func calculateCWLLeagueBackfillRank(clanTag string, group cwlLeagueBackfillGroup, wars map[string]cwlLeagueBackfillWar) (int, bool) {
	items, complete := calculateCWLGroupStandings(group, wars)
	for _, standing := range items {
		if standing.tag == clanTag {
			return standing.rank, complete
		}
	}
	return 0, false
}

func calculateCWLSeasonSummary(clanTag string, group cwlLeagueBackfillGroup, wars map[string]cwlLeagueBackfillWar) (cwlSeasonSummary, bool) {
	items, _ := calculateCWLGroupStandings(group, wars)
	for _, standing := range items {
		if standing.tag != clanTag || standing.warsFinished == 0 {
			continue
		}
		return cwlSeasonSummary{
			rank:  standing.rank,
			stars: standing.stars,
			destruction: math.Round(
				(standing.destruction/float64(standing.warsFinished))*100,
			) / 100,
			wins:   standing.wins,
			ties:   standing.ties,
			losses: standing.losses,
		}, true
	}
	return cwlSeasonSummary{}, false
}

func cwlLeagueAssignments(
	groups []cwlLeagueBackfillGroup,
	history map[string]int,
	hasLeagueHistory bool,
) map[string]int {
	assignments := map[string]int{}
	for index := range groups {
		group := &groups[index]
		if group.leagueID != 0 {
			continue
		}
		if group.month == "" || group.month >= cwlBackfillEndMonth {
			continue
		}
		directHistoryMonth := group.month <= cwlDirectHistoryEndMonth
		if directHistoryMonth {
			group.leagueID = history[group.month]
		}
		if group.leagueID == 0 {
			if index > 0 && followingCWLSeason(groups[index-1], *group) {
				prior := groups[index-1]
				if prior.complete && prior.leagueID != 0 {
					group.leagueID = nextCWLLeagueID(prior.leagueID, prior.rank, len(prior.clanTags), prior.month)
				}
			}
		}
		if group.leagueID == 0 && directHistoryMonth && hasLeagueHistory {
			group.leagueID = cwlUnrankedLeagueID
		}
		if group.leagueID == 0 {
			continue
		}
		assignments[group.cwlID] = group.leagueID
	}
	return assignments
}

func nextCWLLeagueID(leagueID, rank, groupSize int, season string) int {
	if leagueID == cwlUnrankedLeagueID || rank <= 0 || groupSize <= 0 {
		return cwlUnrankedLeagueID
	}
	rule, ok := historicalCWLLeagueRules[leagueID]
	if !ok {
		return cwlUnrankedLeagueID
	}
	if season >= "2026-05" {
		rule, ok = currentCWLLeagueRules[leagueID]
		if !ok {
			return cwlUnrankedLeagueID
		}
	}
	if season >= "2026-05" && season <= "2026-08" {
		if leagueID >= 48000015 && leagueID <= 48000017 {
			rule.promotionRank = 2
		}
		if leagueID >= 48000018 && leagueID <= 48000021 {
			rule.promotionRank = 4
		}
		if leagueID >= 48000018 && leagueID <= 48000022 {
			rule.demotionCount = 1
		}
	}
	if rule.promotionRank > 0 && rank <= rule.promotionRank {
		if leagueID < cwlHighestLeagueID {
			return leagueID + 1
		}
		return leagueID
	}
	demotionRank := rule.demotionRank
	if rule.demotionCount > 0 {
		demotionRank = groupSize - rule.demotionCount + 1
	}
	if demotionRank > 0 && rank >= demotionRank {
		if leagueID > cwlLowestLeagueID {
			return leagueID - 1
		}
		return leagueID
	}
	return leagueID
}

func cwlSeasonMonth(season string) string {
	if len(season) < 7 {
		return ""
	}
	month := season[:7]
	if _, err := time.Parse("2006-01", month); err != nil {
		return ""
	}
	return month
}

func followingCWLSeason(left, right cwlLeagueBackfillGroup) bool {
	leftValue := left.season
	if leftValue == "" {
		leftValue = left.month
	}
	rightValue := right.season
	if rightValue == "" {
		rightValue = right.month
	}
	leftDate, err := parseCWLSeasonDate(leftValue)
	if err != nil {
		return false
	}
	rightDate, err := parseCWLSeasonDate(rightValue)
	return err == nil && rightDate.After(leftDate)
}

func parseCWLSeasonDate(value string) (time.Time, error) {
	if len(value) == 7 {
		return time.Parse("2006-01", value)
	}
	return time.Parse("2006-01-02", value)
}
