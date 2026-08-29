package legacy

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"time"

	legacymodels "github.com/ClashKingInc/ClashKingAPI/internal/models/legacy"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type warIDQuery func(context.Context, string, time.Time, time.Time, int) ([]string, error)
type warArchiveLoader func(context.Context, []string) (map[string]wararchive.War, error)
type warAtTimeQuery func(context.Context, string, time.Time) (string, error)

// previousWars godoc
// @Summary Previous wars for a clan
// @Description Legacy v1-compatible stored full-war history.
// @Tags Legacy
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Inclusive preparation-time start" default(0)
// @Param timestamp_end query int false "Inclusive preparation-time end" default(9999999999)
// @Param limit query int false "Maximum wars" default(50)
// @Success 200 {object} legacy.WarListResponse
// @Router /war/{clan_tag}/previous [get]
func previousWars(deps apptypes.Deps) fiber.Handler {
	return previousWarsHandler(
		func(ctx context.Context, tag string, start, end time.Time, limit int) ([]string, error) {
			return queryWarIDs(ctx, deps.Store.SQL, tag, start, end, limit)
		},
		func(ctx context.Context, ids []string) (map[string]wararchive.War, error) {
			return deps.Store.WarArchive.LoadIDs(ctx, deps.Store.SQL, ids)
		},
	)
}

func previousWarsHandler(queryIDs warIDQuery, loadWars warArchiveLoader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startUnix, err := parseInt64(c.Query("timestamp_start"), 0)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "timestamp_start must be an integer")
		}
		endUnix, err := parseInt64(c.Query("timestamp_end"), 9999999999)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "timestamp_end must be an integer")
		}
		limit, err := parseInt(c.Query("limit"), 50)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "limit must be an integer")
		}
		if limit <= 0 {
			return apptypes.JSON(c, http.StatusOK, legacymodels.WarListResponse{Items: []legacymodels.War{}})
		}
		ids, err := queryIDs(c.UserContext(), fixTag(c.Params("clan_tag")), time.Unix(startUnix, 0).UTC(), time.Unix(endUnix, 0).UTC(), limit)
		if err != nil {
			return err
		}
		wars, err := loadWars(c.UserContext(), ids)
		if err != nil {
			return err
		}
		items := make([]legacymodels.War, 0, len(ids))
		for _, id := range ids {
			if war, ok := wars[id]; ok {
				items = append(items, legacyWar(war, true))
			}
		}
		return apptypes.JSON(c, http.StatusOK, legacymodels.WarListResponse{Items: items})
	}
}

type warQueryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func queryWarIDs(ctx context.Context, db warQueryDB, clanTag string, start, end time.Time, limit int) ([]string, error) {
	rows, err := db.Query(ctx, `
		SELECT war_id::text
		FROM wars
		WHERE (clan_tag = $1 OR opponent_tag = $1)
		  AND prep_time >= $2 AND prep_time <= $3
		ORDER BY end_time DESC
		LIMIT $4
	`, clanTag, start, end, limit)
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

// previousWarAtTime godoc
// @Summary Previous war at an end time
// @Description Legacy v1-compatible lookup within five minutes of the supplied Clash timestamp.
// @Tags Legacy
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param end_time path string true "End time in Clash format"
// @Success 200 {object} legacy.War
// @Failure 404 {object} map[string]string
// @Router /war/{clan_tag}/previous/{end_time} [get]
func previousWarAtTime(deps apptypes.Deps) fiber.Handler {
	return previousWarAtTimeHandler(
		func(ctx context.Context, tag string, target time.Time) (string, error) {
			return queryWarAtTime(ctx, deps.Store.SQL, tag, target)
		},
		func(ctx context.Context, ids []string) (map[string]wararchive.War, error) {
			return deps.Store.WarArchive.LoadIDs(ctx, deps.Store.SQL, ids)
		},
	)
}

func previousWarAtTimeHandler(findWar warAtTimeQuery, loadWars warArchiveLoader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		target, err := time.Parse("20060102T150405.000Z", c.Params("end_time"))
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "invalid end_time")
		}
		id, err := findWar(c.UserContext(), fixTag(c.Params("clan_tag")), target)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.JSON(c, http.StatusNotFound, map[string]string{"detail": "War Not Found"})
		}
		if err != nil {
			return err
		}
		wars, err := loadWars(c.UserContext(), []string{id})
		if err != nil {
			return err
		}
		war, ok := wars[id]
		if !ok {
			return apptypes.JSON(c, http.StatusNotFound, map[string]string{"detail": "War Not Found"})
		}
		return apptypes.JSON(c, http.StatusOK, legacyWar(war, true))
	}
}

func queryWarAtTime(ctx context.Context, db warQueryDB, clanTag string, target time.Time) (string, error) {
	const leeway = 5 * time.Minute
	var id string
	err := db.QueryRow(ctx, `
			SELECT war_id::text
			FROM wars
			WHERE (clan_tag = $1 OR opponent_tag = $1)
			  AND end_time >= $2
			  AND end_time <= $3
			ORDER BY abs(extract(epoch FROM end_time)::double precision - $4), war_id
			LIMIT 1
		`, clanTag, target.Add(-leeway), target.Add(leeway), float64(target.Unix())+float64(target.Nanosecond())/float64(time.Second)).Scan(&id)
	return id, err
}

