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
