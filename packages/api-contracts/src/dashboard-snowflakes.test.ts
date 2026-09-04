import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  ClanSettingsResponse, EmbedColorResponse,
  ServerSettingsResponse, UpdateServerPanelRequest,
} from "./dashboard-server.js"
import { DashboardDeleteRosterEndpoint } from "./dashboard-roster.js"

const snowflake = "9007199254740993123"

describe("Dashboard snowflake transport", () => {
  it.each([
    [ServerSettingsResponse, { message: "updated", server_id: snowflake, updated_fields: 1 }],
    [EmbedColorResponse, { message: "updated", server_id: snowflake, embed_color: 123 }],
    [ClanSettingsResponse, { message: "updated", server_id: snowflake, clan_tag: "#P0Y", updated_fields: 1, category: null }],
  ])("preserves exact response IDs and rejects numeric IDs", (schema, value) => {
    expect(Schema.decodeUnknownSync(schema)(value)).toEqual(value)
    expect(() => Schema.decodeUnknownSync(schema)({ ...value, server_id: Number(snowflake) })).toThrow()
  })

  it("requires string IDs in roster queries", () => {
    const schema = DashboardDeleteRosterEndpoint.query
    expect(Schema.decodeUnknownSync(schema)({ server_id: snowflake })).toEqual({ server_id: snowflake })
    expect(() => Schema.decodeUnknownSync(schema)({ server_id: Number(snowflake) })).toThrow()
  })

  it("requires string channel IDs while preserving nullable clears", () => {
    const schema = UpdateServerPanelRequest
    const fields = { buttons: [], button_color: "Grey" }
    expect(Schema.decodeUnknownSync(schema)({ ...fields, welcome_channel: snowflake })).toEqual({ ...fields, welcome_channel: snowflake })
    expect(Schema.decodeUnknownSync(schema)({ ...fields, welcome_channel: null })).toEqual({ ...fields, welcome_channel: null })
    expect(() => Schema.decodeUnknownSync(schema)({ ...fields, welcome_channel: Number(snowflake) })).toThrow()
  })
})
