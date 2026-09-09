import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { AdminUser } from "./admin.js"

describe("Admin identity contract", () => {
  it("accepts the original Access profile without account timestamps", () => {
    const profile = {
      id: "access-subject", email: "admin@example.test", username: "admin@example.test",
      display_name: "admin", role: "owner", active: true,
    }
    expect(Schema.decodeUnknownSync(AdminUser)(profile)).toEqual(profile)
    expect(Schema.encodeUnknownSync(AdminUser)(profile)).toEqual(profile)
  })
})
