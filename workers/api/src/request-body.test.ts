import { Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"

import { readBoundedJson } from "./request-body.js"
import { encodeJson, failureResponse, recoverDefect } from "./router.js"

const request = (body: BodyInit, headers?: HeadersInit) => new Request("https://api.test/v2/example", {
  method: "POST", body, headers, duplex: "half",
} as RequestInit)

describe("bounded JSON request bodies", () => {
  it("accepts valid JSON exactly at its byte limit", async () => {
    expect(await Effect.runPromise(readBoundedJson(request('{"a":1}'), 7))).toEqual({ a: 1 })
  })
  it("rejects an oversized declared body before reading it", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const response = await Effect.runPromise(readBoundedJson(request(body, { "content-length": "20" }), 7).pipe(
      Effect.catch((failure) => Effect.succeed(failureResponse(failure, "request"))),
    )) as Response
    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it.each([undefined, "1"])("counts chunks even with declared length %s", async (declared) => {
    const chunks = ["{\"a\":", "123}"]
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(new TextEncoder().encode(chunk)) },
      cancel,
    })
    const response = await Effect.runPromise(readBoundedJson(request(body, declared ? { "content-length": declared } : undefined), 7).pipe(
      Effect.catch((failure) => Effect.succeed(failureResponse(failure, "request"))),
    )) as Response
    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it("counts UTF-8 bytes rather than string characters", async () => {
    const response = await Effect.runPromise(readBoundedJson(request('"é"'), 3).pipe(
      Effect.catch((failure) => Effect.succeed(failureResponse(failure, "request"))),
    )) as Response
    expect(response.status).toBe(413)
  })
  it("reports malformed JSON without reflecting the input", async () => {
    const response = await Effect.runPromise(readBoundedJson(request("private-broken-payload")).pipe(
      Effect.catch((failure) => Effect.succeed(failureResponse(failure, "request"))),
    )) as Response
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("private-broken-payload")
  })
  it("cancels an unfinished stream when its UTF-8 is malformed", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(0xff)) }, cancel,
    })
    await expect(Effect.runPromise(readBoundedJson(request(body)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(cancel).toHaveBeenCalledOnce()
  })
  it("treats invalid server output as generic500, never a client error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const response = await Effect.runPromise(encodeJson(Schema.Struct({ count: Schema.Number }), {
        count: "private-server-value",
      } as unknown as { count: number }).pipe(recoverDefect))
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain("private-server-value")
      expect(log).toHaveBeenCalledOnce()
    } finally { log.mockRestore() }
  })
})
