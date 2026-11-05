// Read-only end-to-end check against the real local Worker and PostgreSQL.
// No mocked responses, provider calls, materialized-view refresh, or seed rows.
import assert from 'node:assert/strict'
import pg from 'pg'

const origin = new URL(process.env.CLASHKING_LOCAL_API_ORIGIN ?? 'http://127.0.0.1:8787')
assert.equal(origin.hostname, '127.0.0.1', 'Only the loopback API may be tested')
const db = new pg.Client({ connectionString: 'postgres://clashking_local:clashking_local@127.0.0.1:54330/clashking_dev' })
await db.connect()
let checked = 0
try {
  const rows = (await db.query(`SELECT c.tag,c.location_id,c.troops_donated,c.troops_received,c.war_wins,c.war_win_streak,
    c.capital_gold_total::text,to_jsonb(l) AS ranks FROM basic_clan c JOIN clan_leaderboards l ON l.tag=c.tag
    WHERE c.tag=ANY($1::text[])`, [['#VY2J0LL', '#2QPCJQQ2U']])).rows
  assert(rows.length > 0, 'The local database must contain a real clan from this regression')
  for (const row of rows) {
    const response = await fetch(new URL(`/v2/clan/${encodeURIComponent(row.tag)}/rankings`, origin))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.tag, row.tag)
    for (const [field,value,global,local] of [
      ['donations',row.troops_donated,'donated_rank','location_donated_rank'],
      ['donationsReceived',row.troops_received,'received_rank','location_received_rank'],
      ['warWins',row.war_wins,'war_wins_rank','location_war_wins_rank'],
      ['warWinStreak',row.war_win_streak,'war_win_streak_rank',null],
      ['capitalGold',Number(row.capital_gold_total),'capital_gold_rank','location_capital_gold_rank'],
    ]) {
      const expected = []
      if (row.ranks[global] > 0) expected.push({locationId:'global',rank:Number(row.ranks[global]),points:value})
      if (local && row.location_id && row.ranks[local] > 0) expected.push({locationId:String(row.location_id),rank:Number(row.ranks[local]),points:value})
      assert.deepEqual(body[field], {points:value,placements:expected}, `${field} must match stored current ranks`)
      checked++
    }
    for (const [field,type] of [['homeVillage','home'],['builderBase','builder_base'],['clanCapital','capital']]) {
      const expected = (await db.query(`SELECT location_id AS "locationId",rank,points FROM clan_rankings_current
        WHERE clan_tag=$1 AND ranking_type=$2 ORDER BY CASE WHEN location_id='global' THEN 0 ELSE 1 END,location_id`,[row.tag,type])).rows
      assert.deepEqual(body[field].placements,expected)
      checked++
    }
  }
  console.log(`PASS: ${checked} real local clan-ranking categories match PostgreSQL; no rows mutated.`)
} finally { await db.end() }
