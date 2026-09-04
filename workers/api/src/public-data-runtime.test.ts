import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { dispatchPublicData } from "./public-data-runtime.js"
import { AuthIdentity } from "./auth.js"
import { Unauthenticated } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { SqlClient } from "effect/unstable/sql"

const database = Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient)
const denied = Layer.succeed(AuthIdentity, {
  requireUser: () => Effect.fail(new Unauthenticated({ message: "Token required" })),
  requireBot: () => Effect.fail(new Unauthenticated({ message: "Token required" })),
  requireUserOrBot: () => Effect.fail(new Unauthenticated({ message: "Token required" })),
})
const run = (path: string) => Effect.runPromise(dispatchPublicData(new Request(`https://api.test${path}`), {} as WorkerBindings).pipe(Effect.provide(denied), Effect.provide(database)))
describe("public dispatcher input boundary", () => {
  it("authorizes protected joins before database access", async () => {
    await expect(run("/v2/player/%23P0Y/join-leave?limit=1")).rejects.toMatchObject({ _tag: "Unauthenticated" })
  })
  it("rejects malformed path and typed query values before accessing any provider", async () => {
    for (const path of ["/v2/player/search", "/v2/player/search?query=Valid&limit=no", "/v2/leaderboard/townhalls/no", "/v2/clan/%ZZ/records", "/v2/player/%23P0Y/battlelog/history?attack=maybe"]) {
      await expect(run(path)).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
  })
  it("leaves non-owned routes to other explicit dispatchers", async () => {
    expect(await run("/v2/not-owned")).toBeUndefined()
  })
})
