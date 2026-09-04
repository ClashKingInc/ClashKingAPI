import { describe, expect, it } from "vitest"

import { discordGuildManager, serverAccessAllows } from "./server-authorization.js"

describe("server authorization decisions", () => {
  it("requires manage for writes while allowing a delegated view for reads", () => {
    const access = { manager: false, sections: { links: "view" as const } }
    expect(serverAccessAllows(access, { section: "links" })).toBe(true)
    expect(serverAccessAllows(access, { section: "links", write: true })).toBe(false)
    expect(serverAccessAllows(access, { section: "settings" })).toBe(false)
    expect(serverAccessAllows(access, { managerOnly: true })).toBe(false)
  })

  it("allows delegated manage and full Discord managers", () => {
    expect(serverAccessAllows({ manager: false, sections: { links: "manage" } }, { section: "links", write: true })).toBe(true)
    expect(serverAccessAllows({ manager: true, sections: {} }, { managerOnly: true, write: true })).toBe(true)
  })

  it("evaluates Discord permissions with bigint without truncating high bits", () => {
    expect(discordGuildManager({ owner: false, permissions: "9007199254741024" })).toBe(true)
    expect(discordGuildManager({ owner: false, permissions: "9007199254740992" })).toBe(false)
    expect(discordGuildManager({ owner: false, permissions: "8" })).toBe(true)
    expect(discordGuildManager({ owner: true, permissions: "0" })).toBe(true)
    expect(discordGuildManager({ owner: false, permissions: "invalid" })).toBe(false)
  })
})
