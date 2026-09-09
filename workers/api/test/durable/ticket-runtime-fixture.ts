import { TicketRuntimeCoordinator } from "../../src/ticket-runtime-coordinator.js"

/** Test-only executor: production queue, alarm and SQLite behavior are inherited. */
export class TicketRuntimeFixture extends TicketRuntimeCoordinator {
  protected override async executeJob(operationId: string): Promise<boolean> {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS attempted_jobs (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL)")
    this.ctx.storage.sql.exec(`INSERT INTO attempted_jobs(id,attempts) VALUES(?,1)
      ON CONFLICT(id) DO UPDATE SET attempts=attempted_jobs.attempts+1`,operationId)
    const mode = await this.ctx.storage.get<string>("executor_mode")
    if (mode === "failure") throw new Error("Fixture executor unavailable")
    return mode === "terminal"
  }
}
