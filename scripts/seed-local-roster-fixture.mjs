import pg from "pg"

const database = new URL(process.env.CLASHKING_LOCAL_DATABASE_URL ?? "")
if (database.protocol !== "postgres:" || database.hostname !== "127.0.0.1" || database.port !== "54330"
    || database.pathname !== "/clashking_dev" || database.username !== "clashking_local") {
  throw new Error("Expected the owned loopback clashking_dev database")
}

export const localFixture = {
  userId: "706149153431879760",
  serverId: "999999999999999001",
  clanTag: "#P0Y",
  playerTag: "#P0YJ",
}

const client = new pg.Client({ connectionString: database.href })
const clanMembers = JSON.stringify([
  { tag: localFixture.playerTag, name: "Local Roster Player", townHallLevel: 17, trophies: 5000, role: "member" },
])
await client.connect()
try {
  await client.query("BEGIN")
  await client.query(`INSERT INTO auth_users(user_id,provider) VALUES($1,'discord') ON CONFLICT (user_id) DO NOTHING`, [localFixture.userId])
  await client.query(`INSERT INTO servers(id,name) VALUES($1,'Synthetic local roster guild')
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()`, [localFixture.serverId])
  await client.query(`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members)
    VALUES($1,'Synthetic Local Clan',true,1,1,'synthetic-local',0,0,$2::jsonb)
    ON CONFLICT (tag) DO UPDATE SET name=EXCLUDED.name,member_count=EXCLUDED.member_count,members=EXCLUDED.members`,
  [localFixture.clanTag, clanMembers])
  await client.query(`INSERT INTO basic_player(tag,name,league_id,clan_tag,townhall_level,trophies)
    VALUES($1,'Local Roster Player',29000022,$2,17,5000)
    ON CONFLICT (tag) DO UPDATE SET name=EXCLUDED.name,league_id=EXCLUDED.league_id,clan_tag=EXCLUDED.clan_tag,
      townhall_level=EXCLUDED.townhall_level,trophies=EXCLUDED.trophies`, [localFixture.playerTag, localFixture.clanTag])
  await client.query(`INSERT INTO player_profile_details(player_tag,townhall_level,heroes,equipment,achievements,observed_at)
    VALUES($1,17,'[]','[]','[]',now()) ON CONFLICT (player_tag) DO UPDATE SET townhall_level=EXCLUDED.townhall_level,observed_at=now()`, [localFixture.playerTag])
  await client.query(`INSERT INTO player_links(tag,is_main,order_index,is_verified,source,user_id,verified_at,hidden)
    VALUES($1,true,0,true,'discord',$2,now(),false)
    ON CONFLICT (tag) DO UPDATE SET is_main=true,order_index=0,is_verified=true,source='discord',user_id=EXCLUDED.user_id,
      verified_at=COALESCE(player_links.verified_at,now()),hidden=false,updated_at=now()`, [localFixture.playerTag, localFixture.userId])
  await client.query(`INSERT INTO server_clans(tag,server_id,abbreviation) VALUES($1,$2,'LOCAL')
    ON CONFLICT (tag,server_id) DO UPDATE SET abbreviation=EXCLUDED.abbreviation,updated_at=now()`, [localFixture.clanTag, localFixture.serverId])

  await client.query("COMMIT")
  console.log(JSON.stringify({ event: "local_roster_fixture_seeded", ...localFixture }))
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  await client.end()
}
