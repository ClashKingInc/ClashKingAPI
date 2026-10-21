import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { readArchiveWar } from "./war-archive.js"
import { archiveAttackFacts, type ArchivedWar } from "./war-archive-model.js"

const lineupMatches=(matchId:string,war:ArchivedWar)=>Effect.gen(function*(){
 const sql=yield* SqlClient.SqlClient
 const expected=yield* sql<{clanTag:string;playerTag:string}>`SELECT team.clan_tag AS "clanTag",account->>'playerTag' AS "playerTag" FROM competitive_matches m JOIN competitive_participants p ON p.tournament_id=m.tournament_id AND p.team_id IN (m.home_team_id,m.away_team_id) JOIN competitive_teams team ON team.id=p.team_id CROSS JOIN LATERAL jsonb_array_elements(p.roster) account WHERE m.id::text=${matchId}`
 return [war.clan,war.opponent].every(side=>{const tags=expected.filter(account=>account.clanTag===side.tag).map(account=>account.playerTag);return tags.length===war.teamSize&&side.members.length===tags.length&&side.members.every(member=>tags.includes(member.tag))})
})

export const storeCompetitiveObservation=(matchId:string,warId:string)=>Effect.gen(function*(){
 const sql=yield* SqlClient.SqlClient,entry=yield* readArchiveWar(warId)
 if(!entry||!(yield* lineupMatches(matchId,entry.war)))return false
 const facts=archiveAttackFacts(warId,entry.war)
 const roster=yield* sql<{playerTag:string;userId:string}>`SELECT account->>'playerTag' AS "playerTag",account->>'userId' AS "userId" FROM competitive_matches m JOIN competitive_participants p ON p.tournament_id=m.tournament_id AND p.team_id IN (m.home_team_id,m.away_team_id) CROSS JOIN LATERAL jsonb_array_elements(p.roster) account WHERE m.id::text=${matchId}`
 const summaries=roster.map(account=>{const attacks=facts.filter(fact=>fact.attackerTag===account.playerTag);return {...account,attacks:attacks.length,triples:attacks.filter(attack=>attack.stars===3).length,stars:attacks.reduce((sum,attack)=>sum+attack.stars,0),destructionTotal:attacks.reduce((sum,attack)=>sum+attack.destructionPercentage,0),durationTotal:attacks.reduce((sum,attack)=>sum+attack.duration,0),evidenceVersion:1}})
 yield* sql`UPDATE competitive_matches SET observed_attacks=${JSON.stringify(summaries)}::jsonb WHERE id::text=${matchId} AND status='completed'`
 return true
})

export const competitiveAttacks=(warId:string|null)=>Effect.gen(function*(){
 if(!warId||!/^\d+$/u.test(warId))return []
 const entry=yield* readArchiveWar(warId)
 return entry?archiveAttackFacts(warId,entry.war):[]
})
/** Consume the existing canonical wars/archive feed. Clan discovery remains
 * owned by configured Dashboard clans and the existing tracking service. */
