import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("runs the actual Durable Object alarm loop and retains waiting or failed jobs until a terminal retry",async()=>{
  const bundle=await build({bundle:true,write:false,format:"esm",platform:"node",external:["cloudflare:*"],
    stdin:{resolveDir:process.cwd(),loader:"ts",contents:`
      import {TicketRuntimeCoordinator} from './workers/api/src/ticket-runtime-coordinator.js';
      import {configureJob,callsFor} from './workers/api/src/ticket-effects.js';
      export class FixtureCoordinator extends TicketRuntimeCoordinator {
        async enqueueFixture(id,first){configureJob(id,first);await this.wake(id);await this.ctx.storage.deleteAlarm();}
        async tickFixture(){await this.ctx.storage.deleteAlarm();await this.alarm();}
        async snapshotFixture(id){return {rows:this.ctx.storage.sql.exec('SELECT operation_id FROM operation_queue').toArray(),
          alarm:await this.ctx.storage.getAlarm(),calls:callsFor(id)};}
      }
      export default {async fetch(request,env){const url=new URL(request.url),id=url.searchParams.get('id');
        const stub=env.QUEUE.getByName(id);
        if(url.pathname==='/enqueue')await stub.enqueueFixture(id,url.searchParams.get('first'));
        if(url.pathname==='/tick')await stub.tickFixture();
        return Response.json(await stub.snapshotFixture(id));
      }};
    `},plugins:[{name:"isolated-executor",setup(builder){
      builder.onResolve({filter:/\/ticket-effects\.js$/},()=>({path:"executor",namespace:"queue-fixture"}))
      builder.onResolve({filter:/\/ticket-panel-publications\.js$/},()=>({path:"panel",namespace:"queue-fixture"}))
      builder.onResolve({filter:/\/database\.js$/},()=>({path:"database",namespace:"queue-fixture"}))
      builder.onLoad({filter:/.*/,namespace:"queue-fixture"},args=>({loader:"js",resolveDir:process.cwd(),contents:args.path==="database"
        ?`import {Layer} from 'effect'; export const databaseLayer=()=>Layer.empty;`
        :args.path==="panel"?`import {Effect} from 'effect';export const runTicketPanelPublication=()=>Effect.die('Unexpected panel job');`
        :`import {Effect} from 'effect';const jobs=new Map();
          export const configureJob=(id,first)=>{if(!jobs.has(id))jobs.set(id,{first,calls:0});};
          export const callsFor=id=>jobs.get(id)?.calls??0;
          export const runTicketOperation=id=>Effect.suspend(()=>{const job=jobs.get(id);job.calls++;
            if(job.calls>1)return Effect.succeed('completed');
            return job.first==='failure'?Effect.fail(new Error('isolated dependency outage')):Effect.succeed(job.first);
          });`,}))
    }}]})
  const runtime=new Miniflare(convertV4MiniflareOptions({script:bundle.outputFiles[0]!.text,modules:true,
    compatibilityDate:"2026-08-22",compatibilityFlags:["nodejs_compat"],
    durableObjects:{QUEUE:{className:"FixtureCoordinator",useSQLite:true}},
    bindings:{DISCORD_API_ORIGIN:"https://discord.example.test/api/v10",DISCORD_BOT_TOKEN:"fixture-only"},
  }))
  try {
    for(const [index,first] of ["waiting","reconciling","failure"].entries()){
      const id=`70000000-0000-4000-8000-00000000000${index}`
      const call=async(path:string)=>(await runtime.dispatchFetch(`https://queue.test/${path}?id=${id}&first=${first}`)).json() as Promise<{
        rows:Array<{operation_id:string}>;alarm:number|null;calls:number
      }>
      const queued=await call("enqueue")
      expect(queued.rows).toEqual([{operation_id:id}]);expect(queued.calls).toBe(0)
      await call("enqueue")
      const firstAttempt=await call("tick")
      expect(firstAttempt.rows).toEqual([{operation_id:id}]);expect(firstAttempt.calls).toBe(1)
      expect(firstAttempt.alarm).toBeGreaterThan(Date.now()+20_000)
      const complete=await call("tick")
      expect(complete.rows).toEqual([]);expect(complete.calls).toBe(2);expect(complete.alarm).toBeNull()
    }
  } finally {await runtime.dispose()}
},30_000)
