import { Schema } from "effect"
import { expect, expectTypeOf, it } from "vitest"

import { type EndpointResponse, requireEndpointSuccessStatus } from "./endpoint.js"
import { expoEndpoints } from "./expo.js"
import { PlayerBuilderhallCountsEndpoint, PlayerBuilderhallCountsUnavailableResponse, PlayerTownhallCountsEndpoint } from "./expo-stats.js"

it("preserves the public Builder Hall count operation as a declared error-only endpoint", () => {
  expect(expoEndpoints.playerBuilderhallCounts).toBe(PlayerBuilderhallCountsEndpoint)
  expect(PlayerBuilderhallCountsEndpoint).toMatchObject({
    method: "GET", path: "/v2/counts/players/builder-halls", auth: "public",
    bodyMode: "none", successStatus: null, errors: [{ status: 501 }],
  })
  expectTypeOf<EndpointResponse<typeof PlayerBuilderhallCountsEndpoint>>().toEqualTypeOf<never>()
  expect(Schema.is(PlayerBuilderhallCountsEndpoint.response)({ items: [], count: 0 })).toBe(false)
  const body = { code: "not_implemented", message: "Builder Hall counts are not implemented", request_id: "fixture" }
  expect(Schema.decodeUnknownSync(PlayerBuilderhallCountsUnavailableResponse)(body)).toEqual(body)
})

it("never lets a response writer fabricate success for an error-only endpoint", () => {
  expect(() => requireEndpointSuccessStatus(PlayerBuilderhallCountsEndpoint)).toThrow("has no successful response")
  expect(requireEndpointSuccessStatus(PlayerTownhallCountsEndpoint)).toBe(200)
})
