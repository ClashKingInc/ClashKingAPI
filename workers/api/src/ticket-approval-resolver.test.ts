import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { UpstreamUnavailable } from "./errors.js"
import { resolveTicketApproval, TicketApprovalGuildCounts } from "./ticket-approval-resolver.js"
import type { StaffTicketSnapshot } from "./ticket-staff-runtime.js"
import { SqlClient, Statement } from "effect/unstable/sql"
import { Reactivity } from "effect/unstable/reactivity"

const ticket: StaffTicketSnapshot = { id: "00000000-0000-4000-8000-000000000001", server_id: "123", channel_id: "234",
  panel_id: "00000000-0000-4000-8000-000000000002", applicant_user_id: "345", thread_id: null, status: "open", number: 5,
  naming_convention: "ticket", applicant_accounts: ["#PQL"], data: {}, panel_name: "Panel", panel_revision: "revision", assigned_clan_tag: "#PYL" }
const applicationId = "456"
const noSql = Layer.effect(SqlClient.SqlClient, SqlClient.make({ acquirer: Effect.die("Unexpected approval SQL query"),
  compiler: Statement.makeCompilerSqlite(), spanAttributes: [] })).pipe(Layer.provide(Reactivity.layer))
const setup = (options: { player?: unknown; clan?:unknown; clanResponse?:Response; count?: number; countUnavailable?: boolean; mismatchUser?: boolean } = {}) => {
  const fetch = vi.fn(async (request: Request) => {
    if (request.url.includes("/players/")) return Response.json(options.player ?? { tag: "#PQL", name: "Player {custom}", townHallLevel: 8,
      heroes: [{ name: "Barbarian King", level: 20, village: "home" }], heroEquipment: [{ name: "Barbarian Puppet", level: 18, maxLevel: 18 }] })
    if (request.url.includes("/clans/")) return options.clanResponse ?? Response.json(options.clan ?? { tag: "#PYL", name: "Clan", clanLevel: 20, members: 50,
      location: { name: "International" }, warLeague: { name: "Champion League I" }, capitalLeague: { name: "Titan League I" },
      memberList: [{ tag: "#PYY", name: "Leader", role: "leader" }] })
    throw new Error(`Unexpected fetch ${request.url}`)
  })
  const request = vi.fn((path: string) => {
    if (path === "/users/345") return Effect.succeed({ id: options.mismatchUser ? "999" : "345", username: "Applicant" })
    if (path === "/guilds/123") return Effect.succeed({ id: "123", name: "Guild", approximate_member_count: 9999 })
    if (path === `/applications/${applicationId}/emojis`) return Effect.succeed({ items:
      ["blank", "barbarian_king", "gold_20", "barbarian_puppet", "gold_18"].map((name, index) => ({ id: String(500 + index), name })) })
    return Effect.die(`Unexpected Discord ${path}`)
  })
  const exact = vi.fn(() => options.countUnavailable ? Effect.fail(new UpstreamUnavailable({ cause: undefined, message: "Exact count unavailable" })) : Effect.succeed(options.count ?? 42))
  const bindings = { DISCORD_APPLICATION_ID: applicationId, CLASH_PROXY: { fetch } }
  const layer = Layer.mergeAll(Layer.succeed(DiscordApi, { request, token: () => Effect.die("Unexpected OAuth") }),
    Layer.succeed(TicketApprovalGuildCounts, { exact }), noSql)
  // These unit cases never request the SQL-backed leader mention; any accidental
  // query fails through the sentinel acquirer, without a database or a type cast.
  const run = (template: string) => Effect.runPromise(resolveTicketApproval(ticket, template, bindings).pipe(Effect.provide(layer)))
  return { fetch, request, exact, layer, run }
}

describe("ticket approval live provider projection", () => {
  it.each([false,true])("cancels a failed Clash response and preserves its error when cancellation rejects=%s",async(rejectCancel)=>{
    const cancel=vi.fn(async()=>{if (rejectCancel) throw new Error("Cleanup rejected")})
    const fixture=setup({clanResponse:new Response(new ReadableStream<Uint8Array>({cancel},{highWaterMark:0}),{status:503})})
    await expect(fixture.run("{clan_leader}")).rejects.toMatchObject({_tag:"UpstreamUnavailable",message:"Ticket approval Clash snapshot is unavailable"})
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  it("rejects multiple leaders or duplicate account identities instead of choosing an arbitrary leader",async()=>{
    const leader={tag:"#PYY",name:"Leader",role:"leader"},member={tag:"#PQY",name:"Member",role:"member"}
    for (const memberList of [[leader,{...leader,tag:"#PQU"}],[leader,leader],[leader,member,member]]) {
      const fixture=setup({clan:{tag:"#PYL",name:"Clan",clanLevel:20,members:memberList.length,memberList}})
      await expect(fixture.run("{clan_leader}")).rejects.toMatchObject({_tag:"UpstreamUnavailable",message:"Ticket clan leader snapshot is unavailable"})
    }
  })
  it("does not fetch unrelated providers for ticket-only or custom-only templates", async () => {
    const fixture = setup()
    const result = await fixture.run("{ticket_count} {user_mention} {custom}")
    expect(result).toEqual({ builtins: { ticket_count: "5", user_mention: "<@345>" }, userMentions: ["345"] })
    expect(fixture.fetch).not.toHaveBeenCalled(); expect(fixture.request).not.toHaveBeenCalled(); expect(fixture.exact).not.toHaveBeenCalled()
  })
  it("projects live player/all equipment, clan, application emojis and exact count without a write", async () => {
    const fixture = setup()
    const result = await fixture.run("{account_name} {account_th} {account_heroes} {clan_name} {clan_badge_emoji} {clan_leader} {user_name} {server_name} {server_member_count}")
    expect(result.builtins).toMatchObject({ account_name: "Player {custom}", account_th: "8", clan_name: "Clan", clan_badge_emoji: "<:blank:500>",
      clan_leader: "Leader", user_name: "Applicant", server_name: "Guild", server_member_count: "42" })
    expect(result.builtins.account_heroes).toBe("<:barbarian_king:501><:gold_20:502> | <:barbarian_puppet:503><:gold_18:504>\n")
    expect(result.userMentions).toEqual([])
    expect(fixture.exact).toHaveBeenCalledExactlyOnceWith(applicationId, "123")
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
    for (const [request] of fixture.fetch.mock.calls) expect(request.method).toBe("GET")
  })
  it("accepts known zero but fails unavailable count instead of using the REST approximate count", async () => {
    const known = setup({ count: 0 }), unavailable = setup({ countUnavailable: true })
    const invoke = (fixture: ReturnType<typeof setup>) => fixture.run("{server_name} {server_member_count}")
    expect((await invoke(known)).builtins.server_member_count).toBe("0")
    await expect(invoke(unavailable)).rejects.toMatchObject({ _tag: "UpstreamUnavailable", message: "Exact count unavailable" })
  })
  it("rejects provider identity mismatches and malformed player snapshots", async () => {
    for (const fixture of [setup({ mismatchUser: true }), setup({ player: { tag: "#PYL", name: "Wrong", townHallLevel: 8, heroes: [] } }), setup({ player: {} })]) {
      await expect(fixture.run("{user_name} {account_name}")).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    }
  })
})
