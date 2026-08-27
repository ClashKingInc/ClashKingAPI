package routes

import (
	"context"
	"math"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
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
	WarType              string          `json:"-"`
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
		SELECT war_id::text, clan_tag, opponent_tag, prep_time, start_time, end_time, size, attacks_per_member,
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
	archived, err := sqlArchiveWarsContext(c.UserContext(), a, warIDs)
	if err != nil {
		return nil, err
	}
	items := make([]officialWarResponse, 0, len(wars))
	for _, war := range wars {
		value, exists := archived[war.WarID]
		if !exists {
			continue
		}
		items = append(items, buildStoredArchiveWar(war, value, clanTag))
	}
	return items, nil
}

func buildStoredArchiveWar(row sqlWarRow, archived wararchive.War, clanTag string) officialWarResponse {
	archived.Type = row.WarType
	return buildOfficialArchiveWar(archived, clanTag)
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
	wars, err := sqlArchiveWarsContext(ctx, a, warIDs)
	if err != nil {
		return nil, err
	}
	for warID, war := range wars {
		for _, side := range []struct{ clan, opponent wararchive.Clan }{{war.Clan, war.Opponent}, {war.Opponent, war.Clan}} {
			for _, member := range side.clan.Members {
				out[warID] = append(out[warID], sqlWarMemberRow{
					WarID: warID, ClanTag: side.clan.Tag, OpponentTag: side.opponent.Tag,
					PlayerTag: member.Tag, PlayerName: member.Name, Townhall: member.TownhallLevel,
					MapPosition: member.MapPosition, ExpectedAttacks: war.AttacksPerMember,
					AttackCount: len(member.Attacks), MissedAttacks: max(0, war.AttacksPerMember-len(member.Attacks)),
				})
			}
		}
	}
	return out, nil
}

func sqlWarMissedAttacks(c *fiber.Ctx, a apptypes.Deps, warIDs []string) (map[string][]sqlWarMemberRow, error) {
	out := map[string][]sqlWarMemberRow{}
	if len(warIDs) == 0 {
		return out, nil
	}
	members, err := sqlWarMembersContext(c.UserContext(), a, warIDs)
	if err != nil {
		return nil, err
	}
	for warID, values := range members {
		for _, member := range values {
			if member.MissedAttacks > 0 {
				out[warID] = append(out[warID], member)
			}
		}
	}
	return out, nil
}

func sqlWarAttacks(c *fiber.Ctx, a apptypes.Deps, warIDs []string) (map[string][]sqlWarAttackRow, error) {
	return sqlWarAttacksContext(c.UserContext(), a, warIDs)
}

func sqlWarAttacksContext(ctx context.Context, a apptypes.Deps, warIDs []string) (map[string][]sqlWarAttackRow, error) {
	out := map[string][]sqlWarAttackRow{}
	if len(warIDs) == 0 {
		return out, nil
	}
	wars, err := sqlArchiveWarsContext(ctx, a, warIDs)
	if err != nil {
		return nil, err
	}
	for warID, war := range wars {
		for _, attack := range wararchive.Attacks(warID, war) {
			out[warID] = append(out[warID], sqlWarAttackFromArchive(attack))
		}
	}
	return out, nil
}

func sqlArchiveWarsContext(ctx context.Context, a apptypes.Deps, warIDs []string) (map[string]wararchive.War, error) {
	return a.Store.WarArchive.LoadIDs(ctx, a.Store.SQL, warIDs)
}

func sqlWarsForPlayersContext(ctx context.Context, a apptypes.Deps, playerTags []string, start, end time.Time) (map[string]wararchive.War, error) {
	return a.Store.WarArchive.LoadForPlayers(ctx, a.Store.SQL, playerTags, start, end)
}

func sqlAttacksForPlayersContext(ctx context.Context, a apptypes.Deps, playerTags []string, start, end time.Time) ([]sqlWarAttackRow, map[string]wararchive.War, error) {
	wars, err := sqlWarsForPlayersContext(ctx, a, playerTags, start, end)
	if err != nil {
		return nil, nil, err
	}
	wanted := make(map[string]struct{}, len(playerTags))
	for _, tag := range playerTags {
		wanted[tag] = struct{}{}
	}
	var attacks []sqlWarAttackRow
	for warID, war := range wars {
		for _, attack := range wararchive.Attacks(warID, war) {
			if _, exists := wanted[attack.AttackerTag]; exists {
				attacks = append(attacks, sqlWarAttackFromArchive(attack))
			}
		}
	}
	return attacks, wars, nil
}

