import { Effect } from "effect"

import { InvalidRequest, PayloadTooLarge } from "./errors.js"

export const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024

/** Enforce the byte limit while reading, including chunked/undeclared bodies. */
export const readBoundedText = (request: Pick<Request, "headers" | "body">, maxBytes = DEFAULT_JSON_BODY_LIMIT) => Effect.tryPromise({
  try: async (signal): Promise<string> => {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid JSON body limit")
    const declaredLength = request.headers.get("content-length")
    if (declaredLength !== null && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxBytes) {
      await request.body?.cancel()
      throw new PayloadTooLarge({ message: `JSON body exceeds ${maxBytes} bytes` })
    }
    if (request.body === null) throw new InvalidRequest({ message: "Request body must be valid JSON" })
    const reader = request.body.getReader()
    const abort = () => { void reader.cancel(signal.reason).catch(() => undefined) }
    signal.addEventListener("abort", abort, { once: true })
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let size = 0
    let text = ""
    try {
      while (true) {
        signal.throwIfAborted()
        const chunk = await reader.read()
        signal.throwIfAborted()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          throw new PayloadTooLarge({ message: `JSON body exceeds ${maxBytes} bytes` })
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
      return text
    } catch (cause) {
      await reader.cancel().catch(() => undefined)
      throw cause
    } finally {
      signal.removeEventListener("abort", abort)
      reader.releaseLock()
    }
  },
  catch: (cause) => cause instanceof PayloadTooLarge || cause instanceof InvalidRequest
    ? cause
    : new InvalidRequest({ message: "Request body must be valid JSON" }),
})

export const readBoundedJson = (request: Pick<Request, "headers" | "body">, maxBytes = DEFAULT_JSON_BODY_LIMIT) =>
  readBoundedText(request, maxBytes).pipe(Effect.flatMap((text) => Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new InvalidRequest({ message: "Request body must be valid JSON" }),
  })))
