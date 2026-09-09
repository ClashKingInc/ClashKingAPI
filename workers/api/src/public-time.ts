import { Effect } from "effect"
import { InvalidRequest } from "./errors.js"

export const parseHistoryTime = (raw: string | null, fallback: Date): Effect.Effect<Date, InvalidRequest> => {
  if (!raw?.trim()) return Effect.succeed(fallback)
  const text = raw.trim(), date = new Date(text)
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(text) || !Number.isFinite(date.getTime())) {
    return Effect.fail(new InvalidRequest({ message: "Time must be an ISO-8601 date or timestamp" }))
  }
  // JavaScript rolls impossible dates into the next month; reject those inputs.
  const [year, month, day] = text.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== text.slice(0, 10)) {
    return Effect.fail(new InvalidRequest({ message: "Invalid calendar date" }))
  }
  return Effect.succeed(date)
}
