import { Effect, Layer } from "effect"
import { SqlClient, Statement } from "effect/unstable/sql"
import { Reactivity } from "effect/unstable/reactivity"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Forbidden } from "./errors.js"
import { addLink } from "./link-mutations.js"
import { addServerScopedLink, requireServerLinkToken } from "./server-scoped-linking.js"

vi.mock("./link-mutations.js", () => ({ addLink: vi.fn() }))

const canonicalLinker = vi.mocked(addLink)
const principal = { kind: "bot" as const }
const userId = "943000000000000001"
const bindings = { CLASH_PROXY: { fetch: vi.fn() } }
const result = { message: "Linked", account: { tag: "#PYL", name: "Player", townHallLevel: 18, is_verified: true, hidden: false } }
// The real linker requires SQL; these tests substitute it to verify only the
// scoped precondition/delegation, and fail if the wrapper itself accesses SQL.
const noSql = Layer.effect(SqlClient.SqlClient, SqlClient.make({
  acquirer: Effect.die("The scoped guard must not access the database"),
  compiler: Statement.makeCompilerSqlite(), spanAttributes: [],
})).pipe(Layer.provide(Reactivity.layer))
const run = <A, E>(operation: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(operation.pipe(
  Effect.provide(noSql),
))

beforeEach(() => { canonicalLinker.mockReset(); bindings.CLASH_PROXY.fetch.mockReset() })

describe("server-scoped API token requirement", () => {
  it.each([undefined, "", " ", "\n\t"])("denies an enabled attempt with missing token %j before the canonical linker", async (api_token) => {
    await expect(run(addServerScopedLink({ requireApiTokenWhenLinking: true, principal, userId,
      input: { player_tag: "#PYL", ...(api_token === undefined ? {} : { api_token }) }, bindings })))
      .rejects.toMatchObject({ _tag: "Forbidden" })
    expect(canonicalLinker).not.toHaveBeenCalled()
    expect(bindings.CLASH_PROXY.fetch).not.toHaveBeenCalled()
  })

  it("has no verified-owner exemption on a new enabled attempt", async () => {
    canonicalLinker.mockReturnValue(Effect.succeed(result))
    await expect(run(addServerScopedLink({ requireApiTokenWhenLinking: true, principal, userId,
      input: { player_tag: "#PYL" }, bindings }))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(canonicalLinker).not.toHaveBeenCalled()
  })

  it("passes supplied proof to the canonical verifier without asserting ownership itself", async () => {
    canonicalLinker.mockReturnValue(Effect.succeed(result))
    const input = { player_tag: "#PYL", api_token: " supplied-token " }
    await expect(run(addServerScopedLink({ requireApiTokenWhenLinking: true, principal, userId, input, bindings }))).resolves.toEqual(result)
    expect(canonicalLinker).toHaveBeenCalledExactlyOnceWith(principal, userId, input, bindings)
  })

  it("propagates invalid proof rejection instead of converting it into success", async () => {
    canonicalLinker.mockReturnValue(Effect.fail(new Forbidden({ message: "Invalid player token" })))
    await expect(run(addServerScopedLink({ requireApiTokenWhenLinking: true, principal, userId,
      input: { player_tag: "#PYL", api_token: "invalid" }, bindings }))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(canonicalLinker).toHaveBeenCalledTimes(1)
  })

  it("leaves setting-off linking and transfer protection to the unchanged canonical linker", async () => {
    canonicalLinker.mockReturnValue(Effect.succeed(result))
    const input = { player_tag: "#PYL" }
    await expect(run(addServerScopedLink({ requireApiTokenWhenLinking: false, principal, userId, input, bindings }))).resolves.toEqual(result)
    expect(canonicalLinker).toHaveBeenCalledExactlyOnceWith(principal, userId, input, bindings)
  })

  it("requires an explicit policy but does not choose a migration default", async () => {
    await expect(Effect.runPromise(requireServerLinkToken(false, undefined))).resolves.toBeUndefined()
    await expect(Effect.runPromise(requireServerLinkToken(true, undefined))).rejects.toMatchObject({ _tag: "Forbidden" })
  })
})
