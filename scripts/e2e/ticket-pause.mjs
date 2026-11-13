// Real API Worker + production Durable Object implementations + disposable SQL.
// Local subclasses expose read-only queue snapshots; no executor is replaced.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import pg from 'pg';
import { ErrorResponse } from '@clashking/api-contracts';
import { Effect, Schema } from 'effect';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1');
const database = new URL(process.env.TEST_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname, '/clashking_test');
const db = new pg.Client({ connectionString: database.href }); await db.connect();
assert.equal((await db.query("SELECT count(*)::int AS count FROM goose_db_version WHERE version_id=81 AND is_applied")).rows[0].count, 0, 'Run with baseline-079 to prove paused deployment before migration 081');
const storage = mkdtempSync(join(tmpdir(), 'ck-ticket-pause-'));
const compiled = await build({ entryPoints: ['workers/api/src/index.ts'], bundle: true, write: false,
  format: 'esm', platform: 'node', conditions: ['workerd'], external: ['cloudflare:*'],
  banner: { js: 'import { createRequire as localCreateRequire } from "node:module"; const require = localCreateRequire("/local-api/index.js");' },
  plugins: [{ name: 'binary', setup(builder) {
    builder.onResolve({filter:/\.wasm$/},()=>({path:'./zstd.wasm',external:true}));
    builder.onResolve({filter:/\.zdict$/},()=>({path:'./dictionary.bin',external:true}));
  }}],
});
const base = {
  host: '127.0.0.1', port: 8834, resourcePersistencePath: storage, modulesRoot: '/local-api',
  compatibilityDate: '2026-08-22', compatibilityFlags: ['nodejs_compat'],
  hyperdrives: { HYPERDRIVE: "postgres://clashking_test:clashking_test@127.0.0.1:1/clashking_test", HYPERDRIVE_FRESH: database.href },
  kvNamespaces: ['API_CACHE'], r2Buckets: ['ASSETS','WAR_ARCHIVE','POSTS','APP_UPDATES','MEDIA','TICKETING'],
  durableObjects: { TICKET_RUNTIME: {className:'ObservedTicket',useSQLite:true}, RUNTIME_RECOVERY:{className:'ObservedRecovery',useSQLite:true} },
  outboundService: () => new Response('No external providers in pause E2E', {status:503}),
  modules: [
    {type:'ESModule',path:'/local-api/index.js',contents:compiled.outputFiles[0].text},
    {type:'CompiledWasm',path:'/local-api/zstd.wasm',contents:readFileSync('node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm')},
    {type:'Data',path:'/local-api/dictionary.bin',contents:readFileSync('workers/api/assets/war-json.zdict')},
    {type:'ESModule',path:'/local-api/entry.js',contents:`
      import worker, {TicketRuntimeCoordinator,RuntimeRecoveryCoordinator} from './index.js';
      export class ObservedTicket extends TicketRuntimeCoordinator {
        async runAlarm(){await this.alarm();}
        async snapshot(){return {rows:this.ctx.storage.sql.exec('SELECT * FROM operation_queue').toArray(),alarm:await this.ctx.storage.getAlarm()};}
      }
      export class ObservedRecovery extends RuntimeRecoveryCoordinator {
        async runAlarm(){await this.alarm();}
        async snapshot(){return {rows:this.ctx.storage.sql.exec('SELECT * FROM recovery_scans ORDER BY kind').toArray(),wakes:this.ctx.storage.sql.exec('SELECT * FROM recovery_wakes').toArray(),alarm:await this.ctx.storage.getAlarm()};}
      }
      export default {async fetch(request,env,ctx){
        const url=new URL(request.url);
        if(url.pathname.startsWith('/__e2e/')){
          const ticket=env.TICKET_RUNTIME.getByName('pause-e2e'),recovery=env.RUNTIME_RECOVERY.getByName('global');
          if(url.pathname==='/__e2e/wake'){await ticket.wake(url.searchParams.get('id'));await recovery.wake();}
          if(url.pathname==='/__e2e/alarm'){await ticket.runAlarm();await recovery.runAlarm();}
          return Response.json({ticket:await ticket.snapshot(),recovery:await recovery.snapshot()});
        }
        return worker.fetch(request,env,ctx);
      }};
    `},
  ],
};
// The entry module must be first; the production bundle stays an imported module.
base.modules.unshift(base.modules.pop());
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8').split('\n').filter(line=>!line.trimStart().startsWith('//')).join('\n'));
const options = paused => convertV4MiniflareOptions({...base,bindings:{
  ...config.vars, ENVIRONMENT:'isolated-local',API_BOT_TOKEN:'e2e'.padEnd(43,'x'),JWT_ACCESS_SECRET:'x'.repeat(43),JWT_REFRESH_SECRET:'y'.repeat(43),
  DATA_ENCRYPTION_KEY:'z'.repeat(43),DISCORD_API_ORIGIN:'https://discord.com/api/v10',WEB_ALLOWED_ORIGINS:'http://localhost:3002',
  DISCORD_CLIENT_ID:'922222222222222904',DISCORD_CLIENT_SECRET:'fixture',DISCORD_BOT_TOKEN:'',DISCORD_APPLICATION_ID:'922222222222222904',
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'9',SMTP_USERNAME:'',SMTP_PASSWORD:'',STRIPE_RESTRICTED_KEY:'',STRIPE_WEBHOOK_SECRET:'x'.repeat(43),
  ELASTICSEARCH_API_KEY:'',ACCESS_TEAM_DOMAIN:'',ACCESS_AUDIENCE:'',AI_USAGE_SECRET:'x'.repeat(43),
  ...(paused ? {TICKETS_PAUSED:'true'} : {}),
}});
const runtime = new Miniflare(options(true));
const origin = 'http://127.0.0.1:8834';
const state = async path => {const response=await fetch(origin+path);assert.equal(response.status,200);return response.json();};
try {
  await runtime.ready;
  const paths=['/v2/server/922222222222222901/tickets','/v2/server/922222222222222901/tickets/panel/buttons/button',
    '/v2/runtime/tickets/open/prepare','/v2/runtime/tickets/resume','/v2/runtime/ticket-operations/'+randomUUID()+'/advance',
    '/v2/runtime/ticket-panel-publications/prepare','/v2/bot/server/922222222222222901/ticket-panels',
    '/V2/runtime/TICKET-OPERATIONS/'+randomUUID()+'/advance'];
  for(const path of paths){const response=await fetch(origin+path,{method:'POST',body:'not-json'});assert.equal(response.status,503,path);assert.equal(response.headers.get('retry-after'),'30');const body=await response.json();await Effect.runPromise(Schema.decodeUnknownEffect(ErrorResponse)(body));assert.equal(body.reason,'ticket_maintenance');assert.equal(body.code,'upstream_unavailable');assert.equal(typeof body.message,'string');}
  assert.equal((await fetch(origin+'/v2/health')).status,200,'Non-ticket API remains live');
  const id=randomUUID(),before=await state('/__e2e/wake?id='+id);
  const paused=await state('/__e2e/alarm');
  assert.equal(paused.ticket.rows[0].operation_id,id);assert.equal(paused.ticket.rows.length,1);
  assert.deepEqual(paused.recovery.rows,before.recovery.rows,'Paused recovery preserves cursors');
  assert(paused.ticket.alarm && paused.recovery.alarm,'Both coordinators retain a resume alarm');
  await runtime.setOptions(options(false)); await runtime.ready;
  let resumed;
  for(let i=0;i<4;i++) resumed=await state('/__e2e/alarm');
  assert.equal(resumed.ticket.rows.length,0,'Real SQL executor processes missing job after unpause');
  assert(resumed.recovery.rows.every(row=>row.active===0),'Real SQL recovery resumes and finishes scans');
  assert.equal((await fetch(origin+'/v2/health')).status,200);
  const response=await fetch(origin+'/v2/server/922222222222222901/tickets');
  assert.notEqual((await response.json()).reason,'ticket_maintenance','Unset flag restores normal ticket routing');
  console.log('PASS real local Worker/DO pause before migration081: ticket HTTP503 before dependencies, non-ticket health200, durable queue/cursors retained, alarms rearmed, SQL execution/recovery resume with unset flag');
} finally {await runtime.dispose();await db.end();rmSync(storage,{recursive:true,force:true});}
