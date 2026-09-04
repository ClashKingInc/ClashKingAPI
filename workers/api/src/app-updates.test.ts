import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { appUpdateInternals } from "./app-updates.js"

describe("app update selection", () => {
  it("validates release naming conventions", () => {
    expect(appUpdateInternals.validVersion("1.1.0-beta", "beta", "native")).toBe(true)
    expect(appUpdateInternals.validVersion("1.1.2-beta", "beta", "ota")).toBe(true)
    expect(appUpdateInternals.validVersion("1.1.0-beta", "beta", "ota")).toBe(false)
    expect(appUpdateInternals.validVersion("1.1.2-beta", "production", "ota")).toBe(false)
  })

  it("accepts only 16-byte installation tokens", async () => {
    await expect(Effect.runPromise(appUpdateInternals.installationToken("not-a-token"))).rejects.toMatchObject({
      _tag: "InvalidRequest",
    })
    await expect(Effect.runPromise(appUpdateInternals.installationToken("00112233445566778899aabbccddeeff")))
      .resolves.toBe("00112233445566778899aabbccddeeff")
  })

  it("keeps rollout assignment stable within one release", async () => {
    const first = await Effect.runPromise(appUpdateInternals.rolloutBucket(
      "1.1.2-beta",
      "00112233445566778899aabbccddeeff",
    ))
    const second = await Effect.runPromise(appUpdateInternals.rolloutBucket(
      "1.1.2-beta",
      "00112233445566778899aabbccddeeff",
    ))
    expect(second).toBe(first)
  })
})
