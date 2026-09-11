import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { CreateBaseEndpoint, DeleteBaseEndpoint, UpdateBaseEndpoint } from "./dashboard-server.js"

describe("base mutation failure contracts", () => {
  it("publishes one canonical manager-write PATCH contract", () => {
    expect(UpdateBaseEndpoint).toMatchObject({
      auth: "server-manager-write",
      method: "PATCH",
      operationId: "updateDashboardBase",
      path: "/v2/server/:serverId/bases/:baseId",
    })
    expect(Schema.decodeUnknownSync(UpdateBaseEndpoint.body)({
      baseLink: "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
      description: "Updated layout",
      images: ["https://api.clashk.ing/v2/media/base.png"],
    })).toEqual({
      baseLink: "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
      description: "Updated layout",
      images: ["https://api.clashk.ing/v2/media/base.png"],
    })
  })

  it.each([500, 502, 503])("preserves custom and honest generic failures at %s", (status) => {
    for (const endpoint of [CreateBaseEndpoint, DeleteBaseEndpoint]) {
      const error = endpoint.errors.find((error) => error.status === status)
      expect(error).toBeDefined()
      const custom = endpoint === CreateBaseEndpoint
        ? { code: "internal_error", message: "failed", databaseInserted: false, discordMessageCreated: true, discordMessageId: "1234567890123456789", discordMessageCleanup: "failed", retryable: false }
        : { code: "internal_error", message: "failed", baseId: "base-id", databaseDeleted: false, discordMessageCleanup: "deleted", retryable: true }
      expect(Schema.decodeUnknownSync(error!.body)(custom)).toEqual(custom)
      const generic = { code: "internal_error", message: "Outcome unknown. Do not retry automatically" }
      const decoded = Schema.decodeUnknownSync(error!.body)(generic)
      expect(decoded).toEqual(generic)
      expect("retryable" in decoded).toBe(false)
    }
  })
})
