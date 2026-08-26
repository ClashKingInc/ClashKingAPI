package routes

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// cwlSeasons godoc
// @Summary List stored CWL seasons for a clan
// @Tags CWL
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} modelsv2.CWLSeasonsResponse
// @Router /v2/cwl/{clan_tag}/seasons [get]
func cwlSeasons(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		if clanTag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid clan tag")
		}
		if err := ensureCWLLeagueIDs(c, a, clanTag); err != nil {
			return err
		}
		groups, err := loadCWLLeagueBackfillGroups(c, a, clanTag)
		if err != nil {
			return err
		}
		wars, err := loadCWLLeagueBackfillWars(c, a, groups)
		if err != nil {
			return err
		}
		catalog := newReferenceCatalog(a)
		items := make([]modelsv2.CWLSeasonItem, 0, len(groups))
		seenSeasons := make(map[string]struct{}, len(groups))
		for index := len(groups) - 1; index >= 0; index-- {
			group := groups[index]
			if group.state != "ended" {
				continue
			}
			if _, exists := seenSeasons[group.season]; exists {
				continue
			}
			seenSeasons[group.season] = struct{}{}
			item := modelsv2.CWLSeasonItem{Season: group.season, State: group.state}
			if group.warSize > 0 {
				value := group.warSize
				item.WarSize = &value
			}
			if group.leagueID > 0 {
				item.WarLeague = catalog.warLeague(group.leagueID)
			}
			if summary, ok := calculateCWLSeasonSummary(clanTag, group, wars); ok {
				item.Rank = &summary.rank
				item.Stars = &summary.stars
				item.Destruction = &summary.destruction
				item.Rounds = &modelsv2.CWLRankingRounds{
					Won: summary.wins, Tied: summary.ties, Lost: summary.losses,
				}
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.CWLSeasonsResponse{Items: items})
	}
}

// storedCWL godoc
// @Summary Get a stored CWL group
// @Description Returns the requested season, or the most recent stored season when season is omitted.
// @Tags CWL
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season query string false "CWL season (YYYY-MM or YYYY-MM-DD)"
// @Success 200 {object} modelsv2.CWLResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/{clan_tag} [get]
func storedCWL(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		season := strings.TrimSpace(c.Query("season"))
		if clanTag == "" || (season != "" && !validCWLBonusSeason(season)) {
			return apptypes.Error(http.StatusBadRequest, "a valid clan tag and optional YYYY-MM or YYYY-MM-DD season are required")
		}
		if err := ensureCWLLeagueIDs(c, a, clanTag); err != nil {
			return err
		}
		var cwlID string
		var response modelsv2.CWLResponse
		var roundsJSON []byte
		var leagueID pgtype.Int4
		err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT g.cwl_id, g.season, g.state, g.rounds, g.cwl_league_id
			FROM cwl_groups AS g
			JOIN cwl_group_clans AS clan ON clan.cwl_id = g.cwl_id
			WHERE clan.clan_tag = $1 AND ($2 = '' OR g.season = $2)
			ORDER BY g.season DESC, g.cwl_id DESC
			LIMIT 1
		`, clanTag, season).Scan(&cwlID, &response.Season, &response.State, &roundsJSON, &leagueID)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "stored CWL group not found")
		}
		if err != nil {
			return err
		}
		if leagueID.Valid {
			response.WarLeague = newReferenceCatalog(a).warLeague(int(leagueID.Int32))
		}
		roundTags := decodeCWLRoundTags(roundsJSON)
		response.Clans, err = loadCWLGroupClans(c, a, cwlID)
		if err != nil {
			return err
		}
		wars, err := loadStoredCWLWars(c, a, roundTags, response.Season)
		if err != nil {
			return err
		}
		response.Rounds = hydrateCWLRounds(roundTags, wars)
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

func decodeCWLRoundTags(raw []byte) [][]string {
	var tags [][]string
	if json.Unmarshal(raw, &tags) == nil {
		return tags
	}
	var officialRounds []struct {
		WarTags []string `json:"warTags"`
	}
	if json.Unmarshal(raw, &officialRounds) != nil {
		return [][]string{}
	}
	tags = make([][]string, 0, len(officialRounds))
	for _, round := range officialRounds {
		tags = append(tags, round.WarTags)
	}
	return tags
}

func loadCWLGroupClans(c *fiber.Ctx, a apptypes.Deps, cwlID string) ([]modelsv2.CWLStoredGroupClan, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT clan.clan_tag, clan.name, clan.clan_level, clan.badge_token,
		       member.tag, member.name, member.town_hall
		FROM cwl_group_clans AS clan
		LEFT JOIN cwl_group_members AS member
		  ON member.cwl_id = clan.cwl_id AND member.clan_tag = clan.clan_tag
		WHERE clan.cwl_id = $1
		ORDER BY clan.clan_tag, member.tag
	`, cwlID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clans := make([]modelsv2.CWLStoredGroupClan, 0)
	indexes := make(map[string]int)
	for rows.Next() {
		var tag, name, badgeToken string
		var clanLevel int
		var memberTag, memberName pgtype.Text
		var townHall pgtype.Int2
		if err := rows.Scan(&tag, &name, &clanLevel, &badgeToken, &memberTag, &memberName, &townHall); err != nil {
			return nil, err
		}
		index, ok := indexes[tag]
		if !ok {
			clans = append(clans, modelsv2.CWLStoredGroupClan{
				Tag: tag, Name: name, ClanLevel: clanLevel,
				BadgeURLs: publicBadgeURLsFromToken(badgeToken),
				Members:   []modelsv2.CWLGroupMember{},
			})
			index = len(clans) - 1
			indexes[tag] = index
		}
		if memberTag.Valid {
			clans[index].Members = append(clans[index].Members, modelsv2.CWLGroupMember{
				Tag: memberTag.String, Name: memberName.String, TownHallLevel: int(townHall.Int16),
			})
		}
	}
	return clans, rows.Err()
}

