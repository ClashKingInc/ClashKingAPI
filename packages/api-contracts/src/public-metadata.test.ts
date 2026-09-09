import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { publicEnumCatalog, publicMetadataEndpoints, EnumCatalogResponse, GuildSummaryQuery, PublicConfigResponse, MobilePublicConfigResponse } from "./public-metadata.js"

describe("public metadata contracts", () => {
  it("keeps every public enum well formed, uniquely named, and stably ordered", () => {
    expect(Schema.decodeUnknownSync(EnumCatalogResponse)(publicEnumCatalog)).toEqual(publicEnumCatalog)
    for (const values of Object.values(publicEnumCatalog)) {
      expect(values.map(({ id }) => id)).toEqual(values.map((_, index) => index + 1))
      expect(new Set(values.map(({ value }) => value)).size).toBe(values.length)
      for (const value of values) {
        expect(value.value).not.toBe("")
        expect(value.description).not.toBe("")
        expect(value.scope).not.toBe("")
      }
    }
  })

  it("exports exactly eight canonical public GET descriptors without aliases", () => {
    expect(Object.values(publicMetadataEndpoints)).toHaveLength(8)
    for (const endpoint of Object.values(publicMetadataEndpoints)) {
      expect(endpoint.auth).toBe("public")
      expect(endpoint.method).toBe("GET")
      expect(endpoint.path).not.toBe("/v2/public")
      expect(endpoint.path).not.toBe("/v2/guild-summary")
    }
  })

  it("keeps separate public configuration shapes and lossless guild IDs", () => {
    expect(() => Schema.decodeUnknownSync(PublicConfigResponse)({ sentry_dsn: "x" })).toThrow()
    expect(() => Schema.decodeUnknownSync(MobilePublicConfigResponse)({ sentry_dsn_mobile: "x" })).toThrow()
    expect(Schema.decodeUnknownSync(GuildSummaryQuery)({ guild_id: "123456789012345678" }).guild_id)
      .toBe("123456789012345678")
    expect(() => Schema.decodeUnknownSync(GuildSummaryQuery)({ guild_id: Number.MAX_SAFE_INTEGER })).toThrow()
  })
})
