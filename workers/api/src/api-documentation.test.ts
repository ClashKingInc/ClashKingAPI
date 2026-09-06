import { describe, expect, it, vi } from "vitest"
import { isApiDocumentationRequest, serveApiDocumentation } from "./api-documentation.js"

describe("retained public API documentation", () => {
  it.each([
    ["/", "scalar.html", "text/html"], ["/docs", "scalar.html", "text/html"], ["/docs/page", "scalar.html", "text/html"],
    ["/swagger/index.html", "swagger.html", "text/html"], ["/openapi.json", "openapi.json", "application/json"],
    ["/openapi.scalar.json", "openapi.json", "application/json"], ["/openapi.yaml", "openapi.yaml", "application/yaml"],
  ])("serves %s from the exact documentation asset without forwarding credentials", async (path, file, contentType) => {
    const fetch = vi.fn(async (_request: Request) => new Response("fixture", { headers: { "cache-control": "public" } }))
    const request = new Request(`https://api.example.test${path}?ignored=1`, { headers: { cookie: "private", authorization: "Bearer private", range: "bytes=0-1" } })
    expect(isApiDocumentationRequest(request)).toBe(true)
    const response = await serveApiDocumentation(request, { fetch } as unknown as Fetcher)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain(contentType)
    expect(response.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate, private")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(await response.text()).toBe("fixture")
    const forwarded = fetch.mock.calls[0]![0]
    expect(new URL(forwarded.url).pathname).toBe(`/${file}`)
    expect(new URL(forwarded.url).search).toBe("")
    expect([...forwarded.headers]).toEqual([])
  })

  it.each([["/swagger", "/swagger/index.html"], ["/swagger/", "/swagger/index.html"], ["/redoc", "/"]])("retains the %s redirect", async (path, destination) => {
    const response = await serveApiDocumentation(new Request(`https://api.example.test${path}`), {} as Fetcher)
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(destination)
  })

  it.each(["/swagger/public", "/swagger/private", "/swagger/unknown.js", "/scalar.html", "/.env"])("never exposes arbitrary files at %s", async path => {
    const fetch = vi.fn()
    const response = await serveApiDocumentation(new Request(`https://api.example.test${path}`), { fetch } as unknown as Fetcher)
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("handles HEAD and rejects non-read methods without serving assets", async () => {
    const fetch = vi.fn(async () => new Response(null))
    const assets = { fetch } as unknown as Fetcher
    expect(await (await serveApiDocumentation(new Request("https://api.example.test/docs", { method: "HEAD" }), assets)).text()).toBe("")
    fetch.mockClear()
    expect((await serveApiDocumentation(new Request("https://api.example.test/docs", { method: "POST" }), assets)).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
    expect(isApiDocumentationRequest(new Request("https://api.example.test/v2/server/1"))).toBe(false)
  })

  it("reports missing/unavailable deployed documentation instead of an empty successful reference", async () => {
    const request = new Request("https://api.example.test/openapi.json")
    for (const fetch of [async () => new Response(null, { status: 404 }), async () => { throw new Error("binding unavailable") }]) {
      expect((await serveApiDocumentation(request, { fetch } as unknown as Fetcher)).status).toBe(503)
    }
  })
})
