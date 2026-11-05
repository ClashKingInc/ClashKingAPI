import assert from 'node:assert/strict';

const base = new URL(process.env.CLASHKING_E2E_BASE_URL ?? 'http://127.0.0.1:8787');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Local API only');
async function read(path) {
  const response = await fetch(new URL(`/v2/esports/ccn/${path}`, base), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response.json();
}
const current = await read('elo');
assert.equal(current.source, 'ccn');
assert.equal(current.data.offset, 0);
assert.equal(current.data.limit, 50);
assert.ok(current.data.teams.length > 0);
for (let i = 1; i < current.data.teams.length; i++) assert.ok(current.data.teams[i - 1].elo >= current.data.teams[i].elo);
assert.ok(current.data.teams.every(team => team.rankMovement30d === undefined), 'Base rankings do not wait for optional history');
const movement = await read('elo?movement=1');
assert.ok(movement.data.teams.some(team => typeof team.rankMovement30d === 'number'), 'Optional enrichment includes rank comparison');
for (const team of movement.data.teams) {
  if (team.previousRank30d != null) assert.equal(team.rankMovement30d, team.previousRank30d - team.rank);
  else assert.equal(team.newToRanking30d, true);
  assert.equal(team.eloChange30d, undefined, 'Rank movement must not become Elo point movement');
}
const repeated = await read('elo');
assert.equal(repeated.fetchedAt, current.fetchedAt, 'Ranking should reuse server cache');
const page = await read('elo?offset=50');
assert.equal(page.data.offset, 50);
assert.ok(page.data.teams.every(team => !current.data.teams.some(first => first.team_id === team.team_id)));
for (const team of [current.data.teams[0], page.data.teams[0]]) {
  const placement = await read(`elo-team?teamId=${team.team_id}`);
  assert.equal(placement.data.team.team_id, team.team_id);
  assert.equal(placement.data.team.rank, team.rank);
  assert.equal(placement.data.team.elo, team.elo);
}
assert.equal((await fetch(new URL('/v2/esports/ccn/elo-team?teamId=no', base))).status, 400);
const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 1).toISOString();
const historical = await read(`elo?timestamp=${encodeURIComponent(monthEnd)}`);
assert.ok(historical.data.teams.every(team => team.rankMovement30d === undefined), 'Past snapshots omit movement');
assert.equal(Date.parse(`${historical.data.timestamp}${/Z$|[+-]\d\d:\d\d$/.test(historical.data.timestamp) ? '' : 'Z'}`), Date.parse(monthEnd));
const invalid = await fetch(new URL('/v2/esports/ccn/elo?offset=-1', base));
assert.equal(invalid.status, 400);
const feed = await read('elo-matches');
assert.equal(feed.data.teams.length, 50);
assert.equal(feed.data.teams[0].team_id, current.data.teams[0].team_id);
const recentIds = feed.data.recent.map(match => match.match_id);
assert.equal(new Set(recentIds).size, recentIds.length);
for (const match of feed.data.upcoming) {
  assert.ok(Array.isArray(match.streams), 'Upcoming feed must include stream metadata');
  for (const stream of match.streams) {
    assert.equal(typeof stream.streamer_name, 'string');
    assert.equal(typeof stream.platform, 'string');
    assert.equal(typeof stream.link, 'string');
  }
}
assert.ok(feed.data.failures.length < 100);
const cachedFeed = await read('elo-matches');
assert.equal(cachedFeed.fetchedAt, feed.fetchedAt, 'Feed should reuse shared aggregation');
assert.deepEqual(cachedFeed.data, feed.data);
console.log(JSON.stringify({ passed: true, currentTeams: current.data.total, historicalTeams: historical.data.total, feedTeams: feed.data.teams.length, recentMatches: feed.data.recent.length, upcomingMatches: feed.data.upcoming.length, partialFailures: feed.data.failures.length }));
