package wararchive

import (
	_ "embed"
	"encoding/json"
	"time"
)

//go:embed war-json.zdict
var dictionary []byte

type War struct {
	WarTag               string     `json:"warTag,omitempty"`
	Type                 string     `json:"type"`
	State                string     `json:"state"`
	TeamSize             int        `json:"teamSize"`
	AttacksPerMember     int        `json:"attacksPerMember"`
	PreparationStartTime time.Time  `json:"preparationStartTime"`
	StartTime            *time.Time `json:"startTime,omitempty"`
	EndTime              time.Time  `json:"endTime"`
	BattleModifier       string     `json:"battleModifier,omitempty"`
	Clan                 Clan       `json:"clan"`
	Opponent             Clan       `json:"opponent"`
}

type Clan struct {
	Tag                   string   `json:"tag"`
	Name                  string   `json:"name,omitempty"`
	BadgeToken            string   `json:"badgeToken,omitempty"`
	ClanLevel             int      `json:"clanLevel,omitempty"`
	Attacks               int      `json:"attacks,omitempty"`
	Stars                 int      `json:"stars,omitempty"`
	DestructionPercentage float64  `json:"destructionPercentage,omitempty"`
	Members               []Member `json:"members"`
}

type Member struct {
	Tag           string   `json:"tag"`
	Name          string   `json:"name,omitempty"`
	TownhallLevel int      `json:"townhallLevel,omitempty"`
	MapPosition   int      `json:"mapPosition,omitempty"`
	Attacks       []Attack `json:"attacks,omitempty"`
}

type Attack struct {
	DefenderTag           string `json:"defenderTag"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Duration              int    `json:"duration"`
	Order                 int    `json:"order"`
}

type Ref struct {
	WarID           string
	WarType         string
	PackID          *int64
	Offset          *int64
	CompressedBytes *int
	Pending         json.RawMessage
}

type LoadedWar struct {
	WarID string
	War   War
}

type AttackFact struct {
	WarID                 string
	WarEndTime            time.Time
	WarType               string
	WarSize               int
	BattleModifier        string
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
}

type AttackAggregate struct {
	Attacks            int   `json:"attacks"`
	Stars              int   `json:"stars"`
	Triples            int   `json:"triples"`
	ZeroStars          int   `json:"zeroStars"`
	OneStars           int   `json:"oneStars"`
	TwoStars           int   `json:"twoStars"`
	DestructionPercent int64 `json:"destructionPercent"`
	DurationSeconds    int64 `json:"durationSeconds"`
}

func Attacks(warID string, war War) []AttackFact {
	result := make([]AttackFact, 0, war.Clan.Attacks+war.Opponent.Attacks)
	result = appendAttackFacts(result, warID, war, war.Clan, war.Opponent)
	result = appendAttackFacts(result, warID, war, war.Opponent, war.Clan)
	return result
}

func appendAttackFacts(out []AttackFact, warID string, war War, attacking, defending Clan) []AttackFact {
	defenders := make(map[string]Member, len(defending.Members))
	for _, member := range defending.Members {
		defenders[member.Tag] = member
	}
	for _, attacker := range attacking.Members {
		for _, attack := range attacker.Attacks {
			defender := defenders[attack.DefenderTag]
			out = append(out, AttackFact{
				WarID: warID, WarEndTime: war.EndTime, WarType: war.Type, WarSize: war.TeamSize,
				BattleModifier: war.BattleModifier, AttackingClanTag: attacking.Tag, DefendingClanTag: defending.Tag,
				AttackerTag: attacker.Tag, AttackerName: attacker.Name, DefenderTag: defender.Tag, DefenderName: defender.Name,
				AttackerTownhall: attacker.TownhallLevel, DefenderTownhall: defender.TownhallLevel,
				AttackerMapPosition: attacker.MapPosition, DefenderMapPosition: defender.MapPosition,
				Stars: attack.Stars, DestructionPercentage: attack.DestructionPercentage,
				Duration: attack.Duration, AttackOrder: attack.Order,
			})
		}
	}
	return out
}
