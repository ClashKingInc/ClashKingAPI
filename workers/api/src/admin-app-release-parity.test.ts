import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { AccessIdentity } from "./access.js"
import { dispatchAdmin } from "./admin.js"
import { adminOperationInternals, type AdminWorkerBindings } from "./admin-operations.js"

const principal = { id: "access-subject", email: "operator@example.invalid", username: "operator", display_name: "Operator", role: "owner" as const, active: true }
const body = { expectedUpdatedAt: "2026-09-04T12:00:00Z", activeVersion: "1.2.2", rollbackTargetVersion: null, rolloutBasisPoints: 2500, paused: false, schedule: null }
const marker = { schemaVersion: 1, version: "1.2.2", appVersion: "1.2.2", track: "production", type: "ota", gitSha: "test", createdAt: "2026-09-04T12:00:00Z", platforms: { ios: { runtimeVersion: "runtime/one", manifest: { id: "test" } } }, rollbackTargets: { "1.2.1": { type: "ota", platforms: { ios: { runtimeVersion: "runtime/one", key: "rollbacks/production/1.2.2/1.2.1/ios-00000000-0000-4000-8000-000000000000.json" } } } } }
const row = { channel: "production", platform: "ios", runtime_version: "runtime/one", active_version: "1.2.1", rollback_target_version: null, rollout_basis_points: 0, paused: false, rollout_from_basis_points: null, rollout_to_basis_points: null, rollout_starts_at: null, rollout_ends_at: null, updated_at: "2026-09-04T12:00:00Z" }

const harness = (current: Record<string, unknown> | null = row, release: unknown = marker) => {
  const events: string[] = []
  let stored = current
  let rolledBack = false
  const audit = vi.fn(() => { events.push("audit"); return Effect.succeed([]) })
  const unsafe = vi.fn((query: string, values?: ReadonlyArray<unknown>) => {
    events.push(query.includes("FOR UPDATE") ? "lock" : query.includes("DO NOTHING") ? "claim" : "write")
    if (query.includes("DO NOTHING")) {
      if (stored !== null) return Effect.succeed([])
      stored = { ...row, active_version: null }
      return Effect.succeed([{ channel: "production" }])
    }
    if (query.includes("FOR UPDATE")) return Effect.succeed(stored === null ? [] : [stored])
    if (query.includes("RETURNING")) return Effect.succeed([{ ...row, active_version: values?.[3], rollback_target_version: values?.[4], rollout_basis_points: values?.[5], paused: values?.[6], rollout_from_basis_points: values?.[7], rollout_to_basis_points: values?.[8], rollout_starts_at: values?.[9], rollout_ends_at: values?.[10] }])
    return Effect.succeed([])
  })
  const sql = Object.assign(audit, { unsafe, withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.suspend(() => {
    const before = stored
    return effect.pipe(Effect.catch((cause) => {
      stored = before
      rolledBack = true
      return Effect.fail(cause)
    }))
  }) }) as unknown as SqlClient.SqlClient
  const get = vi.fn(async () => { events.push("marker"); return { json: async () => release } })
  const head = vi.fn(async () => { throw new Error("The existing selection behavior does not HEAD rollback objects") })
  const run = (payload: unknown) => Effect.runPromise(dispatchAdmin(new Request("https://api.example.invalid/v2/admin/app-releases/channels/production/ios/runtime%2Fone", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), { APP_UPDATES: { get, head } } as unknown as AdminWorkerBindings).pipe(
    Effect.provideService(AccessIdentity, { requireAdmin: () => Effect.succeed(principal) }),
    Effect.provideService(SqlClient.SqlClient, sql),
  ))
  return { run, unsafe, get, head, audit, events, stored: () => stored, rolledBack: () => rolledBack }
}

const expectError = async (response: Response | undefined, status: number, detail: string) => {
  expect(response?.status).toBe(status)
  expect(await response?.json()).toEqual({ detail })
}

