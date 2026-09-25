import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { assertSignupEligibility } from "./dashboard-roster-runtime.js"
import { rosterPlayerSnapshot } from "./dashboard-roster-refresh.js"

vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected archive") } }))

const player = (clan?: string) => rosterPlayerSnapshot({
  tag: "#P0Y", name: "Player", townHallLevel: 17, trophies: 5000,
  heroes: [], troops: [], spells: [], ...(clan ? { clan: { tag: clan, name: "Clan" } } : {}),
})
const roster = { min_townhall: null, max_townhall: null, clan_tag: "#P2Y", server_id: "123" }
const sqlFixture = (tags: string[] = []) => {
  const query = vi.fn(() => Effect.succeed(tags.map(tag => ({ tag }))))
  return { query, sql: query as unknown as SqlClient.SqlClient }
}

describe("roster signup scope", () => {
  it.each([undefined, "#OUTSIDE"])("anyone accepts a player in %s without querying family membership", async clan => {
    const { sql, query } = sqlFixture()
    await Effect.runPromise(assertSignupEligibility(sql, { ...roster, signup_scope: "anyone" }, player(clan)))
    expect(query).not.toHaveBeenCalled()
  })
  it("anyone still enforces Town Hall limits", async () => {
    const { sql } = sqlFixture()
    await expect(Effect.runPromise(assertSignupEligibility(sql, { ...roster, signup_scope: "anyone", min_townhall: 18 }, player())))
      .rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("clan-only requires the selected clan", async () => {
    const { sql } = sqlFixture()
    await Effect.runPromise(assertSignupEligibility(sql, { ...roster, signup_scope: "clan-only" }, player("#P2Y")))
    await expect(Effect.runPromise(assertSignupEligibility(sql, { ...roster, signup_scope: "clan-only" }, player("#OUTSIDE"))))
      .rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("family-only checks membership in a server-linked clan", async () => {
    const { sql, query } = sqlFixture(["#P2Y"])
    await Effect.runPromise(assertSignupEligibility(sql, { ...roster, signup_scope: "family-only" }, player("#P2Y")))
    expect(query).toHaveBeenCalledOnce()
    const empty = sqlFixture()
    await expect(Effect.runPromise(assertSignupEligibility(empty.sql, { ...roster, signup_scope: "family-only" }, player("#OUTSIDE"))))
      .rejects.toMatchObject({ _tag: "Forbidden" })
  })
})
