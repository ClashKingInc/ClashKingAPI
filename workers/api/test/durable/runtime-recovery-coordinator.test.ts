/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env, runInDurableObject, runDurableObjectAlarm, evictDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { RuntimeRecoveryFixture } from "./runtime-recovery-fixture.js"

const namespace = (env as unknown as { RUNTIME_RECOVERY_FIXTURE: DurableObjectNamespace<RuntimeRecoveryFixture> }).RUNTIME_RECOVERY_FIXTURE
const start = async (panel: number, ticket: number) => {
  const stub = namespace.getByName(crypto.randomUUID())
  await runInDurableObject(stub,async (instance,state) => {
    await state.storage.put({ panel_total: panel, ticket_total: ticket })
    await (instance as RuntimeRecoveryFixture).wake()
    await state.storage.setAlarm(Date.now()+60_000)
  })
  return stub
}

describe("durable runtime recovery", () => {
  it("leaves unattempted wakes durable when slow batches exhaust the alarm budget",async()=>{
    const stub=await start(105,1)
    await runInDurableObject(stub,async(instance,state)=>{
      const coordinator=instance as RuntimeRecoveryFixture
      coordinator.setBudget(75)
      await state.storage.put("wake_delay",30)
      await coordinator.alarm()
      const attempted=state.storage.sql.exec("SELECT id FROM wakes").toArray().length
      expect(attempted).toBeGreaterThan(0)
      expect(attempted).toBeLessThan(100)
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray().length).toBeGreaterThanOrEqual(100-attempted)
      expect(JSON.parse(String(state.storage.sql.exec("SELECT cursor FROM recovery_scans WHERE kind='panel'").one().cursor)).id).toBe('100')
      expect((await state.storage.getAlarm())!-Date.now()).toBeGreaterThan(25_000)
      await state.storage.delete("wake_delay")
      coordinator.setBudget(30_000)
      // Any delayed successes must not remove their persisted retry records.
      const retained=state.storage.sql.exec("SELECT id FROM recovery_wakes ORDER BY id").toArray()
      await new Promise(resolve=>setTimeout(resolve,50))
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes ORDER BY id").toArray()).toEqual(retained)
      await state.storage.setAlarm(Date.now()+60_000)
    })
    for(let index=0;index<3;index++)expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async(_instance,state)=>{
      expect(state.storage.sql.exec("SELECT id FROM wakes").toArray()).toHaveLength(106)
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toHaveLength(0)
      await state.storage.deleteAlarm()
    })
  })
  it.each(["hold_read","hold_wake"])("bounds %s without losing the inventory cursor or durable wake",async hold=>{
    const stub=await start(105,1)
    await runInDurableObject(stub,async(instance,state)=>{
      await state.storage.put(hold,hold==='hold_read'?'panel':'panel-0')
      const coordinator=instance as RuntimeRecoveryFixture
      const work=coordinator.alarm()
      let timer:ReturnType<typeof setTimeout>|undefined
      try {
        const completed=await Promise.race([work.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),250)})])
        expect(completed).toBe(true)
        if(hold==='hold_read') expect(state.storage.sql.exec("SELECT cursor,active FROM recovery_scans WHERE kind='panel'").one())
          .toEqual({cursor:null,active:1})
        else expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toEqual([{id:'panel-0'}])
        if(hold==='hold_read') expect(state.storage.sql.exec("SELECT kind FROM reads WHERE kind='aborted'").toArray()).toHaveLength(1)
        expect((await state.storage.getAlarm())!-Date.now()).toBeGreaterThan(25_000)
      } finally {
        clearTimeout(timer)
        coordinator.releaseIo()
        await work
        await state.storage.delete(hold)
        await state.storage.deleteAlarm()
      }
    })
  })
  it("rotates bounded pages across lanes and preserves progress across cron wakes", async () => {
    const stub = await start(205,205)
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (instance,state) => {
      expect(state.storage.sql.exec("SELECT id FROM wakes").toArray()).toHaveLength(100)
      const before = state.storage.sql.exec("SELECT * FROM recovery_scans ORDER BY kind").toArray()
      await (instance as RuntimeRecoveryFixture).wake()
      expect(state.storage.sql.exec("SELECT * FROM recovery_scans ORDER BY kind").toArray()).toEqual(before)
      await state.storage.setAlarm(Date.now()+60_000)
    })
    await evictDurableObject(stub)
    for (let index=0;index<5;index++) expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (_instance,state) => {
      expect(state.storage.sql.exec("SELECT kind FROM reads").toArray().map(row=>row.kind))
        .toEqual(["panel","ticket","panel","ticket","panel","ticket"])
      expect(state.storage.sql.exec("SELECT id FROM wakes").toArray()).toHaveLength(410)
      expect(state.storage.sql.exec("SELECT kind FROM recovery_scans WHERE active=1").toArray()).toHaveLength(0)
    })
    // The crash-safety fallback is a single no-op after scan completion.
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await runDurableObjectAlarm(stub)).toBe(false)
    await runInDurableObject(stub,async (instance,state) => {
      await (instance as RuntimeRecoveryFixture).wake()
      expect(state.storage.sql.exec("SELECT kind FROM recovery_scans WHERE active=1 AND cursor IS NULL").toArray()).toHaveLength(2)
      await state.storage.deleteAlarm()
    })
  })

  it("retains a failed inventory page while servicing the other lane", async () => {
    const stub = await start(105,1)
    await runInDurableObject(stub,async (_instance,state) => { await state.storage.put("fail_read","panel") })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (_instance,state) => {
      expect(state.storage.sql.exec("SELECT cursor,active FROM recovery_scans WHERE kind='panel'").one()).toEqual({ cursor:null,active:1 })
      expect(await state.storage.getAlarm()).not.toBeNull()
      expect((await state.storage.getAlarm())! - Date.now()).toBeGreaterThan(25_000)
      await state.storage.delete("fail_read")
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true) // ticket lane despite panel failure
    expect(await runDurableObjectAlarm(stub)).toBe(true) // repeated panel page
    expect(await runDurableObjectAlarm(stub)).toBe(true) // final panel page
    await runInDurableObject(stub,async (_instance,state) => {
      expect(state.storage.sql.exec("SELECT kind,after_id FROM reads").toArray()).toEqual([
        {kind:"panel",after_id:null},{kind:"ticket",after_id:null},{kind:"panel",after_id:null},{kind:"panel",after_id:"100"},
      ])
      expect(state.storage.sql.exec("SELECT id FROM wakes").toArray()).toHaveLength(106)
      await state.storage.deleteAlarm()
    })
  })

  it("persists poison wakes across eviction without blocking later pages", async () => {
    const stub = await start(205,1)
    await runInDurableObject(stub,async (_instance,state) => { await state.storage.put("fail_wake","panel-0") })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (_instance,state) => {
      expect(JSON.parse(String(state.storage.sql.exec("SELECT cursor FROM recovery_scans WHERE kind='panel'").one().cursor)).id).toBe("100")
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toEqual([{id:"panel-0"}])
      expect((await state.storage.getAlarm())! - Date.now()).toBeGreaterThan(25_000)
    })
    await evictDurableObject(stub)
    await runInDurableObject(stub,async (instance,state) => {
      await (instance as RuntimeRecoveryFixture).wake()
      expect(JSON.parse(String(state.storage.sql.exec("SELECT cursor FROM recovery_scans WHERE kind='panel'").one().cursor)).id).toBe("100")
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toEqual([{id:"panel-0"}])
      await state.storage.setAlarm(Date.now()+60_000)
    })
    for (let index=0;index<4;index++) expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (_instance,state) => {
      expect(state.storage.sql.exec("SELECT id FROM wakes").toArray()).toHaveLength(206)
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toEqual([{id:"panel-0"}])
      expect(state.storage.sql.exec("SELECT kind FROM recovery_scans WHERE active=1").toArray()).toHaveLength(0)
      await state.storage.delete("fail_wake")
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await runInDurableObject(stub,async (_instance,state) => {
      expect(state.storage.sql.exec("SELECT id FROM recovery_wakes").toArray()).toHaveLength(0)
      await state.storage.deleteAlarm()
    })
  })
})
