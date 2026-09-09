import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { resolveDiscohook } from "./discohook.js"

const run = (url: string, fetcher: typeof fetch) => Effect.runPromise(resolveDiscohook(url, fetcher).pipe(
  Effect.catch((failure) => Effect.succeed({ error: failure._tag })),
))

describe("bounded Discohook resolver", () => {
  it.each(["http://discohook.app/a", "https://discohook.app.evil.test/a", "https://user@discohook.app/a", "https://discohook.app:8443/a"])("rejects disallowed initial URL %s", async (url) => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await run(url, fetcher)).toEqual({ error: "InvalidRequest" })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("unwraps a non-null data envelope and preserves direct objects", async () => {
    expect(await run("https://discohook.app/api/v1/share/a", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { content: "hello" } })))).toEqual({ payload: { content: "hello" } })
    expect(await run("https://discohook.app/api/v1/share/a", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: null, content: "hello" })))).toEqual({ payload: { data: null, content: "hello" } })
  })
  it("cancels redirect bodies and refuses to fetch a disallowed destination", async () => {
    const cancel = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: "https://private.test/secret" } }))
    expect(await run("https://share.discohook.app/a", fetcher)).toEqual({ error: "UnprocessableEntity" })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it("returns an allowlisted data redirect without consuming its body", async () => {
    const cancel = vi.fn()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://discohook.app/?data=abc" } }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel })))
    expect(await run("https://share.discohook.app/a", fetcher)).toEqual({ resolvedUrl: "https://discohook.app/?data=abc" })
    expect(cancel).toHaveBeenCalledOnce()
  })
  it.each(["not json", "[]", "42"])("rejects invalid payload %s", async (body) => {
    expect(await run("https://discohook.app/a", vi.fn<typeof fetch>().mockResolvedValue(new Response(body)))).toEqual({ error: "UnprocessableEntity" })
  })
  it("bounds undeclared response bytes and cancels the stream", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)) }, cancel })
    expect(await run("https://discohook.app/a", vi.fn<typeof fetch>().mockResolvedValue(new Response(body)))).toEqual({ error: "UnprocessableEntity" })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
