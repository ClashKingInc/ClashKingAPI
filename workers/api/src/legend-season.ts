/** Shared calendar with clashy.go GetSeasonByID and Tracking officialLegendSeasonWindow. */
const period = 28 * 86_400_000
const anchor = Date.parse("2025-10-06T05:00:00Z")

export function legendSeasonWindow(now: Date, officialSeason: string) {
  const boundary = legendSeasonFinish(officialSeason)
  if (!officialSeason.startsWith("v2-") || !Number.isFinite(boundary)) throw new Error("Official Legend season boundary is required")
  const start = boundary + Math.floor((now.valueOf() - boundary) / period) * period
  return { start: new Date(start), end: new Date(start + period) }
}

export function legendSeasonFinish(season: string): number {
  if (/^v2-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(season)) return Date.parse(season.slice(3))
  if (/^\d{4}-\d{2}-\d{2}$/u.test(season)) return Date.parse(`${season}T05:00:00Z`)
  if (!/^\d{4}-\d{2}$/u.test(season)) return Number.NaN
  const [year = 0, month = 0] = season.split("-").map(Number)
  if (month < 1 || month > 12) return Number.NaN
  if (season === "2025-09") return anchor
  const offset = year * 12 + month - (2025 * 12 + 10)
  if (offset >= 0) return anchor + (offset + 1) * period
  const end = new Date(Date.UTC(year, month, 0, 5))
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7)
  return end.valueOf()
}


/** Date-only legacy identifiers have no proven boundary semantics. Preserve
 * them as labels instead of pretending their date is a 05:00 season finish. */
export function legendHistoryWindow(season: string): { start: Date; end: Date } | null {
  if (!/^v2-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(season) && !/^\d{4}-(0[1-9]|1[0-2])$/u.test(season)) return null
  const finish = legendSeasonFinish(season)
  if (!Number.isFinite(finish)) return null
  if (season.startsWith("v2-")) {
    if (new Date(finish).toISOString().replace(".000Z", "Z") !== season.slice(3)) return null
    return { start: new Date(finish - period), end: new Date(finish) }
  }
  if (season === "2025-09") return { start: new Date("2025-08-25T05:00:00Z"), end: new Date(finish) }
  const [year = 0, month = 0] = season.split("-").map(Number)
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7)
  return { start: new Date(legendSeasonFinish(previous)), end: new Date(finish) }
}
