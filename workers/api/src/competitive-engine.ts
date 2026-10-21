import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { InvalidRequest, NotFound } from "./errors.js"

export interface CompetitiveMatch { id: string; round: number; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string }
export const competitiveStandings = (ids: readonly string[], matches: readonly CompetitiveMatch[],format?:string) => {
  const rows = new Map(ids.map(teamId => [teamId, { teamId, played: 0, wins: 0, losses: 0, draws: 0, points: 0, elo: 1000 }]))
  // Recompute in stable round/id order so corrections deterministically replace
  // the previous result; no duplicate Elo mutation or compensating ledger exists.
  for (const match of matches) {
    if (match.status !== "completed" || match.homeScore === null || match.awayScore === null) continue
    const home = rows.get(match.homeTeamId), away = rows.get(match.awayTeamId)
    if (!home || !away) continue
    const outcome = match.homeScore > match.awayScore ? 1 : match.homeScore < match.awayScore ? 0 : 0.5
    const change = 32 * (outcome - 1 / (1 + 10 ** ((away.elo - home.elo) / 400)))
    home.elo += change; away.elo -= change; home.played++; away.played++
    home.points += outcome === 1 ? 3 : outcome === 0.5 ? 1 : 0
    away.points += outcome === 0 ? 3 : outcome === 0.5 ? 1 : 0
    if (outcome === 1) { home.wins++; away.losses++ } else if (outcome === 0) { away.wins++; home.losses++ } else { home.draws++; away.draws++ }
  }
  return [...rows.values()].sort((a,b)=>(format==='elo'?b.elo-a.elo:b.points-a.points)||b.elo-a.elo||a.teamId.localeCompare(b.teamId)).map(row=>({...row,elo:Math.round(row.elo)}))
}

