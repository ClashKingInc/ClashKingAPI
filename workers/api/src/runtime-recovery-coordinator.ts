import { DurableObject } from "cloudflare:workers"
import { Effect } from "effect"
import type { WorkerBindings } from "./environment.js"
import { pendingRuntimePage, type RecoveryCursor, type RecoveryJob, type RecoveryKind, type RecoveryPage } from "./runtime-recovery.js"

interface ScanRow { readonly [key: string]: SqlStorageValue; readonly kind: RecoveryKind; readonly cursor: string | null }
interface WakeRow { readonly [key: string]: SqlStorageValue; readonly id: string; readonly queue: string }

/** Enumerates missing wakes only; per-ticket coordinators own external delivery. */
export class RuntimeRecoveryCoordinator extends DurableObject<WorkerBindings> {
  private running = false

  constructor(ctx: DurableObjectState, env: WorkerBindings) {
    super(ctx,env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS recovery_scans (
        kind TEXT PRIMARY KEY, cursor TEXT, active INTEGER NOT NULL, turn INTEGER NOT NULL
      )`)
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS recovery_wakes (
        id TEXT NOT NULL, queue TEXT NOT NULL, turn INTEGER NOT NULL, PRIMARY KEY(queue,id)
      )`)
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS recovery_wakes_turn ON recovery_wakes(turn,queue,id)")
      for (const kind of ["ticket", "panel"]) ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO recovery_scans(kind,cursor,active,turn) VALUES(?,NULL,0,0)", kind)
    })
  }

  async wake(): Promise<void> {
    // A periodic wake repairs lost alarms without restarting an in-flight scan.
    if (!this.hasScan()) this.ctx.storage.sql.exec("UPDATE recovery_scans SET cursor=NULL,active=1,turn=0")
    await this.ensureAlarm(1_000)
  }

  protected get ioTimeoutMs(): number { return 10_000 }
  protected get alarmBudgetMs(): number { return 30_000 }

  protected async readPage(kind: RecoveryKind, cursor?: RecoveryCursor, signal?: AbortSignal): Promise<RecoveryPage> {
    const { databaseLayer } = await import("./database.js")
    return Effect.runPromise(pendingRuntimePage(kind,cursor).pipe(Effect.provide(databaseLayer(this.env)),Effect.scoped),{signal})
  }

  protected async wakeJob(job: RecoveryJob): Promise<void> {
    await this.env.TICKET_RUNTIME.getByName(job.queue).wake(job.id)
  }

  private async boundedIo<A>(deadline: number, run: (signal: AbortSignal) => Promise<A>): Promise<A> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve,reject) => {
      timer = setTimeout(() => {
        reject(new Error("Recovery I/O deadline exceeded"))
        controller.abort()
      },Math.min(this.ioTimeoutMs,Math.max(1,deadline-Date.now())))
    })
    try {
      // Promise.race observes late rejection too. SQL honors the abort signal;
      // RPC has no cancellation parameter, so timeout never means rollback.
      // Its durable wake remains retryable and target insertion is idempotent.
      return await Promise.race([run(controller.signal),timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  private hasScan(): boolean {
    return this.ctx.storage.sql.exec("SELECT kind FROM recovery_scans WHERE active=1 LIMIT 1").toArray().length > 0
  }

  private hasBacklog(): boolean {
    return this.ctx.storage.sql.exec("SELECT id FROM recovery_wakes LIMIT 1").toArray().length > 0
  }

  private async ensureAlarm(delay: number): Promise<void> {
    const desired = Date.now()+delay, current = await this.ctx.storage.getAlarm()
    if (current === null || current > desired) await this.ctx.storage.setAlarm(desired)
  }

  override async alarm(): Promise<void> {
    if (this.running) return
    const row = this.ctx.storage.sql.exec<ScanRow>(
      "SELECT kind,cursor FROM recovery_scans WHERE active=1 ORDER BY turn,kind LIMIT 1").toArray()[0]
    if (!row && !this.hasBacklog()) return
    this.running = true
    const deadline = Date.now()+this.alarmBudgetMs
    let retry = false
    try {
      // Persist a fallback before external I/O. Eviction/crashes retain the cursor
      // and this alarm; the cron also rearms it without discarding progress.
      await this.ensureAlarm(30_000)
      if (row) {
        try {
          const page = await this.boundedIo(deadline,signal=>this.readPage(row.kind,
            row.cursor === null ? undefined : JSON.parse(row.cursor) as RecoveryCursor,signal))
          // Advance only once every inventoried wake is durable. The backlog
          // separates poison destinations from pagination without dropping work.
          this.ctx.storage.transactionSync(() => {
            for (const job of page.jobs) this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO recovery_wakes(id,queue,turn)
              VALUES(?,?,(SELECT COALESCE(MAX(turn),0)+1 FROM recovery_wakes))`,job.id,job.queue)
            this.ctx.storage.sql.exec("UPDATE recovery_scans SET cursor=?,active=? WHERE kind=?",
              page.nextCursor ? JSON.stringify(page.nextCursor) : null,page.nextCursor ? 1 : 0,row.kind)
          })
        } catch {
          retry = true
          console.error(JSON.stringify({ event: "runtime_recovery_inventory_retry", kind: row.kind }))
        } finally {
          this.ctx.storage.sql.exec("UPDATE recovery_scans SET turn=(SELECT MAX(turn)+1 FROM recovery_scans) WHERE kind=?",row.kind)
        }
      }
      const jobs = this.ctx.storage.sql.exec<WakeRow>("SELECT id,queue FROM recovery_wakes ORDER BY turn,queue,id LIMIT 100").toArray()
      for (let start=0;start<jobs.length;start+=10) {
        if (Date.now() >= deadline) { retry = true; break }
        const batch = jobs.slice(start,start+10)
        const results = await Promise.allSettled(batch.map(job=>this.boundedIo(deadline,()=>this.wakeJob(job))))
        for (const [index,result] of results.entries()) {
          const job = batch[index]!
          if (result.status === "fulfilled") this.ctx.storage.sql.exec("DELETE FROM recovery_wakes WHERE queue=? AND id=?",job.queue,job.id)
          else {
            retry = true
            this.ctx.storage.sql.exec("UPDATE recovery_wakes SET turn=(SELECT MAX(turn)+1 FROM recovery_wakes) WHERE queue=? AND id=?",job.queue,job.id)
          }
        }
      }
    } catch {
      retry = true
      // Fixed diagnostic, never provider bodies/credentials. The cursor/backlog
      // survives errors; retrying is independent of the platform retry cap.
      console.error(JSON.stringify({ event: "runtime_recovery_retry" }))
    } finally {
      this.running = false
    }
    // Retain the fallback on an exhausted scan. Its one final no-op alarm avoids
    // deleting an alarm concurrently installed by a new cron wake.
    if (this.hasScan() || this.hasBacklog()) {
      // A long call may consume the initial crash fallback. Retry delay starts
      // after this attempt, rather than immediately firing an overdue alarm.
      if (retry) await this.ctx.storage.setAlarm(Date.now()+30_000)
      else await this.ensureAlarm(1_000)
    }
  }
}
