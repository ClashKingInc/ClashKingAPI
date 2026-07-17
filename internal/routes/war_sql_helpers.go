package routes

import (
	"context"
	"math"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

const clashBadgeBaseURL = "https://api-assets.clashofclans.com/badges"

type sqlWarRow struct {
	WarID                         string
	ClanTag                       string
	OpponentTag                   string
	PrepTime                      time.Time
	StartTime                     *time.Time
	EndTime                       time.Time
	Size                          int
	AttacksPerMember              int
	WarType                       string
	State                         string
	BattleModifier                string
	WarTag                        *string
	ClanName                      string
	OpponentName                  string
	ClanBadgeToken                string
	OpponentBadgeToken            string
	ClanLevel                     int
	OpponentClanLevel             int
	ClanAttacks                   int
	OpponentAttacks               int
	ClanStars                     int
	OpponentStars                 int
	ClanDestructionPercentage     float64
	OpponentDestructionPercentage float64
}

type sqlWarMemberRow struct {
	WarID           string
	ClanTag         string
	OpponentTag     string
	PlayerTag       string
	PlayerName      string
	Townhall        int
	MapPosition     int
	ExpectedAttacks int
	AttackCount     int
	MissedAttacks   int
}

type sqlWarAttackRow struct {
	WarID                 string
	WarEndTime            time.Time
	WarType               string
	WarSize               int
	AttackingClanTag      string
	DefendingClanTag      string
	AttackerTag           string
	AttackerName          string
	DefenderTag           string
	DefenderName          string
	AttackerTownhall      int
	DefenderTownhall      int
	AttackerMapPosition   int
	DefenderMapPosition   int
	Stars                 int
	DestructionPercentage int
	Duration              int
	AttackOrder           int
	BattleModifier        string
}

type officialWarResponse struct {
	State                string          `json:"state"`
	TeamSize             int             `json:"teamSize"`
	AttacksPerMember     *int            `json:"attacksPerMember,omitempty"`
	BattleModifier       *string         `json:"battleModifier,omitempty"`
	PreparationStartTime string          `json:"preparationStartTime"`
	StartTime            *string         `json:"startTime,omitempty"`
	EndTime              string          `json:"endTime"`
	Clan                 officialWarClan `json:"clan"`
	Opponent             officialWarClan `json:"opponent"`
	WarStartTime         *string         `json:"warStartTime,omitempty"`
	Tag                  *string         `json:"tag,omitempty"`
}

type officialWarClan struct {
	Tag                   string              `json:"tag"`
	Name                  string              `json:"name"`
	BadgeURLs             officialBadgeURLs   `json:"badgeUrls"`
	ClanLevel             int                 `json:"clanLevel"`
	Attacks               int                 `json:"attacks"`
	Stars                 int                 `json:"stars"`
	DestructionPercentage float64             `json:"destructionPercentage"`
	Members               []officialWarMember `json:"members"`
}

type officialBadgeURLs struct {
	Small  string `json:"small"`
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

type officialWarMember struct {
	Tag                string              `json:"tag"`
	Name               string              `json:"name"`
	TownhallLevel      int                 `json:"townhallLevel"`
	MapPosition        int                 `json:"mapPosition"`
	Attacks            []officialWarAttack `json:"attacks,omitempty"`
	OpponentAttacks    *int                `json:"opponentAttacks,omitempty"`
	BestOpponentAttack *officialWarAttack  `json:"bestOpponentAttack,omitempty"`
}

type officialWarAttack struct {
	AttackerTag           string `json:"attackerTag"`
	DefenderTag           string `json:"defenderTag"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Order                 int    `json:"order"`
	Duration              int    `json:"duration"`
}

func sqlClanWars(c *fiber.Ctx, a apptypes.Deps, clanTag string, start time.Time, end time.Time, types []string, limit int) ([]officialWarResponse, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT war_id, clan_tag, opponent_tag, prep_time, start_time, end_time, size, attacks_per_member,
			war_type, state, battle_modifier, war_tag, clan_name, opponent_name, clan_badge_token,
			opponent_badge_token, clan_level, opponent_clan_level, clan_attacks, opponent_attacks,
			clan_stars, opponent_stars, clan_destruction_percentage::float8, opponent_destruction_percentage::float8
		FROM wars
		WHERE (clan_tag = $1 OR opponent_tag = $1)
			AND end_time >= $2
			AND end_time <= $3
			AND war_type = ANY($4)
		ORDER BY end_time DESC
		LIMIT $5
	`, clanTag, start, end, types, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	wars := []sqlWarRow{}
	warIDs := []string{}
	for rows.Next() {
		war, err := scanSQLWar(rows)
		if err != nil {
			return nil, err
		}
		wars = append(wars, orientWarForClan(war, clanTag))
		warIDs = append(warIDs, war.WarID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	members, err := sqlWarMembers(c, a, warIDs)
	if err != nil {
		return nil, err
	}
	attacks, err := sqlWarAttacks(c, a, warIDs)
	if err != nil {
		return nil, err
	}
	items := make([]officialWarResponse, 0, len(wars))
	for _, war := range wars {
		items = append(items, buildOfficialWar(war, members[war.WarID], attacks[war.WarID]))
	}
	return items, nil
}

func scanSQLWar(row interface{ Scan(dest ...any) error }) (sqlWarRow, error) {
	var war sqlWarRow
	var start pgtype.Timestamptz
	var warTag pgtype.Text
	err := row.Scan(
		&war.WarID, &war.ClanTag, &war.OpponentTag, &war.PrepTime, &start, &war.EndTime,
		&war.Size, &war.AttacksPerMember, &war.WarType, &war.State, &war.BattleModifier, &warTag,
		&war.ClanName, &war.OpponentName, &war.ClanBadgeToken, &war.OpponentBadgeToken,
		&war.ClanLevel, &war.OpponentClanLevel, &war.ClanAttacks, &war.OpponentAttacks,
		&war.ClanStars, &war.OpponentStars, &war.ClanDestructionPercentage, &war.OpponentDestructionPercentage,
	)
	if start.Valid {
		war.StartTime = &start.Time
	}
	if warTag.Valid {
		war.WarTag = &warTag.String
	}
	return war, err
}

func scanSQLWarAttack(row interface{ Scan(dest ...any) error }) (sqlWarAttackRow, error) {
	var attack sqlWarAttackRow
	err := row.Scan(
		&attack.WarID, &attack.WarEndTime, &attack.WarType, &attack.WarSize, &attack.AttackingClanTag,
		&attack.DefendingClanTag, &attack.AttackerTag, &attack.AttackerName, &attack.DefenderTag,
		&attack.DefenderName, &attack.AttackerTownhall, &attack.DefenderTownhall, &attack.AttackerMapPosition,
		&attack.DefenderMapPosition, &attack.Stars, &attack.DestructionPercentage, &attack.Duration,
		&attack.AttackOrder, &attack.BattleModifier,
	)
	return attack, err
}

func orientWarForClan(war sqlWarRow, clanTag string) sqlWarRow {
	if war.OpponentTag != clanTag || war.ClanTag == clanTag {
		return war
	}
	war.ClanTag, war.OpponentTag = war.OpponentTag, war.ClanTag
	war.ClanName, war.OpponentName = war.OpponentName, war.ClanName
	war.ClanBadgeToken, war.OpponentBadgeToken = war.OpponentBadgeToken, war.ClanBadgeToken
	war.ClanLevel, war.OpponentClanLevel = war.OpponentClanLevel, war.ClanLevel
	war.ClanAttacks, war.OpponentAttacks = war.OpponentAttacks, war.ClanAttacks
	war.ClanStars, war.OpponentStars = war.OpponentStars, war.ClanStars
	war.ClanDestructionPercentage, war.OpponentDestructionPercentage = war.OpponentDestructionPercentage, war.ClanDestructionPercentage
	return war
}

func sqlWarMembers(c *fiber.Ctx, a apptypes.Deps, warIDs []string) (map[string][]sqlWarMemberRow, error) {
	return sqlWarMembersContext(c.UserContext(), a, warIDs)
}

func sqlWarMembersContext(ctx context.Context, a apptypes.Deps, warIDs []string) (map[string][]sqlWarMemberRow, error) {
	out := map[string][]sqlWarMemberRow{}
	if len(warIDs) == 0 {
		return out, nil
	}
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT war_id, clan_tag, opponent_tag, player_tag, player_name, townhall_level, map_position
		FROM war_members
		WHERE war_id = ANY($1)
	`, warIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var member sqlWarMemberRow
		if err := rows.Scan(
			&member.WarID, &member.ClanTag, &member.OpponentTag, &member.PlayerTag, &member.PlayerName,
			&member.Townhall, &member.MapPosition,
		); err != nil {
			return nil, err
		}
		out[member.WarID] = append(out[member.WarID], member)
	}
	return out, rows.Err()
}

func sqlWarMissedAttacks(c *fiber.Ctx, a apptypes.Deps, warIDs []string) (map[string][]sqlWarMemberRow, error) {
	out := map[string][]sqlWarMemberRow{}
	if len(warIDs) == 0 {
		return out, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT war_id, clan_tag, opponent_tag, player_tag, player_name, townhall_level, map_position,
			expected_attacks, attack_count, missed_attacks
		FROM war_missed_attacks
		WHERE war_id = ANY($1)
		ORDER BY war_id, clan_tag, map_position
	`, warIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var member sqlWarMemberRow
		if err := rows.Scan(
			&member.WarID, &member.ClanTag, &member.OpponentTag, &member.PlayerTag, &member.PlayerName,
			&member.Townhall, &member.MapPosition, &member.ExpectedAttacks, &member.AttackCount, &member.MissedAttacks,
		); err != nil {
			return nil, err
		}
		out[member.WarID] = append(out[member.WarID], member)
	}
	return out, rows.Err()
}

func sqlWarAttacks(c *fiber.Ctx, a apptypes.Deps, warIDs []string) (map[string][]sqlWarAttackRow, error) {
	return sqlWarAttacksContext(c.UserContext(), a, warIDs)
}

func sqlWarAttacksContext(ctx context.Context, a apptypes.Deps, warIDs []string) (map[string][]sqlWarAttackRow, error) {
	out := map[string][]sqlWarAttackRow{}
	if len(warIDs) == 0 {
		return out, nil
	}
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT war_id, war_end_time, war_type, war_size, attacking_clan_tag, defending_clan_tag,
			attacker_tag, attacker_name, defender_tag, defender_name, attacker_townhall, defender_townhall,
			attacker_map_position, defender_map_position, stars, destruction_percentage, duration, attack_order,
			battle_modifier
		FROM war_attacks
		WHERE war_id = ANY($1)
		ORDER BY war_id, attack_order
	`, warIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		attack, err := scanSQLWarAttack(rows)
		if err != nil {
			return nil, err
		}
		out[attack.WarID] = append(out[attack.WarID], attack)
	}
	return out, rows.Err()
}

func buildOfficialWar(war sqlWarRow, members []sqlWarMemberRow, attacks []sqlWarAttackRow) officialWarResponse {
	item := officialWarResponse{
		State:                war.State,
		TeamSize:             war.Size,
		BattleModifier:       &war.BattleModifier,
		PreparationStartTime: clashTime(war.PrepTime),
		EndTime:              clashTime(war.EndTime),
		Clan:                 buildWarClan(war, "clan", members, attacks),
		Opponent:             buildWarClan(war, "opponent", members, attacks),
	}
	if war.StartTime != nil {
		startTime := clashTime(*war.StartTime)
		item.StartTime = &startTime
		if war.WarType == "cwl" {
			item.WarStartTime = &startTime
		}
	}
	if war.WarType == "cwl" {
		item.Tag = war.WarTag
	} else {
		item.AttacksPerMember = &war.AttacksPerMember
	}
	return item
}

func buildWarClan(war sqlWarRow, side string, members []sqlWarMemberRow, attacks []sqlWarAttackRow) officialWarClan {
	clanTag, opponentTag := war.ClanTag, war.OpponentTag
	name, token := war.ClanName, war.ClanBadgeToken
	level, attackCount := war.ClanLevel, war.ClanAttacks
	stars, destruction := war.ClanStars, war.ClanDestructionPercentage
	if side == "opponent" {
		clanTag, opponentTag = war.OpponentTag, war.ClanTag
		name, token = war.OpponentName, war.OpponentBadgeToken
		level, attackCount = war.OpponentClanLevel, war.OpponentAttacks
		stars, destruction = war.OpponentStars, war.OpponentDestructionPercentage
	}
	out := officialWarClan{
		Tag:                   clanTag,
		Name:                  name,
		BadgeURLs:             officialBadgeURLsFromToken(token),
		ClanLevel:             level,
		Attacks:               attackCount,
		Stars:                 stars,
		DestructionPercentage: destruction,
	}
	reconstructed := reconstructedWarMembers(clanTag, opponentTag, members, attacks)
	out.Members = make([]officialWarMember, 0, len(reconstructed))
	for _, member := range reconstructed {
		out.Members = append(out.Members, buildWarMember(member, opponentTag, attacks))
	}
	return out
}

func reconstructedWarMembers(clanTag string, opponentTag string, missed []sqlWarMemberRow, attacks []sqlWarAttackRow) []sqlWarMemberRow {
	out := []sqlWarMemberRow{}
	for _, member := range missed {
		if member.ClanTag == clanTag {
			out = append(out, member)
		}
	}
	return out
}

func buildWarMember(member sqlWarMemberRow, opponentTag string, attacks []sqlWarAttackRow) officialWarMember {
	out := officialWarMember{
		Tag:           member.PlayerTag,
		Name:          member.PlayerName,
		TownhallLevel: member.Townhall,
		MapPosition:   member.MapPosition,
	}
	opponentAttacks := 0
	var best *officialWarAttack
	for _, attack := range attacks {
		if attack.AttackerTag == member.PlayerTag {
			out.Attacks = append(out.Attacks, officialAttackMap(attack))
		}
		if attack.DefenderTag == member.PlayerTag && attack.AttackingClanTag == opponentTag {
			opponentAttacks++
			candidate := officialAttackMap(attack)
			if betterAttack(candidate, best) {
				best = &candidate
			}
		}
	}
	if opponentAttacks > 0 {
		out.OpponentAttacks = &opponentAttacks
	} else {
		out.OpponentAttacks = &opponentAttacks
	}
	if best != nil {
		out.BestOpponentAttack = best
	}
	return out
}

func officialAttackMap(attack sqlWarAttackRow) officialWarAttack {
	return officialWarAttack{
		AttackerTag:           attack.AttackerTag,
		DefenderTag:           attack.DefenderTag,
		Stars:                 attack.Stars,
		DestructionPercentage: attack.DestructionPercentage,
		Order:                 attack.AttackOrder,
		Duration:              attack.Duration,
	}
}

func officialBadgeURLsFromToken(token string) officialBadgeURLs {
	return officialBadgeURLs{
		Small:  badgeURL(token, 70),
		Large:  badgeURL(token, 512),
		Medium: badgeURL(token, 200),
	}
}

func sqlWarAttackMap(attack sqlWarAttackRow, playerTag string) map[string]any {
	return map[string]any{
		"war_id":                attack.WarID,
		"warEndTime":            clashTime(attack.WarEndTime),
		"warType":               attack.WarType,
		"warSize":               attack.WarSize,
		"attackingClanTag":      attack.AttackingClanTag,
		"defendingClanTag":      attack.DefendingClanTag,
		"attackerTag":           attack.AttackerTag,
		"attackerName":          attack.AttackerName,
		"defenderTag":           attack.DefenderTag,
		"defenderName":          attack.DefenderName,
		"attackerTownhall":      attack.AttackerTownhall,
		"defenderTownhall":      attack.DefenderTownhall,
		"attackerMapPosition":   attack.AttackerMapPosition,
		"defenderMapPosition":   attack.DefenderMapPosition,
		"stars":                 attack.Stars,
		"destructionPercentage": attack.DestructionPercentage,
		"duration":              attack.Duration,
		"attackOrder":           attack.AttackOrder,
		"battleModifier":        attack.BattleModifier,
		"side":                  warAttackSide(attack, playerTag),
	}
}

func betterAttack(candidate officialWarAttack, best *officialWarAttack) bool {
	if best == nil {
		return true
	}
	if candidate.Stars != best.Stars {
		return candidate.Stars > best.Stars
	}
	if candidate.DestructionPercentage != best.DestructionPercentage {
		return candidate.DestructionPercentage > best.DestructionPercentage
	}
	return candidate.Order < best.Order
}

func sqlPlayerWarStats(c *fiber.Ctx, a apptypes.Deps, playerTag string, start time.Time, end time.Time) (map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT a.war_id, a.war_end_time, a.war_type, w.attacks_per_member, a.attacker_townhall,
			a.defender_townhall, a.stars, a.destruction_percentage, a.duration
		FROM war_attacks a
		JOIN wars w ON w.war_id = a.war_id
		WHERE a.attacker_tag = $1 AND a.war_end_time >= $2 AND a.war_end_time <= $3
		ORDER BY a.war_end_time DESC
	`, playerTag, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	buckets := map[string]*warStatsBucket{
		"all":      {},
		"random":   {},
		"friendly": {},
		"cwl":      {},
	}
	seenExpected := map[string]bool{}
	for rows.Next() {
		var warID, warType string
		var warEndTime time.Time
		var attacksPerMember, ownTownhall, defenderTownhall, stars, destruction, duration int
		if err := rows.Scan(&warID, &warEndTime, &warType, &attacksPerMember, &ownTownhall, &defenderTownhall, &stars, &destruction, &duration); err != nil {
			return nil, err
		}
		_ = warEndTime
		for _, key := range []string{"all", warType} {
			bucket := buckets[key]
			if bucket == nil {
				continue
			}
			expectedKey := key + ":" + warID
			if !seenExpected[expectedKey] {
				bucket.Wars++
				bucket.ExpectedAttacks += attacksPerMember
				seenExpected[expectedKey] = true
			}
			bucket.addAttack(stars, destruction, duration, ownTownhall, defenderTownhall)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	missedRows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT m.war_id, w.war_type, m.expected_attacks
		FROM war_missed_attacks m
		JOIN wars w ON w.war_id = m.war_id
		WHERE m.player_tag = $1 AND m.war_end_time >= $2 AND m.war_end_time <= $3
	`, playerTag, start, end)
	if err != nil {
		return nil, err
	}
	defer missedRows.Close()
	for missedRows.Next() {
		var warID, warType string
		var expectedAttacks int
		if err := missedRows.Scan(&warID, &warType, &expectedAttacks); err != nil {
			return nil, err
		}
		for _, key := range []string{"all", warType} {
			bucket := buckets[key]
			if bucket == nil {
				continue
			}
			expectedKey := key + ":" + warID
			if !seenExpected[expectedKey] {
				bucket.Wars++
				bucket.ExpectedAttacks += expectedAttacks
				seenExpected[expectedKey] = true
			}
		}
	}
	if err := missedRows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{
		"playerTag":      playerTag,
		"timestampStart": start.Unix(),
		"timestampEnd":   end.Unix(),
		"total":          buckets["all"].Map(),
		"random":         buckets["random"].Map(),
		"friendly":       buckets["friendly"].Map(),
		"cwl":            buckets["cwl"].Map(),
	}, nil
}

type warStatsBucket struct {
	Wars            int
	ExpectedAttacks int
	Attacks         int
	Stars           int
	Destruction     int
	Duration        int
	Triples         int
	TwoStars        int
	OneStars        int
	ZeroStars       int
	Perfect         int
	SameTHAttacks   int
	SameTHTriples   int
	DipAttacks      int
	DipTriples      int
	HitUpAttacks    int
	HitUpTriples    int
}

func (b *warStatsBucket) addAttack(stars int, destruction int, duration int, ownTownhall int, defenderTownhall int) {
	b.Attacks++
	b.Stars += stars
	b.Destruction += destruction
	b.Duration += duration
	switch stars {
	case 3:
		b.Triples++
	case 2:
		b.TwoStars++
	case 1:
		b.OneStars++
	default:
		b.ZeroStars++
	}
	if stars == 3 && destruction == 100 {
		b.Perfect++
	}
	if ownTownhall > 0 && defenderTownhall > 0 {
		switch {
		case defenderTownhall == ownTownhall:
			b.SameTHAttacks++
			if stars == 3 {
				b.SameTHTriples++
			}
		case defenderTownhall < ownTownhall:
			b.DipAttacks++
			if stars == 3 {
				b.DipTriples++
			}
		case defenderTownhall > ownTownhall:
			b.HitUpAttacks++
			if stars == 3 {
				b.HitUpTriples++
			}
		}
	}
}

func (b *warStatsBucket) Map() map[string]any {
	return map[string]any{
		"wars":                b.Wars,
		"expectedAttacks":     b.ExpectedAttacks,
		"attacks":             b.Attacks,
		"missedAttacks":       maxInt(0, b.ExpectedAttacks-b.Attacks),
		"stars":               b.Stars,
		"averageStars":        rateFloat(float64(b.Stars), b.Attacks),
		"averageDestruction":  rateFloat(float64(b.Destruction), b.Attacks),
		"averageDuration":     rateFloat(float64(b.Duration), b.Attacks),
		"hitrate":             rate(b.Triples, b.Attacks),
		"threeStarRate":       rate(b.Triples, b.Attacks),
		"twoStarRate":         rate(b.TwoStars, b.Attacks),
		"oneStarRate":         rate(b.OneStars, b.Attacks),
		"zeroStarRate":        rate(b.ZeroStars, b.Attacks),
		"perfectAttackRate":   rate(b.Perfect, b.Attacks),
		"sameTownhallHitrate": rate(b.SameTHTriples, b.SameTHAttacks),
		"dipHitrate":          rate(b.DipTriples, b.DipAttacks),
		"hitUpHitrate":        rate(b.HitUpTriples, b.HitUpAttacks),
		"sameTownhallAttacks": b.SameTHAttacks,
		"dipAttacks":          b.DipAttacks,
		"hitUpAttacks":        b.HitUpAttacks,
	}
}

func warTypesFromQuery(c *fiber.Ctx, includeCWL bool) []string {
	values := splitWarTypeCSV(apptypes.QueryValues(c, "war_type"), c.Query("war_types"))
	defaults := []string{"random", "friendly"}
	if includeCWL {
		defaults = []string{"random", "friendly", "cwl"}
	}
	if len(values) == 0 {
		return defaults
	}
	out := []string{}
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if value == "" || value == "all" {
			return defaults
		}
		if value == "random" || value == "friendly" || (includeCWL && value == "cwl") {
			out = append(out, value)
		}
	}
	if len(out) == 0 {
		return defaults
	}
	return out
}

func splitWarTypeCSV(list []string, single string) []string {
	out := make([]string, 0, len(list)+1)
	for _, raw := range list {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, trimmed)
			}
		}
	}
	if single != "" {
		for _, part := range strings.Split(single, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, trimmed)
			}
		}
	}
	return out
}

func badgeURLs(token string) map[string]any {
	if token == "" {
		return map[string]any{"small": "", "medium": "", "large": ""}
	}
	return map[string]any{
		"small":  badgeURL(token, 70),
		"medium": badgeURL(token, 200),
		"large":  badgeURL(token, 512),
	}
}

func badgeURL(token string, size int) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	return clashBadgeBaseURL + "/" + strconv.Itoa(size) + "/" + strings.TrimSuffix(token, ".png") + ".png"
}

func badgeURLPtr(token *string, size int) *string {
	if token == nil || strings.TrimSpace(*token) == "" {
		return nil
	}
	out := badgeURL(*token, size)
	return &out
}

func clashTime(value time.Time) string {
	return value.UTC().Format("20060102T150405.000Z")
}

func warAttackSide(attack sqlWarAttackRow, playerTag string) string {
	if attack.AttackerTag == playerTag {
		return "attack"
	}
	if attack.DefenderTag == playerTag {
		return "defense"
	}
	return ""
}

func rate(num int, den int) float64 {
	if den == 0 {
		return 0
	}
	return round2(float64(num) / float64(den))
}

func rateFloat(num float64, den int) float64 {
	if den == 0 {
		return 0
	}
	return round2(num / float64(den))
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
