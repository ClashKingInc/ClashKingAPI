import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { executeDashboardReminders, publishReminderChange, reminderMinutes } from "./dashboard-server-reminders.js"
import { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"

describe("Dashboard reminders", () => {
  it.each([["1.5hr", 90], ["2h", 120], ["30min", 30], ["45m", 45], ["bad", 0], ["1e100", 0]])("normalizes the Go reminder duration %s", (value, expected) => {
    expect(reminderMinutes(String(value))).toBe(expected)
  })
  it("publishes only the confirmed Tracking fields and canonicalizes roster event casing", async () => {
    const requests: Request[] = []
    const fetch = vi.fn(async (request: Request) => { requests.push(request); return Response.json({ published: true }) })
    const bindings = { API_BOT_TOKEN: "test-only", TRACKING: { fetch } } as unknown as WorkerBindings
    await Effect.runPromise(publishReminderChange(bindings, { clan_tag: "#P0Y", type: "roster", action: "updated", reminder_id: "01991412-3895-7000-8000-123456789012" }))
    expect(requests[0]?.url).toBe("https://tracking.internal/internal/reminder-config/publish")
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer test-only")
    expect(await requests[0]?.json()).toEqual({ clan_tag: "#P0Y", type: "Roster", action: "updated", reminder_id: "01991412-3895-7000-8000-123456789012" })
  })
  it.each([503, 200])("keeps post-commit publication best effort on failed or unacknowledged replies (%s)", async (status) => {
    const bindings = { API_BOT_TOKEN: "test-only", TRACKING: { fetch: () => Promise.resolve(Response.json({ published: false }, { status })) } } as unknown as WorkerBindings
    await expect(Effect.runPromise(publishReminderChange(bindings, { clan_tag: "", type: "War", action: "deleted", reminder_id: "01991412-3895-7000-8000-123456789012" }))).resolves.toBeUndefined()
  })
  it("returns the created reminder after committing once even if publication hangs", async () => {
    const serverId = "1334567890123456789", channelId = "2334567890123456789"
    const events: string[] = []
    let signal: AbortSignal | undefined
    const tracking = vi.fn((request: Request) => { events.push("publish"); signal = request.signal; return new Promise<Response>(() => {}) })
    const query = () => Effect.succeed([{ id: serverId }])
    const sql = Object.assign(query, {
      unsafe: () => Effect.sync(() => { events.push("insert"); return [{ id: "01991412-3895-7000-8000-123456789012" }] }),
      withTransaction: <A,E,R>(effect: Effect.Effect<A,E,R>) => Effect.sync(() => { events.push("begin") }).pipe(Effect.andThen(effect), Effect.tap(() => Effect.sync(() => { events.push("commit") }))),
    }) as unknown as SqlClient.SqlClient
    const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: () => Effect.sync(() => { events.push("discord"); return { id: channelId, guild_id: serverId, type: 0 } }), token: () => Effect.die("Unexpected OAuth") }))
    const operation = executeDashboardReminders({ endpoint: dashboardEndpoints.createServerReminder, path: { serverId }, query: {}, body: { type: "War", clan_tag: "#P0Y", channel_id: channelId, time: "1hr", roles: ["leader"] }, bindings: { API_BOT_TOKEN: "test-only", TRACKING: { fetch: tracking } } as unknown as WorkerBindings, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing") })
    await expect(Effect.runPromise(operation.pipe(Effect.provide(layer)))).resolves.toMatchObject({ message: "Reminder created successfully", reminder_id: "01991412-3895-7000-8000-123456789012" })
    expect(events).toEqual(["discord", "begin", "insert", "commit", "publish"])
    expect(signal?.aborted).toBe(true)
  })
  it("does not publish if commit acknowledgement fails after executing the SQL body", async () => {
    const serverId = "1334567890123456789", channelId = "2334567890123456789"
    const tracking = vi.fn()
    const query = () => Effect.succeed([{ id: serverId }])
    const sql = Object.assign(query, { unsafe: () => Effect.succeed([{ id: "01991412-3895-7000-8000-123456789012" }]), withTransaction: <A,E,R>(effect: Effect.Effect<A,E,R>) => effect.pipe(Effect.andThen(Effect.fail(new Error("commit acknowledgement lost")))) }) as unknown as SqlClient.SqlClient
    const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: () => Effect.succeed({ id: channelId, guild_id: serverId, type: 0 }), token: () => Effect.die("Unexpected OAuth") }))
    const operation = executeDashboardReminders({ endpoint: dashboardEndpoints.createServerReminder, path: { serverId }, query: {}, body: { type: "War", channel_id: channelId, time: "1hr", roles: ["leader"] }, bindings: { API_BOT_TOKEN: "test-only", TRACKING: { fetch: tracking } } as unknown as WorkerBindings, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing") })
    await expect(Effect.runPromise(operation.pipe(Effect.provide(layer)))).rejects.toMatchObject({ _tag: "DatabaseFailure" })
    expect(tracking).not.toHaveBeenCalled()
  })
})
