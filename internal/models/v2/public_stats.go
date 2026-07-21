package modelsv2

import "time"

// PlayerBattlelogStatsRequest is the request body for bulk player legend battlelog stats.
type PlayerBattlelogStatsRequest struct {
	PlayerTags []string `json:"player_tags"`
}

type ClanChangesResponse struct {
	Name      string             `json:"name"`
	Tag       string             `json:"tag"`
	BadgeURLs PublicBadgeURLs    `json:"badgeUrls"`
	Count     int                `json:"count"`
	Items     []ClanChangeRecord `json:"items"`
}

type ClanChangeRecord struct {
	Time     time.Time       `json:"time"`
	Type     string          `json:"type"`
	Previous ClanChangeValue `json:"previous"`
	Current  ClanChangeValue `json:"current"`
}

type ClanChangeValue struct {
	Kind    string  `json:"kind" enums:"text,integer"`
	Text    *string `json:"text,omitempty"`
	Integer *int    `json:"integer,omitempty"`
}

type BattlelogItemFilters struct {
	TownHallLevel *int `json:"townHallLevel,omitempty"`
	LeagueID      *int `json:"leagueId,omitempty"`
	Top200        bool `json:"top200,omitempty"`
}

type BattlelogItemUsagePoint struct {
	Date      string  `json:"date"`
	Used      int     `json:"used"`
	Total     int     `json:"total"`
	UsageRate float64 `json:"usageRate"`
}

type BattlelogItemUsageResponse struct {
	Item      string                    `json:"item"`
	Metric    string                    `json:"metric"`
	Dimension string                    `json:"dimension"`
	Filters   BattlelogItemFilters      `json:"filters"`
	Items     []BattlelogItemUsagePoint `json:"items"`
}

type BattlelogItemHitratePoint struct {
	Date       string  `json:"date"`
	ThreeStars int     `json:"threeStars"`
	Total      int     `json:"total"`
	HitRate    float64 `json:"hitRate"`
}

type BattlelogItemHitrateResponse struct {
	Item      string                      `json:"item"`
	Metric    string                      `json:"metric"`
	Dimension string                      `json:"dimension"`
	Filters   BattlelogItemFilters        `json:"filters"`
	Items     []BattlelogItemHitratePoint `json:"items"`
}

type PlayerRankingsResponse struct {
	Tag               string  `json:"tag"`
	CountryCode       *string `json:"country_code"`
	CountryName       *string `json:"country_name"`
	Rank              *int    `json:"rank,omitempty"`
	LocalRank         *int    `json:"local_rank"`
	GlobalRank        *int    `json:"global_rank"`
	BuilderGlobalRank *int    `json:"builder_global_rank"`
	BuilderLocalRank  *int    `json:"builder_local_rank"`
}

type PublicStatsTimeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type BattlelogEntry struct {
	BattleID           string         `json:"battle_id"`
	PlayerTag          string         `json:"player_tag"`
	PlayerName         string         `json:"player_name"`
	PlayerTownhall     int            `json:"player_townhall"`
	OpponentTag        string         `json:"opponent_tag"`
	OpponentName       string         `json:"opponent_name"`
	OpponentTownhall   int            `json:"opponent_townhall"`
	BattleType         string         `json:"battle_type"`
	Attack             bool           `json:"attack"`
	Stars              int            `json:"stars"`
	DestructionPercent int            `json:"destruction_percentage"`
	Gold               int            `json:"gold"`
	Elixir             int            `json:"elixir"`
	DarkElixir         int            `json:"dark_elixir"`
	Timestamp          time.Time      `json:"timestamp"`
	ArmyItems          []string       `json:"army_items"`
	ArmyCounts         map[string]int `json:"army_counts"`
	Duration           int            `json:"duration"`
	ArmyShareCode      string         `json:"army_share_code"`
}

type PlayerBattlelogHistoryResponse struct {
	PlayerTag string               `json:"player_tag"`
	Items     []BattlelogEntry     `json:"items"`
	Count     int                  `json:"count"`
	Limit     int                  `json:"limit"`
	Time      PublicStatsTimeRange `json:"time"`
}

type LegendBattle struct {
	ID                    string `json:"id,omitempty"`
	Tag                   string `json:"tag,omitempty"`
	Name                  string `json:"name,omitempty"`
	Stars                 int    `json:"stars"`
	DestructionPercentage int    `json:"destructionPercentage"`
	TrophyChange          int    `json:"trophyChange"`
	Trophies              int    `json:"trophies,omitempty"`
	Timestamp             string `json:"timestamp,omitempty"`
}

