package legacy

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	legacymodels "github.com/ClashKingInc/ClashKingAPI/internal/models/legacy"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
)

const badgeBaseURL = "https://api-assets.clashofclans.com/badges"

var tagCharacters = regexp.MustCompile(`[^A-Z0-9]+`)

func fixTag(raw string) string {
	if decoded, err := url.PathUnescape(raw); err == nil {
		raw = decoded
	}
	raw = strings.TrimPrefix(strings.ToUpper(strings.TrimSpace(raw)), "#")
	raw = tagCharacters.ReplaceAllString(raw, "")
	raw = strings.ReplaceAll(raw, "O", "0")
	if raw == "" {
		return ""
	}
	return "#" + raw
}

func parseInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	return strconv.Atoi(raw)
}

func parseInt64(raw string, fallback int64) (int64, error) {
	if raw == "" {
		return fallback, nil
	}
	return strconv.ParseInt(raw, 10, 64)
}

func clashTime(value time.Time) string {
	return value.UTC().Format("20060102T150405.000Z")
}

func legacyDateTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000000")
}

func badgeURLs(token string) legacymodels.BadgeURLs {
	token = strings.TrimSuffix(strings.TrimSpace(token), ".png")
	if token == "" {
		return legacymodels.BadgeURLs{}
	}
	return legacymodels.BadgeURLs{
		Small:  badgeBaseURL + "/70/" + token + ".png",
		Large:  badgeBaseURL + "/512/" + token + ".png",
		Medium: badgeBaseURL + "/200/" + token + ".png",
	}
}

func legacyWar(source wararchive.War, includeMembers bool) legacymodels.War {
	war := legacymodels.War{
		State: normalizeWarState(source.State), TeamSize: source.TeamSize,
		BattleModifier:       source.BattleModifier,
		PreparationStartTime: clashTime(source.PreparationStartTime), EndTime: clashTime(source.EndTime),
		Clan:     legacyWarClan(source.Clan, source.Opponent, includeMembers),
		Opponent: legacyWarClan(source.Opponent, source.Clan, includeMembers),
	}
	if source.Type == "cwl" {
		war.Tag = source.WarTag
		if source.StartTime != nil {
			war.WarStartTime = clashTime(*source.StartTime)
		}
	} else {
		attacksPerMember := source.AttacksPerMember
		war.AttacksPerMember = &attacksPerMember
		if source.StartTime != nil {
			war.StartTime = clashTime(*source.StartTime)
		}
	}
	return war
}

func legacyWarClan(clan, opponent wararchive.Clan, includeMembers bool) legacymodels.WarClan {
	result := legacymodels.WarClan{
		Tag: clan.Tag, Name: clan.Name, BadgeURLs: badgeURLs(clan.BadgeToken), ClanLevel: clan.ClanLevel,
		Attacks: clan.Attacks, Stars: clan.Stars, DestructionPercentage: clan.DestructionPercentage,
	}
	if !includeMembers {
		return result
	}
	result.Members = make([]legacymodels.WarMember, 0, len(clan.Members))
	opponentAttacks := attacksByDefender(opponent)
	for _, member := range clan.Members {
		attacks := make([]legacymodels.WarAttack, 0, len(member.Attacks))
		for _, attack := range member.Attacks {
			attacks = append(attacks, legacyAttack(member.Tag, attack))
		}
		defenses := opponentAttacks[member.Tag]
		count := len(defenses)
		item := legacyMember(member, &count)
		item.Attacks = attacks
		for index := range defenses {
			candidate := defenses[index]
			if betterAttack(candidate, item.BestOpponentAttack) {
				item.BestOpponentAttack = &candidate
			}
		}
		result.Members = append(result.Members, item)
	}
	return result
}

func legacyMember(member wararchive.Member, opponentAttacks *int) legacymodels.WarMember {
	return legacymodels.WarMember{
		Tag: member.Tag, Name: member.Name, TownhallLevel: member.TownhallLevel,
		MapPosition: member.MapPosition, OpponentAttacks: opponentAttacks,
	}
}

func legacyAttack(attackerTag string, attack wararchive.Attack) legacymodels.WarAttack {
	return legacymodels.WarAttack{
		AttackerTag: attackerTag, DefenderTag: attack.DefenderTag, Stars: attack.Stars,
		DestructionPercentage: attack.DestructionPercentage, Order: attack.Order, Duration: attack.Duration,
	}
}

func attacksByDefender(clan wararchive.Clan) map[string][]legacymodels.WarAttack {
	result := map[string][]legacymodels.WarAttack{}
	for _, member := range clan.Members {
		for _, attack := range member.Attacks {
			result[attack.DefenderTag] = append(result[attack.DefenderTag], legacyAttack(member.Tag, attack))
		}
	}
	return result
}

func betterAttack(candidate legacymodels.WarAttack, current *legacymodels.WarAttack) bool {
	if current == nil || candidate.Stars != current.Stars {
		return current == nil || candidate.Stars > current.Stars
	}
	if candidate.DestructionPercentage != current.DestructionPercentage {
		return candidate.DestructionPercentage > current.DestructionPercentage
	}
	return candidate.Order < current.Order
}

func normalizeWarState(value string) string {
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
