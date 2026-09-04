import { describe, expect, it } from "vitest"

import { decryptStoredFernet, encryptStoredFernet } from "./fernet.js"

const key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
const historical = "Z0FBQUFBQmxVX0VBUkRHcFlDZE9nTUNCNE9KMUJQQ3d5d0FQem1xdFBhN0FORkVuUEM3UlNZSWo0RjZBaFVwMGtjU3JOR3hjZkxJVEdBS3V3eXV0R1R4Yi1OZXIyQ01aQzh1a1REOWQwT1dpbHl6bzhwQW94ZkU9"

describe("stored Fernet compatibility", () => {
  it("decrypts the historical Python/Go double-base64 storage format", async () => {
    await expect(decryptStoredFernet(historical, key)).resolves.toBe("user@example.com")
  })

  it("round-trips new values in the existing storage format", async () => {
    const encrypted = await encryptStoredFernet("refresh-token", key, new Date("2026-09-03T00:00:00Z"))
    expect(encrypted).not.toContain("refresh-token")
    await expect(decryptStoredFernet(encrypted, key)).resolves.toBe("refresh-token")
  })

  it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptStoredFernet("refresh-token", key)
    const tampered = `${encrypted.slice(0, -2)}AA`
    await expect(decryptStoredFernet(tampered, key)).rejects.toThrow()
  })
})