type LegendDay struct {
	Attacks          []LegendBattle `json:"attacks"`
	Defenses         []LegendBattle `json:"defenses"`
	NumAttacks       int            `json:"num_attacks,omitempty"`
	NumDefenses      int            `json:"num_defenses,omitempty"`
	AttackSum        int            `json:"attack_sum,omitempty"`
	DefenseSum       int            `json:"defense_sum,omitempty"`
	NetGain          int            `json:"net_gain,omitempty"`
	NewBest          bool           `json:"new_best,omitempty"`
	Trophies         int            `json:"trophies,omitempty"`
	PreviousTrophies int            `json:"previous_trophies,omitempty"`
}

type PlayerLegendsDayResponse struct {
	Tag      string         `json:"tag"`
	Day      string         `json:"day"`
	Attacks  []LegendBattle `json:"attacks"`
	Defenses []LegendBattle `json:"defenses"`
	Data     LegendDay      `json:"data"`
}

type LegendSeasonStats struct {
	AttackCount        int     `json:"attack_count"`
	DefenseCount       int     `json:"defense_count"`
	AttackTrophies     int     `json:"attack_trophies"`
	DefenseTrophies    int     `json:"defense_trophies"`
	NetTrophies        int     `json:"net_trophies"`
	ThreeStars         int     `json:"three_stars"`
	TwoStars           int     `json:"two_stars"`
	OneStars           int     `json:"one_stars"`
	ZeroStars          int     `json:"zero_stars"`
	DefenseWins        int     `json:"defense_wins"`
	DefenseLosses      int     `json:"defense_losses"`
	AverageStars       float64 `json:"average_stars"`
	AverageDestruction float64 `json:"average_destruction"`
}

type PlayerLegendSeasonResponse struct {
	Tag    string               `json:"tag"`
	Season string               `json:"season"`
	Found  *bool                `json:"found,omitempty"`
	Days   map[string]LegendDay `json:"days,omitempty"`
	Stats  *LegendSeasonStats   `json:"stats,omitempty"`
	Streak int                  `json:"streak,omitempty"`
}

type PlayersLegendSeasonResponse struct {
	Season string                       `json:"season"`
	Items  []PlayerLegendSeasonResponse `json:"items"`
	Count  int                          `json:"count"`
}

type RankedMember struct {
	Tag              string  `json:"tag"`
	Name             string  `json:"name"`
	ClanTag          *string `json:"clan_tag,omitempty"`
	ClanName         *string `json:"clan_name,omitempty"`
	Placement        int     `json:"placement"`
	LeagueTrophies   int     `json:"league_trophies"`
	AttackWinCount   int     `json:"attack_win_count"`
	AttackLoseCount  int     `json:"attack_lose_count"`
	DefenseWinCount  int     `json:"defense_win_count"`
	DefenseLoseCount int     `json:"defense_lose_count"`
	GroupTag         string  `json:"group_tag,omitempty"`
	LeagueTierID     int     `json:"league_tier_id,omitempty"`
}

type PlayerRankedBattlelogResponse struct {
	Tag        string           `json:"tag"`
	Season     int64            `json:"season"`
	Member     *RankedMember    `json:"member"`
	Battlelogs []BattlelogEntry `json:"battlelogs"`
}

type PlayerRankedGroupResponse struct {
	Tag          string         `json:"tag,omitempty"`
	Season       int64          `json:"season"`
	GroupTag     string         `json:"group_tag,omitempty"`
	LeagueTierID int            `json:"league_tier_id,omitempty"`
	Group        *RankedMember  `json:"group,omitempty"`
	Player       *RankedMember  `json:"player,omitempty"`
	Members      []RankedMember `json:"members"`
	Count        int            `json:"count,omitempty"`
}

type PlayerChangeValue struct {
	Name  string `json:"name,omitempty"`
	Level int    `json:"level,omitempty"`
	Value string `json:"value,omitempty"`
	Tag   string `json:"tag,omitempty"`
}

type PlayerChangeRecord struct {
	Time          time.Time         `json:"time"`
	PlayerTag     string            `json:"player_tag"`
	ClanTag       string            `json:"clan_tag"`
	TownhallLevel int               `json:"townhall_level"`
	Type          string            `json:"type"`
	Previous      PlayerChangeValue `json:"previous"`
	Current       PlayerChangeValue `json:"current"`
}

