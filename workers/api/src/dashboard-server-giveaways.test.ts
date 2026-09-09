import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { executeDashboardGiveaways, giveawayEntrants, giveawayWinnerValue, parseGiveawayForm } from "./dashboard-server-giveaways.js"
import { DashboardServerOperations, dispatchDashboardServer, type DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { AuthIdentity } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, Forbidden } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import type { WorkerBindings } from "./environment.js"
const form = () => { const value = new FormData(); for (const [key, item] of Object.entries({ prize: "Gold Pass", channel_id: "1334567890123456789", winners: "2", now: "true", end_time: "2026-10-01T12:00:00" })) value.set(key,item); return value }
describe("Giveaway validation and weighted entry reporting", () => {
  it("keeps snowflakes exact and parses timezone-less ISO dates as UTC", async () => {
    const value = await Effect.runPromise(parseGiveawayForm(form(), new Date("2026-09-03T00:00:00Z")))
    expect(value.channelId).toBe("1334567890123456789")
    expect(value.end.toISOString()).toBe("2026-10-01T12:00:00.000Z")
  })
  it("rejects fractional winners, malformed JSON and numeric snowflakes in lists", async () => {
    for (const [key,value] of [["winners","1.5"],["roles_json","[1234567890123456789]"],["mentions_json","oops"],["end_time","2020-01-01T00:00:00Z"]]) {
      const input = form(); input.set(key!,value!)
      await expect(Effect.runPromise(parseGiveawayForm(input,new Date("2026-09-03T00:00:00Z")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
  })
  it("counts weighted duplicate entries in first-seen order", () => {
    expect(giveawayEntrants(["1334567890123456789", { user_id: "2334567890123456789" }, "1334567890123456789"])).toEqual({ totalEntries: 3, uniqueUsers: 2, entrants: [{ userId: "1334567890123456789", entries: 2, winChance: 66.67 }, { userId: "2334567890123456789", entries: 1, winChance: 33.33 }] })
  })
  it("resolves winner identity without rounding IDs and matches the pinned Go avatar behavior", async () => {
    const userId = "1334567890123456789"
    const value = await Effect.runPromise(giveawayWinnerValue("2334567890123456789", { user_id: userId, status: "winner" }, { nick: "Captain", user: { id: userId, username: "captain", discriminator: "1000" } }))
    expect(value).toMatchObject({ userId, username: "Captain", avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`, inServer: true })
  })
  it("uses the stored winner name when absent from the verified complete snapshot, without Discord calls", async () => {
    expect(await Effect.runPromise(giveawayWinnerValue("2334567890123456789", { user_id: "1334567890123456789", username: "Previous winner" })))
      .toMatchObject({ username: "Previous winner", inServer: false })
  })
})

describe("Existing Dashboard reroll without bot publication orchestration", () => {
  const serverId = "1334567890123456789"
  const giveawayId = "11111111-1111-4111-8111-111111111111"
  const oldWinner = "2334567890123456789"
  const newWinner = "3334567890123456789"
  const principal = { kind: "user" as const, userId: "4334567890123456789" }
  const bindings = {} as WorkerBindings
  const request = () => new Request(`https://api.clashk.ing/v2/server/${serverId}/giveaways/${giveawayId}/reroll`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_ids_to_replace: [oldWinner] }),
  })
  const fixture = (options: {
    readonly row?: Readonly<Record<string, unknown>> | null
    readonly writeFailure?: DatabaseFailure
  } = {}) => {
    // These rows deliberately have no Discord publication destination and no
    // bot journals. Only the original servers/giveaways tables are available.
    const row = options.row === null ? undefined : {
      id: giveawayId, server_id: serverId, status: "ended", channel_id: null, message_id: null,
      winners_list: [{ user_id: oldWinner, status: "winner", timestamp: "2026-09-01T00:00:00Z" }],
      entries: [oldWinner, { user_id: newWinner }], ...options.row,
    }
    const query = vi.fn((statement: string, params: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>, unknown> => {
      if (/giveaway_outcome_runs|giveaway_publication_effects/u.test(statement)) {
        return Effect.die(new Error("Dashboard reroll must not read or enqueue bot publication journals"))
      }
      if (statement.includes("SELECT id FROM servers")) {
        expect(statement).toContain("FOR UPDATE")
        expect(params).toEqual([serverId])
        return Effect.succeed([{ id: serverId }])
      }
      if (statement.includes("FROM giveaways WHERE server_id=$1 AND id=$2 FOR UPDATE")) {
        expect(params).toEqual([serverId, giveawayId])
        return Effect.succeed(row === undefined ? [] : [row])
      }
      if (statement.startsWith("UPDATE giveaways SET winners_list=")) {
        expect(params.slice(1)).toEqual([serverId, giveawayId])
        return options.writeFailure ? Effect.fail(options.writeFailure) : Effect.succeed([])
      }
      return Effect.die(new Error(`Unexpected SQL, including any publication-enqueue preflight: ${statement}`))
    })
    let transactions = 0
    const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) => { transactions += 1; return effect }
    const sql = Object.assign((parts: TemplateStringsArray, ...params: ReadonlyArray<unknown>) => query(parts.join("?"), params), {
      unsafe: (statement: string, params: ReadonlyArray<unknown>) => query(statement, params), withTransaction,
    }) as SqlClient.SqlClient
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Reroll must not publish to Discord"))
    const input = (body: unknown = { user_ids_to_replace: [oldWinner] }): DashboardServerOperationInput => ({
      bindings, body, endpoint: dashboardEndpoints.rerollGiveaway, path: { serverId, giveawayId },
      principal, query: {}, request: request(),
    })
    const run = (body?: unknown) => Effect.runPromise(executeDashboardGiveaways(input(body)).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.provideService(DiscordApi, { request: discord, token: () => Effect.die("Unexpected OAuth grant") }),
    ))
    return { query, sql, discord, transactionCount: () => transactions, run }
  }

  it("rerolls using only baseline tables and returns the existing response without publication gating", async () => {
    const { run, query, discord, transactionCount } = fixture()
    await expect(run()).resolves.toEqual({ message: "Winners rerolled successfully", giveawayId, serverId, newWinners: [newWinner] })
    expect(transactionCount()).toBe(1)
    expect(query).toHaveBeenCalledTimes(3)
    const update = query.mock.calls[2]!
    expect(update[0]).toContain("updated_at=now()")
    expect(JSON.parse(String(update[1][0]))).toEqual([
      { user_id: oldWinner, status: "rerolled", timestamp: expect.any(String), reason: "dashboard_reroll" },
      { user_id: newWinner, status: "winner", timestamp: expect.any(String) },
    ])
    expect(discord).not.toHaveBeenCalled()
  })

  it("preserves weighted entries rather than giving every eligible user equal odds", async () => {
    const otherEntrant = "5334567890123456789"
    const selected: string[] = []
    // All six equally likely Fisher-Yates choices for three entry slots.
    // The repeated entrant must occupy four outcomes, not three.
    for (let last = 0; last < 3; last += 1) for (let first = 0; first < 2; first += 1) {
      const draws = [last, first]
      const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
        if (!(array instanceof Uint32Array)) throw new Error("Unexpected random draw type")
        array[0] = draws.shift() ?? 0
        return array
      })
      try {
        const { run } = fixture({ row: { entries: [oldWinner, newWinner, { user_id: newWinner }, otherEntrant] } })
        const result = await run() as { newWinners: string[] }
        selected.push(...result.newWinners)
        expect(random).toHaveBeenCalledTimes(2)
      } finally {
        random.mockRestore()
      }
    }
    expect(selected.filter((id) => id === newWinner)).toHaveLength(4)
    expect(selected.filter((id) => id === otherEntrant)).toHaveLength(2)
  })

  it("rejects a draw with too few unique people even when weighted slots are plentiful", async () => {
    const secondOldWinner = "6334567890123456789"
    const { run, query } = fixture({ row: {
      winners_list: [{ user_id: oldWinner, status: "winner" }, { user_id: secondOldWinner, status: "winner" }],
      entries: [oldWinner, secondOldWinner, newWinner, { user_id: newWinner }],
    } })
    await expect(run({ user_ids_to_replace: [oldWinner, secondOldWinner] })).rejects.toThrow("Not enough eligible participants")
    expect(query.mock.calls.some(([statement]) => String(statement).includes("UPDATE giveaways"))).toBe(false)
  })

  it("selects different people while preserving extra weighted slots", async () => {
    const secondOldWinner = "6334567890123456789", otherEntrant = "7334567890123456789"
    const { run } = fixture({ row: {
      winners_list: [{ user_id: oldWinner, status: "winner" }, { user_id: secondOldWinner, status: "winner" }],
      entries: [oldWinner, secondOldWinner, newWinner, { user_id: newWinner }, otherEntrant],
    } })
    const result = await run({ user_ids_to_replace: [oldWinner, secondOldWinner] }) as { newWinners: string[] }
    expect(new Set(result.newWinners)).toEqual(new Set([newWinner, otherEntrant]))
    expect(result.newWinners).toHaveLength(2)
  })

  it.each([
    { name: "an ongoing giveaway", row: { status: "ongoing" }, body: { user_ids_to_replace: [oldWinner] } },
    { name: "an empty replacement list", row: {}, body: { user_ids_to_replace: [] } },
    { name: "a duplicate replacement target", row: {}, body: { user_ids_to_replace: [oldWinner, oldWinner] } },
    { name: "an invalid Discord ID", row: {}, body: { user_ids_to_replace: ["invalid"] } },
    { name: "a user who is not a current winner", row: {}, body: { user_ids_to_replace: [newWinner] } },
    { name: "too few eligible participants", row: { entries: [oldWinner] }, body: { user_ids_to_replace: [oldWinner] } },
  ])("still rejects $name before writing or enqueuing anything", async ({ row, body }) => {
    const { run, query, discord } = fixture({ row })
    await expect(run(body)).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(query.mock.calls.some(([statement]) => statement.startsWith("UPDATE"))).toBe(false)
    expect(discord).not.toHaveBeenCalled()
  })

  it("still reports a missing giveaway without writing", async () => {
    const { run, query } = fixture({ row: null })
    await expect(run()).rejects.toMatchObject({ _tag: "NotFound", message: "Giveaway not found" })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("still reports the database failure instead of a successful reroll", async () => {
    const { run, query } = fixture({ writeFailure: new DatabaseFailure({ message: "write failed", cause: "fixture" }) })
    await expect(run()).rejects.toMatchObject({ _tag: "DatabaseFailure", message: "write failed" })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it("the HTTP dispatcher still requires giveaway write access before executing any mutation", async () => {
    const { sql, query } = fixture()
    const requireAccess = vi.fn<ServerAuthorization["Service"]["require"]>(() => Effect.fail(new Forbidden({ message: "Denied" })))
    const execute = vi.fn<DashboardServerOperations["Service"]["execute"]>(() => Effect.die("Denied request reached mutation"))
    const value = dispatchDashboardServer(request(), bindings).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.provideService(ServerAuthorization, { require: requireAccess, resolve: () => Effect.die("Unexpected access resolve") }),
      Effect.provideService(DashboardServerOperations, { execute }),
      Effect.provideService(AuthIdentity, { requireUser: () => Effect.die("Unexpected user auth"), requireBot: () => Effect.die("Unexpected bot auth"), requireUserOrBot: () => Effect.die("Unexpected alternate auth") }),
    )
    await expect(Effect.runPromise(value)).rejects.toMatchObject({ _tag: "Forbidden", message: "Denied" })
    expect(requireAccess).toHaveBeenCalledWith(expect.any(Request), serverId, { write: true, managerOnly: false, section: "giveaways" })
    expect(query).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
