import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { dispatchLegends } from "./legends.js"

const run = (request: Request, rows: readonly Record<string, unknown>[]) => {
  const query = vi.fn((_statement: string, _parameters: readonly unknown[]) => Effect.succeed(rows))
  const sql = Object.assign(() => Effect.die("Unexpected tagged SQL"), { unsafe: query }) as unknown as SqlClient.SqlClient
  return Effect.runPromise(dispatchLegends(request).pipe(Effect.provide(Layer.succeed(SqlClient.SqlClient, sql)))).then((response) => ({ response, query }))
}

describe("final Legend ranking reads", () => {
  it("reads current ranks in requested order and omits unresolved optional identities", async () => {
    const { response, query } = await run(new Request("https://api.clashk.ing/v2/legends/ranks", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["#P0Y", "#P0Y"] }),
    }), [{ tag: "#P0Y", name: "Player", trophies: 6500, global_rank: 12, clan_tag: null, clan_name: null, location_id: null }])
    expect(await response?.json()).toEqual({ items: [{ tag: "#P0Y", name: "Player", trophies: 6500, globalRank: 12 }] })
    expect(query.mock.calls[0]?.[0]).toContain("FROM legend_rankings_current")
    expect(query.mock.calls[0]?.[1]).toEqual([["#P0Y"]])
  })

  it("reads compact historical snapshots and derives trophy buckets at read time", async () => {
    const history = await run(new Request("https://api.clashk.ing/v2/legends/ranks/history", {
      method: "POST", body: JSON.stringify({ day: "2026-09-10", tags: ["#P0Y"] }),
    }), [{ tag: "#P0Y", name: "Player", trophies: 6420, global_rank: 15, clan_tag: "#2PP", clan_name: "Clan", location_id: null }])
    expect(await history.response?.json()).toEqual({ items: [{ tag: "#P0Y", name: "Player", trophies: 6420, globalRank: 15, clan: { tag: "#2PP", name: "Clan" } }] })
    expect(history.query.mock.calls[0]?.[0]).toContain("leaderboard_history_player_home")

    const bucket = await run(new Request("https://api.clashk.ing/v2/legends/trophy-buckets/2026-09-10"), [{ minimum_trophies: 6400, player_count: 23 }])
    expect(await bucket.response?.json()).toEqual({ items: [{ minimumTrophies: 6400, maximumTrophies: 6499, playerCount: 23 }] })
    expect(bucket.query.mock.calls[0]?.[0]).toContain("GROUP BY 1")
  })

  it("rejects more than 100 tags and invalid history dates before SQL", async () => {
    await expect(run(new Request("https://api.clashk.ing/v2/legends/ranks", {
      method: "POST", body: JSON.stringify({ tags: Array.from({ length: 101 }, (_, index) => `#P${index}`) }),
    }), [])).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(run(new Request("https://api.clashk.ing/v2/legends/trophy-buckets/2026-02-30"), [])).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
