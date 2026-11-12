import { BotMemberPanelsEndpoint, DecimalSnowflake, TicketPanelMessage, DiscordEmbed } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ServerAuthorization } from "./server-authorization.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment } from "./environment.js"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { lockServerDiscordResources } from "./discord-managed-resources.js"
const keyFor = (name:string) => Effect.promise(async()=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(name)))).map(n=>n.toString(16).padStart(2,"0")).join("").slice(0,12))
const Channel = Schema.Struct({id:DecimalSnowflake,guild_id:DecimalSnowflake,type:Schema.Number,thread_metadata:Schema.optionalKey(Schema.Struct({locked:Schema.optionalKey(Schema.Boolean),archived:Schema.optionalKey(Schema.Boolean)}))})
const Guild = Schema.Struct({name:Schema.String,icon:Schema.optionalKey(Schema.NullOr(Schema.String))})
const clean=(text:string)=>text.replace(/[\\`*_~|<>\r\n]/gu," ").slice(0,200)
export const dispatchBotMemberPanels=(request:Request)=>Effect.gen(function*(){
  const url=new URL(request.url),match=/^\/v2\/bot\/servers\/(\d+)\/member-panels$/u.exec(url.pathname)
  if(request.method!=="POST"||!match)return undefined
  if(url.search)return yield* new InvalidRequest({message:"Unexpected query parameters"})
  const body=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(BotMemberPanelsEndpoint.body)),Effect.mapError(()=>new InvalidRequest({message:"Invalid member panel request"})))
  const server=match[1]!
  yield* (yield* ServerAuthorization).requireBotActor(request,server,body.actorId,{section:"panels",write:true})
  const sql=yield* SqlClient.SqlClient,discord=yield* DiscordApi,bindings=yield* WorkerEnvironment
  const embeds=yield* sql<{name:string;data:unknown}>`SELECT name,data FROM server_custom_embeds WHERE server_id=${server} ORDER BY name`
  const choices=yield* Effect.all(embeds.map(row=>keyFor(row.name).pipe(Effect.map(key=>({name:row.name,key})))) )
  if(body.action==="options")return Response.json({kind:"options",embeds:choices},{headers:{"Cache-Control":"no-store"}})
  if(new Set(body.buttons).size!==body.buttons.length)return yield* new InvalidRequest({message:"Choose each button only once"})
  const channel=yield* discord.request(`/channels/${body.channelId}`).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Channel)),Effect.mapError(cause=>cause instanceof NotFound?new InvalidRequest({message:"Choose a channel in this server"}):cause))
  if(channel.guild_id!==server||![0,5,10,11,12].includes(channel.type))return yield* new InvalidRequest({message:"Choose a text channel or thread in this server"})
  if(channel.thread_metadata?.locked||channel.thread_metadata?.archived)return yield* new InvalidRequest({message:"Choose an open, unlocked thread"})
  const guild=yield* discord.request(`/guilds/${server}`).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Guild)),Effect.mapError(cause=>new UpstreamUnavailable({cause,message:"Server details could not be loaded"})))
  const settings=yield* sql<{embed_color:string|null}>`SELECT embed_color FROM servers WHERE id=${server}`
  const rawColor=settings[0]?.embed_color??"2829617",parsedColor=rawColor.startsWith("#")?Number.parseInt(rawColor.slice(1),16):Number(rawColor)
  const color=Number.isInteger(parsedColor)&&parsedColor>=0&&parsedColor<=0xffffff?parsedColor:2829617,name=clean(guild.name)
  let savedName:string|undefined,content:string|undefined,card:ReadonlyArray<Schema.Schema.Type<typeof DiscordEmbed>>
  if(body.embedKey){
    const selected=choices.flatMap((choice,i)=>choice.key===body.embedKey?[embeds[i]!]:[])
    if(selected.length!==1)return yield* new InvalidRequest({message:"That saved embed changed. Run /buttons again"})
    savedName=selected[0]!.name
    const saved=yield* Schema.decodeUnknownEffect(TicketPanelMessage)(selected[0]!.data).pipe(Effect.mapError(()=>new InvalidRequest({message:"Choose a classic saved embed for these buttons"})))
    if(saved.flags===32768)return yield* new InvalidRequest({message:"Choose a classic saved embed for these buttons"})
    card=saved.embeds??[];content=saved.content
    if(!card.length&&!content)return yield* new InvalidRequest({message:"The saved embed is empty"})
  }else{
    const only=body.buttons.length===1?body.buttons[0]:body.buttons.length===2&&body.buttons.includes("Link Button")&&body.buttons.includes("Link Help Button")?"Link Button":"other"
    const description=body.welcome?`**Welcome to ${name}!**\nUse the buttons below to get started.`:only==="Link Button"||only==="Link Help Button"?"To link your account, press the link button below to get started.":only==="Refresh Button"?"To refresh your roles, press the refresh button below.":only==="To-Do Button"?"To view your account to-do list click the button below!\n> Clan Games\n> War Hits\n> Raid Hits\n> Inactivity\n> Legend Hits":only==="Roster Button"?"To view all the rosters you are on & the group (Main, Benched, etc) & clans your accounts are in, press the button below.":"Use the buttons below to view info about your accounts."
    card=[{...(!body.welcome&&["Link Button","Link Help Button","Refresh Button"].includes(only!)?{title:`Welcome to ${name}!`}:{}),description,color,...(guild.icon?{thumbnail:{url:`https://cdn.discordapp.com/icons/${server}/${guild.icon}.png`}}:{})}]
  }
  // Saved embeds cannot supply their own buttons, files or mention policy.
  // Every persistent action resolves the clicker, never this panel's creator.
  const emojis=yield* discord.request(`/applications/${bindings.DISCORD_CLIENT_ID}/emojis`).pipe(Effect.catch(()=>Effect.succeed({items:[]})))
  const inventory=(emojis as {items?:Array<{id:string;name:string;animated?:boolean}>}).items??[]
  const icon=(name:string,fallback:string)=>{const item=inventory.find(item=>item.name===name&&/^\d+$/u.test(item.id));return item?{id:item.id,name:item.name,...(item.animated?{animated:true}:{})}:{name:fallback}}
  const definitions={"Link Button":{label:"Link Account",action:"link",emoji:{name:"🔗"}},"Link Help Button":{label:"Help",action:"help",emoji:{name:"❓"}},"Refresh Button":{label:"Refresh Roles",action:"refresh",emoji:icon("refresh","🔄")},"To-Do Button":{label:"To-Do List",action:"todo",emoji:icon("green_check","✅")},"Roster Button":{label:"My Rosters",action:"rosters",emoji:icon("calendar","📅")}}
  const style={Blue:1,Grey:2,Green:3,Red:4}[body.buttonColor]
  const components=[{type:1,components:body.buttons.map(button=>({type:2,style,custom_id:`ck:quick:${server}:${definitions[button].action}`,label:definitions[button].label,emoji:definitions[button].emoji}))}]
  const message={...(content?{content}:{}),embeds:card,components,allowed_mentions:{parse:[]}}
  yield* Schema.decodeUnknownEffect(TicketPanelMessage)(message).pipe(Effect.mapError(()=>new InvalidRequest({message:"The saved embed exceeds Discord message limits"})))
  if(body.welcome){
    // Store the same canonical panel config as Dashboard. No second automation
    // store, delivery ledger or alternate member-join handler is introduced.
    yield* sql.withTransaction(Effect.gen(function*(){
      yield* lockServerDiscordResources(server)
      yield* sql`INSERT INTO server_welcome_panels(server_id,embed_name,button_color,welcome_channel_id,updated_at) VALUES(${server},${savedName??null},${body.buttonColor},${channel.id},now()) ON CONFLICT(server_id) DO UPDATE SET embed_name=EXCLUDED.embed_name,button_color=EXCLUDED.button_color,welcome_channel_id=EXCLUDED.welcome_channel_id,updated_at=now()`
      yield* sql`DELETE FROM server_welcome_panel_buttons WHERE server_id=${server}`
      for(const [position,button]of body.buttons.entries())yield* sql`INSERT INTO server_welcome_panel_buttons(server_id,button_name,position) VALUES(${server},${button},${position})`
    }))
    return Response.json({kind:"welcome",channelId:channel.id,preview:message},{headers:{"Cache-Control":"no-store"}})
  }
  const posted=yield* discord.request(`/channels/${channel.id}/messages`,{method:"POST",body:message}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({id:DecimalSnowflake}))),Effect.mapError(cause=>cause instanceof InvalidRequest?cause:new UpstreamUnavailable({cause,message:"The panel could not be posted. Check the channel before trying again"})))
  return Response.json({kind:"posted",channelId:channel.id,messageId:posted.id,preview:message},{headers:{"Cache-Control":"no-store"}})
}).pipe(Effect.catchTag("SchemaError",cause=>Effect.fail(new UpstreamUnavailable({cause,message:"Discord channel response failed schema validation"}))),Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Member panel configuration failed"}))))