describe("saved Admin release handler parity", () => {
  it.each([null, "2026-09-04T11:59:59Z"])("rejects a stale channel revision %s before reading release storage", async (expectedUpdatedAt) => {
    const test = harness()
    await expectError(await test.run({ ...body, expectedUpdatedAt }), 409, "This release channel changed since you loaded it. Reload before saving.")
    expect(test.get).not.toHaveBeenCalled()
    expect(test.audit).not.toHaveBeenCalled()
  })
  it("rejects invalid schema input before database or storage calls", async () => {
    const test = harness()
    await expect(test.run({ ...body, activeVersion: "../bad" })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(test.events).toEqual([])
  })
  it("checks schedule order before state lookup or release lookup", async () => {
    const test = harness()
    await expectError(await test.run({ ...body, schedule: { fromBasisPoints: 0, toBasisPoints: 10_000, startsAt: "2026-09-05T12:00Z", endsAt: "2026-09-04T12:00Z" } }), 400, "schedule.endsAt must be after schedule.startsAt")
    expect(test.events).toEqual([])
  })
  it.each([
    [{ ...row, rollback_target_version: "1.2.0" }, { ...body, activeVersion: null }, "pause this rollback or select a newer OTA release"],
    [{ ...row, rollback_target_version: "1.2.0" }, { ...body, activeVersion: "1.2.1" }, "an activated rollback is final for this release; select a newer OTA release"],
    [row, { ...body, activeVersion: "1.2.0" }, "select a newer OTA release, or use the pre-signed rollback control"],
  ] as const)("preserves rollback and forward-selection conflicts before storage", async (current, payload, detail) => {
    const test = harness(current)
    await expectError(await test.run(payload), 409, detail)
    expect(test.events).toEqual(["claim", "lock"])
  })
  it("returns 409 for a native release marker instead of inventing an OTA validation rule", async () => {
    const test = harness({ ...row, active_version: null }, { ...marker, type: "native", version: "1.3.0", appVersion: "1.3.0", rollbackTargets: {} })
    await expectError(await test.run({ ...body, activeVersion: "1.3.0" }), 409, "selected release is not an OTA update for this channel, platform, and runtime")
    expect(test.audit).not.toHaveBeenCalled()
  })
  it("returns 409 for an OTA marker with the wrong runtime", async () => {
    const test = harness(row, { ...marker, platforms: { ios: { runtimeVersion: "another", manifest: {} } } })
    await expectError(await test.run(body), 409, "selected release is not an OTA update for this channel, platform, and runtime")
  })
  it.each(["1.2.2", "1.1.9"])("rejects an undeclared or self rollback %s with 409", async (rollbackTargetVersion) => {
    const test = harness()
    await expectError(await test.run({ ...body, rollbackTargetVersion }), 409, "selected rollback was not pre-signed for this release, platform, and runtime")
    expect(test.head).not.toHaveBeenCalled()
  })
  it("requires an active release before selecting a rollback", async () => {
    const test = harness()
    await expectError(await test.run({ ...body, activeVersion: null, rollbackTargetVersion: "1.2.1" }), 400, "rollbackTargetVersion requires activeVersion")
    expect(test.get).not.toHaveBeenCalled()
  })
  it.each([
    [{ ...body, activeVersion: null, rollbackTargetVersion: "1.2.1" }, marker, 400],
    [body, { ...marker, platforms: { ios: { runtimeVersion: "another", manifest: {} } } }, 409],
  ] as const)("rolls back a newly claimed key on rejected first activation", async (payload, release, status) => {
    const test = harness(null, release)
    expect((await test.run({ ...payload, expectedUpdatedAt: null }))?.status).toBe(status)
    expect(test.rolledBack()).toBe(true)
    expect(test.stored()).toBeNull()
    expect(test.audit).not.toHaveBeenCalled()
  })
  it("selects a marker-declared rollback without adding a HEAD requirement and retains the key lock", async () => {
    const test = harness()
    const response = await test.run({ ...body, activeVersion: " 1.2.2 ", rollbackTargetVersion: "1.2.1" })
    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({ activeVersion: "1.2.2", rollbackTargetVersion: "1.2.1", rolloutBasisPoints: 2500, schedule: null })
    expect(test.events).toEqual(["claim", "lock", "marker", "write", "audit"])
    expect(test.head).not.toHaveBeenCalled()
  })
  it("compares numeric versions while stripping beta and rejects invalid stored versions", () => {
    expect(adminOperationInternals.compareVersions("1.10.1-beta", "1.2.9-beta")).toBeGreaterThan(0)
    expect(adminOperationInternals.compareVersions("1.2.1-beta", "1.2.1")).toBe(0)
    expect(() => adminOperationInternals.compareVersions("1.2.1-rc", "1.2.1")).toThrow("cannot compare invalid app release versions")
  })
})