export const runCompetitiveWarSync=(serverId?:string,tournamentId?:string)=>Effect.gen(function*(){
 const sql=yield* SqlClient.SqlClient
 const matches=yield* sql<{id:string;server_id:string;tournament_id:string;home_team_id:string;away_team_id:string;home_clan:string;away_clan:string;war_id:string|null;starts_at:Date;ends_at:Date;team_size:number}>`SELECT m.*,t.server_id,t.starts_at,t.ends_at,t.team_size,h.clan_tag AS home_clan,a.clan_tag AS away_clan FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id JOIN competitive_teams h ON h.id=m.home_team_id JOIN competitive_teams a ON a.id=m.away_team_id WHERE t.status='active' AND m.status IN ('scheduled','active') AND (${serverId??null}::text IS NULL OR t.server_id=${serverId??null}) AND (${tournamentId??null}::text IS NULL OR t.id::text=${tournamentId??null}) ORDER BY t.starts_at,m.round LIMIT 50`
 let updated=0
 for(const match of matches){
  const candidates=yield* sql<{war_id:string;clan_tag:string;clan_stars:number;opponent_stars:number;clan_destruction_percentage:number;opponent_destruction_percentage:number;state:string}>`SELECT w.war_id::text,w.clan_tag,w.clan_stars,w.opponent_stars,w.clan_destruction_percentage,w.opponent_destruction_percentage,w.state FROM wars w WHERE ((w.clan_tag=${match.home_clan} AND w.opponent_tag=${match.away_clan}) OR (w.clan_tag=${match.away_clan} AND w.opponent_tag=${match.home_clan})) AND w.size=${match.team_size} AND w.start_time>=${match.starts_at} AND w.start_time<${match.ends_at} AND (${match.war_id}::text IS NULL OR w.war_id::text=${match.war_id}) AND NOT EXISTS(SELECT 1 FROM competitive_matches other WHERE other.war_id=w.war_id::text AND other.id<>${match.id}::uuid) ORDER BY w.start_time LIMIT 2`
  // More than one war in a tournament window requires an explicit staff link;
  // never guess which round owns a rematch between the same clans.
  if(candidates.length!==1)continue
  const war=candidates[0]!,ended=['warEnded','ended'].includes(war.state)
  const archived=ended?yield* readArchiveWar(war.war_id).pipe(Effect.catch(()=>Effect.succeed(undefined))):undefined
  // Clan identity and war size are insufficient: another lineup can play the
  // same opponent. A completed automatic result requires the frozen rosters.
  // Missing archive evidence leaves the match active until a later sync.
  if(ended&&(!archived||!(yield* lineupMatches(match.id,archived.war))))continue
  const attacks=archived?archiveAttackFacts(war.war_id,archived.war):[]
  yield* sql.withTransaction(Effect.gen(function*(){
   const before=yield* sql`SELECT * FROM competitive_matches WHERE id=${match.id}::uuid AND status IN ('scheduled','active') FOR UPDATE`
   if(!before.length)return
   const home=war.clan_tag===match.home_clan
   const homeScore=(home?war.clan_stars:war.opponent_stars)+(home?war.clan_destruction_percentage:war.opponent_destruction_percentage)/1000
   const awayScore=(home?war.opponent_stars:war.clan_stars)+(home?war.opponent_destruction_percentage:war.clan_destruction_percentage)/1000
   yield* sql`UPDATE competitive_matches SET war_id=${war.war_id},home_score=${ended?homeScore:null},away_score=${ended?awayScore:null},status=${ended?'completed':'active'} WHERE id=${match.id}::uuid`
   if(ended)yield* storeCompetitiveObservation(match.id,war.war_id).pipe(Effect.catch(()=>Effect.succeed(false)))
   yield* sql`INSERT INTO competitive_audit(server_id,actor_id,action,entity_id,before_data,after_data,reason) VALUES(${match.server_id},'tracking','match.sync',${match.id},${JSON.stringify(before[0])}::jsonb,${JSON.stringify({warId:war.war_id,homeScore,awayScore,status:ended?'completed':'active'})}::jsonb,'Canonical tracked war; stars then destruction tie break')`
   if(ended&&attacks.length)yield* sql`INSERT INTO achievement_player_awards(achievement_id,player_tag) SELECT DISTINCT 'first_tournament',entry->>'playerTag' FROM competitive_participants p CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry JOIN player_links l ON l.tag=entry->>'playerTag' AND l.user_id=entry->>'userId' AND l.is_verified WHERE p.tournament_id=${match.tournament_id}::uuid AND p.team_id IN (${match.home_team_id}::uuid,${match.away_team_id}::uuid) AND entry->>'playerTag'=ANY(${attacks.map(attack=>attack.attackerTag)}::text[]) ON CONFLICT DO NOTHING`
   updated++
  }))
 }
 // Archive publication can follow the lightweight war row. Revisit completed
 // matches for awards without changing a staff-corrected score or its audit.
 const pending=yield* sql<{id:string;war_id:string;tournament_id:string;home_team_id:string;away_team_id:string}>`SELECT m.id::text,m.war_id,m.tournament_id::text,m.home_team_id::text,m.away_team_id::text FROM competitive_matches m JOIN competitive_tournaments t ON t.id=m.tournament_id JOIN wars w ON w.war_id::text=m.war_id WHERE m.status='completed' AND w.state IN ('ended','warEnded') AND (${serverId??null}::text IS NULL OR t.server_id=${serverId??null}) AND (${tournamentId??null}::text IS NULL OR t.id::text=${tournamentId??null}) AND (${tournamentId??null}::text IS NOT NULL OR m.observed_attacks IS NULL OR EXISTS(SELECT 1 FROM competitive_participants p CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry JOIN player_links l ON l.tag=entry->>'playerTag' AND l.user_id=entry->>'userId' AND l.is_verified WHERE p.tournament_id=m.tournament_id AND p.team_id IN (m.home_team_id,m.away_team_id) AND NOT EXISTS(SELECT 1 FROM achievement_player_awards a WHERE a.achievement_id='first_tournament' AND a.player_tag=l.tag))) ORDER BY w.end_time DESC LIMIT 50`
 for(const match of pending){
  const observed=yield* storeCompetitiveObservation(match.id,match.war_id).pipe(Effect.catch(()=>Effect.succeed(false)))
  if(!observed)continue
  const attacks=yield* competitiveAttacks(match.war_id).pipe(Effect.catch(()=>Effect.succeed([])))
  if(!attacks.length)continue
  yield* sql`INSERT INTO achievement_player_awards(achievement_id,player_tag) SELECT DISTINCT 'first_tournament',entry->>'playerTag' FROM competitive_participants p CROSS JOIN LATERAL jsonb_array_elements(p.roster) entry JOIN player_links l ON l.tag=entry->>'playerTag' AND l.user_id=entry->>'userId' AND l.is_verified WHERE p.tournament_id=${match.tournament_id}::uuid AND p.team_id IN (${match.home_team_id}::uuid,${match.away_team_id}::uuid) AND entry->>'playerTag'=ANY(${attacks.map(attack=>attack.attackerTag)}::text[]) ON CONFLICT DO NOTHING`
 }
 return {updated}
})
