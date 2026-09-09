import { RuntimeUUID,TicketPanelPublicationPrepareEndpoint,TicketPanelPublicationStatusEndpoint } from "@clashking/api-contracts/deferred-runtime"
import { Effect,Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict,DatabaseFailure,Forbidden,InvalidRequest,NotFound,RateLimited,UpstreamUnavailable,type ApiFailure } from "./errors.js"
import { requireFreshInteraction,type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

type Prepare=typeof TicketPanelPublicationPrepareEndpoint.response.Type
type Status=typeof TicketPanelPublicationStatusEndpoint.response.Type
interface EffectRow { readonly effect_id:string;readonly panel_id:string;readonly server_id:string;readonly revision:string|number
  readonly source_updated_at:string;readonly channel_id:string;readonly payload:unknown;readonly state:Status["state"]
  readonly claim_token:string|null;readonly expired:boolean;readonly ready:boolean;readonly result_message_id:string|null }
const object=(value:unknown):Record<string,unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string,unknown> : {}
const componentIds=(value:unknown):ReadonlyArray<string>=>{
  const ids:Array<string>=[]
  const visit=(item:unknown):void=>{
    if(Array.isArray(item)){ for(const child of item)visit(child);return }
    const record=object(item)
    if(typeof record.custom_id==="string")ids.push(record.custom_id)
    if(Array.isArray(record.components))visit(record.components)
  }
  visit(value)
  return ids.sort()
}
const digest=(value:string)=>Effect.promise(async()=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map((byte)=>byte.toString(16).padStart(2,"0")).join(""))
const databaseFailure=(cause:unknown)=>new DatabaseFailure({ cause,message:"Ticket panel publication storage is unavailable" })
const decodePanelId=(value:string)=>Schema.decodeUnknownEffect(RuntimeUUID)(value).pipe(Effect.mapError(()=>new InvalidRequest({ message:"Invalid ticket panel ID" })))
const response=(row:Pick<EffectRow,"effect_id"|"panel_id"|"state"|"result_message_id">):Status=>({
  effectId:row.effect_id,panelId:row.panel_id,state:row.state,statusCustomId:`ck:ticket:panel-status:${row.effect_id}`,
  ...(row.result_message_id ? { messageId:row.result_message_id } : {}),
})
const commandOptions=(interaction:VerifiedRuntimeInteraction)=>{
  if(interaction.type!==2||interaction.data.name!=="ticket")return undefined
  const top=(interaction.data.options??[]).map(object).find((option)=>option.name==="panel-post")
  const options=Array.isArray(top?.options)?top.options.map(object):[]
  const panelId=options.find((option)=>option.name==="panel-id")?.value
  return typeof panelId === "string" ? { panelId,channelId:interaction.channelId } : undefined
}
const discordButtons=(panelId:string,value:unknown):ReadonlyArray<Record<string,unknown>>|undefined=>{
  if(!Array.isArray(value)||value.length<1||value.length>5)return undefined
  const buttons:Array<Record<string,unknown>>=[]
  for(const item of value){
    const button=object(item),id=typeof button.id === "string" ? button.id : "",customId=typeof button.custom_id === "string" ? button.custom_id : ""
    if(button.type!==2||!new RegExp(`^ck:ticket:open:${panelId}:[0-9a-f-]{36}$`,"iu").test(customId)||!customId.endsWith(`:${id}`)||
      typeof button.style!=="number"||!Number.isInteger(button.style)||button.style<1||button.style>4||
      typeof button.label!=="string"||button.label.length<1||button.label.length>80)return undefined
    const emoji=object(button.emoji)
    const safeEmoji=typeof emoji.id!=="string"&&typeof emoji.name!=="string"?undefined:{
      ...(typeof emoji.id==="string"?{ id:emoji.id }:{}),...(typeof emoji.name==="string"?{ name:emoji.name }:{}),
      ...(typeof emoji.animated==="boolean"?{ animated:emoji.animated }:{}),
    }
    buttons.push({ type:2,custom_id:customId,style:button.style,label:button.label,
      ...(safeEmoji?{ emoji:safeEmoji }:{}),...(typeof button.disabled==="boolean"?{ disabled:button.disabled }:{}) })
  }
  return buttons
}

export const prepareTicketPanelPublication=(interaction:VerifiedRuntimeInteraction):Effect.Effect<Prepare,ApiFailure,SqlClient.SqlClient>=>Effect.gen(function*(){
  const command=commandOptions(interaction)
  if(!command)return yield* new Forbidden({ message:"A canonical ticket panel-post command is required",reason:"wrong_message" })
  yield* requireFreshInteraction(interaction)
  const permissions=BigInt(interaction.permissions)
  if((permissions&8n)===0n&&(permissions&32n)===0n)return yield* new Forbidden({ message:"Manage Server permission is required" })
  const { panelId,channelId }=command,requestId=interaction.id
  yield* decodePanelId(panelId)
  const sql=yield* SqlClient.SqlClient,effectId=yield* digest(JSON.stringify([panelId,channelId,requestId]))
  return yield* sql.withTransaction(Effect.gen(function*(){
    const existing=(yield* sql<EffectRow>`SELECT effect_id,panel_id::text,server_id,revision,source_updated_at::text,channel_id,payload,state,
      claim_token::text,lease_expires_at<=clock_timestamp() AS expired,next_attempt_at<=clock_timestamp() AS ready,result_message_id
      FROM ticket_panel_publication_effects WHERE effect_id=${effectId}`)[0]
    if(existing){
      if(existing.panel_id!==panelId||existing.channel_id!==channelId)return yield* new Conflict({ message:"Panel publication request identity was reused" })
      const storedPayload=object(existing.payload)
      if(storedPayload.actorUserId!==interaction.actorId||storedPayload.serverId!==interaction.guildId)return yield* new Conflict({ message:"Panel publication request identity was reused" })
      return { effectId,panelId,state:existing.state,statusCustomId:`ck:ticket:panel-status:${effectId}` }
    }
    const panel=(yield* sql<{ server_id:string;name:string;components:unknown;data:unknown;updated_at:string }>`SELECT server_id,name,components,data,updated_at::text
      FROM ticket_panels WHERE id=${panelId}::uuid AND archived_at IS NULL FOR SHARE`)[0]
    if(!panel||panel.server_id!==interaction.guildId)return yield* new NotFound({ message:"Ticket panel not found" })
    const unresolved=yield* sql`SELECT effect_id FROM ticket_panel_publication_effects WHERE panel_id=${panelId}::uuid AND state IN ('pending','executing','uncertain')`
    if(unresolved.length)return yield* new Conflict({ message:"Ticket panel already has an unresolved publication" })
    const components=discordButtons(panelId,panel.components)
    if(!components)return yield* new Conflict({ message:"Ticket panel buttons are not publishable" })
    const data=object(panel.data),embedName=typeof data.embed_name === "string" ? data.embed_name : undefined
    const embed=embedName ? (yield* sql<{ data:unknown }>`SELECT data FROM server_custom_embeds WHERE server_id=${panel.server_id} AND name=${embedName}`)[0]?.data : undefined
    const configured=object(embed),firstMessage=Array.isArray(configured.messages)?object(object(configured.messages[0]).data):configured
    const message={ ...firstMessage,
      ...(typeof firstMessage.content === "string"||Array.isArray(firstMessage.embeds)?{}:{ content:`Open a ${panel.name} ticket using a button below.` }),
      components:[{ type:1,components }],nonce:requestId,enforce_nonce:true,allowed_mentions:{ parse:[] } }
    const payload={ version:1,actorUserId:interaction.actorId,serverId:interaction.guildId,requestId,message }
    if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>262_144)return yield* new Conflict({ message:"Ticket panel publication exceeds the payload limit" })
    const revision=(yield* sql<{ revision:string|number }>`SELECT COALESCE(max(revision),0)+1 AS revision FROM ticket_panel_publication_effects WHERE panel_id=${panelId}::uuid`)[0]?.revision
    if(revision===undefined)return yield* databaseFailure(undefined)
    yield* sql`INSERT INTO ticket_panel_publication_effects(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,payload)
      VALUES(${effectId},${panelId}::uuid,${panel.server_id},${Number(revision)},${panel.updated_at}::timestamptz,${channelId},${JSON.stringify(payload)}::jsonb)`
    return { effectId,panelId,state:"pending" as const,statusCustomId:`ck:ticket:panel-status:${effectId}` }
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(databaseFailure(cause))))

export const ticketPanelPublicationStatus=(effectId:string,interaction?:VerifiedRuntimeInteraction):Effect.Effect<Status,ApiFailure,SqlClient.SqlClient>=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  const row=(yield* sql<EffectRow>`SELECT effect_id,panel_id::text,server_id,revision,source_updated_at::text,channel_id,payload,state,
    claim_token::text,lease_expires_at<=clock_timestamp() AS expired,next_attempt_at<=clock_timestamp() AS ready,result_message_id
    FROM ticket_panel_publication_effects WHERE effect_id=${effectId}`)[0]
  if(!row)return yield* new NotFound({ message:"Ticket panel publication not found" })
  if(interaction){
    const payload=object(row.payload)
    if(interaction.type!==3||interaction.data.component_type!==2||interaction.data.custom_id!==`ck:ticket:panel-status:${effectId}`||
      interaction.guildId!==row.server_id||interaction.actorId!==payload.actorUserId)return yield* new Forbidden({ message:"Panel publication status does not belong to this command",reason:"wrong_message" })
  }
  return response(row)
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(databaseFailure(cause))))

const commitPanelSuccess=(claimed:EffectRow,messageId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*(){
    const current=(yield* sql<EffectRow>`SELECT effect_id,panel_id::text,server_id,revision,source_updated_at::text,channel_id,payload,state,
      claim_token::text,lease_expires_at<=clock_timestamp() AS expired,next_attempt_at<=clock_timestamp() AS ready,result_message_id
      FROM ticket_panel_publication_effects WHERE effect_id=${claimed.effect_id} FOR UPDATE`)[0]
    if(!current||(current.state!=="executing"&&current.state!=="uncertain")||current.claim_token!==claimed.claim_token){
      return yield* new Conflict({ message:"Panel publication claim is no longer owned" })
    }
    yield* sql`UPDATE ticket_panel_publication_effects SET state='succeeded',result_message_id=${messageId},updated_at=clock_timestamp()
      WHERE effect_id=${claimed.effect_id}`
    yield* sql`UPDATE ticket_panel_publications SET state='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE panel_id=${current.panel_id}::uuid AND state='active'`
    yield* sql`INSERT INTO ticket_panel_publications(effect_id,panel_id,server_id,revision,source_updated_at,channel_id,message_id)
      VALUES(${claimed.effect_id},${current.panel_id}::uuid,${current.server_id},${Number(current.revision)},${current.source_updated_at}::timestamptz,${current.channel_id},${messageId})`
    return { effectId:claimed.effect_id,panelId:current.panel_id,state:"succeeded" as const,
      statusCustomId:`ck:ticket:panel-status:${claimed.effect_id}`,messageId }
  }))
})

