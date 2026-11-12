import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { InvalidRequest, NotFound } from "./errors.js"

/** All category membership/order mutations take this lock BEFORE category or
 * clan rows. A concurrent move must not leave duplicate/gapped positions or
 * deadlock against category deletion. Pure reorders never enqueue role work. */
export const lockServerClanOrder=(serverId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  if(!(yield* sql`SELECT id FROM servers WHERE id=${serverId} FOR UPDATE`).length)return yield* new NotFound({message:"Server not found"})
})

export const compactServerClanOrder=(serverId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`WITH ordered AS (
    SELECT tag,row_number() OVER(PARTITION BY category_id ORDER BY position,added_at,tag)-1 AS position
    FROM server_clans WHERE server_id=${serverId}
  ) UPDATE server_clans scoped SET position=ordered.position FROM ordered
    WHERE scoped.server_id=${serverId} AND scoped.tag=ordered.tag AND scoped.position<>ordered.position`
})

export const reorderServerClans=(serverId:string,categoryId:string|null,clanTags:ReadonlyArray<string>)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  if(new Set(clanTags).size!==clanTags.length)return yield* new InvalidRequest({message:"Clan order contains duplicates"})
  return yield* sql.withTransaction(Effect.gen(function*(){
    yield* lockServerClanOrder(serverId)
    if(categoryId && !(yield* sql`SELECT id FROM server_clan_categories WHERE server_id=${serverId} AND id=${categoryId}::uuid`).length)return yield* new NotFound({message:"Category not found in this server"})
    const current=yield* sql<{tag:string}>`SELECT tag FROM server_clans WHERE server_id=${serverId} AND category_id IS NOT DISTINCT FROM ${categoryId}::uuid`
    if(current.length!==clanTags.length || current.some(row=>!clanTags.includes(row.tag)))return yield* new InvalidRequest({message:"Clan order changed. Reload and include every clan in this category exactly once"})
    for(const [position,tag] of clanTags.entries())yield* sql`UPDATE server_clans SET position=${position} WHERE server_id=${serverId} AND tag=${tag}`
    return {clanTags:[...clanTags]}
  }))
})