func buildOfficialWar(war sqlWarRow, members []sqlWarMemberRow, attacks []sqlWarAttackRow) officialWarResponse {
	item := officialWarResponse{
		WarType:              war.WarType,
		State:                officialWarState(war.State),
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

func buildOfficialArchiveWar(war wararchive.War, clanTag string) officialWarResponse {
	if war.Opponent.Tag == clanTag && war.Clan.Tag != clanTag {
		war.Clan, war.Opponent = war.Opponent, war.Clan
	}
	item := officialWarResponse{
		WarType: war.Type,
		State:   officialWarState(war.State), TeamSize: war.TeamSize, PreparationStartTime: clashTime(war.PreparationStartTime),
		EndTime: clashTime(war.EndTime), Clan: officialArchiveClan(war.Clan, war.Opponent),
		Opponent: officialArchiveClan(war.Opponent, war.Clan),
	}
	modifier := war.BattleModifier
	item.BattleModifier = &modifier
	if war.StartTime != nil {
		value := clashTime(*war.StartTime)
		item.StartTime = &value
		if war.Type == "cwl" {
			item.WarStartTime = &value
		}
	}
	if war.Type == "cwl" {
		if war.WarTag != "" {
			item.Tag = &war.WarTag
		}
	} else {
		item.AttacksPerMember = &war.AttacksPerMember
	}
	return item
}

func officialWarState(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "notinwar":
		return "notInWar"
	case "preparation":
		return "preparation"
	case "inwar":
		return "inWar"
	case "ended", "warended":
		return "warEnded"
	default:
		return value
	}
}

func officialArchiveClan(clan, opponent wararchive.Clan) officialWarClan {
	result := officialWarClan{
		Tag: clan.Tag, Name: clan.Name, BadgeURLs: officialBadgeURLsFromToken(clan.BadgeToken),
		ClanLevel: clan.ClanLevel, Attacks: clan.Attacks, Stars: clan.Stars,
		DestructionPercentage: clan.DestructionPercentage,
		Members:               make([]officialWarMember, 0, len(clan.Members)),
	}
	opponentAttacks := make(map[string][]officialWarAttack)
	for _, member := range opponent.Members {
		for _, attack := range member.Attacks {
			opponentAttacks[attack.DefenderTag] = append(opponentAttacks[attack.DefenderTag], officialWarAttack{
				AttackerTag: member.Tag, DefenderTag: attack.DefenderTag, Stars: attack.Stars,
				DestructionPercentage: attack.DestructionPercentage, Order: attack.Order, Duration: attack.Duration,
			})
		}
	}
	for _, member := range clan.Members {
		value := officialWarMember{
			Tag: member.Tag, Name: member.Name, TownhallLevel: member.TownhallLevel, MapPosition: member.MapPosition,
			Attacks: make([]officialWarAttack, 0, len(member.Attacks)),
		}
		for _, attack := range member.Attacks {
			value.Attacks = append(value.Attacks, officialWarAttack{
				AttackerTag: member.Tag, DefenderTag: attack.DefenderTag, Stars: attack.Stars,
				DestructionPercentage: attack.DestructionPercentage, Order: attack.Order, Duration: attack.Duration,
			})
		}
		defenses := opponentAttacks[member.Tag]
		count := len(defenses)
		value.OpponentAttacks = &count
		for index := range defenses {
			if betterAttack(defenses[index], value.BestOpponentAttack) {
				candidate := defenses[index]
				value.BestOpponentAttack = &candidate
			}
		}
		result.Members = append(result.Members, value)
	}
	return result
}

func sqlWarAttackFromArchive(attack wararchive.AttackFact) sqlWarAttackRow {
	return sqlWarAttackRow{
		WarID: attack.WarID, WarEndTime: attack.WarEndTime, WarType: attack.WarType, WarSize: attack.WarSize,
		AttackingClanTag: attack.AttackingClanTag, DefendingClanTag: attack.DefendingClanTag,
		AttackerTag: attack.AttackerTag, AttackerName: attack.AttackerName,
		DefenderTag: attack.DefenderTag, DefenderName: attack.DefenderName,
		AttackerTownhall: attack.AttackerTownhall, DefenderTownhall: attack.DefenderTownhall,
		AttackerMapPosition: attack.AttackerMapPosition, DefenderMapPosition: attack.DefenderMapPosition,
		Stars: attack.Stars, DestructionPercentage: attack.DestructionPercentage,
		Duration: attack.Duration, AttackOrder: attack.AttackOrder, BattleModifier: attack.BattleModifier,
	}
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
	attacks, wars, err := sqlAttacksForPlayersContext(c.UserContext(), a, []string{playerTag}, start, end)
	if err != nil {
		return nil, err
	}
	buckets := map[string]*warStatsBucket{
		"all":      {},
		"random":   {},
		"friendly": {},
		"cwl":      {},
	}
	for _, war := range wars {
		participated := false
		for _, clan := range []wararchive.Clan{war.Clan, war.Opponent} {
			for _, member := range clan.Members {
				if member.Tag == playerTag {
					participated = true
					break
				}
			}
		}
		if !participated {
			continue
		}
		for _, key := range []string{"all", war.Type} {
			bucket := buckets[key]
			if bucket == nil {
				continue
			}
			bucket.Wars++
			bucket.ExpectedAttacks += war.AttacksPerMember
		}
	}
	for _, attack := range attacks {
		for _, key := range []string{"all", attack.WarType} {
			bucket := buckets[key]
			if bucket == nil {
				continue
			}
			bucket.addAttack(attack.Stars, attack.DestructionPercentage, attack.Duration, attack.AttackerTownhall, attack.DefenderTownhall)
		}
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
