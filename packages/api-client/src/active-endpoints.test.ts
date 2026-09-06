import * as contracts from "@clashking/api-contracts"
import { Effect } from "effect"
import { describe, expect, expectTypeOf, it, vi } from "vitest"

import { createApiClient, serviceBindingTransport } from "./index.js"

describe("active shared-client contract surface", () => {
  it("leaves Tenor rendering in the existing Dashboard Worker", () => {
    expect(contracts).not.toHaveProperty("TenorMediaEndpoint")
    expect(contracts.endpoints).not.toHaveProperty("tenorMedia")
    expectTypeOf<Extract<keyof typeof contracts.endpoints, "tenorMedia">>().toEqualTypeOf<never>()
  })
  it("excludes new roster-member configuration methods without removing original roster groups", () => {
    type DeferredKeys = "dashboardRosterMemberGroups" | "dashboardCreateRosterMemberGroup" |
      "dashboardUpdateRosterMemberGroup" | "dashboardDeleteRosterMemberGroup" | "dashboardReplaceRosterMemberGroups"
    expectTypeOf<Extract<keyof typeof contracts.dashboardEndpoints, DeferredKeys>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<keyof typeof contracts.endpoints, DeferredKeys>>().toEqualTypeOf<never>()
    for (const map of [contracts.dashboardEndpoints, contracts.endpoints]) {
      expect(Object.values(map).some(({ path }) => path.includes("/roster-member-groups") || path.endsWith("/member-groups"))).toBe(false)
    }
    expect([
      contracts.dashboardEndpoints.dashboardCreateRosterGroup,
      contracts.dashboardEndpoints.dashboardListRosterGroups,
      contracts.dashboardEndpoints.dashboardGetRosterGroup,
      contracts.dashboardEndpoints.dashboardUpdateRosterGroup,
      contracts.dashboardEndpoints.dashboardDeleteRosterGroup,
      contracts.dashboardEndpoints.dashboardRosterAccountGroupsQuery,
    ].map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /v2/roster-group", "GET /v2/roster-group/list", "GET /v2/roster-group/:groupId",
      "PATCH /v2/roster-group/:groupId", "DELETE /v2/roster-group/:groupId", "POST /v2/roster/account-groups/query",
    ])
  })

  it("does not offer the deferred Discord orchestration operations to clients", () => {
    expectTypeOf<Extract<keyof typeof contracts.botEndpoints,
      "giveawayEnter" | "ticketOpenPrepare" | "ticketAction" | "rosterAction">>().toEqualTypeOf<never>()
    expectTypeOf<Extract<keyof typeof contracts.endpoints, "ticketMessageEvent">>().toEqualTypeOf<never>()
    for (const map of [contracts.botEndpoints, contracts.endpoints]) {
      expect(Object.values(map).some(({ path }) => path.startsWith("/v2/runtime/"))).toBe(false)
    }
    expect(contracts).not.toHaveProperty("TicketMessageEventEndpoint")
    expect(contracts).not.toHaveProperty("GiveawayEnterEndpoint")
    expect(contracts).not.toHaveProperty("RosterActionEndpoint")
  })

  it("still executes an established bot contract through the shared transport", async () => {
    const response = { message: "Account unlinked" }
    const fetch = vi.fn(async (_request: Request) => Response.json(response))
    const client = createApiClient({ transport: serviceBindingTransport({ fetch }) })
    expect(await Effect.runPromise(client.execute(contracts.botEndpoints.unlinkAccount, {
      path: { userId: "123456789012345678", tag: "#P0Y" }, query: {}, body: {},
    }))).toEqual(response)
    const request = fetch.mock.calls[0]![0]
    expect(request.method).toBe("DELETE")
    expect(new URL(request.url).pathname).toBe("/v2/links/123456789012345678/%23P0Y")
  })

  it("offers only the canonical Dashboard channels endpoint and preserves its response", async () => {
    expectTypeOf<Extract<keyof typeof contracts.dashboardEndpoints, "serverDiscordChannels">>().toEqualTypeOf<never>()
    expect(contracts).not.toHaveProperty("ServerDiscordChannelsEndpoint")
    for (const map of [contracts.dashboardEndpoints, contracts.endpoints]) {
      expect(map).not.toHaveProperty("serverDiscordChannels")
      expect(Object.values(map).some(({ path }) => path.endsWith("/discord-channels"))).toBe(false)
    }
    expect(contracts.dashboardEndpoints.serverChannels).toBe(contracts.ServerChannelsEndpoint)
    const response = [{ id: "222222222222222222", name: "general", type: "text" }]
    const fetch = vi.fn(async (_request: Request) => Response.json(response))
    const client = createApiClient({ transport: serviceBindingTransport({ fetch }) })
    expect(await Effect.runPromise(client.execute(contracts.dashboardEndpoints.serverChannels, {
      path: { serverId: "123456789012345678" }, query: {}, body: {},
    }))).toEqual(response)
    const request = fetch.mock.calls[0]![0]
    expect(request.method).toBe("GET")
    expect(new URL(request.url).pathname).toBe("/v2/server/123456789012345678/channels")
  })
})
