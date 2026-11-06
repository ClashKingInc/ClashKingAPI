// Real public Worker routes read the canonical capped materialized view.
import assert from 'node:assert/strict'
export async function verifyCappedClanRankings({db,origin}) {
  await db.query(`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,war_win_streak,member_count,badge_token,troops_donated,troops_received,capital_gold_total,location_id)
    SELECT '#CAPAPI'||g,'Rank fixture',true,2000-g,0,1,'',2000-g,2000-g,2000-g,990001 FROM generate_series(1,1002) g`)
  try {
    await db.query('REFRESH MATERIALIZED VIEW clan_leaderboards')
    const capped=await db.query("SELECT donated_rank,location_donated_rank FROM clan_leaderboards WHERE tag='#CAPAPI1002'")
    assert(capped.rows[0].donated_rank!==null)
    assert.equal(capped.rows[0].location_donated_rank,null)
    // A clan may change country between refreshes. Its retained global placement
    // must not turn the absent country placement into an API rank of zero.
    await db.query("UPDATE basic_clan SET location_id=990002 WHERE tag IN ('#CAPAPI1001','#CAPAPI1002')")
    for(const kind of ['donations','war-wins','capital-gold']) {
      for(const location of [990001,990002]) {
        const response=await fetch(`${origin}/v2/leaderboard/${location}/clan/${kind}?limit=500`)
        const body=await response.json()
        assert.equal(response.status,200,JSON.stringify(body))
        if(location===990002) assert.deepEqual(body.items,[],`${kind}: absent country placement must be excluded`)
        else {assert.equal(body.items.length,500);assert(body.items.every(item=>Number.isInteger(item.rank)&&item.rank>0))}
      }
    }
    const response=await fetch(`${origin}/v2/leaderboard/clan/win-streak?limit=500`)
    const body=await response.json()
    assert.equal(response.status,200,JSON.stringify(body))
    assert(!body.items.some(item=>item.tag.startsWith('#CAPAPI')),'Zero war streaks are absent')
    console.log('PASS capped clan rankings: actual Worker routes exclude absent country ranks after country changes and omit zero streaks')
  } finally {
    await db.query("DELETE FROM basic_clan WHERE tag LIKE '#CAPAPI%'")
    await db.query('REFRESH MATERIALIZED VIEW clan_leaderboards')
  }
}
