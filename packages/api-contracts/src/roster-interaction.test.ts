import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { rosterInteractionEndpoints, RosterActionEndpoint, RosterOperationStatusEndpoint } from "./roster-interaction.js"

const id="70000000-0000-4000-8000-000000000001",rosterId="71000000-0000-4000-8000-000000000001"
describe("persistent roster interaction contracts",()=>{
  it("declares exactly five proof-only canonical Bot endpoints",()=>{
    const endpoints=Object.values(rosterInteractionEndpoints)
    expect(endpoints).toHaveLength(5)
    expect(new Set(endpoints.map(endpoint=>endpoint.operationId)).size).toBe(5)
    for(const endpoint of endpoints){
      expect(endpoint).toMatchObject({auth:"bot",method:"POST",bodyMode:"json",successStatus:200})
      expect(Schema.is(endpoint.body)({rosterId,actorId:"123456789012345678"})).toBe(false)
      expect(Schema.is(endpoint.body)({interaction:{rawBody:"{}",timestamp:"1788480000",signature:"a".repeat(128)}})).toBe(true)
    }
  })
  it("requires scoped action receipts and rejects oversized or empty forms",()=>{
    const receipt={outcome:"accepted",operationId:id,rosterId,action:"signup",state:"submitted",statusCustomId:`ck:roster:status:${id}`}
    expect(Schema.is(RosterActionEndpoint.response)(receipt)).toBe(true)
    expect(Schema.is(RosterActionEndpoint.response)({...receipt,action:undefined})).toBe(false)
    expect(Schema.is(RosterActionEndpoint.response)({...receipt,statusCustomId:undefined})).toBe(false)
    const form={kind:"string_select",customId:`ck:roster:group:${id}:0`,content:"Choose a group",placeholder:"Group",minValues:1,maxValues:1,
      options:[{value:"main",label:"Main"}]}
    const ready={outcome:"ready",operationId:id,rosterId,action:"signup",expiresAt:"2026-09-04T05:00:00.000Z",form}
    expect(Schema.is(RosterActionEndpoint.response)(ready)).toBe(true)
    expect(Schema.is(RosterActionEndpoint.response)({...ready,form:{...form,options:[]}})).toBe(false)
    expect(Schema.is(RosterActionEndpoint.response)({...ready,form:{...form,options:Array.from({length:26},()=>form.options[0])}})).toBe(false)
    expect(Schema.is(RosterOperationStatusEndpoint.response)({operationId:id,rosterId,action:"publish",state:"completed",messageId:"123456789012345678"})).toBe(true)
  })
})