type cwlStoredWarResponse struct {
	officialWarResponse
	Season string `json:"season"`
}

func loadStoredCWLWars(c *fiber.Ctx, a apptypes.Deps, rounds [][]string, season string) (map[string]cwlStoredWarResponse, error) {
	tags := make([]string, 0)
	seen := make(map[string]struct{})
	for _, round := range rounds {
		for _, tag := range round {
			if tag == "" || tag == "#0" {
				continue
			}
			if _, ok := seen[tag]; ok {
				continue
			}
			seen[tag] = struct{}{}
			tags = append(tags, tag)
		}
	}
	if len(tags) == 0 {
		return map[string]cwlStoredWarResponse{}, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT war_id::text, clan_tag, opponent_tag, prep_time, start_time, end_time, size, attacks_per_member,
		       war_type, state, battle_modifier, war_tag, clan_name, opponent_name, clan_badge_token,
		       opponent_badge_token, clan_level, opponent_clan_level, clan_attacks, opponent_attacks,
		       clan_stars, opponent_stars, clan_destruction_percentage::float8, opponent_destruction_percentage::float8
		FROM wars
		WHERE war_type = 'cwl' AND war_tag = ANY($1)
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	wars := make([]sqlWarRow, 0, len(tags))
	warIDs := make([]string, 0, len(tags))
	for rows.Next() {
		war, err := scanSQLWar(rows)
		if err != nil {
			return nil, err
		}
		wars = append(wars, war)
		warIDs = append(warIDs, war.WarID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	archived, err := sqlArchiveWarsContext(c.UserContext(), a, warIDs)
	if err != nil {
		return nil, err
	}
	byTag := make(map[string]cwlStoredWarResponse, len(wars))
	for _, war := range wars {
		if war.WarTag == nil {
			continue
		}
		value, exists := archived[war.WarID]
		if !exists {
			continue
		}
		item := buildOfficialArchiveWar(value, war.ClanTag)
		item.BattleModifier = nil
		byTag[*war.WarTag] = cwlStoredWarResponse{officialWarResponse: item, Season: season}
	}
	return byTag, nil
}

func hydrateCWLRounds(rounds [][]string, wars map[string]cwlStoredWarResponse) []modelsv2.CWLGroupRound {
	out := make([]modelsv2.CWLGroupRound, 0, len(rounds))
	for _, tags := range rounds {
		warTags := make([]any, 0, len(tags))
		for _, tag := range tags {
			if war, ok := wars[tag]; ok {
				warTags = append(warTags, war)
			} else {
				warTags = append(warTags, map[string]string{"tag": tag})
			}
		}
		out = append(out, modelsv2.CWLGroupRound{WarTags: warTags})
	}
	return out
}
