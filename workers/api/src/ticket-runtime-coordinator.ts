import { DurableObject } from "cloudflare:workers"
import { Effect, Layer } from "effect"
import { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"
import { WorkerEnvironment } from "./environment.js"
import { runTicketOperation } from "./ticket-effects.js"
import { runTicketPanelPublication } from "./ticket-panel-publications.js"

interface QueueRow { readonly [key:string]: SqlStorageValue; readonly operation_id:string }

export class TicketRuntimeCoordinator extends DurableObject<WorkerBindings> {
  private running = false

  constructor(ctx: DurableObjectState,env: WorkerBindings) {
    super(ctx,env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS operation_queue (
        operation_id TEXT PRIMARY KEY,
        queued_at INTEGER NOT NULL
      )`)
    })
  }

  async wake(operationId: string): Promise<void> {
    if (!/^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.test(operationId)) {
      throw new TypeError("Invalid ticket runtime job ID")
    }
    operationId = operationId.toLowerCase()
    this.ctx.storage.sql.exec(`INSERT INTO operation_queue(operation_id,queued_at) VALUES(?,?)
      ON CONFLICT(operation_id) DO UPDATE SET queued_at=MIN(operation_queue.queued_at,excluded.queued_at)`,operationId,Date.now())
    await this.ensureAlarm(1)
  }

  override async alarm(): Promise<void> {
    await this.drain()
  }

  private async ensureAlarm(delayMs: number): Promise<void> {
    const desired = Date.now()+delayMs
    const current = await this.ctx.storage.getAlarm()
    if (current === null || desired < current) await this.ctx.storage.setAlarm(desired)
  }

  /** Separates the external executor from the durable queue so alarm tests can
   * exercise real storage without pretending to run PostgreSQL in Workerd. */
  protected async executeJob(operationId: string): Promise<boolean> {
    const { databaseLayer } = await import("./database.js")
    const environment = WorkerEnvironment.layer(this.env)
    const discord = DiscordApi.layer.pipe(Layer.provideMerge(environment))
    const layer = Layer.mergeAll(databaseLayer(this.env),discord)
    if (/^[0-9a-f]{64}$/u.test(operationId)) {
      const outcome = await Effect.runPromise(runTicketPanelPublication(operationId).pipe(Effect.provide(layer),Effect.scoped))
      return outcome.state === "succeeded" || outcome.state === "failed"
    }
    const outcome = await Effect.runPromise(runTicketOperation(operationId).pipe(Effect.provide(layer),Effect.scoped))
    return outcome === "completed" || outcome === "failed" || outcome === "missing"
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const rows = this.ctx.storage.sql.exec<QueueRow>("SELECT operation_id FROM operation_queue ORDER BY queued_at,operation_id LIMIT 25").toArray()
      for (const row of rows) {
        try {
          const terminal = await this.executeJob(row.operation_id)
          if (terminal) {
            this.ctx.storage.sql.exec("DELETE FROM operation_queue WHERE operation_id=?",row.operation_id)
          }
        } catch (failure) {
          console.error(JSON.stringify({ event:"ticket_runtime_operation_failed",operation_id:row.operation_id,
            failure:failure instanceof Error ? failure.message : String(failure) }))
        } finally {
          // A waiting, uncertain or failed attempt must not monopolize the
          // oldest batch forever. Strictly advance behind every queued job,
          // including ties created within the same millisecond.
          this.ctx.storage.sql.exec(`UPDATE operation_queue SET queued_at=MAX(?,
            (SELECT COALESCE(MAX(queued_at),0)+1 FROM operation_queue)) WHERE operation_id=?`,Date.now(),row.operation_id)
        }
      }
      const remaining = this.ctx.storage.sql.exec("SELECT operation_id FROM operation_queue LIMIT 1").toArray().length > 0
      if (remaining) await this.ensureAlarm(30_000)
    } finally {
      this.running = false
    }
  }
}
