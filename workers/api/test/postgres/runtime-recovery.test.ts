import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { pendingRuntimePage } from "../../src/runtime-recovery.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const database = PgClient.layer({url:Redacted.make(process.env.TEST_DATABASE_URL)})
const run = <A,E>(program:Effect.Effect<A,E,SqlClient.SqlClient>)=>Effect.runPromise(program.pipe(Effect.provide(database),Effect.scoped))
const guild="685000000000000001", actor="785000000000000001", channel="885000000000000001"

describe("persistent recovery inventory",()=>{
  it("pages ticket jobs through microsecond timestamp ties and excludes later retry writes",async()=>{
    const created=await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      yield*sql`INSERT INTO servers(id,name) VALUES(${guild},'Recovery fixture') ON CONFLICT DO NOTHING`
      const panel=(yield*sql<{id:string}>`INSERT INTO ticket_panels(server_id,name,components,data)
        VALUES(${guild},'Ticket recovery','[]','{}') RETURNING id::text`)[0]!
      return yield*sql<{id:string;ticket_id:string}>`INSERT INTO ticket_runtime_operations
        (interaction_id,action,server_id,actor_user_id,panel_id,origin_channel_id,origin_message_id,context,request,request_hash,
          submission_interaction_id,submitted_request,submitted_request_hash,state,updated_at)
        SELECT (385000000000000000::bigint+n)::text,'set_status',${guild},${actor},${panel.id}::uuid,${channel},${channel},'{}','{}',repeat('a',64),
          (485000000000000000::bigint+n)::text,'{}',repeat('a',64),
          CASE WHEN n<=103 THEN 'submitted' WHEN n=104 THEN 'provisioning' WHEN n=105 THEN 'reconciling' ELSE 'failed' END,
          '2000-01-01 00:00:00.000001+00'::timestamptz FROM generate_series(1,106)n
        RETURNING id::text,ticket_id::text`
    }))
    const eligible=await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      return yield*sql<{id:string}>`SELECT id::text FROM ticket_runtime_operations WHERE server_id=${guild} AND state<>'failed' ORDER BY ticket_runtime_operations.id`
    }))
    const before=await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      return yield*sql`SELECT id::text,xmin::text FROM ticket_runtime_operations WHERE server_id=${guild} ORDER BY id`
    }))
    const first=await run(pendingRuntimePage("ticket")),second=await run(pendingRuntimePage("ticket",first.nextCursor))
    expect(first.jobs.map(job=>job.id)).toEqual(eligible.slice(0,100).map(row=>row.id))
    expect(first.nextCursor?.updatedAt).toContain(".000001")
    expect(second.jobs.map(job=>job.id)).toEqual(eligible.slice(100).map(row=>row.id))
    expect(second.nextCursor).toBeUndefined()
    for(const job of [...first.jobs,...second.jobs]) expect(job.queue).toBe(`${guild}:${created.find(row=>row.id===job.id)!.ticket_id}`)
    expect(await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      return yield*sql`SELECT id::text,xmin::text FROM ticket_runtime_operations WHERE server_id=${guild} ORDER BY id`
    }))).toEqual(before)
    await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      yield*sql`UPDATE ticket_runtime_operations SET updated_at=clock_timestamp() WHERE id=${eligible[0]!.id}::uuid`
    }))
    expect((await run(pendingRuntimePage("ticket",first.nextCursor))).jobs.some(job=>job.id===eligible[0]!.id)).toBe(false)
  })

  it("pages all uncertain, due pending and expired executing publications without touching leases",async()=>{
    const ids=await run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      yield*sql`INSERT INTO servers(id,name) VALUES(${guild},'Recovery fixture') ON CONFLICT DO NOTHING`
      const panels=yield*sql<{id:string;updated_at:string}>`INSERT INTO ticket_panels(server_id,name,components,data)
        SELECT ${guild},'Recovery '||n,'[]','{}' FROM generate_series(1,110)n RETURNING id::text,updated_at::text`
      const expected:string[]=[]
      for(const [index,panel] of panels.entries()) {
        const id=index.toString(16).padStart(64,'0'),state=index<103?'uncertain':index===103?'pending':index===104?'executing':index===105?'pending':index===106?'executing':index===107?'failed':'succeeded'
        if(index<105)expected.push(id)
        yield*sql`INSERT INTO ticket_panel_publication_effects
          (effect_id,panel_id,server_id,revision,source_updated_at,channel_id,payload,state,updated_at,
            next_attempt_at,claim_token,claimed_at,lease_expires_at,attempt_count,result_message_id)
          VALUES(${id},${panel.id}::uuid,${guild},1,${panel.updated_at}::timestamptz,${channel},'{}',${state},
            '2000-01-01 00:00:00.000001+00',${index===105?'2099-01-01':'2000-01-01'}::timestamptz,
            ${state==='executing'?crypto.randomUUID():null}::uuid,${state==='executing'?'2000-01-01':null}::timestamptz,
            ${state==='executing'?(index===106?'2099-01-01':'2000-01-02'):null}::timestamptz,
            ${state==='executing'?1:0},${state==='succeeded'?channel:null})`
      }
      return expected
    }))
    const snapshot=()=>run(Effect.gen(function*(){const sql=yield*SqlClient.SqlClient
      return yield*sql`SELECT effect_id,xmin::text,claim_token::text FROM ticket_panel_publication_effects WHERE server_id=${guild} ORDER BY effect_id`
    }))
    const before=await snapshot(),first=await run(pendingRuntimePage("panel")),second=await run(pendingRuntimePage("panel",first.nextCursor))
    expect(first.jobs.map(job=>job.id)).toEqual(ids.slice(0,100))
    expect(first.nextCursor?.updatedAt).toContain(".000001")
    expect(second.jobs.map(job=>job.id)).toEqual(ids.slice(100))
    expect(second.nextCursor).toBeUndefined()
    expect(first.jobs.every(job=>job.queue.startsWith(`${guild}:panel:`))).toBe(true)
    expect(await snapshot()).toEqual(before)
  })
})
