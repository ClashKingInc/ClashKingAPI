import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import type { WorkerBindings } from "./environment.js"
import { proxyRequest } from "./proxy.js"

describe("proxyRequest", () => {
  it("strips the public prefix and never forwards API credentials", async () => {
    let captured: Request | undefined
    const binding = {
      fetch: async (request: Request) => {
        captured = request
        return Response.json({ tag: "#PLAYER" }, {
          headers: { etag: '"player-v1"', "x-upstream-secret": "do-not-forward" },
        })
      },
    }
    const bindings = { CLASH_PROXY: binding } as unknown as WorkerBindings
    const request = new Request(
      "https://api.clashk.ing/proxy/v1/players/%23PLAYER?limit=10",
      {
        headers: {
          authorization: "Bearer private-api-token",
          cookie: "refresh=private",
          "if-none-match": '"old"',
          "x-request-id": "request-1",
        },
      },
    )

    const response = await Effect.runPromise(proxyRequest(request, bindings))

    expect(captured?.url).toBe("https://clash-proxy.internal/v1/players/%23PLAYER?limit=10")
    expect(captured?.headers.get("authorization")).toBeNull()
    expect(captured?.headers.get("cookie")).toBeNull()
    expect(captured?.headers.get("if-none-match")).toBe('"old"')
    expect(response.headers.get("etag")).toBe('"player-v1"')
    expect(response.headers.get("x-upstream-secret")).toBeNull()
  })
})
