import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { bearerToken, sameSecret } from "./auth.js"

describe("Worker bearer authentication primitives", () => {
  it("accepts only the canonical Bearer authorization form", () => {
    expect(bearerToken(new Request("https://api.clashk.ing/v2/me", {
      headers: { authorization: "Bearer signed-token" },
    }))).toBe("signed-token")
    expect(bearerToken(new Request("https://api.clashk.ing/v2/me", {
      headers: { authorization: "signed-token" },
    }))).toBeUndefined()
    expect(bearerToken(new Request("https://api.clashk.ing/v2/me", {
      headers: { authorization: "Basic signed-token" },
    }))).toBeUndefined()
  })

  it("compares bot secrets by fixed-size digests", async () => {
    await expect(Effect.runPromise(sameSecret("secret", "secret"))).resolves.toBe(true)
    await expect(Effect.runPromise(sameSecret("secret", "different"))).resolves.toBe(false)
  })
})