type PlayerChangesResponse struct {
	Tag   string               `json:"tag"`
	Items []PlayerChangeRecord `json:"items"`
	Count int                  `json:"count"`
}

type PlayerLeaderboardItem struct {
	Rank          int                `json:"rank"`
	Tag           string             `json:"tag"`
	Name          string             `json:"name"`
	LeagueID      *int               `json:"league_id,omitempty"`
	League        *LeaderboardLeague `json:"league,omitempty"`
	ClanTag       *string            `json:"clan_tag,omitempty"`
	Clan          *LeaderboardClan   `json:"clan,omitempty"`
	TownhallLevel int                `json:"townhall_level"`
	Trophies      int                `json:"trophies"`
	CountryCode   string             `json:"country_code,omitempty"`
	CountryName   string             `json:"country_name,omitempty"`
}

type LeaderboardLeague struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Badge string `json:"badge"`
}

type LeaderboardClan struct {
	Tag   string  `json:"tag"`
	Name  *string `json:"name,omitempty"`
	Badge string  `json:"badge"`
}

type PlayerLeaderboardResponse struct {
	LeagueTierID *int                    `json:"league_tier_id,omitempty"`
	Townhall     *int                    `json:"townhall_level,omitempty"`
	Items        []PlayerLeaderboardItem `json:"items"`
	Count        int                     `json:"count"`
	GeneratedAt  *time.Time              `json:"generated_at,omitempty"`
}

type PlayerLeaderboardHistoryResponse struct {
	Kind     string                  `json:"kind"`
	Location string                  `json:"location"`
	Date     string                  `json:"date"`
	Items    []PlayerLeaderboardItem `json:"items"`
	Count    int                     `json:"count"`
}

type PublicClanLeaderboardItem struct {
	Tag          string          `json:"tag"`
	Name         string          `json:"name"`
	LocationID   *int            `json:"location_id,omitempty"`
	BadgeURL     string          `json:"badge_url"`
	BadgeURLs    PublicBadgeURLs `json:"badgeUrls"`
	Donations    int             `json:"donations,omitempty"`
	WarWins      int             `json:"war_wins,omitempty"`
	WarWinStreak int             `json:"war_win_streak"`
	Rank         *int64          `json:"rank,omitempty"`
}

type PublicClanLeaderboardResponse struct {
	LocationID *int                        `json:"location_id,omitempty"`
	Kind       string                      `json:"kind,omitempty"`
	Items      []PublicClanLeaderboardItem `json:"items"`
	Count      int                         `json:"count"`
}

type TrophyBucket struct {
	Bucket   int   `json:"bucket"`
	Players  int   `json:"players"`
	Trophies int64 `json:"trophies"`
}

type TrophyBucketHistory struct {
	Date string         `json:"date"`
	Data []TrophyBucket `json:"data"`
}

type TrophyBucketsResponse struct {
	LeagueTierID int                   `json:"league_tier_id"`
	Items        []TrophyBucket        `json:"items"`
	History      []TrophyBucketHistory `json:"history,omitempty"`
	Count        int                   `json:"count"`
}

type GroupedCountItem struct {
	CWLLeagueID      *int  `json:"cwl_league_id,omitempty"`
	LocationID       *int  `json:"location_id,omitempty"`
	TownhallLevel    *int  `json:"townhall_level,omitempty"`
	BuilderhallLevel *int  `json:"builderhall_level,omitempty"`
	CapitalLeagueID  *int  `json:"capital_league_id,omitempty"`
	LeagueTierID     *int  `json:"league_tier_id,omitempty"`
	Count            int64 `json:"count"`
}

type GroupedCountsResponse struct {
	Items []GroupedCountItem `json:"items"`
	Count int                `json:"count"`
}

type BattlelogArmyItem struct {
	ArmyShareCode        string         `json:"army_share_code"`
	ArmyItems            []string       `json:"army_items"`
	ArmyCounts           map[string]int `json:"army_counts"`
	UsageCount           int            `json:"usage_count"`
	ThreeStars           int            `json:"three_stars"`
	UsageRate            float64        `json:"usage_rate"`
	ThreeStarRate        float64        `json:"three_star_rate"`
	AverageStars         float64        `json:"average_stars"`
	AverageDestruction   float64        `json:"average_destruction"`
	ContainsMatchPercent float64        `json:"contains_match_percent"`
}

