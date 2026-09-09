import { describe, expect, it } from "vitest"
import { ticketChannelName } from "./ticket-channel-name.js"
const values = {number:42,user:"Applicant",accountName:"Player",accountTownhall:17,status:"open" as const}
describe("ticket channel names",()=>{
  it("retains all six opening and status tokens",()=>{
    expect(ticketChannelName("{ticket_count}-{user}-{account_name}-{account_th}-{ticket_status}-{emoji_status}",values)).toBe("42-Applicant-Player-17-open-✅")
    expect(ticketChannelName("{ticket_status}-{emoji_status}",{...values,status:"sleep"})).toBe("sleep-💤")
    expect(ticketChannelName("{ticket_status}-{emoji_status}",{...values,status:"closed"})).toBe("closed-❌")
  })
  it("preserves international names and treats inserted template-like text literally",()=>{
    expect(ticketChannelName("{user}-{account_name}-{ticket_count}-{custom}",{...values,user:"{ticket_count}",accountName:"你好 💫"})).toBe("{ticket_count}-你好-💫-42-{custom}")
  })
  it("handles missing accounts and empty names with a stable bounded fallback",()=>{
    expect(ticketChannelName("{account_name}{account_th}",{...values,accountName:"",accountTownhall:null})).toBe("ticket-42")
    expect(ticketChannelName("",values)).toBe("42-Applicant")
    expect(ticketChannelName("   ",values)).toBe("ticket-42")
  })
  it("never splits a surrogate pair at the 100-unit channel name limit",()=>{
    const name=ticketChannelName("a".repeat(99)+"😀",values)
    expect(name).toBe("a".repeat(99))
    expect(ticketChannelName("💫".repeat(60),values)).toBe("💫".repeat(50))
  })
})
