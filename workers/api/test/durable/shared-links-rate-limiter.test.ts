/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env, runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"

import type { SharedLinksRateLimiter } from "../../src/shared-links-rate-limiter.js"

const namespace = (env as unknown as { SHARED_LINKS_LIMITER: DurableObjectNamespace<SharedLinksRateLimiter> }).SHARED_LINKS_LIMITER

describe("shared-link distributed quota", () => {
  it("allows exactly 120 concurrent calls and rejects the rest", async () => {
    const stub = namespace.getByName(crypto.randomUUID())
    const results = await Promise.all(Array.from({ length: 125 }, () => stub.consume()))
    expect(results.filter((result) => result.allowed)).toHaveLength(120)
    expect(results.filter((result) => !result.allowed)).toHaveLength(5)
    expect(results.at(-1)?.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("isolates applications and persists the exhausted counter", async () => {
    const first = namespace.getByName(crypto.randomUUID())
    const second = namespace.getByName(crypto.randomUUID())
    await Promise.all(Array.from({ length: 120 }, () => first.consume()))
    expect((await first.consume()).allowed).toBe(false)
    expect((await second.consume()).allowed).toBe(true)
    await runInDurableObject(first, (_instance, state) => {
      const row = state.storage.sql.exec<{ used: number }>("SELECT used FROM rate_window").one()
      expect(row.used).toBe(121)
    })
  })

  it("resets an expired window instead of retaining the prior quota", async () => {
    const stub = namespace.getByName(crypto.randomUUID())
    await stub.consume()
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE rate_window SET used = 121, window_start = ?", Date.now() - 120_000)
    })
    expect(await stub.consume()).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })
})
