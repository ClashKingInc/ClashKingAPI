import { DiscordEmbed } from "@clashking/api-contracts"
import { Schema } from "effect"

export type TicketEmbed = typeof DiscordEmbed.Type
const object=(value:unknown):Record<string,unknown>=>typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string,unknown> : {}
const invalid=()=>new Error("Ticket welcome embeds exceed supported Discord limits")
export const ticketEmbedTextLength=(embed:TicketEmbed):number=>(embed.title?.length ?? 0)+(embed.description?.length ?? 0)
  +(embed.footer?.text.length ?? 0)+(embed.author?.name.length ?? 0)
  +(embed.fields ?? []).reduce((size,field)=>size+field.name.length+field.value.length,0)

/** Use only the canonical embed fields, never webhook identities, mentions,
 * components or attachment declarations supplied with a saved template. */
export const validateTicketEmbeds=(value:unknown):ReadonlyArray<TicketEmbed>=>{
  const embeds=Schema.decodeUnknownSync(Schema.Array(DiscordEmbed))(value)
  if (embeds.length>100) throw invalid()
  for (const embed of embeds) {
    if ((embed.title?.length ?? 0)>256 || (embed.description?.length ?? 0)>4096 || (embed.fields?.length ?? 0)>25
      || (embed.footer?.text.length ?? 0)>2048 || (embed.author?.name.length ?? 0)>256
      || embed.fields?.some(field=>field.name.length>256 || field.value.length>1024 || !field.name.trim() || !field.value.trim())
      || ticketEmbedTextLength(embed)>6000) throw invalid()
    if (embed.color !== undefined && (!Number.isInteger(embed.color) || embed.color<0 || embed.color>0xffffff)) throw invalid()
    if (embed.timestamp !== undefined && !Number.isFinite(Date.parse(embed.timestamp))) throw invalid()
    for (const value of [embed.url,embed.image?.url,embed.thumbnail?.url,embed.author?.url,embed.author?.icon_url,embed.footer?.icon_url]) {
      if (value === undefined) continue
      // Attachment references cannot resolve without an upload into the newly
      // created message. Do not silently emit broken attachment:// URLs.
      const url=new URL(value)
      if (!["https:","http:"].includes(url.protocol) || url.username || url.password) throw invalid()
    }
    if (!ticketEmbedTextLength(embed) && !embed.image && !embed.thumbnail) throw invalid()
  }
  return embeds
}

export const ticketWelcomeEmbeds=(configured?:unknown):ReadonlyArray<TicketEmbed>=>{
  if (configured === undefined) return [{description:"This ticket will be handled shortly!\nPlease be patient.",color:3066993}]
  const data=object(configured)
  // Both are current saved-editor shapes. The legacy ticket used only embeds;
  // no arbitrary saved webhook content or mention policy crosses this boundary.
  const embeds=Array.isArray(data.messages) ? data.messages.flatMap(message=>{
    const values=object(object(message).data).embeds
    if (!Array.isArray(values)) throw invalid()
    return values
  }) : data.embeds
  return validateTicketEmbeds(embeds)
}

export const ticketOpeningEmbedPages=(intro:ReadonlyArray<TicketEmbed>,questions:ReadonlyArray<string>,answers:ReadonlyArray<string>,accounts:ReadonlyArray<string>):ReadonlyArray<ReadonlyArray<TicketEmbed>>=>{
  const sections=questions.map((question,index)=>`**${index+1}. ${question}**\n> ${answers[index] ?? ""}`)
  if (accounts.length) sections.unshift(`**Accounts**\n${accounts.map(tag=>`\`${tag}\``).join(", ")}`)
  let description=sections.join("\n\n")
  const embeds:TicketEmbed[]=[...validateTicketEmbeds(intro)]
  while (description.length) {
    let end=Math.min(4096,description.length)
    if (end<description.length && /[\uD800-\uDBFF]/u.test(description[end-1]!)) end--
    embeds.push({title:"Ticket application",description:description.slice(0,end)})
    description=description.slice(end)
  }
  const pages:TicketEmbed[][]=[[]]
  let size=0
  for (const embed of embeds) {
    const next=ticketEmbedTextLength(embed),current=pages[pages.length-1]!
    // Discord deduplicates equal embed URLs in one message. A new page keeps
    // distinct configured embeds visible without stripping their links.
    if (current.length>=10 || size+next>6000 || embed.url && current.some(value=>value.url === embed.url)) {
      pages.push([]);size=0
    }
    pages[pages.length-1]!.push(embed);size+=next
  }
  return pages
}
