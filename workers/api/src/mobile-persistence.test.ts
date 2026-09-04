import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity, type ApiPrincipal } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { Unauthenticated } from "./errors.js"
import { dispatchMobilePersistence, recordSuccessfulProxySearch } from "./mobile-persistence.js"

const userId = "7534567890123456789"
const bindings = {} as WorkerBindings
const testLayer = (principal: ApiPrincipal = { kind: "user", userId }, expired = false, rows?: readonly object[]) => {
  const query = vi.fn(() => rows === undefined ? Effect.die("Unexpected database query") : Effect.succeed(rows))
  const auth = vi.fn(() => expired ? Effect.fail(new Unauthenticated({ message: "Invalid or expired token" })) : Effect.succeed(principal))
  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient),
    Layer.succeed(AuthIdentity, { requireUserOrBot: auth,
      requireUser: () => principal.kind === "user" && !expired ? Effect.succeed(principal) : Effect.fail(new Unauthenticated({ message: "User token required" })),
      requireBot: () => principal.kind === "bot" ? Effect.succeed(principal) : Effect.fail(new Unauthenticated({ message: "Bot token required" })),
    }),
  )
  return { layer, query, auth }
}
const request = (path: string, method = "GET", body?: unknown) => new Request(`https://api.clashk.ing${path}`, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})

describe("mobile persistence dispatcher", () => {
  it.each(["text/plain", "application/jsonp", ""])("rejects unsupported JSON media type %j", async (contentType) => {
    const fixture = testLayer()
    const invalid = new Request(`https://api.clashk.ing/v2/links/${userId}/bookmarks`, {
      method: "POST", body: new TextEncoder().encode(JSON.stringify({ type: "player", tag: "#P0Y" })),
      ...(contentType === "" ? {} : { headers: { "content-type": contentType } }),
    })
    await expect(Effect.runPromise(dispatchMobilePersistence(invalid, bindings).pipe(Effect.provide(fixture.layer))))
      .rejects.toMatchObject({ _tag: "InvalidRequest", status: 415 })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it("rejects bookmark listing without its required type", async () => {
    const fixture = testLayer()
    await expect(Effect.runPromise(dispatchMobilePersistence(request(`/v2/links/${userId}/bookmarks`), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it("returns undefined for unrelated routes without authenticating or querying", async () => {
    const fixture = testLayer()
    expect(await Effect.runPromise(dispatchMobilePersistence(request("/v2/not-mobile-persistence"), bindings).pipe(Effect.provide(fixture.layer)))).toBeUndefined()
    expect(fixture.auth).not.toHaveBeenCalled()
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it("rejects expired authentication before accessing persisted state", async () => {
    const fixture = testLayer({ kind: "user", userId }, true)
    await expect(Effect.runPromise(dispatchMobilePersistence(request(`/v2/links/${userId}/bookmarks?type=player`), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it("does not let a user read another account's persistence", async () => {
    const fixture = testLayer()
    await expect(Effect.runPromise(dispatchMobilePersistence(request("/v2/links/8534567890123456789/searches"), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it.each([{ ordered_tags: [] }, { ordered_tags: ["#P0Y", "#P0Y"] }, { ordered_tags: ["p0y", "#P0Y"] }])("rejects empty or duplicate normalized bookmark order $ordered_tags", async ({ ordered_tags }) => {
    const fixture = testLayer()
    await expect(Effect.runPromise(dispatchMobilePersistence(request(`/v2/links/${userId}/bookmarks/order`, "PUT", { type: "player", ordered_tags }), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it.each([{ data: null }, { data: [] }, { data: "not an object" }, { data: 12 }])("rejects non-object saved upgrade data $data", async ({ data }) => {
    const fixture = testLayer()
    await expect(Effect.runPromise(dispatchMobilePersistence(request(`/v2/links/${userId}/%23P0Y/upgrades`, "PUT", { data }), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it.each([
    ["/v1/players/%23P0Y", 404], ["/v1/clans/%23P0Y", 201], ["/v1/players/%23P0Y/battlelog", 200],
    ["/v1/clans/%23P0Y/members", 200], ["/v2/players/%23P0Y", 200],
  ])("does not record an unsuccessful or non-profile proxy target %s (%s)", async (path, status) => {
    const fixture = testLayer()
    await Effect.runPromise(recordSuccessfulProxySearch({ kind: "user", userId }, path, status, { tag: "#P0Y", name: "Player" }).pipe(Effect.provide(fixture.layer)))
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it("permits bot bookmark reads for subjects without an auth account", async () => {
    const fixture = testLayer({ kind: "bot" }, false, [])
    const response = await Effect.runPromise(dispatchMobilePersistence(request(`/v2/links/${userId}/bookmarks?type=clan`), bindings).pipe(Effect.provide(fixture.layer)))
    expect(await response?.json()).toEqual({ items: [] })
  })

  it("does not let a bot invoke the user-only achievement check", async () => {
    const fixture = testLayer({ kind: "bot" })
    await expect(Effect.runPromise(dispatchMobilePersistence(request("/v2/achievements/check", "POST", {}), bindings)
      .pipe(Effect.provide(fixture.layer)))).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(fixture.query).not.toHaveBeenCalled()
  })
})
