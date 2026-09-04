import { describe,expect,it } from "vitest"
import { ticketApplicantPermissions,ticketModeratorPermissions,ticketPermissionOverwrites } from "./ticket-permissions.js"
const bits=(value:string)=>Array.from({length:64},(_,i)=>i).filter(i=>(BigInt(value)&(1n<<BigInt(i)))!==0n)
describe("ticket permission overwrites",()=>{
  it("grants the retained applicant conversation rights without TTS or staff thread management",()=>{
    expect(bits(ticketApplicantPermissions)).toEqual([6,10,11,14,15,16,18])
  })
  it("preserves high-bit moderator thread and command rights without granting administrator",()=>{
    expect(bits(ticketModeratorPermissions)).toEqual([4,6,10,11,13,15,16,18,31,38])
  })
  it("denies everyone ticket visibility and deduplicates staff roles",()=>{
    expect(ticketPermissionOverwrites("1","2",["3","3"])).toEqual([
      {id:"1",type:0,deny:"1024",allow:"262144"},{id:"2",type:1,deny:"0",allow:ticketApplicantPermissions},
      {id:"3",type:0,deny:"0",allow:ticketModeratorPermissions},
    ])
  })
  it("rejects everyone as a moderator instead of overriding the visibility denial",()=>{
    expect(()=>ticketPermissionOverwrites("1","2",["1"])).toThrow("everyone")
  })
})
