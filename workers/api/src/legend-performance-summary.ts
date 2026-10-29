export const millisecondsPerDay = 86_400_000
export const date = (value: Date | string) => new Date(value).toISOString().slice(0, 10)
export const number = (value: number | string) => Number(value)
export type PeriodKind = "selected" | "previous_30" | "previous_90"
export interface Period { kind: PeriodKind; firstDay: string; lastDay: string; expectedDays: number }
export interface Row {
  day: Date | string
  direction: number
  source_window_start: Date | string
  source_window_end: Date | string
  eligible_player_count: number
  observed_player_count: number
  complete_player_count: number
  invalid_player_count: number
  observed_battle_count: number | string
  observed_triple_count: number | string
  perfect_player_count: number
  complete_trophy_sum: number | string
  trophy_buckets: number[]
}
export const summarize = (rows: readonly Row[]) => {
  const sum = (key: keyof Omit<Row, "day" | "source_window_start" | "source_window_end" | "trophy_buckets">) => rows.reduce((total, row) => total + number(row[key]), 0)
  const eligible = sum("eligible_player_count"), observed = sum("observed_player_count")
  const complete = sum("complete_player_count"), invalid = sum("invalid_player_count")
  const battles = sum("observed_battle_count"), triples = sum("observed_triple_count"), perfect = sum("perfect_player_count")
  return {
    eligiblePlayerDays: eligible, observedPlayerDays: observed, completePlayerDays: complete,
    partialPlayerDays: observed - complete - invalid, missingPlayerDays: eligible - observed,
    invalidPlayerDays: invalid, observedBattles: battles, observedTriples: triples, perfectPlayerDays: perfect,
    tripleRate: battles === 0 ? null : triples / battles,
    perfectDayRate: complete === 0 ? null : perfect / complete,
    meanTrophies: complete === 0 ? null : sum("complete_trophy_sum") / complete,
    buckets: Array.from({ length: 16 }, (_, index) => {
      const playerDays = rows.reduce((total, row) => total + number(row.trophy_buckets[index] ?? 0), 0)
      return { minimum: index * 20, maximum: index === 15 ? 320 : index * 20 + 19,
        playerDays, share: complete === 0 ? null : playerDays / complete }
    }),
  }
}