export const generateCompetitiveRound = (serverId: string, tournamentId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const tournament = (yield* sql<{ id: string; format: string; status: string;ends_at:Date }>`SELECT id::text,format,status,ends_at FROM competitive_tournaments WHERE id::text=${tournamentId} AND server_id=${serverId} FOR UPDATE`)[0]
  if (!tournament) return yield* new NotFound({ message: "Tournament not found" })
  if (!["registration", "active"].includes(tournament.status)) return yield* new InvalidRequest({ message: "Open or active tournament required" })
  const participants = yield* sql<{ teamId: string;clanTag:string }>`SELECT p.team_id::text AS "teamId",t.clan_tag AS "clanTag" FROM competitive_participants p JOIN competitive_teams t ON t.id=p.team_id WHERE p.tournament_id=${tournament.id}::uuid AND p.withdrawn_at IS NULL AND p.checked_in_at IS NOT NULL AND NOT t.archived ORDER BY p.joined_at,p.team_id`
  const ids = participants.map(row=>row.teamId)
  if (ids.length < 2) return yield* new InvalidRequest({ message: "At least two checked-in teams are required" })
  if(new Set(participants.map(row=>row.clanTag)).size!==participants.length)return yield* new InvalidRequest({message:"Withdraw duplicate clan entries before scheduling; a clan cannot fight itself"})
  const matches = yield* sql<CompetitiveMatch>`SELECT id::text,round,home_team_id::text AS "homeTeamId",away_team_id::text AS "awayTeamId",CASE WHEN home_score IS NULL THEN NULL ELSE GREATEST(0,home_score-COALESCE((penalty->>'homeDeduction')::numeric,0)) END::float8 AS "homeScore",CASE WHEN away_score IS NULL THEN NULL ELSE GREATEST(0,away_score-COALESCE((penalty->>'awayDeduction')::numeric,0)) END::float8 AS "awayScore",status FROM competitive_matches WHERE tournament_id=${tournament.id}::uuid ORDER BY round,id`
  if (matches.some(match=>match.status!=="completed"&&match.status!=="cancelled")) return yield* new InvalidRequest({ message: "Complete the current matches before generating another round" })
  const pairings: {home:string;away:string;round:number}[]=[]
  const round = matches.reduce((value,match)=>Math.max(value,match.round),0)+1
  if((tournament.format==="elo"&&+tournament.ends_at<=Date.now())||(tournament.format==="swiss"&&round>Math.ceil(Math.log2(ids.length)))){yield* sql`UPDATE competitive_tournaments SET status='completed' WHERE id=${tournament.id}::uuid`;return {round,matches:[],completed:true}}
  if (tournament.format === "round_robin") {
    if (matches.length) {yield* sql`UPDATE competitive_tournaments SET status='completed' WHERE id=${tournament.id}::uuid`;return {round,matches:[],completed:true}}
    const rotating: (string|null)[]=[...ids]
    if(rotating.length%2)rotating.push(null)
    for(let index=1;index<rotating.length;index++) {
      for(let slot=0;slot<rotating.length/2;slot++) {
        const home=rotating[slot],away=rotating[rotating.length-1-slot]
        if(home&&away)pairings.push({home,away,round:index})
      }
      rotating.splice(1,0,rotating.pop()!)
    }
  } else {
    let available=ids
    if(tournament.format==="single_elimination"||tournament.format==="double_elimination") {
      if(ids.length&(ids.length-1))return yield* new InvalidRequest({message:"Single elimination requires a power-of-two checked-in field"})
      if(matches.some(match=>match.status==="completed"&&match.homeScore===match.awayScore))return yield* new InvalidRequest({message:"Resolve tied elimination matches before advancing"})
      const losses=new Map(ids.map(id=>[id,0]))
      for(const match of matches.filter(match=>match.status==="completed")){const loser=match.homeScore!>match.awayScore!?match.awayTeamId:match.homeTeamId;losses.set(loser,(losses.get(loser)??0)+1)}
      const eliminated=new Set(ids.filter(id=>(losses.get(id)??0)>=(tournament.format==="double_elimination"?2:1)))
      available=ids.filter(id=>!eliminated.has(id))
      if(available.length===1){yield* sql`UPDATE competitive_tournaments SET status='completed' WHERE id=${tournament.id}::uuid`;return {round,matches:[],completed:true}}
      // Double elimination pairs teams by losses. When bracket sizes are odd,
      // the least-played team gets the bye; the final resets if both have one loss.
      if(tournament.format==="double_elimination")available.sort((a,b)=>(losses.get(a)??0)-(losses.get(b)??0)||matches.filter(m=>m.homeTeamId===b||m.awayTeamId===b).length-matches.filter(m=>m.homeTeamId===a||m.awayTeamId===a).length||a.localeCompare(b))
    } else available=competitiveStandings(ids,matches).sort((a,b)=>b.elo-a.elo||a.teamId.localeCompare(b.teamId)).map(row=>row.teamId)
    if(tournament.format==="swiss") {
      if(ids.length%2)return yield* new InvalidRequest({message:"Swiss requires an even checked-in field"})
      available=competitiveStandings(ids,matches).map(row=>row.teamId)
      const played=(a:string,b:string)=>matches.some(match=>(match.homeTeamId===a&&match.awayTeamId===b)||(match.homeTeamId===b&&match.awayTeamId===a))
      let budget=10000
      const pair=(remaining:string[]):{home:string;away:string;round:number}[]|null=>{
        if(!remaining.length)return []
        if(--budget<0)return null
        const home=remaining[0]!
        for(let index=1;index<remaining.length;index++){const away=remaining[index]!;if(played(home,away))continue;const next=pair(remaining.filter((_,slot)=>slot!==0&&slot!==index));if(next)return [{home,away,round},...next]}
        return null
      }
      const paired=pair(available)
      if(!paired)return yield* new InvalidRequest({message:"No non-repeating Swiss pairing is available; review the field"})
      pairings.push(...paired)
    }else for(let index=0;index+1<available.length;index+=2)pairings.push({home:available[index]!,away:available[index+1]!,round})
  }
  const generated:string[]=[]
  for(const pair of pairings){const rows=yield* sql<{id:string}>`INSERT INTO competitive_matches(tournament_id,home_team_id,away_team_id,round) VALUES(${tournament.id}::uuid,${pair.home}::uuid,${pair.away}::uuid,${pair.round}) RETURNING id::text`;generated.push(rows[0]!.id)}
  yield* sql`UPDATE competitive_tournaments SET status='active' WHERE id=${tournament.id}::uuid`
  return {round,matches:generated,completed:false}
})
