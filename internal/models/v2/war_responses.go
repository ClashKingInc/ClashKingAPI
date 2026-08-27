package modelsv2

// CWLStanding is a stored CWL standing. Rankings are absent until Tracking
// persists them; API readers never derive them from wars.
type CWLStanding struct {
	ClanTag           string  `json:"clanTag"`
	Season            string  `json:"season"`
	CWLLeagueID       int     `json:"cwlLeagueId"`
	WarSize           int     `json:"warSize"`
	Stars             int     `json:"stars"`
	Destruction       float64 `json:"destruction"`
	Wins              int     `json:"wins"`
	Losses            int     `json:"losses"`
	Ties              int     `json:"ties"`
	WarsFinished      int     `json:"warsFinished"`
	TotalClansInGroup int     `json:"totalClansInGroup"`
	GroupRank         *int    `json:"groupRank,omitempty"`
	GlobalRank        *int    `json:"globalRank,omitempty"`
	UpdatedAt         string  `json:"updatedAt"`
}

// CWLGroupClan is the immutable roster snapshot for a clan in one CWL group.
type CWLGroupClan struct {
	ClanTag    string      `json:"clanTag"`
	Name       string      `json:"name"`
	ClanLevel  int         `json:"clanLevel"`
	BadgeToken string      `json:"badgeToken"`
	Members    []CWLMember `json:"members"`
}

// CWLHistoryItem is one player or clan CWL group history entry.
type CWLHistoryItem struct {
	Season      string       `json:"season"`
	CWLLeagueID *int         `json:"cwlLeagueId,omitempty"`
	State       string       `json:"state"`
	WarSize     *int         `json:"warSize,omitempty"`
	Rounds      []CWLRound   `json:"rounds"`
	Clan        CWLGroupClan `json:"clan"`
	Standing    *CWLStanding `json:"standing,omitempty"`
}

type CWLClanHistoryResponse struct {
	ClanTag string           `json:"clanTag"`
	Items   []CWLHistoryItem `json:"items"`
}

type CWLPlayerHistoryResponse struct {
	Items []CWLPlayerHistoryItem `json:"items"`
}

// CWLPlayerHistoryItem is one player-centric CWL season. It intentionally does
// not reuse the clan group snapshot contract.
type CWLPlayerHistoryItem struct {
	Season        string                    `json:"season"`
	TownHallLevel int                       `json:"townHallLevel"`
	TeamSize      *int                      `json:"teamSize" extensions:"x-nullable"`
	Clan          CWLPlayerHistoryClan      `json:"clan"`
	Attacks       []CWLPlayerHistoryAttack  `json:"attacks"`
	Placement     *CWLPlayerAttackPlacement `json:"placement" extensions:"x-nullable"`
	MissedAttacks int                       `json:"missedAttacks"`
}

type CWLPlayerHistoryClan struct {
	Tag        string                     `json:"tag"`
	Name       string                     `json:"name"`
	BadgeURLs  WarBadgeURLs               `json:"badgeUrls"`
	WarLeague  *LeagueReference           `json:"warLeague,omitempty"`
	Wars       *CWLPlayerHistoryWarRecord `json:"wars" extensions:"x-nullable"`
	TotalStars *int                       `json:"totalStars" extensions:"x-nullable"`
	Placement  *CWLPlayerClanPlacement    `json:"placement" extensions:"x-nullable"`
}

type CWLPlayerHistoryWarRecord struct {
	Won  int `json:"won"`
	Lost int `json:"lost"`
	Tied int `json:"tied"`
}

type CWLPlayerAttackPlacement struct {
	Clan  int `json:"clan"`
	Group int `json:"group"`
}

type CWLPlayerClanPlacement struct {
	Group  *int `json:"group" extensions:"x-nullable"`
	Global *int `json:"global" extensions:"x-nullable"`
}

type CWLPlayerHistoryAttack struct {
	WarTag                string                         `json:"warTag"`
	Round                 int                            `json:"round"`
	Opponent              CWLPlayerHistoryAttackOpponent `json:"opponent"`
	Defender              CWLPlayerHistoryAttackDefender `json:"defender"`
	Stars                 int                            `json:"stars"`
	DestructionPercentage int                            `json:"destructionPercentage"`
	Order                 int                            `json:"order"`
	Duration              int                            `json:"duration"`
}

type CWLPlayerHistoryAttackOpponent struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type CWLPlayerHistoryAttackDefender struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
	MapPosition   int    `json:"mapPosition"`
}

type CWLLeagueRankingsResponse struct {
	Season      string        `json:"season"`
	CWLLeagueID int           `json:"cwlLeagueId"`
	WarSize     int           `json:"warSize"`
	Items       []CWLStanding `json:"items"`
}

