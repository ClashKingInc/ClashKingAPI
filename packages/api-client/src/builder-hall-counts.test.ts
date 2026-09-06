import { PlayerBuilderhallCountsEndpoint, type EndpointResponse } from "@clashking/api-contracts"
import { Effect } from "effect"
import { expect, expectTypeOf, it, vi } from "vitest"

import { createApiClient, serviceBindingTransport } from "./index.js"

const input = { path: {}, query: {}, body: {} }
const body = { code: "not_implemented", message: "Builder Hall counts are not implemented", request_id: "builder-hall-fixture" }

it("returns the declared 501 non-success result without inventing Builder Hall data", async () => {
  const fetch = vi.fn(async (_request: Request) => Response.json(body, {
    status: 501, headers: { "x-request-id": "builder-hall-fixture" },
  }))
  const client = createApiClient({ transport: serviceBindingTransport({ fetch }) })
  const result = await Effect.runPromise(client.executeStatus(PlayerBuilderhallCountsEndpoint, input))
  expect(result).toEqual({ ok: false, status: 501, body, requestId: "builder-hall-fixture" })
  if (result.ok) throw new Error("The original unavailable route cannot succeed")
  expectTypeOf(result.status).toEqualTypeOf<501>()
  expectTypeOf(result.body.code).toEqualTypeOf<"not_implemented">()
  expectTypeOf<EndpointResponse<typeof PlayerBuilderhallCountsEndpoint>>().toEqualTypeOf<never>()
  const request = fetch.mock.calls[0]![0]
  expect(request.method).toBe("GET")
  expect(new URL(request.url).pathname).toBe("/v2/counts/players/builder-halls")
  expect(request.headers.has("authorization")).toBe(false)
  await expect(Effect.runPromise(client.execute(PlayerBuilderhallCountsEndpoint, input)))
    .rejects.toMatchObject({ _tag: "ApiResponseError", status: 501, body })
})

it("rejects an unexpected 200 response instead of decoding fabricated count data", async () => {
  const client = createApiClient({ transport: serviceBindingTransport({
    fetch: async () => Response.json({ items: [], count: 0 }),
  }) })
  await expect(Effect.runPromise(client.executeStatus(PlayerBuilderhallCountsEndpoint, input)))
    .rejects.toMatchObject({ _tag: "ResponseDecodeError" })
})
