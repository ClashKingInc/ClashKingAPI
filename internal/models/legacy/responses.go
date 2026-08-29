package legacy

// JoinLeaveResponse is the legacy envelope returned by clan and player history.
type JoinLeaveResponse struct {
	Items []JoinLeaveEvent `json:"items"`
}

// JoinLeaveEvent preserves the original v1 field names and timestamp format.
type JoinLeaveEvent struct {
	Name     string `json:"name"`
	Tag      string `json:"tag"`
	Townhall int    `json:"th"`
	Time     string `json:"time"`
	Clan     string `json:"clan"`
	Type     string `json:"type"`
	ClanName string `json:"clan_name,omitempty"`
}

// WarListResponse is the envelope used by legacy previous-war routes.
type WarListResponse struct {
	Items []War `json:"items"`
}

// War is an official-API-shaped stored war. Type and Season are only populated
// by legacy endpoints that historically added those fields.
type War struct {
	Type                 string  `json:"type,omitempty"`
	State                string  `json:"state"`
	TeamSize             int     `json:"teamSize"`
	AttacksPerMember     *int    `json:"attacksPerMember,omitempty"`
	BattleModifier       string  `json:"battleModifier,omitempty"`
	PreparationStartTime string  `json:"preparationStartTime"`
	StartTime            string  `json:"startTime,omitempty"`
	EndTime              string  `json:"endTime"`
	Clan                 WarClan `json:"clan"`
	Opponent             WarClan `json:"opponent"`
	WarStartTime         string  `json:"warStartTime,omitempty"`
	Tag                  string  `json:"tag,omitempty"`
	Season               string  `json:"season,omitempty"`
}

type BadgeURLs struct {
	Small  string `json:"small"`
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

type WarClan struct {
	Tag                   string      `json:"tag"`
	Name                  string      `json:"name"`
	BadgeURLs             BadgeURLs   `json:"badgeUrls"`
	ClanLevel             int         `json:"clanLevel"`
	Attacks               int         `json:"attacks"`
	Stars                 int         `json:"stars"`
	DestructionPercentage float64     `json:"destructionPercentage"`
	Members               []WarMember `json:"members,omitempty"`
}

type WarMember struct {
	Tag                string      `json:"tag"`
	Name               string      `json:"name"`
	TownhallLevel      int         `json:"townhallLevel"`
	MapPosition        int         `json:"mapPosition"`
	Attacks            []WarAttack `json:"attacks,omitempty"`
	OpponentAttacks    *int        `json:"opponentAttacks,omitempty"`
	BestOpponentAttack *WarAttack  `json:"bestOpponentAttack,omitempty"`
}

type WarAttack struct {
	AttackerTag           string `json:"attackerTag"`
	DefenderTag           string `json:"defenderTag"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Order                 int    `json:"order"`
	Duration              int    `json:"duration"`
}

type PlayerWarHitsResponse struct {
	Items []PlayerWarHit `json:"items"`
}

type PlayerWarHit struct {
	WarData    War            `json:"war_data"`
	MemberData WarMember      `json:"member_data"`
	Attacks    []WarHitAttack `json:"attacks"`
	Defenses   []WarHitAttack `json:"defenses"`
}

type WarHitAttack struct {
	AttackerTag           string     `json:"attackerTag"`
	DefenderTag           string     `json:"defenderTag"`
	Stars                 int        `json:"stars"`
	DestructionPercentage int        `json:"destructionPercentage"`
	Order                 int        `json:"order"`
	Duration              int        `json:"duration"`
	Fresh                 bool       `json:"fresh"`
	Defender              *WarMember `json:"defender,omitempty"`
	Attacker              *WarMember `json:"attacker,omitempty"`
	AttackOrder           int        `json:"attack_order"`
}

// CWLGroupEnvelope preserves the Mongo document wrapper returned by /group.
type CWLGroupEnvelope struct {
	Data CWLGroup `json:"data"`
}

type CWLGroup struct {
	State  string     `json:"state"`
	Season string     `json:"season"`
	Clans  []CWLClan  `json:"clans"`
	Rounds []CWLRound `json:"rounds"`
}

type CWLClan struct {
	Tag       string      `json:"tag"`
	Name      string      `json:"name"`
	ClanLevel int         `json:"clanLevel"`
	BadgeURLs BadgeURLs   `json:"badgeUrls"`
	Members   []CWLMember `json:"members"`
}

type CWLMember struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
}

// WarTags contains strings for /group and full War objects or tag placeholders
// for the season endpoint, matching the old dynamic response.
type CWLRound struct {
	WarTags []any `json:"warTags" swaggertype:"array,object"`
}
