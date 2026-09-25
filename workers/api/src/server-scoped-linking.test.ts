import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { prepareLink } from "./link-mutations.js"

describe("required ownership proof for new links", () => {
  it.each([undefined, "", "  "]) ("rejects missing token %j before provider I/O", async (api_token) => {
    const fetch = vi.fn()
    await expect(Effect.runPromise(prepareLink({ kind: "bot" }, "943000000000000001",
      { player_tag: "#PYL", api_token: api_token ?? "" }, { CLASH_PROXY: { fetch } })))
      .rejects.toMatchObject({ _tag: "Forbidden" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("verifies a supplied token for an existing player", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = new Request(input)
      return new URL(request.url).pathname.endsWith("/verifytoken")
        ? Response.json({ status: "ok" })
        : Response.json({ tag: "#PYL", name: "Player", townHallLevel: 18 })
    })
    const proof = await Effect.runPromise(prepareLink({ kind: "bot" }, "943000000000000001",
      { player_tag: "#PYL", api_token: " valid " }, { CLASH_PROXY: { fetch } }))
    expect(proof.verifiedOwnership).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
