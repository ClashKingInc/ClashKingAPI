import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { recordProxyWarActivity } from "./proxy-war-activity.js"

const principal = { kind: "user" as const, userId: "owner" }
const war = { state: "inWar", startTime: "20260915T010000.000Z", endTime: "20260916T010000.000Z",
  clan: { tag: "#P0Y", members: [{ tag: "#P0L" }] } }
const run = async (body: unknown, path = "/proxy/v1/clans/%23P0Y/currentwar") => {
  const query = vi.fn(() => Effect.succeed([]))
  await Effect.runPromise(recordProxyWarActivity(principal, path, body, new Date("2026-09-15T12:00:00Z")).pipe(
    Effect.provideService(SqlClient.SqlClient, { unsafe: query } as unknown as SqlClient.SqlClient)))
  return query
}
describe("current war activity hints", () => {
  it("advances both timestamps using the war start, with ownership and preference checks", async () => {
    const query = await run(war)
    expect(query).toHaveBeenCalledWith(expect.stringContaining("last_active=GREATEST"),
      ["#P0Y", new Date("2026-09-15T01:00:00Z"), "owner", ["#P0L"]])
    const statement = (query.mock.calls[0] as unknown as [string])[0]
    expect(statement).toContain("last_war_at=GREATEST")
    expect(statement).toContain("link.user_id=$3 AND link.is_verified")
    expect(statement).toContain("JOIN mobile_notification_accounts preference")
    expect(statement).toContain("AND preference.enabled")
    expect(statement).not.toContain("COALESCE(preference.enabled,true)")
    expect(statement).not.toContain("war_schedule")
  })
  it("ignores missing, ended, mismatched, invalid, and implausible future wars", async () => {
    for (const body of [{ state: "notInWar" }, { ...war, state: "warEnded" },
      { ...war, clan: { ...war.clan, tag: "#OTHER" } }, { ...war, startTime: "invalid" },
      { ...war, startTime: "20260918T010000.000Z", endTime: "20260919T010000.000Z" },
      { ...war, clan: { ...war.clan, members: [] } }]) {
      expect(await run(body)).not.toHaveBeenCalled()
    }
  })
})
