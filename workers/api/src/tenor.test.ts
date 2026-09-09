import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { parseTenorMetadata, TenorResolver } from "./tenor.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

const resolve = () => Effect.runPromise(Effect.gen(function* () {
  return yield* (yield* TenorResolver).resolve("https://tenor.com/view/example-123456")
}).pipe(Effect.provide(TenorResolver.layer), Effect.provide(WorkerEnvironment.layer({
  TENOR_ALLOWED_HOSTS: "tenor.com", TENOR_MEDIA_ALLOWED_HOSTS: "media.tenor.com",
} as WorkerBindings))))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("parseTenorMetadata", () => {
  it("accepts safe meta attributes regardless of attribute order", () => {
    expect(parseTenorMetadata(`
      <meta content="640" property="og:image:width">
      <meta property='og:image:height' content='480'>
      <meta content="https://media.tenor.com/example.gif?x=1&amp;y=2" name="og:image">
    `)).toEqual({
      "og:image": "https://media.tenor.com/example.gif?x=1&amp;y=2",
      "og:image:height": "480",
      "og:image:width": "640",
    })
  })

  it("ignores unrelated and incomplete metadata", () => {
    expect(parseTenorMetadata(`
      <meta property="og:title" content="Not media">
      <meta property="og:image">
    `)).toEqual({})
  })
})

describe("Tenor upstream bounds", () => {
  it("parses safe dimensions and allowlisted media", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('<meta property="og:image" content="https://media.tenor.com/a.gif"><meta property="og:image:width" content="640">')))
    expect(await resolve()).toEqual({ provider: "tenor", id: "123456", media_url: "https://media.tenor.com/a.gif", width: 640, height: 0 })
  })
  it("cancels redirect bodies before rejecting a forbidden destination", async () => {
    const cancel = vi.fn()
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: "https://private.test" } }))
    vi.stubGlobal("fetch", fetcher)
    await expect(resolve()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it("rejects and cancels oversized undeclared HTML", async () => {
    const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)) }, cancel }))))
    await expect(resolve()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(cancel).toHaveBeenCalledOnce()
  })
  it("uses one deadline through redirects and cancels a stalled final body", async () => {
    const deadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
    const cancel = vi.fn()
    let bodyStarted!: () => void
    const started = new Promise<void>((done) => { bodyStarted = done })
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/view/other-123456" } }))
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ pull() { bodyStarted() }, cancel }))))
    const result = resolve()
    const rejected = expect(result).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    await started
    deadline.abort()
    await rejected
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledOnce()
  })
})
