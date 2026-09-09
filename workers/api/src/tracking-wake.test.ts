import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { expect, it, vi } from "vitest"
import { notifyTracking, trackingWakeChannel } from "./tracking-wake.js"

it("publishes a versioned tracking wake without calling another service", async () => {
  const query = vi.fn(() => Effect.succeed([]))
  await Effect.runPromise(notifyTracking(query as unknown as SqlClient.SqlClient,
    { kind: "reminder_config", clanTag: "#P0Y", reminderType: "War" }))
  expect(query).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0]?.slice(1)).toEqual([
    trackingWakeChannel,
    JSON.stringify({ v: 1, kind: "reminder_config", clanTag: "#P0Y", reminderType: "War" }),
  ])
})
