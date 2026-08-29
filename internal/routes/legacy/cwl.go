package legacy

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	legacymodels "github.com/ClashKingInc/ClashKingAPI/internal/models/legacy"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const cwlSeasonDateCutoff = "2026-06-14"

// currentCWLGroup godoc
// @Summary Current-season CWL group for a clan
// @Description Legacy v1-compatible Mongo-style CWL group envelope. Returns null when unavailable.
// @Tags Legacy
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} legacy.CWLGroupEnvelope
// @Router /cwl/{clan_tag}/group [get]
func currentCWLGroup(deps apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := clashy.GetSeasonID()
		group, err := loadCWLGroup(c, deps, fixTag(c.Params("clan_tag")), season, false)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, legacymodels.CWLGroupEnvelope{Data: *group})
	}
}

// cwlSeason godoc
// @Summary CWL information for a clan in a season
// @Description Legacy v1-compatible CWL group with round war tags expanded into stored wars.
// @Tags Legacy
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season in YYYY-MM or date form"
// @Success 200 {object} legacy.CWLGroup
// @Failure 404 {object} map[string]string
// @Router /cwl/{clan_tag}/{season} [get]
func cwlSeason(deps apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season := normalizeCWLSeason(c.Params("season"))
		group, err := loadCWLGroup(c, deps, fixTag(c.Params("clan_tag")), season, true)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.JSON(c, http.StatusNotFound, map[string]string{"detail": "No CWL Data Found"})
		}
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, group)
	}
}

func normalizeCWLSeason(season string) string {
	raw := season
	if len(raw) == len("2006-01") {
		raw += "-01"
	}
	parsed, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return season
	}
	cutoff, _ := time.Parse("2006-01-02", cwlSeasonDateCutoff)
	if parsed.Before(cutoff) {
		return parsed.Format("2006-01")
	}
	return season
}

func loadCWLGroup(c *fiber.Ctx, deps apptypes.Deps, clanTag, season string, hydrateWars bool) (*legacymodels.CWLGroup, error) {
	var id, storedSeason, state string
	var roundsRaw []byte
	err := deps.Store.SQL.QueryRow(c.UserContext(), `
		SELECT groups.cwl_id, groups.season, groups.state, groups.rounds
		FROM cwl_groups AS groups
		JOIN cwl_group_clans AS clan ON clan.cwl_id = groups.cwl_id
		WHERE clan.clan_tag = $1 AND groups.season = $2
		ORDER BY groups.cwl_id DESC
		LIMIT 1
	`, clanTag, season).Scan(&id, &storedSeason, &state, &roundsRaw)
	if err != nil {
		return nil, err
	}
	clans, err := loadCWLClans(c, deps, id)
	if err != nil {
		return nil, err
	}
	rounds := decodeCWLRounds(roundsRaw)
	response := &legacymodels.CWLGroup{State: state, Season: storedSeason, Clans: clans, Rounds: make([]legacymodels.CWLRound, 0, len(rounds))}
	if !hydrateWars {
		for _, tags := range rounds {
			values := make([]any, 0, len(tags))
			for _, tag := range tags {
				values = append(values, tag)
			}
			response.Rounds = append(response.Rounds, legacymodels.CWLRound{WarTags: values})
		}
		return response, nil
	}
	wars, err := loadCWLWars(c, deps, rounds, storedSeason)
	if err != nil {
		return nil, err
	}
	for _, tags := range rounds {
		values := make([]any, 0, len(tags))
		for _, tag := range tags {
			if war, ok := wars[tag]; ok {
				values = append(values, war)
			} else {
				values = append(values, map[string]string{"tag": tag})
			}
		}
		response.Rounds = append(response.Rounds, legacymodels.CWLRound{WarTags: values})
	}
	return response, nil
}

func decodeCWLRounds(raw []byte) [][]string {
	var direct [][]string
	if json.Unmarshal(raw, &direct) == nil {
		return direct
	}
	var official []struct {
		WarTags []string `json:"warTags"`
	}
	if json.Unmarshal(raw, &official) != nil {
		return [][]string{}
	}
	direct = make([][]string, 0, len(official))
	for _, round := range official {
		direct = append(direct, round.WarTags)
	}
	return direct
}

func loadCWLClans(c *fiber.Ctx, deps apptypes.Deps, id string) ([]legacymodels.CWLClan, error) {
	rows, err := deps.Store.SQL.Query(c.UserContext(), `
		SELECT clan.clan_tag, clan.name, clan.clan_level, clan.badge_token,
		       member.tag, member.name, member.town_hall
		FROM cwl_group_clans AS clan
		LEFT JOIN cwl_group_members AS member
		  ON member.cwl_id = clan.cwl_id AND member.clan_tag = clan.clan_tag
		WHERE clan.cwl_id = $1
		ORDER BY clan.clan_tag, member.tag
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clans := []legacymodels.CWLClan{}
	indexes := map[string]int{}
	for rows.Next() {
		var tag, name, badgeToken string
		var clanLevel int
		var memberTag, memberName pgtype.Text
		var townhall pgtype.Int2
		if err := rows.Scan(&tag, &name, &clanLevel, &badgeToken, &memberTag, &memberName, &townhall); err != nil {
			return nil, err
		}
		index, exists := indexes[tag]
		if !exists {
			clans = append(clans, legacymodels.CWLClan{Tag: tag, Name: name, ClanLevel: clanLevel, BadgeURLs: badgeURLs(badgeToken), Members: []legacymodels.CWLMember{}})
			index = len(clans) - 1
			indexes[tag] = index
		}
		if memberTag.Valid {
			clans[index].Members = append(clans[index].Members, legacymodels.CWLMember{Tag: memberTag.String, Name: memberName.String, TownHallLevel: int(townhall.Int16)})
		}
	}
	return clans, rows.Err()
}

func loadCWLWars(c *fiber.Ctx, deps apptypes.Deps, rounds [][]string, season string) (map[string]legacymodels.War, error) {
	tags := []string{}
	seen := map[string]struct{}{}
	for _, round := range rounds {
		for _, tag := range round {
			if tag == "" || tag == "#0" {
				continue
			}
			if _, exists := seen[tag]; !exists {
				seen[tag] = struct{}{}
				tags = append(tags, tag)
			}
		}
	}
	if len(tags) == 0 {
		return map[string]legacymodels.War{}, nil
	}
	rows, err := deps.Store.SQL.Query(c.UserContext(), `
		SELECT war_id::text, war_tag
		FROM wars
		WHERE war_type = 'cwl' AND war_tag = ANY($1)
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	tagsByID := map[string]string{}
	for rows.Next() {
		var id string
		var tag pgtype.Text
		if err := rows.Scan(&id, &tag); err != nil {
			return nil, err
		}
		if tag.Valid {
			ids = append(ids, id)
			tagsByID[id] = tag.String
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	archived, err := deps.Store.WarArchive.LoadIDs(c.UserContext(), deps.Store.SQL, ids)
	if err != nil {
		return nil, err
	}
	result := map[string]legacymodels.War{}
	for id, source := range archived {
		war := legacyWar(source, true)
		war.Season = season
		result[tagsByID[id]] = war
	}
	return result, nil
}
