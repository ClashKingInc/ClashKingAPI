package routes

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const playerWarStatsRecentIDsQuery = `
	SELECT selected.war_id::text
	FROM unnest((
		SELECT war_ids[GREATEST(cardinality(war_ids) - $2 + 1, 1):cardinality(war_ids)]
		FROM player_war_history
		WHERE player_tag = $1
	)) WITH ORDINALITY AS selected(war_id, position)
	ORDER BY selected.position DESC
`

const playerWarStatsFilteredIDsQuery = `
	SELECT selected.war_id::text
	FROM player_war_history AS history
	CROSS JOIN LATERAL unnest(history.war_ids) WITH ORDINALITY AS selected(war_id, position)
	JOIN wars AS war ON war.war_id = selected.war_id
	WHERE history.player_tag = $1
	  AND war.end_time >= $2
	  AND war.end_time <= $3
	  AND ($4 = '' OR war.war_type = $4)
	ORDER BY selected.position DESC
	LIMIT $5
`

type playerWarStatsDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// playerWarStats godoc
// @Summary Review a player's complete war history
// @Description Returns wars where the player appeared, including both sides and every attack involving them. Empty attack lists reveal missed opportunities.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param type query string false "War type" Enums(cwl,random,friendly)
// @Param time[after] query string false "Only include wars ending at or after this ISO-8601 time"
// @Param time[before] query string false "Only include wars ending at or before this ISO-8601 time"
// @Param limit query int false "Maximum wars to return" default(15) minimum(1) maximum(500)
// @Success 200 {object} modelsv2.PlayerWarStatsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/war/stats [get]
func playerWarStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := warFixTag(c.Params("player_tag"))
		warType := strings.ToLower(strings.TrimSpace(c.Query("type")))
		if warType != "" && warType != "cwl" && warType != "random" && warType != "friendly" {
			return apptypes.Error(http.StatusBadRequest, "invalid type")
		}
		limit, err := v2QueryInt(c, "limit", 15)
		if err != nil || limit < 1 {
			return apptypes.Error(http.StatusBadRequest, "invalid limit")
		}
		limit = clamp(limit, 1, 500)

		hasTimeFilter := strings.TrimSpace(c.Query("time[after]")) != "" || strings.TrimSpace(c.Query("time[before]")) != ""
		after, before, err := v2TimeWindowFromQuery(c, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC())
		if err != nil {
			return err
		}
		warIDs, err := queryPlayerWarStatsIDs(c.UserContext(), a.Store.SQL, tag, warType, after, before, limit, hasTimeFilter)
		if err != nil {
			return err
		}
		wars, err := a.Store.WarArchive.LoadIDs(c.UserContext(), a.Store.SQL, warIDs)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, buildPlayerWarStatsResponse(tag, warIDs, wars))
	}
}

func queryPlayerWarStatsIDs(ctx context.Context, db playerWarStatsDB, tag, warType string, after, before time.Time, limit int, hasTimeFilter bool) ([]string, error) {
	query := playerWarStatsRecentIDsQuery
	args := []any{tag, limit}
	if hasTimeFilter || warType != "" {
		query = playerWarStatsFilteredIDsQuery
		args = []any{tag, after, before, warType, limit}
	}
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]string, 0, limit)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func buildPlayerWarStatsResponse(tag string, warIDs []string, wars map[string]wararchive.War) modelsv2.PlayerWarStatsResponse {
	response := modelsv2.PlayerWarStatsResponse{Items: []modelsv2.PlayerWarHistoryItem{}}
	for _, warID := range warIDs {
		war, ok := wars[warID]
		if !ok {
			continue
		}
		item, ok := buildPlayerWarHistoryItem(tag, warID, war)
		if ok {
			response.Items = append(response.Items, item)
		}
	}
	return response
}

func buildPlayerWarHistoryItem(tag, warID string, war wararchive.War) (modelsv2.PlayerWarHistoryItem, bool) {
	clan, opponent := war.Clan, war.Opponent
	member, found := warMemberByTag(clan, tag)
	if !found {
		member, found = warMemberByTag(opponent, tag)
		if !found {
			return modelsv2.PlayerWarHistoryItem{}, false
		}
		clan, opponent = opponent, clan
	}

	item := modelsv2.PlayerWarHistoryItem{
		TeamSize: war.TeamSize, AttacksPerMember: war.AttacksPerMember,
		PreparationStartTime: clashTime(war.PreparationStartTime), EndTime: clashTime(war.EndTime),
		Clan: playerWarHistoryClan(clan), Opponent: playerWarHistoryClan(opponent), Type: war.Type,
		Player: playerWarHistoryPlayer(member), Attacks: []modelsv2.PlayerWarHistoryAttack{}, Defenses: []modelsv2.PlayerWarHistoryAttack{},
	}
	if war.StartTime != nil {
		item.StartTime = clashTime(*war.StartTime)
	}

	facts := wararchive.Attacks(warID, war)
	freshOrder := make(map[string]int, len(facts))
	for _, fact := range facts {
		if current, exists := freshOrder[fact.DefenderTag]; !exists || fact.AttackOrder < current {
			freshOrder[fact.DefenderTag] = fact.AttackOrder
		}
	}
	for _, fact := range facts {
		attack := modelsv2.PlayerWarHistoryAttack{
			Stars: fact.Stars, DestructionPercentage: fact.DestructionPercentage,
			Order: fact.AttackOrder, Duration: fact.Duration, Fresh: freshOrder[fact.DefenderTag] == fact.AttackOrder,
		}
		switch {
		case fact.AttackerTag == tag:
			attack.Player = modelsv2.PlayerWarHistoryPlayer{Tag: fact.DefenderTag, Name: fact.DefenderName, TownhallLevel: fact.DefenderTownhall, MapPosition: fact.DefenderMapPosition}
			item.Attacks = append(item.Attacks, attack)
		case fact.DefenderTag == tag:
			attack.Player = modelsv2.PlayerWarHistoryPlayer{Tag: fact.AttackerTag, Name: fact.AttackerName, TownhallLevel: fact.AttackerTownhall, MapPosition: fact.AttackerMapPosition}
			item.Defenses = append(item.Defenses, attack)
		}
	}
	sort.Slice(item.Attacks, func(i, j int) bool { return item.Attacks[i].Order < item.Attacks[j].Order })
	sort.Slice(item.Defenses, func(i, j int) bool { return item.Defenses[i].Order < item.Defenses[j].Order })
	return item, true
}

func warMemberByTag(clan wararchive.Clan, tag string) (wararchive.Member, bool) {
	for _, member := range clan.Members {
		if member.Tag == tag {
			return member, true
		}
	}
	return wararchive.Member{}, false
}

func playerWarHistoryClan(clan wararchive.Clan) modelsv2.PlayerWarHistoryClan {
	return modelsv2.PlayerWarHistoryClan{
		Tag: clan.Tag, Name: clan.Name,
		BadgeURLs: modelsv2.PublicBadgeURLs{Small: badgeURL(clan.BadgeToken, 70), Medium: badgeURL(clan.BadgeToken, 200), Large: badgeURL(clan.BadgeToken, 512)},
		ClanLevel: clan.ClanLevel, Attacks: clan.Attacks, Stars: clan.Stars, DestructionPercentage: clan.DestructionPercentage,
	}
}

func playerWarHistoryPlayer(member wararchive.Member) modelsv2.PlayerWarHistoryPlayer {
	return modelsv2.PlayerWarHistoryPlayer{Tag: member.Tag, Name: member.Name, TownhallLevel: member.TownhallLevel, MapPosition: member.MapPosition}
}
