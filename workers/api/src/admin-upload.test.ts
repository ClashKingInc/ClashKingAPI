import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { AccessIdentity } from "./access.js"
import { dispatchAdmin, type AdminWorkerBindings } from "./admin.js"
import { Forbidden } from "./errors.js"

const MAX_FILE = 25 * 1024 * 1024
const principal = { id: "access-subject", email: "owner@example.com", username: "owner@example.com", display_name: "Owner", role: "owner" as const,
  active: true }
const harness = (authorized = true, publicOrigin = "https://posts.example.com") => {
  const put = vi.fn(async (_key: string, _body: unknown, _options: unknown) => ({}))
  const access = AccessIdentity.of({ requireAdmin: () => authorized
    ? Effect.succeed(principal) : Effect.fail(new Forbidden({ message: "Cloudflare Access assertion is invalid" })) })
  const bindings = { POSTS_PUBLIC_ORIGIN: publicOrigin, POSTS: { put } } as unknown as AdminWorkerBindings
  const run = (request: Request) => Effect.runPromise(dispatchAdmin(request, bindings).pipe(
    Effect.provideService(AccessIdentity, access), Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
  ))
  return { put, run }
}
const upload = (kind: string, size: number) => {
  const form = new FormData()
  form.set("file", new File([new Uint8Array(size)], kind === "stories" ? "story.html" : "image.png"))
  return new Request(`https://api.clashk.ing/v2/admin/${kind}/upload`, { method: "POST", body: form })
}

describe("Admin multipart ingress", () => {
  it.each(["media", "stories"])("validates the public origin before writing a %s object", async (kind) => {
    const test = harness(true, "http://invalid.example.com")
    await expect(test.run(upload(kind, 10))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(test.put).not.toHaveBeenCalled()
  })
  it.each(["media", "stories"])("accepts the exact file limit and preserves the %s R2 response", async (kind) => {
    const test = harness()
    const response = await test.run(upload(kind, MAX_FILE))
    expect(response?.status).toBe(200)
    const value = await response!.json() as { url: string; size_bytes?: number; checksum?: string }
    expect(value.url).toMatch(/^https:\/\/posts\.example\.com\/admin-/u)
    expect(test.put).toHaveBeenCalledOnce()
    if (kind === "stories") {
      expect(value.size_bytes).toBe(MAX_FILE)
      expect(value.checksum).toMatch(/^[a-f0-9]{64}$/u)
    }
  })

  it.each(["media", "stories"])("rejects an oversized %s file before storage writes", async (kind) => {
    const test = harness()
    await expect(test.run(upload(kind, MAX_FILE + 1))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(test.put).not.toHaveBeenCalled()
  })

  it("authorizes before consuming or parsing an oversized body", async () => {
    const test = harness(false)
    const request = new Request("https://api.clashk.ing/v2/admin/media/upload", { method: "POST", body: "not multipart", headers: { "content-length": "999999999" } })
    await expect(test.run(request)).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(request.bodyUsed).toBe(false)
    expect(test.put).not.toHaveBeenCalled()
  })

  it.each([undefined, "1"])("bounds actual total request bytes with Content-Length %s", async (length) => {
    const test = harness()
    let cancelled = false
    const request = new Request("https://api.clashk.ing/v2/admin/stories/upload", { method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=example", ...(length === undefined ? {} : { "content-length": length }) },
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) }, cancel() { cancelled = true } }), duplex: "half",
    } as RequestInit)
    await expect(test.run(request)).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(cancelled).toBe(true)
    expect(test.put).not.toHaveBeenCalled()
  })

  it("rejects an excessive declared multipart length before parsing", async () => {
    const test = harness()
    const request = new Request("https://api.clashk.ing/v2/admin/media/upload", { method: "POST", body: "x",
      headers: { "content-type": "multipart/form-data; boundary=example", "content-length": String(26 * 1024 * 1024 + 1) } })
    await expect(test.run(request)).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(test.put).not.toHaveBeenCalled()
  })
})
