import { RuntimeRecoveryCoordinator } from "../../src/runtime-recovery-coordinator.js"
import type { RecoveryCursor, RecoveryJob, RecoveryKind, RecoveryPage } from "../../src/runtime-recovery.js"

/** Only external inventory/RPC are fake; queue progress and alarms are real. */
export class RuntimeRecoveryFixture extends RuntimeRecoveryCoordinator {
  protected override get ioTimeoutMs(): number { return 50 }
  private budget = 30_000
  protected override get alarmBudgetMs(): number { return this.budget }
  setBudget(milliseconds: number): void { this.budget=milliseconds }
  private releaseHeld: (() => void) | undefined
  releaseIo(): void { this.releaseHeld?.(); this.releaseHeld=undefined }
  private hold(): Promise<void> { return new Promise(resolve=>{ this.releaseHeld=resolve }) }
  protected override async readPage(kind: RecoveryKind, cursor?: RecoveryCursor, signal?: AbortSignal): Promise<RecoveryPage> {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS reads (kind TEXT, after_id TEXT)")
    this.ctx.storage.sql.exec("INSERT INTO reads(kind,after_id) VALUES(?,?)",kind,cursor?.id ?? null)
    if (await this.ctx.storage.get<string>("hold_read") === kind) {
      signal?.addEventListener("abort",()=>{ this.ctx.storage.sql.exec("INSERT INTO reads(kind,after_id) VALUES('aborted',NULL)") },{once:true})
      await this.hold()
    }
    if (await this.ctx.storage.get<string>("fail_read") === kind) throw new Error("Inventory unavailable")
    const offset = cursor ? Number(cursor.id) : 0
    const total = await this.ctx.storage.get<number>(`${kind}_total`) ?? 0
    const count = Math.min(100,total-offset)
    const jobs = Array.from({length:count},(_,index) => ({ id: `${kind}-${offset+index}`, queue: kind }))
    return { jobs, ...(offset+count<total ? { nextCursor: {
      id: String(offset+count), updatedAt: "2000-01-01 00:00:00.000001+00", through: cursor?.through ?? "2026-01-01 00:00:00+00",
    } } : {}) }
  }
  protected override async wakeJob(job: RecoveryJob): Promise<void> {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS wakes (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL)")
    this.ctx.storage.sql.exec("INSERT INTO wakes(id,attempts) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1",job.id)
    if (await this.ctx.storage.get<string>("hold_wake") === job.id) await this.hold()
    const delay=await this.ctx.storage.get<number>("wake_delay")
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay))
    if (await this.ctx.storage.get<string>("fail_wake") === job.id) throw new Error("Queue unavailable")
  }
}
