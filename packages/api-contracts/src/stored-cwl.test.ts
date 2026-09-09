import { Schema } from "effect"
import { expect, it } from "vitest"
import { StoredCwlGroupEndpoint, StoredCwlGroupResponse } from "./expo.js"
import { BotCwlGroupEndpoint } from "./bot-public.js"

it("uses one stored-group schema for Expo and Bot, with exact season and missing-group error", () => {
  expect(StoredCwlGroupEndpoint.response).toBe(BotCwlGroupEndpoint.response)
  expect(StoredCwlGroupEndpoint.path).toBe("/v2/cwl/:tag/group")
  expect(Schema.decodeUnknownSync(StoredCwlGroupEndpoint.query)({ season: "2026-08" })).toEqual({ season: "2026-08" })
  expect(Schema.decodeUnknownSync(StoredCwlGroupEndpoint.query)({})).toEqual({})
  expect(StoredCwlGroupEndpoint.errors?.map(error => error.status)).toContain(404)
  const group = { state: "ended", season: "2026-08", warLeague: null, clans: [], rounds: [{ warTags: [{ tag: "#0" }] }] }
  expect(Schema.decodeUnknownSync(StoredCwlGroupResponse)(group)).toEqual(group)
  expect(() => Schema.decodeUnknownSync(StoredCwlGroupResponse)({ ...group, rounds: [{ warTags: ["#0"] }] })).toThrow()
})
