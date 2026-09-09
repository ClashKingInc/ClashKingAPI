import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { dashboardEndpoints } from "./dashboard.js"
describe("single server giveaway contract", () => {
  it("registers the unique Go read capability with exact snowflake paths", () => {
    const endpoint = dashboardEndpoints.serverGiveaway
    expect(endpoint.path).toBe("/v2/server/:serverId/giveaways/:giveawayId")
    expect(endpoint.method).toBe("GET")
    expect(endpoint.auth).toBe("server-read")
    expect(Schema.decodeUnknownSync(endpoint.pathParams)({ serverId: "1334567890123456789", giveawayId: "giveaway" }).serverId).toBe("1334567890123456789")
    expect(() => Schema.decodeUnknownSync(endpoint.pathParams)({ serverId: 123, giveawayId: "giveaway" })).toThrow()
  })
})
