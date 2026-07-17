package modelsv2

// CWLThresholdItem is one league row returned by GET /v2/cwl/league-thresholds.
type CWLThresholdItem struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Promo  int    `json:"promo"`
	Demote int    `json:"demote"`
}

// CWLRankingHistoryItem is one season row returned by GET /v2/cwl/:clan_tag/ranking-history.
type CWLRankingHistoryItem struct {
	Season string `json:"season"`
	League string `json:"league"`
	Rounds int    `json:"rounds"`
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

type CWLRankingHistoryResponse struct {
	Items []CWLRankingHistoryItem `json:"items"`
}

type CWLThresholdResponse struct {
	Items []CWLThresholdItem `json:"items"`
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

type PlayerWarStatsBucket struct {
	Wars                int     `json:"wars"`
	ExpectedAttacks     int     `json:"expectedAttacks"`
	Attacks             int     `json:"attacks"`
	MissedAttacks       int     `json:"missedAttacks"`
	Stars               int     `json:"stars"`
	AverageStars        float64 `json:"averageStars"`
	AverageDestruction  float64 `json:"averageDestruction"`
	AverageDuration     float64 `json:"averageDuration"`
	Hitrate             float64 `json:"hitrate"`
	ThreeStarRate       float64 `json:"threeStarRate"`
	TwoStarRate         float64 `json:"twoStarRate"`
	OneStarRate         float64 `json:"oneStarRate"`
	ZeroStarRate        float64 `json:"zeroStarRate"`
	PerfectAttackRate   float64 `json:"perfectAttackRate"`
	SameTownhallHitrate float64 `json:"sameTownhallHitrate"`
	DipHitrate          float64 `json:"dipHitrate"`
	HitUpHitrate        float64 `json:"hitUpHitrate"`
	SameTownhallAttacks int     `json:"sameTownhallAttacks"`
	DipAttacks          int     `json:"dipAttacks"`
	HitUpAttacks        int     `json:"hitUpAttacks"`
}

type PlayerWarStatsResponse struct {
	PlayerTag      string               `json:"playerTag"`
	TimestampStart int64                `json:"timestampStart"`
	TimestampEnd   int64                `json:"timestampEnd"`
	Total          PlayerWarStatsBucket `json:"total"`
	Random         PlayerWarStatsBucket `json:"random"`
	Friendly       PlayerWarStatsBucket `json:"friendly"`
	CWL            PlayerWarStatsBucket `json:"cwl"`
}
