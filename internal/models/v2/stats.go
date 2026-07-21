package modelsv2

import "time"

// StatsDateFilter bounds a statistics query to at most 90 days.
type StatsDateFilter struct {
	StartDate string `json:"start_date,omitempty" example:"2026-07-01"`
	EndDate   string `json:"end_date,omitempty" example:"2026-07-20"`
}

// StatsDateRange is the normalized, inclusive date range used by a response.
type StatsDateRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// StatsItemQuantityFilter matches a stored army item and optional quantity bounds.
// Army data does not contain levels, so level filters are intentionally absent.
type StatsItemQuantityFilter struct {
	Item        string `json:"item" example:"u_1"`
	MinQuantity *int   `json:"min_quantity,omitempty" minimum:"1"`
	MaxQuantity *int   `json:"max_quantity,omitempty" minimum:"1"`
}

// StatsBattleFilters are shared by battle intelligence requests.
type StatsBattleFilters struct {
	Dates                 StatsDateFilter           `json:"dates"`
	TownhallLevel         *int                      `json:"townhall_level,omitempty" minimum:"1"`
	OpponentTownhallLevel *int                      `json:"opponent_townhall_level,omitempty" minimum:"1"`
	EqualTownhalls        *bool                     `json:"equal_townhalls,omitempty"`
	RankedLeagueTierID    *int                      `json:"ranked_league_tier_id,omitempty" minimum:"1"`
	IncludeItems          []StatsItemQuantityFilter `json:"include_items,omitempty"`
	ExcludeItems          []string                  `json:"exclude_items,omitempty"`
	MinimumSampleSize     *int                      `json:"minimum_sample_size,omitempty" minimum:"1" default:"100"`
}

// StatsArmiesQuery requests ranked army-composition intelligence.
type StatsArmiesQuery struct {
	StatsBattleFilters
	Limit  *int   `json:"limit,omitempty" minimum:"1" maximum:"100" default:"25"`
	SortBy string `json:"sort_by,omitempty" enums:"usage_rate,three_star_rate,average_stars,average_destruction" default:"usage_rate"`
}

// StatsItemSelector identifies an item. Equipment must name its owning hero.
type StatsItemSelector struct {
	Item string  `json:"item" example:"u_1"`
	Type string  `json:"type" enums:"troop,spell,hero,pet,equipment" example:"troop"`
	Hero *string `json:"hero,omitempty" example:"Archer Queen"`
}

// StatsItemsQuery requests ranked use, usage, hit-rate, and composition-share metrics.
type StatsItemsQuery struct {
	StatsBattleFilters
	Items []StatsItemSelector `json:"items"`
}

// StatsRankedQuery requires one town hall and exactly one ranked league tier.
type StatsRankedQuery struct {
	Dates              StatsDateFilter `json:"dates"`
	TownhallLevel      int             `json:"townhall_level" minimum:"1"`
	RankedLeagueTierID int             `json:"ranked_league_tier_id" minimum:"1" example:"1"`
}

// StatsWarQuery requests regular-war performance. Friendly and CWL wars are never included.
type StatsWarQuery struct {
	Dates                 StatsDateFilter `json:"dates"`
	TownhallLevel         *int            `json:"townhall_level,omitempty" minimum:"1"`
	OpponentTownhallLevel *int            `json:"opponent_townhall_level,omitempty" minimum:"1"`
	EqualTownhalls        *bool           `json:"equal_townhalls,omitempty" default:"true"`
}

// StatsCWLQuery requests CWL performance and season aggregation.
type StatsCWLQuery struct {
	Dates                 StatsDateFilter `json:"dates"`
	TownhallLevel         *int            `json:"townhall_level,omitempty" minimum:"1"`
	OpponentTownhallLevel *int            `json:"opponent_townhall_level,omitempty" minimum:"1"`
	EqualTownhalls        *bool           `json:"equal_townhalls,omitempty" default:"true"`
	CWLLeagueID           *int            `json:"cwl_league_id,omitempty"`
	Seasons               []string        `json:"seasons,omitempty" example:"2026-07"`
}

// StatsDailyPoint is one UTC daily KPI bucket.
type StatsDailyPoint struct {
	Date               string   `json:"date"`
	SampleSize         int64    `json:"sample_size"`
	UseCount           *int64   `json:"use_count,omitempty"`
	UsageRate          *float64 `json:"usage_rate,omitempty"`
	AverageStars       float64  `json:"average_stars"`
	AverageDestruction float64  `json:"average_destruction"`
	ZeroStarRate       float64  `json:"zero_star_rate"`
	OneStarRate        float64  `json:"one_star_rate"`
	TwoStarRate        float64  `json:"two_star_rate"`
	ThreeStarRate      float64  `json:"three_star_rate"`
}

// StatsMetrics is a typed aggregate. Zero samples are explicit through Available=false.
type StatsMetrics struct {
	Available          bool              `json:"available"`
	SampleSize         int64             `json:"sample_size"`
	UsageRate          *float64          `json:"usage_rate,omitempty"`
	AverageStars       float64           `json:"average_stars"`
	AverageDestruction float64           `json:"average_destruction"`
	ZeroStarRate       float64           `json:"zero_star_rate"`
	OneStarRate        float64           `json:"one_star_rate"`
	TwoStarRate        float64           `json:"two_star_rate"`
	ThreeStarRate      float64           `json:"three_star_rate"`
	Daily              []StatsDailyPoint `json:"daily"`
}

// StatsArmyItem is one exact army identity and its metrics.
type StatsArmyItem struct {
	ArmyShareCode string         `json:"army_share_code"`
	ArmyItems     []string       `json:"army_items"`
	ArmyCounts    map[string]int `json:"army_counts"`
	StatsMetrics
}

type StatsArmiesResponse struct {
	DateRange StatsDateRange  `json:"date_range"`
	Items     []StatsArmyItem `json:"items"`
	Count     int             `json:"count"`
}

// StatsItemResult is one selected item's battle intelligence.
type StatsItemResult struct {
	Item             string   `json:"item"`
	Type             string   `json:"type"`
	Hero             *string  `json:"hero,omitempty"`
	UseCount         int64    `json:"use_count"`
	HitRate          float64  `json:"hit_rate"`
	CompositionShare *float64 `json:"composition_share,omitempty"`
	StatsMetrics
}

type StatsItemsResponse struct {
	DateRange StatsDateRange    `json:"date_range"`
	Items     []StatsItemResult `json:"items"`
	Count     int               `json:"count"`
}

type StatsBreakdown struct {
	Key     string       `json:"key"`
	Metrics StatsMetrics `json:"metrics"`
}

type StatsPerformanceResponse struct {
	DateRange  StatsDateRange   `json:"date_range"`
	Metrics    StatsMetrics     `json:"metrics"`
	Breakdowns []StatsBreakdown `json:"breakdowns,omitempty"`
}

type StatsOverviewResponse struct {
	DateRange StatsDateRange       `json:"date_range"`
	Counts    GlobalCountsResponse `json:"counts"`
	Ranked    StatsMetrics         `json:"ranked"`
	War       StatsMetrics         `json:"war"`
	CWL       StatsMetrics         `json:"cwl"`
}