// playerWarHits godoc
// @Summary War attacks and defenses for a player
// @Description Legacy v1-compatible war-grouped player history.
// @Tags Legacy
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Inclusive preparation-time start" default(0)
// @Param timestamp_end query int false "Inclusive preparation-time end" default(2527625513)
// @Param limit query int false "Maximum wars" default(50) maximum(100)
// @Success 200 {object} legacy.PlayerWarHitsResponse
// @Router /player/{player_tag}/warhits [get]
func playerWarHits(deps apptypes.Deps) fiber.Handler {
	return playerWarHitsHandler(
		func(ctx context.Context, tag string, start, end time.Time, limit int) ([]string, error) {
			return queryPlayerWarIDs(ctx, deps.Store.SQL, tag, start, end, limit)
		},
		func(ctx context.Context, ids []string) (map[string]wararchive.War, error) {
			return deps.Store.WarArchive.LoadIDs(ctx, deps.Store.SQL, ids)
		},
	)
}

func playerWarHitsHandler(queryIDs warIDQuery, loadWars warArchiveLoader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startUnix, err := parseInt64(c.Query("timestamp_start"), 0)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "timestamp_start must be an integer")
		}
		endUnix, err := parseInt64(c.Query("timestamp_end"), 2527625513)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "timestamp_end must be an integer")
		}
		limit, err := parseInt(c.Query("limit"), 50)
		if err != nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "limit must be an integer")
		}
		if limit <= 0 {
			return apptypes.JSON(c, http.StatusOK, legacymodels.PlayerWarHitsResponse{Items: []legacymodels.PlayerWarHit{}})
		}
		if limit > 100 {
			limit = 100
		}
		tag := fixTag(c.Params("player_tag"))
		ids, err := queryIDs(c.UserContext(), tag, time.Unix(startUnix, 0).UTC(), time.Unix(endUnix, 0).UTC(), limit)
		if err != nil {
			return err
		}
		wars, err := loadWars(c.UserContext(), ids)
		if err != nil {
			return err
		}
		items := make([]legacymodels.PlayerWarHit, 0, len(ids))
		for _, id := range ids {
			if war, ok := wars[id]; ok {
				if item, ok := buildPlayerWarHit(tag, war); ok {
					items = append(items, item)
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, legacymodels.PlayerWarHitsResponse{Items: items})
	}
}

func queryPlayerWarIDs(ctx context.Context, db warQueryDB, tag string, start, end time.Time, limit int) ([]string, error) {
	rows, err := db.Query(ctx, `
			SELECT selected.war_id::text
			FROM player_war_history AS history
			CROSS JOIN LATERAL unnest(history.war_ids) AS selected(war_id)
			JOIN wars AS war ON war.war_id = selected.war_id
			WHERE history.player_tag = $1
			  AND war.prep_time >= $2 AND war.prep_time <= $3
			ORDER BY war.prep_time DESC, war.war_id DESC
			LIMIT $4
		`, tag, start, end, limit)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func buildPlayerWarHit(playerTag string, war wararchive.War) (legacymodels.PlayerWarHit, bool) {
	own := war.Clan
	member, found := archiveMember(war.Clan, playerTag)
	opponent := war.Opponent
	if !found {
		member, found = archiveMember(war.Opponent, playerTag)
		own = war.Opponent
		opponent = war.Clan
	}
	if !found {
		return legacymodels.PlayerWarHit{}, false
	}

	freshOrders := map[string]int{}
	for _, fact := range wararchive.Attacks("", war) {
		if current, exists := freshOrders[fact.DefenderTag]; !exists || fact.AttackOrder < current {
			freshOrders[fact.DefenderTag] = fact.AttackOrder
		}
	}
	defenders := archiveMembersByTag(opponent)
	ownAttacksByDefender := attacksByDefender(own)
	attacks := make([]legacymodels.WarHitAttack, 0, len(member.Attacks))
	for _, attack := range member.Attacks {
		defender := defenders[attack.DefenderTag]
		opponentAttacks := len(ownAttacksByDefender[defender.Tag])
		defenderData := legacyMember(defender, &opponentAttacks)
		attacks = append(attacks, legacyWarHitAttack(member.Tag, attack, freshOrders[attack.DefenderTag] == attack.Order, &defenderData, nil))
	}
	defenses := []legacymodels.WarHitAttack{}
	for _, attacker := range opponent.Members {
		for _, attack := range attacker.Attacks {
			if attack.DefenderTag != playerTag {
				continue
			}
			opponentAttacks := len(ownAttacksByDefender[attacker.Tag])
			attackerData := legacyMember(attacker, &opponentAttacks)
			defenses = append(defenses, legacyWarHitAttack(attacker.Tag, attack, freshOrders[playerTag] == attack.Order, nil, &attackerData))
		}
	}
	sort.SliceStable(defenses, func(i, j int) bool { return defenses[i].Order < defenses[j].Order })
	defenseCount := len(defenses)
	memberData := legacyMember(member, &defenseCount)
	warData := legacyWar(war, false)
	warData.Type = war.Type
	return legacymodels.PlayerWarHit{WarData: warData, MemberData: memberData, Attacks: attacks, Defenses: defenses}, true
}

func legacyWarHitAttack(attackerTag string, attack wararchive.Attack, fresh bool, defender, attacker *legacymodels.WarMember) legacymodels.WarHitAttack {
	return legacymodels.WarHitAttack{
		AttackerTag: attackerTag, DefenderTag: attack.DefenderTag, Stars: attack.Stars,
		DestructionPercentage: attack.DestructionPercentage, Order: attack.Order, Duration: attack.Duration,
		Fresh: fresh, Defender: defender, Attacker: attacker, AttackOrder: attack.Order,
	}
}

func archiveMember(clan wararchive.Clan, tag string) (wararchive.Member, bool) {
	for _, member := range clan.Members {
		if member.Tag == tag {
			return member, true
		}
	}
	return wararchive.Member{}, false
}

func archiveMembersByTag(clan wararchive.Clan) map[string]wararchive.Member {
	result := make(map[string]wararchive.Member, len(clan.Members))
	for _, member := range clan.Members {
		result[member.Tag] = member
	}
	return result
}