// WarStatsItem is the single entry returned by GET /v2/war/clan/stats.
type WarStatsItem struct {
	WarCount int      `json:"war_count"`
	ClanTags []string `json:"clan_tags"`
}

type WarBadgeURLs struct {
	Small  string `json:"small"`
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

type WarAttack struct {
	AttackerTag           string `json:"attackerTag"`
	DefenderTag           string `json:"defenderTag"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Order                 int    `json:"order"`
	Duration              int    `json:"duration"`
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

type WarClan struct {
	Tag                   string       `json:"tag"`
	Name                  string       `json:"name"`
	BadgeURLs             WarBadgeURLs `json:"badgeUrls"`
	ClanLevel             int          `json:"clanLevel"`
	Attacks               int          `json:"attacks"`
	Stars                 int          `json:"stars"`
	DestructionPercentage float64      `json:"destructionPercentage"`
	Members               []WarMember  `json:"members"`
}

type WarResponse struct {
	State                string  `json:"state"`
	TeamSize             int     `json:"teamSize"`
	AttacksPerMember     *int    `json:"attacksPerMember,omitempty"`
	BattleModifier       *string `json:"battleModifier,omitempty"`
	PreparationStartTime string  `json:"preparationStartTime"`
	StartTime            *string `json:"startTime,omitempty"`
	EndTime              string  `json:"endTime"`
	Clan                 WarClan `json:"clan"`
	Opponent             WarClan `json:"opponent"`
	WarStartTime         *string `json:"warStartTime,omitempty"`
	Tag                  *string `json:"tag,omitempty"`
}

type WarListResponse struct {
	Items []WarResponse `json:"items"`
}

type WarWeeklyHitrateItem struct {
	Week               string  `json:"week"`
	WarType            string  `json:"warType"`
	TownhallLevel      int     `json:"townhallLevel"`
	Attacks            int     `json:"attacks"`
	Triples            int     `json:"triples"`
	Hitrate            float64 `json:"hitrate"`
	AverageStars       float64 `json:"averageStars"`
	AverageDestruction float64 `json:"averageDestruction"`
}

type WarWeeklyHitrateResponse struct {
	Items []WarWeeklyHitrateItem `json:"items"`
}

type WarCompletedDailyItem struct {
	Day           string `json:"day"`
	WarType       string `json:"warType"`
	WarsCompleted int    `json:"warsCompleted"`
}

type WarCompletedDailyResponse struct {
	Items []WarCompletedDailyItem `json:"items"`
}

type WarStatsResponse struct {
	Items []WarStatsItem `json:"items"`
}

type CWLLeague struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type CWLMember struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
}

type CWLClan struct {
	Tag       string       `json:"tag"`
	Name      string       `json:"name"`
	ClanLevel int          `json:"clanLevel"`
	BadgeURLs WarBadgeURLs `json:"badgeUrls"`
	Members   []CWLMember  `json:"members"`
	WarLeague *CWLLeague   `json:"warLeague,omitempty"`
}

type CWLRound struct {
	WarTags []string `json:"warTags"`
}

type CWLGroupResponse struct {
	State        string           `json:"state"`
	Season       string           `json:"season"`
	Clans        []CWLClan        `json:"clans"`
	Rounds       []CWLRound       `json:"rounds"`
	ClanRankings []CWLClanRanking `json:"clan_rankings,omitempty"`
}

type CWLClanRanking struct {
	Name        string           `json:"name"`
	Tag         string           `json:"tag"`
	Stars       int64            `json:"stars"`
	Destruction float64          `json:"destruction"`
	Rounds      CWLRankingRounds `json:"rounds"`
}

type CWLRankingRounds struct {
	Won  int `json:"won"`
	Tied int `json:"tied"`
	Lost int `json:"lost"`
}

type WarSummaryInfo struct {
	State          string       `json:"state"`
	CurrentWarInfo *WarResponse `json:"currentWarInfo,omitempty"`
	Bypass         *bool        `json:"bypass,omitempty"`
}

type WarSummaryResponse struct {
	ClanTag        string            `json:"clan_tag"`
	IsInWar        bool              `json:"isInWar"`
	IsInCWL        bool              `json:"isInCwl"`
	WarInfo        WarSummaryInfo    `json:"war_info"`
	LeagueInfo     *CWLGroupResponse `json:"league_info,omitempty"`
	WarLeagueInfos []WarResponse     `json:"war_league_infos"`
}

type WarSummaryListResponse struct {
	Items []WarSummaryResponse `json:"items"`
}

type WarMatchupStats struct {
	AverageStars       float64        `json:"averageStars"`
	AverageDestruction float64        `json:"averageDestruction"`
	Count              int            `json:"count"`
	StarsCount         map[string]int `json:"starsCount"`
}

type WarHitBucket struct {
	WarsCounts         int                        `json:"warsCounts"`
	TotalAttacks       int                        `json:"totalAttacks"`
	TotalDefenses      int                        `json:"totalDefenses"`
	MissedAttacks      int                        `json:"missedAttacks"`
	MissedDefenses     int                        `json:"missedDefenses"`
	StarsCount         map[string]int             `json:"starsCount"`
	StarsCountDef      map[string]int             `json:"starsCountDef"`
	ByEnemyTownhall    map[string]WarMatchupStats `json:"byEnemyTownhall"`
	ByEnemyTownhallDef map[string]WarMatchupStats `json:"byEnemyTownhallDef"`
}

type WarHitStats struct {
	All      WarHitBucket `json:"all"`
	Random   WarHitBucket `json:"random"`
	CWL      WarHitBucket `json:"cwl"`
	Friendly WarHitBucket `json:"friendly"`
}

type TimeRange struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

type PlayerWarHitResult struct {
	Name          string      `json:"name"`
	Tag           string      `json:"tag"`
	TownhallLevel int         `json:"townhallLevel"`
	Stats         WarHitStats `json:"stats"`
	TimeRange     TimeRange   `json:"timeRange"`
	Wars          []WarHitWar `json:"wars"`
}

type WarHitWar struct {
	WarData        WarResponse `json:"war_data"`
	Members        []WarMember `json:"members"`
	MissedAttacks  int         `json:"missedAttacks,omitempty"`
	MissedDefenses int         `json:"missedDefenses,omitempty"`
}

type ClanWarHitResult struct {
	ClanTag string               `json:"clan_tag"`
	Players []PlayerWarHitResult `json:"players"`
	Wars    []WarHitWar          `json:"wars"`
}

type PlayerWarHitsResponse struct {
	Items []PlayerWarHitResult `json:"items"`
}

type ClanWarHitsResponse struct {
	Items []ClanWarHitResult `json:"items"`
}

type PlayerWarAttackItem struct {
	WarID                 string `json:"war_id"`
	WarEndTime            string `json:"warEndTime"`
	WarType               string `json:"warType"`
	WarSize               int    `json:"warSize"`
	AttackingClanTag      string `json:"attackingClanTag"`
	DefendingClanTag      string `json:"defendingClanTag"`
	AttackerTag           string `json:"attackerTag"`
	AttackerName          string `json:"attackerName"`
	DefenderTag           string `json:"defenderTag"`
	DefenderName          string `json:"defenderName"`
	AttackerTownhall      int    `json:"attackerTownhall"`
	DefenderTownhall      int    `json:"defenderTownhall"`
	AttackerMapPosition   int    `json:"attackerMapPosition"`
	DefenderMapPosition   int    `json:"defenderMapPosition"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	Duration              int    `json:"duration"`
	AttackOrder           int    `json:"attackOrder"`
	BattleModifier        string `json:"battleModifier"`
	Side                  string `json:"side"`
}

type PlayerWarAttacksResponse struct {
	Items []PlayerWarAttackItem `json:"items"`
}

type PlayerWarHistoryClan struct {
	Tag                   string          `json:"tag"`
	Name                  string          `json:"name"`
	BadgeURLs             PublicBadgeURLs `json:"badgeUrls"`
	ClanLevel             int             `json:"clanLevel"`
	Attacks               int             `json:"attacks"`
	Stars                 int             `json:"stars"`
	DestructionPercentage float64         `json:"destructionPercentage"`
}

type PlayerWarHistoryPlayer struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownhallLevel int    `json:"townhallLevel"`
	MapPosition   int    `json:"mapPosition"`
}

type PlayerWarHistoryAttack struct {
	Stars                 int                    `json:"stars"`
	DestructionPercentage int                    `json:"destructionPercentage"`
	Order                 int                    `json:"order"`
	Duration              int                    `json:"duration"`
	Fresh                 bool                   `json:"fresh"`
	Player                PlayerWarHistoryPlayer `json:"player"`
}

type PlayerWarHistoryItem struct {
	TeamSize             int                      `json:"teamSize"`
	AttacksPerMember     int                      `json:"attacksPerMember"`
	PreparationStartTime string                   `json:"preparationStartTime"`
	StartTime            string                   `json:"startTime,omitempty"`
	EndTime              string                   `json:"endTime"`
	Clan                 PlayerWarHistoryClan     `json:"clan"`
	Opponent             PlayerWarHistoryClan     `json:"opponent"`
	Type                 string                   `json:"type" enums:"cwl,random,friendly"`
	Player               PlayerWarHistoryPlayer   `json:"player"`
	Attacks              []PlayerWarHistoryAttack `json:"attacks"`
	Defenses             []PlayerWarHistoryAttack `json:"defenses"`
}

type PlayerWarStatsResponse struct {
	Items []PlayerWarHistoryItem `json:"items"`
}
