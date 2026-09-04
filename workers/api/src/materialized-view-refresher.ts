import { DurableObject } from "cloudflare:workers"
import { Effect } from "effect"

import { databaseLayer, refreshMaterializedViews } from "./database.js"
import type { WorkerBindings } from "./environment.js"

const leaseDurationMs = 15 * 60 * 1_000

interface LeaseRow {
  readonly [key: string]: SqlStorageValue
  readonly lease_until: number
}

export class MaterializedViewRefresher extends DurableObject<WorkerBindings> {
  private running = false

  constructor(ctx: DurableObjectState, env: WorkerBindings) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS refresh_lease (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          lease_until INTEGER NOT NULL,
          last_completed_at INTEGER,
          last_result TEXT
        )
      `)
    })
  }

  async refresh(): Promise<"already_running" | "refreshed"> {
    if (this.running) return "already_running"
    const now = Date.now()
    const lease = this.ctx.storage.sql.exec<LeaseRow>(
      "SELECT lease_until FROM refresh_lease WHERE singleton = 1",
    ).toArray()[0]
    if (lease !== undefined && lease.lease_until > now) return "already_running"

    this.ctx.storage.sql.exec(
      `INSERT INTO refresh_lease (singleton, lease_until, last_result)
       VALUES (1, ?, 'running')
       ON CONFLICT(singleton) DO UPDATE SET lease_until = excluded.lease_until,
         last_result = excluded.last_result`,
      now + leaseDurationMs,
    )
    this.running = true

    try {
      const result = await Effect.runPromise(
        refreshMaterializedViews.pipe(
          Effect.provide(databaseLayer(this.env)),
          Effect.scoped,
        ),
      )
      this.ctx.storage.sql.exec(
        "UPDATE refresh_lease SET lease_until = 0, last_completed_at = ?, last_result = ? WHERE singleton = 1",
        Date.now(),
        result,
      )
      return result
    } catch (cause) {
      this.ctx.storage.sql.exec(
        "UPDATE refresh_lease SET lease_until = 0, last_completed_at = ?, last_result = 'failed' WHERE singleton = 1",
        Date.now(),
      )
      throw cause
    } finally {
      this.running = false
    }
  }
}
