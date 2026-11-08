import assert from 'node:assert/strict'

export async function verifyClanCountDistributions({db,origin}) {
  const counts=[-1,0,1,5,6,10,46,50,51]
  for(const [index,count] of counts.entries()) {
    await db.query(`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,location_id)
      VALUES($1,'Distribution fixture',true,0,$2,'',0,0,$3)`,[`#DIST${index}`,count,index%2===0?null:987601])
  }
  const read=async path=>{
    const response=await fetch(`${origin}${path}`)
    const body=await response.json()
    assert.equal(response.status,200,JSON.stringify(body))
    return body
  }
  try {
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY api_clan_distribution_counts')
    const expectedLocations=(await db.query('SELECT location_id,count(*)::int AS count FROM basic_clan GROUP BY location_id ORDER BY location_id NULLS LAST')).rows.map(row=>({...(row.location_id===null?{}:{location_id:row.location_id}),count:row.count}))
    const expectedBins=(await db.query(`SELECT CASE WHEN member_count BETWEEN 1 AND 50 THEN 1+((member_count-1)/5)*5 ELSE member_count END AS "minMembers",
      CASE WHEN member_count BETWEEN 1 AND 50 THEN 5+((member_count-1)/5)*5 ELSE member_count END AS "maxMembers",count(*)::int AS count
      FROM basic_clan GROUP BY 1,2 ORDER BY 1`)).rows
    const locations=await read('/v2/counts/clans/locations')
    const bins=await read('/v2/counts/clans/member-bins')
    assert.deepEqual(locations,{items:expectedLocations,count:expectedLocations.length})
    assert.deepEqual(bins,{totalClans:expectedBins.reduce((sum,row)=>sum+row.count,0),items:expectedBins})
    await db.query("UPDATE basic_clan SET member_count=31,location_id=987602 WHERE tag='#DIST0'")
    assert.deepEqual(await read('/v2/counts/clans/locations'),locations,'API must keep the published snapshot until refresh')
    assert.deepEqual(await read('/v2/counts/clans/member-bins'),bins,'Member bins must not fall back to live aggregation')
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY api_clan_distribution_counts')
    assert.notDeepEqual(await read('/v2/counts/clans/locations'),locations)
    assert.notDeepEqual(await read('/v2/counts/clans/member-bins'),bins)
    console.log('PASS actual Worker clan distributions: null locations, member boundaries, stale publication and concurrent refresh')
  } finally {
    await db.query("DELETE FROM basic_clan WHERE tag LIKE '#DIST%'")
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY api_clan_distribution_counts')
  }
}
