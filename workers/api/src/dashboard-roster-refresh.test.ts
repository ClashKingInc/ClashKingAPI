import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { loadRosterClashPlayer } from "./dashboard-roster-refresh.js"
import type { WorkerBindings } from "./environment.js"

const run = (response: Response) => {
  const fetcher = vi.fn(async () => response)
  const bindings: Pick<WorkerBindings, "CLASH_PROXY"> = {
    CLASH_PROXY: { fetch: fetcher, connect: () => { throw new Error("Unexpected fixture socket connection") } },
  }
  return { result: Effect.runPromise(loadRosterClashPlayer(bindings, "#P0Y")), fetcher }
}

describe("roster Clash lookup response lifetime", () => {
  it.each([[404, "NotFound"], [429, "UpstreamUnavailable"], [500, "UpstreamUnavailable"], [503, "UpstreamUnavailable"]] as const)(
    "releases an unread HTTP %s body and preserves %s", async (status, tag) => {
      const cancel = vi.fn()
      const response = new Response(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 }), { status })
      const { result, fetcher } = run(response)
      await expect(result).rejects.toMatchObject({ _tag: tag })
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )

  it("does not replace a missing-player error when cancellation fails", async () => {
    const cancel = vi.fn(async () => { throw new Error("Fixture cleanup failure") })
    const { result } = run(new Response(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 }), { status: 404 }))
    await expect(result).rejects.toMatchObject({ _tag: "NotFound" })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("still consumes and validates a successful player response", async () => {
    const player = { tag: "#P0Y", name: "Fixture", townHallLevel: 16, trophies: 5000, troops: [], spells: [], heroes: [] }
    const response = Response.json(player)
    const { result, fetcher } = run(response)
    await expect(result).resolves.toEqual(player)
    expect(response.bodyUsed).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
