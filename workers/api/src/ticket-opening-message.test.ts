import { describe,expect,it } from "vitest"
import { ticketEmbedTextLength,ticketOpeningEmbedPages,ticketWelcomeEmbeds,validateTicketEmbeds } from "./ticket-opening-message.js"

describe("ticket opening embed snapshots",()=>{
  it("uses the retained default intro and only canonical saved embed data",()=>{
    expect(ticketWelcomeEmbeds()).toEqual([{description:"This ticket will be handled shortly!\nPlease be patient.",color:3066993}])
    expect(ticketWelcomeEmbeds({content:"@everyone",allowed_mentions:{parse:["everyone"]},embeds:[{description:"Welcome",unknown:"dropped"}]})).toEqual([{description:"Welcome"}])
    expect(ticketWelcomeEmbeds({messages:[{data:{embeds:[{title:"First"}]}},{data:{embeds:[{title:"Second"}]}}]})).toEqual([{title:"First"},{title:"Second"}])
  })
  it("retains ordered intro, account and answer content while respecting per-embed and message limits",()=>{
    const questions=Array.from({length:6},(_,i)=>`Question ${i+1}`),answers=questions.map(()=>"🛡️".repeat(166))
    const pages=ticketOpeningEmbedPages([{description:"Welcome"},{description:"Staff instructions"}],questions,answers,["#P0Y"])
    const embeds=pages.flat(),application=embeds.slice(2).map(embed=>embed.description).join("")
    expect(application).toBe(`**Accounts**\n\`#P0Y\`\n\n${questions.map((q,i)=>`**${i+1}. ${q}**\n> ${answers[i]}`).join("\n\n")}`)
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(10)
      expect(page.reduce((n,e)=>n+ticketEmbedTextLength(e),0)).toBeLessThanOrEqual(6000)
      for (const embed of page) expect(embed.description?.length ?? 0).toBeLessThanOrEqual(4096)
    }
  })
  it("splits on embed count, total text and duplicate URL without dropping configured embeds",()=>{
    expect(ticketOpeningEmbedPages(Array.from({length:11},(_,i)=>({title:String(i)})),[],[],[]).map(p=>p.length)).toEqual([10,1])
    expect(ticketOpeningEmbedPages([{description:"a".repeat(4000)},{description:"b".repeat(4000)}],[],[],[]).map(p=>p.length)).toEqual([1,1])
    expect(ticketOpeningEmbedPages([{title:"A",url:"https://example.org"},{title:"B",url:"https://example.org"}],[],[],[]).map(p=>p.length)).toEqual([1,1])
  })
  it("rejects unpublishable configured embeds before accepting the application",()=>{
    for (const embeds of [[{description:"x".repeat(4097)}],[{title:"x".repeat(257)}],[{description:"a".repeat(4096),footer:{text:"b".repeat(2048)}}],
      [{fields:Array.from({length:26},()=>({name:"A",value:"B"}))}],[{color:-1,description:"A"}],[{timestamp:"bad",description:"A"}],
      [{image:{url:"attachment://image.png"}}],[{description:"A",url:"javascript:alert(1)"}],[{}]]) expect(()=>validateTicketEmbeds(embeds)).toThrow()
    expect(()=>ticketWelcomeEmbeds({messages:[{data:{content:"No embeds"}}]})).toThrow()
  })
  it("does not split Unicode pairs at a description boundary",()=>{
    const pages=ticketOpeningEmbedPages([],[],[],["x".repeat(4080)+"😀"])
    for (const embed of pages.flat()) expect(embed.description?.isWellFormed()).toBe(true)
  })
})
