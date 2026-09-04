import { describe, expect, it } from "vitest"
import { emailAuthUser } from "./auth-sessions.js"

describe("email authentication user projection", () => {
  it("uses the canonical asset origin without a legacy CDN fallback", () => {
    const user = emailAuthUser({ user_id: "fixture", username: "Reader", password_hash: null })
    expect(user.avatar_url).toBe("https://assets.clashk.ing/stickers/Troop_HV_Goblin.png")
    expect(user.avatar_url).not.toMatch(/b-cdn|bunny/iu)
    expect(user).toMatchObject({ user_id: "fixture", username: "Reader", auth_methods: ["email"] })
    expect(emailAuthUser({ user_id: "fixture", username: " ", password_hash: null }).username).toBe("User")
  })
})