type BattlelogArmyFilters struct {
	TownhallLevel int                  `json:"townhall_level"`
	LeagueID      int                  `json:"league_id"`
	Contains      []string             `json:"contains"`
	Excludes      []string             `json:"excludes"`
	MinUsageCount int                  `json:"min_usage_count"`
	SortBy        string               `json:"sort_by"`
	Time          PublicStatsTimeRange `json:"time"`
}

type BattlelogArmiesResponse struct {
	BattleType string               `json:"battle_type"`
	Filters    BattlelogArmyFilters `json:"filters"`
	Items      []BattlelogArmyItem  `json:"items"`
	Count      int                  `json:"count"`
	Limit      int                  `json:"limit"`
}

type BuilderBaseLeague struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"`
	IconURLs PublicIconURLs `json:"iconUrls"`
}

type PublicBadgeURLs struct {
	Small  string `json:"small,omitempty"`
	Medium string `json:"medium,omitempty"`
	Large  string `json:"large,omitempty"`
}

type PublicIconURLs struct {
	Tiny   string `json:"tiny,omitempty"`
	Small  string `json:"small,omitempty"`
	Medium string `json:"medium,omitempty"`
	Large  string `json:"large,omitempty"`
}

type PublicLeagueReference struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"`
	IconURLs PublicIconURLs `json:"iconUrls"`
}

type BuilderBaseLeaguesResponse struct {
	Items []BuilderBaseLeague `json:"items"`
}

type GlobalCountsResponse struct {
	PlayersInWar     int64 `json:"players_in_war"`
	ClansInWar       int64 `json:"clans_in_war"`
	TotalJoinLeaves  int64 `json:"total_join_leaves"`
	PlayersInLegends int64 `json:"players_in_legends"`
	PlayerCount      int64 `json:"player_count"`
	ClanCount        int64 `json:"clan_count"`
	WarsStored       int64 `json:"wars_stored"`
}

type RankingLocation struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	IsCountry   bool   `json:"isCountry"`
	CountryCode string `json:"countryCode,omitempty"`
}

type RankingClan struct {
	Tag       string          `json:"tag"`
	Name      string          `json:"name"`
	BadgeURLs PublicBadgeURLs `json:"badgeUrls"`
}

type PlayerRankingSnapshotItem struct {
	Tag                 string                 `json:"tag"`
	Name                string                 `json:"name"`
	ExpLevel            int                    `json:"expLevel"`
	Trophies            int                    `json:"trophies"`
	AttackWins          int                    `json:"attackWins"`
	DefenseWins         int                    `json:"defenseWins"`
	Rank                int                    `json:"rank"`
	PreviousRank        int                    `json:"previousRank"`
	Clan                *RankingClan           `json:"clan,omitempty"`
	League              *PublicLeagueReference `json:"league,omitempty"`
	TownHallLevel       int                    `json:"townHallLevel,omitempty"`
	BuilderHallLevel    int                    `json:"builderHallLevel,omitempty"`
	BuilderBaseTrophies int                    `json:"builderBaseTrophies,omitempty"`
}

type ClanRankingSnapshotItem struct {
	Tag               string           `json:"tag"`
	Name              string           `json:"name"`
	ClanLevel         int              `json:"clanLevel"`
	ClanPoints        int              `json:"clanPoints,omitempty"`
	ClanBuilderPoints int              `json:"clanBuilderBasePoints,omitempty"`
	CapitalPoints     int              `json:"clanCapitalPoints,omitempty"`
	Members           int              `json:"members"`
	Rank              int              `json:"rank"`
	PreviousRank      int              `json:"previousRank"`
	Location          *RankingLocation `json:"location,omitempty"`
	BadgeURLs         PublicBadgeURLs  `json:"badgeUrls"`
}

type PlayerRankingSnapshotResponse struct {
	Items  []PlayerRankingSnapshotItem `json:"items"`
	Paging *Paging                     `json:"paging,omitempty"`
}

type ClanRankingSnapshotResponse struct {
	Items  []ClanRankingSnapshotItem `json:"items"`
	Paging *Paging                   `json:"paging,omitempty"`
}

type Paging struct {
	Cursors PagingCursors `json:"cursors"`
}

type PagingCursors struct {
	Before string `json:"before,omitempty"`
	After  string `json:"after,omitempty"`
}
