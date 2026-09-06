import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { executeDashboardReminders, reminderMinutes } from "./dashboard-server-reminders.js"
import { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"

describe("Dashboard reminders", () => {
  it.each([["1.5hr", 90], ["2h", 120], ["30min", 30], ["45m", 45], ["bad", 0], ["1e100", 0]])("normalizes the Go reminder duration %s", (value, expected) => {
    expect(reminderMinutes(String(value))).toBe(expected)
  })
  it("persists a reminder without calling another service", async () => {
    const serverId = "1334567890123456789", channelId = "2334567890123456789"
    const events: string[] = []
    const query = () => Effect.succeed([{ id: serverId }])
    const sql = Object.assign(query, {
      unsafe: () => Effect.sync(() => { events.push("insert"); return [{ id: "01991412-3895-7000-8000-123456789012" }] }),
      withTransaction: <A,E,R>(effect: Effect.Effect<A,E,R>) => Effect.sync(() => { events.push("begin") }).pipe(Effect.andThen(effect), Effect.tap(() => Effect.sync(() => { events.push("commit") }))),
    }) as unknown as SqlClient.SqlClient
    const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: () => Effect.sync(() => { events.push("discord"); return { id: channelId, guild_id: serverId, type: 0 } }), token: () => Effect.die("Unexpected OAuth") }))
    const operation = executeDashboardReminders({ endpoint: dashboardEndpoints.createServerReminder, path: { serverId }, query: {}, body: { type: "War", clan_tag: "#P0Y", channel_id: channelId, time: "1hr", roles: ["leader"] }, bindings: {} as WorkerBindings, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing") })
    await expect(Effect.runPromise(operation.pipe(Effect.provide(layer)))).resolves.toMatchObject({ message: "Reminder created successfully", reminder_id: "01991412-3895-7000-8000-123456789012" })
    expect(events).toEqual(["discord", "begin", "insert", "commit"])
  })
})
