import { describe, expect, it } from "vitest"
import { approvalCustomFields, approvalFieldPages, renderApprovalMessages, ticketApprovalTokens } from "./ticket-approval-template.js"

describe("ticket approval template rendering",()=>{
  it("recognizes every retained builtin and preserves all ordered unique custom fields",()=>{
    const template=`${ticketApprovalTokens.map(token=>`{${token}}`).join(" ")} {one} {two} {three} {four} {five} {six} {seven} {one}`
    expect(approvalCustomFields(template)).toEqual(["one","two","three","four","five","six","seven"])
    const pages=approvalFieldPages(template)
    expect(pages.map(page=>page.length)).toEqual([5,2])
    expect(pages.flat().map(field=>field.customId)).toEqual(Array.from({length:7},(_,index)=>`approval-field:${index}`))
    const builtins=Object.fromEntries(ticketApprovalTokens.map(token=>[token,token.toUpperCase()]))
    const answers=Object.fromEntries(approvalCustomFields(template).map(token=>[token,token]))
    expect(renderApprovalMessages(template,builtins,answers).join("")).toBe(`${ticketApprovalTokens.map(token=>token.toUpperCase()).join(" ")} one two three four five six seven one`)
  })
  it("does not recursively expand untrusted player names, custom answers or replacement syntax",()=>{
    expect(renderApprovalMessages("{account_name} / {custom}",{account_name:"{clan_name} $&"},{custom:"{user_mention}"}))
      .toEqual(["{clan_name} $& / {user_mention}"])
    expect(()=>renderApprovalMessages("{toString}",{},{})).toThrow("unresolved")
    expect(()=>renderApprovalMessages("{custom}",{},{custom:"x".repeat(76)})).toThrow("1 to 75")
    expect(()=>renderApprovalMessages("{clan_name}",{},{})).toThrow("unresolved")
  })
  it("bounds labels without collapsing distinct field identities and splits long output without losing text",()=>{
    const long="x".repeat(60),fields=approvalFieldPages(`{${long}1} {${long}2}`).flat()
    expect(fields[0]?.label).toHaveLength(45)
    expect(fields.map(field=>field.token)).toEqual([`${long}1`,`${long}2`])
    expect(new Set(fields.map(field=>field.customId)).size).toBe(2)
    const template="a".repeat(1999)+"🌍"+"b".repeat(2100)
    const parts=renderApprovalMessages(template,{},{})
    expect(parts).toHaveLength(3);expect(parts.every(part=>part.length<=2000)).toBe(true)
    expect(parts.join("")).toBe(template);expect(parts[1]?.startsWith("🌍")).toBe(true)
  })
})
