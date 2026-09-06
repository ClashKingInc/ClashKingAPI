import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { assertRosterMembershipLimits, lockRosterAdmissionOwners, lockRosterMembership } from "./dashboard-roster-membership.js"

const rosterId = "019fbb92-95e2-7781-9f22-e057c54de9ac"
const serverId = "1234567890123456789"
const makeSql = (rows: (statement: string, values: readonly unknown[]) => readonly object[] = () => []) => {
  const calls: { statement: string; values: readonly unknown[] }[] = []
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join("?")
    expect(statement).not.toMatch(/\bcapacity\b|roster_member_groups|roster_member_group_settings|member_group_id|is_substitute/u)
    calls.push({ statement, values })
    return Effect.succeed(rows(statement, values))
  }
  return { sql: sql as unknown as SqlClient.SqlClient, calls }
}

describe("retained Dashboard roster membership guards", () => {
  it("locks canonical rows without requiring deferred capacity columns", async () => {
    const { sql, calls } = makeSql(() => [{ id: rosterId, revision: "1", max_accounts_per_user: null }])
    await Effect.runPromise(lockRosterMembership(sql, serverId, [rosterId, rosterId]))
    expect(calls[0]?.statement).toContain("ORDER BY id FOR UPDATE")
    expect(calls[0]?.values).toEqual([serverId, [rosterId]])
  })

  it("fails if a scoped roster is missing", async () => {
    const { sql } = makeSql()
    await expect(Effect.runPromise(lockRosterMembership(sql, serverId, [rosterId]))).rejects.toMatchObject({ _tag: "NotFound" })
  })

  it("locks linked rows before sorted owner locks and rereads canonical ownership", async () => {
    const owners = [{ tag: "#A", user_id: "20" }, { tag: "#B", user_id: "10" }]
    const { sql, calls } = makeSql(statement => statement.includes("SELECT tag, user_id") ? owners : [])
    expect(await Effect.runPromise(lockRosterAdmissionOwners(sql, ["#B", "#A", "#A"]))).toEqual(new Map([["#A", "20"], ["#B", "10"]]))
    expect(calls.find(call => call.statement.includes("SELECT tag, user_id"))?.statement).toContain("ORDER BY tag FOR UPDATE")
    expect(calls.filter(call => call.statement.includes("INSERT INTO subject_mutation_locks")).map(call => call.values[0])).toEqual(["10", "20"])
    expect(calls.filter(call => call.statement.includes("SELECT tag, user_id"))).toHaveLength(2)
  })

  it("rejects invalid existing per-user limits", async () => {
    const { sql } = makeSql(statement => statement.includes("max_accounts_per_user <= 0") ? [{ id: rosterId }] : [])
    await expect(Effect.runPromise(assertRosterMembershipLimits(sql, [rosterId]))).rejects.toMatchObject({ _tag: "Conflict", reason: "invalid_configuration" })
  })

  it("checks affected canonical owners without inventing a global roster size", async () => {
    const { sql, calls } = makeSql()
    await Effect.runPromise(assertRosterMembershipLimits(sql, [rosterId], ["10"]))
    expect(calls).toHaveLength(2)
    expect(calls[1]?.statement).toContain("JOIN player_links link ON link.tag = member.tag")
    expect(calls[1]?.statement).toContain("HAVING count(*) > roster.max_accounts_per_user")
    expect(calls[1]?.values).toEqual([[rosterId], false, ["10"]])
  })

  it("rejects an exceeded per-user cap", async () => {
    const { sql } = makeSql(statement => statement.includes("HAVING count(*)") ? [{ id: rosterId }] : [])
    await expect(Effect.runPromise(assertRosterMembershipLimits(sql, [rosterId], ["10"]))).rejects.toMatchObject({ _tag: "Conflict" })
  })
})
