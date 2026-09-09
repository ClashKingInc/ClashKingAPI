import { Effect,Schema } from "effect"
import { DiscordApi } from "./discord-api.js"
import { Conflict,Forbidden,UpstreamUnavailable } from "./errors.js"
const Channel=Schema.Struct({id:Schema.String,guild_id:Schema.String,type:Schema.Number,parent_id:Schema.optionalKey(Schema.NullOr(Schema.String))})
export const requireTicketChannel=(serverId:string,id:string)=>Effect.gen(function* () {
  const discord=yield* DiscordApi
  if (!/^\d{1,20}$/u.test(id)) return yield* new Conflict({message:"Stored ticket channel ID is invalid"})
  const channel=yield* discord.request(`/channels/${id}`).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Channel)),
    Effect.catchTag("SchemaError",cause=>Effect.fail(new UpstreamUnavailable({cause,message:"Discord ticket channel lookup returned invalid data"}))))
  if (channel.id !== id || channel.guild_id !== serverId) return yield* new Forbidden({message:"Ticket channel does not belong to this server"})
  return channel
})
/** Category discovery is provider work: run in the effect executor, never while
 * holding the application's preparation transaction or panel lock. */
export const resolveTicketCategory=(serverId:string,parentId?:string,originChannelId?:string)=>Effect.gen(function* () {
  const load=(id:string)=>requireTicketChannel(serverId,id)
  if (parentId) {
    const category=yield* load(parentId).pipe(Effect.catchTag("NotFound",()=>Effect.succeed(undefined)))
    if (category) {
      if (category.type !== 4) return yield* new Conflict({message:"Configured ticket category is not a category"})
      return category.id
    }
  }
  if (!originChannelId) return undefined
  const origin=yield* load(originChannelId)
  const categoryId=origin.parent_id ?? undefined
  if (categoryId !== undefined && !/^\d{1,20}$/u.test(categoryId)) return yield* new UpstreamUnavailable({cause:undefined,message:"Discord ticket parent category is invalid"})
  return categoryId
})
