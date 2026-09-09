import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { correctTag, validateHomeActivityRequest } from "./home.js"

describe("home activity validation", () => {
  it("normalizes Clash tags using the canonical rules", () => {
    expect(correctTag(" p0ly! ")).toBe("#P0LY")
    expect(correctTag("#goo")).toBe("#G00")
  })

  it("rejects a user querying another account before touching SQL", async () => {
    await expect(Effect.runPromise(validateHomeActivityRequest({
      account_id: "other-user",
      mappings: [{ player_tag: "#P0LY", clan_tag: null }],
    }, { kind: "user", userId: "current-user" }))).rejects.toMatchObject({
      _tag: "Forbidden",
    })
  })

  it("rejects duplicate normalized player tags before touching SQL", async () => {
    await expect(Effect.runPromise(validateHomeActivityRequest({
      account_id: "user-1",
      mappings: [
        { player_tag: "#P0LY", clan_tag: null },
        { player_tag: "poly", clan_tag: null },
      ],
    }, { kind: "user", userId: "user-1" }))).rejects.toMatchObject({
      _tag: "InvalidRequest",
    })
  })
})
