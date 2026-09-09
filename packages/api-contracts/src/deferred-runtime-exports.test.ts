import { describe, expect, it } from "vitest"

import * as bot from "./bot.js"
import * as dashboard from "./dashboard.js"
import * as deferred from "./deferred-runtime.js"
import * as expo from "./expo.js"
import * as root from "./index.js"

const deferredDescriptors = [
  ...Object.values(deferred.persistentRuntimeEndpoints),
  ...Object.values(deferred.rosterInteractionEndpoints),
  deferred.TicketMessageEventEndpoint,
]

describe("deferred Discord runtime contract boundary", () => {
  it("keeps exactly nineteen old orchestration descriptors available only for reference", () => {
    expect(deferredDescriptors).toHaveLength(19)
    expect(new Set(deferredDescriptors.map(({ operationId }) => operationId)).size).toBe(19)
    expect(deferredDescriptors.every(({ path }) => path.startsWith("/v2/runtime/"))).toBe(true)
    // The nineteen orchestration descriptors remain separate from the five
    // additional deferred configuration descriptors below. The old board data
    // shape is also reference-only, separate from the retained Dashboard shape.
    expect(deferred).toHaveProperty("DeferredRosterBoardData")
    expect(Object.keys(deferred)).toHaveLength(54)
  })

  it("keeps five new roster configuration descriptors available only for reference", () => {
    expect(Object.values(deferred.rosterConfigurationEndpoints)).toHaveLength(5)
    expect(new Set(Object.values(deferred.rosterConfigurationEndpoints).map(({ operationId }) => operationId)).size).toBe(5)
  })

  const entrypoints: Array<{ name: string; entry: Readonly<Record<string, unknown>> }> = [
    { name: "root", entry: root }, { name: "bot", entry: bot }, { name: "Dashboard", entry: dashboard }, { name: "Expo", entry: expo },
  ]
  it.each(entrypoints)("does not expose deferred schemas or descriptors from $name", ({ entry }) => {
    for (const name of Object.keys(deferred)) expect(entry).not.toHaveProperty(name)
    for (const value of Object.values(entry)) {
      if (typeof value === "object" && value !== null && "path" in value && typeof value.path === "string") {
        expect(value.path.startsWith("/v2/runtime/")).toBe(false)
      }
    }
  })

  it("excludes all deferred routes and operation IDs from every active endpoint map", () => {
    const deferredOperationIds = new Set([...deferredDescriptors, ...Object.values(deferred.rosterConfigurationEndpoints)].map(({ operationId }) => operationId))
    for (const map of [root.endpoints, root.botEndpoints, root.dashboardEndpoints, root.expoEndpoints, root.adminEndpoints]) {
      for (const endpoint of Object.values(map)) {
        expect(endpoint.path.startsWith("/v2/runtime/")).toBe(false)
        expect(deferredOperationIds.has(endpoint.operationId)).toBe(false)
      }
    }
  })

  it("retains baseline bot-adjacent, moderation, media, and transcript-read contracts", () => {
    for (const [name, endpoint] of Object.entries(root.botAdjacentEndpoints)) {
      expect(Reflect.get(root.botEndpoints, name)).toBe(endpoint)
    }
    expect(root.botEndpoints.addStrike).toBe(root.BotAddStrikeEndpoint)
    expect(root.botEndpoints.deleteStrike).toBe(root.BotDeleteStrikeEndpoint)
    expect(root.botEndpoints.saveBan).toBe(root.BotSaveBanEndpoint)
    expect(root.botEndpoints.deleteBan).toBe(root.BotDeleteBanEndpoint)
    expect(root.endpoints.mediaFile).toBe(root.MediaFileEndpoint)
    for (const [name, endpoint] of Object.entries(root.ticketTranscriptEndpoints)) {
      expect(Reflect.get(root.endpoints, name)).toBe(endpoint)
    }
    expect(root.RosterCapacity).toBeDefined()
    expect(root.RosterMemberGroupSetting).toBeDefined()
    expect(root.RosterBuilderMemberGroupSetting).toBeDefined()
  })
})
