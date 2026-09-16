/** Existing Ranked tournament reader contract: Unix-second start, seven days,
 * inclusive start/exclusive end. Arguments are trusted SQL expressions only. */
export const rankedPeriodPredicate = (battleTime: string, seasonId: string) =>
  `${battleTime} >= to_timestamp(${seasonId}) AND ${battleTime} < to_timestamp(${seasonId})+interval '7 days'`
