export interface StatsDateFilter {
  readonly start_date?: string
  readonly end_date?: string
}

export interface StatsRankedRequest {
  readonly dates: StatsDateFilter
  readonly townhall_level: number
  readonly ranked_league_tier_id: number
}

export interface StatsWarRequest {
  readonly dates: StatsDateFilter
  readonly townhall_level?: number
  readonly opponent_townhall_level?: number
  readonly equal_townhalls?: boolean
}

export interface StatsCwlRequest extends StatsWarRequest {
  readonly cwl_league_id?: number
  readonly seasons?: ReadonlyArray<string>
}
