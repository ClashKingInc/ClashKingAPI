import { Effect,Layer } from "effect"
import { describe,expect,it,vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { NotFound,UpstreamUnavailable } from "./errors.js"
import { resolveTicketCategory } from "./ticket-category.js"
const fixture=(responses:Record<string,Record<string,unknown>|NotFound|UpstreamUnavailable>)=>{
  const request=vi.fn((path:string)=>{
    const result=responses[path]
    if (!result) return Effect.die(`Unexpected request ${path}`)
    return result instanceof NotFound || result instanceof UpstreamUnavailable ? Effect.fail(result) : Effect.succeed(result)
  })
  return {request,run:(parent?:string)=>Effect.runPromise(resolveTicketCategory("1",parent,"2").pipe(
    Effect.provide(Layer.succeed(DiscordApi,{request,token:()=>Effect.die("Unexpected OAuth")}))))}
}
describe("ticket category discovery",()=>{
  it("uses the configured same-server category",async()=>{
    const test=fixture({"/channels/3":{id:"3",guild_id:"1",type:4}})
    expect(await test.run("3")).toBe("3");expect(test.request).toHaveBeenCalledTimes(1)
  })
  it("falls back to the panel channel category if unset or authoritatively deleted",async()=>{
    const test=fixture({"/channels/3":new NotFound({message:"Deleted"}),"/channels/2":{id:"2",guild_id:"1",type:0,parent_id:"4"}})
    expect(await test.run()).toBe("4");expect(await test.run("3")).toBe("4")
  })
  it("permits a panel channel with no parent category",async()=>{
    const test=fixture({"/channels/2":{id:"2",guild_id:"1",type:0,parent_id:null}})
    expect(await test.run()).toBeUndefined()
  })
  it("does not hide provider outages behind category fallback",async()=>{
    const test=fixture({"/channels/3":new UpstreamUnavailable({cause:undefined,message:"Outage"})})
    await expect(test.run("3")).rejects.toMatchObject({_tag:"UpstreamUnavailable"});expect(test.request).toHaveBeenCalledTimes(1)
  })
  it("rejects foreign or invalid category targets",async()=>{
    for (const channel of [{id:"3",guild_id:"9",type:4},{id:"3",guild_id:"1",type:0},{id:"8",guild_id:"1",type:4}]) {
      await expect(fixture({"/channels/3":channel}).run("3")).rejects.toHaveProperty("_tag")
    }
  })
})
