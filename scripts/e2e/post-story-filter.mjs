// Actual Worker HTTP against a disposable Goose-migrated database. No mocks.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1');
const dsn = new URL(process.env.TEST_DATABASE_URL);
assert.equal(dsn.hostname, '127.0.0.1');
assert.equal(dsn.pathname, '/clashking_test');
const db = new pg.Client({ connectionString: dsn.href });
await db.connect();
const port = 8824, origin = `http://127.0.0.1:${port}`;
let logs = '';
const child = spawn(process.execPath, ['scripts/start-local-rewrite-api.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    CLASHKING_LOCAL_API_PORT: String(port), CLASHKING_LOCAL_ADMIN_IDENTITY: '0',
    CLASHKING_LOCAL_DISCORD_CLIENT_ID: '999999999999999999',
    CLASHKING_LOCAL_DISCORD_CLIENT_SECRET: 'fixture', CLASHKING_LOCAL_ARCHIVE_BRIDGE: '0',
    CLASHKING_LOCAL_PRODUCTION_READS: '0', CLASHKING_LOCAL_FCM_CREDENTIALS_FILE: '',
  },
});
child.stdout.on('data', (chunk) => logs += chunk);
child.stderr.on('data', (chunk) => logs += chunk);
const ids = [];
const seed = async (title, type, minute, status = 'live', platforms = ['ios', 'android'], legacy = false) => {
  const id = randomUUID(); ids.push(id);
  await db.query(`INSERT INTO admin_posts(id,slug,title,summary,presentation_type,story_url,status,platforms,published_at)
    VALUES($1::uuid,$1::text,$2,'Fixture summary',$3,$4,$5,$6,$7)`,
  [id, title, type, type === 'story' || legacy ? 'https://posts.clashk.ing/fixture.html' : null,
    status, platforms, new Date(Date.now() - minute * 60000)]);
  return id;
};
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error(logs.slice(-1800));
    try { ready = (await fetch(origin + '/v2/health')).ok && logs.includes('isolated_api_ready'); } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, logs.slice(-1800));
  for (let i = 0; i < 25; i++) await seed(`Article ${i}`, 'article', i);
  const expected = [];
  for (let i = 0; i < 7; i++) expected.push(await seed(`Story ${i}`, 'story', 30 + i));
  const legacy = await seed('Legacy story', 'article', 37, 'live', ['ios', 'android'], true);
  const draft = await seed('Draft story', 'story', 0, 'draft');
  await seed('Android only', 'story', 1, 'live', ['android']);
  const get = async (query, status = 200) => {
    const response = await fetch(origin + '/v2/app/posts?target=ios&locale=en&' + query);
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  };
  const first = await get('presentation_type=story&limit=5&offset=0');
  assert.deepEqual(first.items.map((item) => item.id), expected.slice(0, 5));
  assert.equal(first.has_more, true); assert.equal(first.next_offset, 5);
  const next = await get('presentation_type=story&limit=5&offset=5');
  assert.deepEqual(next.items.map((item) => item.id), [...expected.slice(5), legacy]);
  assert.equal(next.has_more, false);
  const articles = await get('presentation_type=article&limit=50&offset=0');
  assert.equal(articles.items.length, 25);
  assert(articles.items.every((item) => !item.story_url));
  const combined = await get('limit=50&offset=0');
  assert.equal(combined.items.length, 33, 'Omitting filter preserves mixed public feed');
  assert(!combined.items.some((item) => item.id === draft));
  await get('presentation_type=invalid&limit=5&offset=0', 400);
  console.log('PASS real local post API: newest five past 25 articles, pagination, legacy story, platform, draft exclusion, optional filter, invalid filter');
} finally {
  await db.query('DELETE FROM admin_posts WHERE id=ANY($1::uuid[])', [ids]);
  child.kill('SIGTERM'); await db.end();
}
