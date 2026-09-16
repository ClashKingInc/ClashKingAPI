import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, expect, it, vi } from "vitest"
import { BotAdjacentStore } from "./bot-adjacent-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

afterEach(() => vi.unstubAllGlobals())

it.each([200, 302, 403])("stages images without following redirects (HTTP %s)", async (status) => {
  const source = "https://cdn.discordapp.com/attachments/123/456/image.jpg"
  const imageUrl = "https://api.clashk.ing/v2/media/base_test.jpg"
  const response = new Response("image", { status, headers: {
    "content-type": "image/jpeg", ...(status === 302 ? { location: "https://untrusted.example/image" } : {}),
  } })
  const cancel = vi.spyOn(response.body!, "cancel")
  const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
    // Match the edge runtime: Node's fetch accepts "error", but workerd does not.
    if (options.redirect === "error") throw new TypeError("Invalid redirect value")
    return response
  })
  vi.stubGlobal("fetch", fetchMock)
  const query = vi.fn().mockImplementationOnce(() => Effect.succeed([{ image_url: null }]))
    .mockImplementation(() => Effect.succeed([{ image_url: imageUrl }]))
  const put = vi.fn(async () => ({ key: "test" }))
  const bindings = Object.assign({} as WorkerBindings, { MEDIA: { put } })
  const sql = Object.assign({} as SqlClient.SqlClient, { unsafe: query })
  const layer = BotAdjacentStore.layer.pipe(Layer.provide(Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.mock(DiscordApi, {}), WorkerEnvironment.layer(bindings),
  )))
  const result = Effect.runPromise(Effect.gen(function* () {
    return yield* (yield* BotAdjacentStore).stageLegacyBaseImage("157912", 1, source)
  }).pipe(Effect.provide(layer)))
  if (status === 200) {
    await expect(result).resolves.toEqual({ baseId: "157912", position: 1, imageUrl })
    expect(put).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledTimes(2)
  } else {
    await expect(result).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(put).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledOnce()
  }
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL(source), { redirect: "manual", signal: expect.any(AbortSignal) })
})
