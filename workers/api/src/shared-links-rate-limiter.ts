import { DurableObject } from "cloudflare:workers"

export interface SharedLinksLimitResult {
  readonly allowed: boolean
  readonly retryAfterSeconds: number
}

interface CounterRow {
  readonly [key: string]: SqlStorageValue
  readonly used: number
  readonly window_start: number
}

/** One SQLite-backed instance per authenticated developer application. */
export class SharedLinksRateLimiter extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rate_window (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        window_start INTEGER NOT NULL,
        used INTEGER NOT NULL CHECK (used BETWEEN 1 AND 121)
      )`)
    })
  }

  consume(): SharedLinksLimitResult {
    const now = Date.now()
    const windowStart = Math.floor(now / 60_000) * 60_000
    const row = this.ctx.storage.sql.exec<CounterRow>(`
      INSERT INTO rate_window (singleton, window_start, used) VALUES (1, ?, 1)
      ON CONFLICT(singleton) DO UPDATE SET
        used = CASE WHEN excluded.window_start > rate_window.window_start THEN 1
          ELSE min(rate_window.used + 1, 121) END,
        window_start = max(rate_window.window_start, excluded.window_start)
      RETURNING used, window_start
    `, windowStart).one()
    return {
      allowed: row.used <= 120,
      retryAfterSeconds: row.used <= 120 ? 0 : Math.max(1, Math.ceil((row.window_start + 60_000 - now) / 1_000)),
    }
  }
}
