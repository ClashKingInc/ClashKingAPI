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

    expect(captured?.url).toBe("http://clash-proxy.internal/v1/players/%23PLAYER?limit=10")
    expect(captured?.headers.get("authorization")).toBeNull()
    expect(captured?.headers.get("cookie")).toBeNull()
    expect(captured?.headers.get("if-none-match")).toBe('"old"')
    expect(response.headers.get("etag")).toBe('"player-v1"')
    expect(response.headers.get("x-upstream-secret")).toBeNull()
  })

  it.each(["maintenance", "inMaintenance"])("normalizes the explicit %s upstream maintenance reason", async (reason) => {
    const bindings = { CLASH_PROXY: { fetch: async () => Response.json({ reason, message: "provider detail" }, {
      status: 503, headers: { "retry-after": "30" },
    }) } } as unknown as WorkerBindings
    const response = await Effect.runPromise(proxyRequest(new Request("https://api.clashk.ing/proxy/v1/clans/%23P0Y"), bindings))
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("30")
    expect(await response.json()).toEqual({ reason: "maintenance", message: "Clash of Clans is currently under maintenance." })
  })

  it.each([
    Response.json({ reason: "temporarilyUnavailable", message: "generic" }, { status: 503 }),
    new Response("not-json", { status: 503, headers: { "content-type": "application/json" } }),
  ])("does not classify a generic or malformed 503 as maintenance", async (upstream) => {
    const bindings = { CLASH_PROXY: { fetch: async () => upstream.clone() } } as unknown as WorkerBindings
    const response = await Effect.runPromise(proxyRequest(new Request("https://api.clashk.ing/proxy/v1/clans/%23P0Y"), bindings))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('"reason":"maintenance"')
  })

  it("keeps binding failures distinct from Clash maintenance", async () => {
    const bindings = { CLASH_PROXY: { fetch: async () => { throw new Error("offline") } } } as unknown as WorkerBindings
    await expect(Effect.runPromise(proxyRequest(new Request("https://api.clashk.ing/proxy/v1/clans/%23P0Y"), bindings)))
      .rejects.toMatchObject({ _tag: "UpstreamUnavailable", message: "Clash proxy service binding failed" })
  })
})
