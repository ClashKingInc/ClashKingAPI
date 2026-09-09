/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env,runInDurableObject,runDurableObjectAlarm } from "cloudflare:test"
import { describe,expect,it } from "vitest"
import type { TicketRuntimeCoordinator } from "../../src/ticket-runtime-coordinator.js"
import { TicketRuntimeFixture } from "./ticket-runtime-fixture.js"

const namespace=(env as unknown as { TICKET_RUNTIME:DurableObjectNamespace<TicketRuntimeCoordinator> }).TICKET_RUNTIME
const fixtures = (env as unknown as { TICKET_RUNTIME_FIXTURE: DurableObjectNamespace<TicketRuntimeFixture> }).TICKET_RUNTIME_FIXTURE

describe("ticket runtime durable queue",()=>{
  it.each(["waiting", "failure"])("rotates %s jobs so a full batch cannot starve later work",async(mode)=>{
    const stub=fixtures.getByName(crypto.randomUUID())
    await runInDurableObject(stub,async(instance,state)=>{
      if (!(instance instanceof TicketRuntimeFixture)) throw new Error("Expected fixture coordinator")
      await state.storage.put("executor_mode",mode)
      for(let index=0;index<30;index++)await instance.wake(`72000000-0000-4000-8000-${String(index).padStart(12,"0")}`)
      // Force identical enqueue times to cover deterministic tie handling.
      state.storage.sql.exec("UPDATE operation_queue SET queued_at=1")
      await state.storage.setAlarm(Date.now()+60_000)
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async(_instance,state)=>{
      expect(state.storage.sql.exec("SELECT id FROM attempted_jobs").toArray()).toHaveLength(25)
      expect(state.storage.sql.exec("SELECT operation_id FROM operation_queue").toArray()).toHaveLength(30)
      expect(await state.storage.getAlarm()).not.toBeNull()
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async(_instance,state)=>{
      expect(state.storage.sql.exec("SELECT id FROM attempted_jobs").toArray()).toHaveLength(30)
      await state.storage.put("executor_mode","terminal")
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async(_instance,state)=>{
      expect(state.storage.sql.exec("SELECT operation_id FROM operation_queue").toArray()).toHaveLength(0)
      expect(await state.storage.getAlarm()).toBeNull()
    })
  })
  it("persists and deduplicates operation and publication wakes behind an alarm",async()=>{
    const stub=namespace.getByName(crypto.randomUUID())
    await runInDurableObject(stub,async(instance,state)=>{
      const coordinator=instance as TicketRuntimeCoordinator
      const operationId="72000000-0000-4000-8000-000000000001",publicationId="a".repeat(64)
      await coordinator.wake(operationId)
      const firstAlarm=await state.storage.getAlarm()
      await coordinator.wake(operationId)
      await coordinator.wake(publicationId)
      await coordinator.wake(publicationId.toUpperCase())
      const rows=state.storage.sql.exec<{ operation_id:string }>("SELECT operation_id FROM operation_queue ORDER BY operation_id").toArray()
      expect(rows.map((row)=>row.operation_id)).toEqual([operationId,publicationId])
      expect(await state.storage.getAlarm()).toBe(firstAlarm)
      await expect(coordinator.wake("not-a-runtime-job")).rejects.toThrow("Invalid ticket runtime job ID")
      await state.storage.deleteAlarm()
    })
  })

  it("moves a later existing alarm earlier without postponing an earlier alarm",async()=>{
    const stub=namespace.getByName(crypto.randomUUID())
    await runInDurableObject(stub,async(instance,state)=>{
      const coordinator=instance as TicketRuntimeCoordinator
      const later=Date.now()+60_000
      await state.storage.setAlarm(later)
      await coordinator.wake("73000000-0000-4000-8000-000000000001")
      const advanced=await state.storage.getAlarm()
      expect(advanced).not.toBeNull()
      expect(advanced!).toBeLessThan(later)
      await coordinator.wake("73000000-0000-4000-8000-000000000002")
      expect(await state.storage.getAlarm()).toBe(advanced)
      await state.storage.deleteAlarm()
    })
  })
})
