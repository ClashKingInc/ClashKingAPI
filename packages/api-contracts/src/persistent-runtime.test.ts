import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { TicketAccountInteractionEndpoint, TicketOpenPrepareEndpoint } from "./persistent-runtime.js"

const operationId = "00000000-0000-4000-8000-000000000001"
const ticketId = "00000000-0000-4000-8000-000000000002"
const base = { outcome:"ready" as const,operationId,ticketId,action:"open" as const,
  expiresAt:"2026-09-03T23:00:00.000Z" }
const option = { value:"#P0Y",label:"Player" }

describe("persistent ticket runtime contracts", () => {
  it("represents linking before a ticket exists and returns an actor-scoped modal or accepted link", () => {
    const required = { outcome:"link_required",preparationId:operationId,expiresAt:base.expiresAt,
      content:"Link an account, then open a ticket again.",link:{customId:`ck:ticket:link:${operationId}`,label:"Link account"} }
    expect(Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)(required)).toEqual(required)
    const form = { outcome:"form",preparationId:operationId,expiresAt:base.expiresAt,
      form:{kind:"modal",customId:`ck:ticket:link-submit:${operationId}`,title:"Link account",
        fields:[{customId:"player-tag",label:"Player tag",required:true,style:"short",maxLength:20},
          {customId:"api-token",label:"API token",required:false,style:"short",maxLength:100}]} }
    const linked = { outcome:"linked",preparationId:operationId,accountTag:"#P0Y",content:"Account linked. Open a ticket again." }
    for (const value of [form,linked]) {
      expect(Schema.decodeUnknownSync(TicketAccountInteractionEndpoint.response)(value)).toEqual(value)
    }
    expect(Schema.is(TicketOpenPrepareEndpoint.response)({...required,preparationId:"channel-id"})).toBe(false)
    expect(Schema.is(TicketAccountInteractionEndpoint.response)({...linked,accountTag:"invalid"})).toBe(false)
    expect(Schema.is(TicketAccountInteractionEndpoint.response)({...form,form:{...form.form,fields:[]}})).toBe(false)
  })
  it("round-trips bounded Bot-facing account, modal, and continuation descriptors", () => {
    const responses = [
      { ...base,form:{ kind:"account_select",customId:`ck:ticket:accounts:${operationId}`,content:"Select accounts",
        placeholder:"Select account(s)",minValues:1,maxValues:1,options:[option] } },
      { ...base,form:{ kind:"modal",customId:`ck:ticket:answers:${operationId}:0`,title:"Application",
        fields:[{ customId:"q:0",label:"Why us?",required:true,style:"paragraph",maxLength:500 }] } },
      { ...base,form:{ kind:"continue",customId:`ck:ticket:continue:${operationId}:1`,content:"Continue",label:"Continue" } },
    ]
    for (const response of responses) {
      const decoded = Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)(response)
      expect(Schema.encodeUnknownSync(TicketOpenPrepareEndpoint.response)(decoded)).toEqual(response)
    }
  })

  it("rejects descriptors that Discord cannot render safely", () => {
    const field = { customId:"q:0",label:"Question",required:true,style:"paragraph",maxLength:500 }
    expect(() => Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)({ ...base,
      form:{ kind:"modal",customId:"x".repeat(101),title:"Application",fields:[field] } })).toThrow()
    expect(() => Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)({ ...base,
      form:{ kind:"modal",customId:"modal",title:"Application",fields:Array.from({ length:6 },(_,index) => ({ ...field,customId:`q:${index}` })) } })).toThrow()
    expect(() => Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)({ ...base,
      form:{ kind:"account_select",customId:"accounts",content:"Select",placeholder:"Accounts",
        minValues:2,maxValues:2,options:[option] } })).toThrow()
    expect(() => Schema.decodeUnknownSync(TicketOpenPrepareEndpoint.response)({ ...base,
      form:{ kind:"account_select",customId:"accounts",content:"Select",placeholder:"Accounts",
        minValues:1,maxValues:1,options:Array.from({ length:26 },(_,index) => ({ value:String(index),label:String(index) })) } })).toThrow()
  })
})
