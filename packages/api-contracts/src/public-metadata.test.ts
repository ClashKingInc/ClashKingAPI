import { readFileSync } from "node:fs"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { publicEnumCatalog, publicMetadataEndpoints, GuildSummaryQuery, PublicConfigResponse, MobilePublicConfigResponse } from "./public-metadata.js"

describe("public metadata contracts", () => {
  it("preserves every Go enum ID, value, description, scope, and ordering", () => {
    const source = readFileSync(new URL("../../../internal/models/v2/enums.go", import.meta.url), "utf8")
    for (const [name, key] of [
      ["RoleTypeEnums", "role_types"], ["RoleModeEnums", "role_modes"],
      ["LogTypeEnums", "log_types"], ["CountdownTypeEnums", "countdown_types"],
    ] as const) {
      const block = source.match(new RegExp(`var ${name} = \\[\\]EnumValue\\{([\\s\\S]*?)\\n\\}`))?.[1]
      expect(block).toBeDefined()
      const values = [...block!.matchAll(/ID: (\d+), Value: "([^"]+)", Description: "([^"]+)", Scope: "([^"]+)"/g)]
        .map((match) => ({ id: Number(match[1]), value: match[2], description: match[3], scope: match[4] }))
      expect(publicEnumCatalog[key]).toEqual(values)
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