export const runTicketPanelPublication=(effectId:string):Effect.Effect<Status,ApiFailure,SqlClient.SqlClient|DiscordApi>=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  const claim=yield* sql.withTransaction(Effect.gen(function*(){
    const row=(yield* sql<EffectRow>`SELECT effect_id,panel_id::text,server_id,revision,source_updated_at::text,channel_id,payload,state,
      claim_token::text,lease_expires_at<=clock_timestamp() AS expired,next_attempt_at<=clock_timestamp() AS ready,result_message_id
      FROM ticket_panel_publication_effects WHERE effect_id=${effectId} FOR UPDATE`)[0]
    if(!row)return yield* new NotFound({ message:"Ticket panel publication not found" })
    if(row.state==="succeeded"||row.state==="failed"||row.state==="executing"&&!row.expired||row.state==="pending"&&!row.ready)return {row,send:false}
    if(row.state==="executing"){
      yield* sql`UPDATE ticket_panel_publication_effects SET state='uncertain',last_error='expired_create_claim',updated_at=clock_timestamp() WHERE effect_id=${effectId}`
      return {row:{ ...row,state:"uncertain" as const },send:false}
    }
    if(row.state==="uncertain")return {row,send:false}
    const source=(yield* sql<{ updated_at:string;archived_at:string|null }>`SELECT updated_at::text,archived_at::text FROM ticket_panels
      WHERE id=${row.panel_id}::uuid AND server_id=${row.server_id} FOR SHARE`)[0]
    if(!source||source.archived_at!==null||source.updated_at!==row.source_updated_at){
      yield* sql`UPDATE ticket_panel_publication_effects SET state='failed',last_error='panel_configuration_changed',updated_at=clock_timestamp()
        WHERE effect_id=${effectId}`
      return {row:{ ...row,state:"failed" as const },send:false}
    }
    const token=crypto.randomUUID()
    yield* sql`UPDATE ticket_panel_publication_effects SET state='executing',retry_reason=NULL,claim_token=${token}::uuid,
      claimed_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',attempt_count=attempt_count+1,
      updated_at=clock_timestamp() WHERE effect_id=${effectId}`
    return {row:{ ...row,state:"executing" as const,claim_token:token,expired:false },send:true}
  }))
  const claimed=claim.row
  // Observing another runner's unexpired lease does not transfer ownership.
  // Only this invocation's fresh claim may send; uncertain work only reconciles.
  if(!claim.send&&claimed.state!=="uncertain")return response(claimed)
  const discord=yield* DiscordApi
  if(claimed.state==="uncertain"&&claimed.claim_token){
    const bot=yield* discord.request("/users/@me").pipe(Effect.result)
    const listed=yield* discord.request(`/channels/${claimed.channel_id}/messages?limit=100`).pipe(Effect.result)
    if(bot._tag==="Success"&&typeof object(bot.success).id==="string"&&listed._tag==="Success"&&Array.isArray(listed.success)){
      const payload=object(claimed.payload),requestId=payload.requestId,expectedComponents=componentIds(object(payload.message).components)
      const matches=listed.success.map(object).filter((message)=>message.nonce===requestId&&typeof message.id==="string"&&
        object(message.author).id===object(bot.success).id&&JSON.stringify(componentIds(message.components))===JSON.stringify(expectedComponents))
      if(matches.length===1)return yield* commitPanelSuccess(claimed,matches[0]!.id as string)
    }
    yield* sql`UPDATE ticket_panel_publication_effects SET last_error='reconciliation_no_unique_match',updated_at=clock_timestamp()
      WHERE effect_id=${effectId} AND state='uncertain' AND claim_token=${claimed.claim_token}::uuid`
    return response(claimed)
  }
  if(claimed.state!=="executing"||!claimed.claim_token)return response(claimed)
  const sent=yield* discord.request(`/channels/${claimed.channel_id}/messages`,{ method:"POST",body:object(claimed.payload).message }).pipe(Effect.result)
  if(sent._tag==="Failure"){
    const failure=sent.failure
    if(failure instanceof RateLimited){
      yield* sql`UPDATE ticket_panel_publication_effects SET state='pending',retry_reason='rate_limited',next_attempt_at=clock_timestamp()+(${failure.retryAfterSeconds}*interval '1 second'),
        claim_token=NULL,claimed_at=NULL,lease_expires_at=NULL,last_error='rate_limited',updated_at=clock_timestamp()
        WHERE effect_id=${effectId} AND state='executing' AND claim_token=${claimed.claim_token}::uuid`
      return yield* ticketPanelPublicationStatus(effectId)
    }
    const state=failure instanceof UpstreamUnavailable ? "uncertain" : "failed"
    yield* sql`UPDATE ticket_panel_publication_effects SET state=${state},last_error=${failure._tag},updated_at=clock_timestamp()
      WHERE effect_id=${effectId} AND state='executing' AND claim_token=${claimed.claim_token}::uuid`
    return state==="uncertain" ? yield* runTicketPanelPublication(effectId) : yield* ticketPanelPublicationStatus(effectId)
  }
  const message=yield* Schema.decodeUnknownEffect(Schema.Struct({ id:Schema.String }))(sent.success).pipe(
    Effect.mapError(()=>new UpstreamUnavailable({ cause:undefined,message:"Discord panel message response is invalid" })))
  return yield* commitPanelSuccess(claimed,message.id)
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(databaseFailure(cause))))
