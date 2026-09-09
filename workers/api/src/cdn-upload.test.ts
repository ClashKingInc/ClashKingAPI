import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthIdentity } from "./auth.js"
import { cdnUploadRuntimeRoutes, dispatchCdnUpload } from "./cdn-upload.js"
import { CDN_UPLOAD_EXTENSIONS, MAX_DASHBOARD_UPLOAD, uploadMediaFile } from "./dashboard-upload.js"
import { Unauthenticated } from "./errors.js"

afterEach(() => vi.unstubAllGlobals())
let provider = vi.fn(async (_key: string, _body: unknown, _options?: R2PutOptions) => ({} as R2Object))
const run = (request: Request, authenticated = true, key: string | undefined = "test-only") => Effect.runPromise(
  dispatchCdnUpload(request, key === undefined ? {} : { MEDIA: { put: provider } }).pipe(
    Effect.provideService(AuthIdentity, AuthIdentity.of({
      requireUser: () => authenticated ? Effect.succeed({ kind: "user", userId: "123", deviceId: "test" }) : Effect.fail(new Unauthenticated({ message: "Sign in required" })),
      requireBot: () => Effect.succeed({ kind: "bot" }),
      requireUserOrBot: () => Effect.fail(new Unauthenticated({ message: "Unused" })),
    })),
    Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
  ),
)
const request = (name?: string, contents: BlobPart = "file contents") => {
  const form = new FormData()
  if (name !== undefined) form.set("file", new File([contents], name))
  return new Request("https://api.clashk.ing/v2/cdn/upload", { method: "POST", body: form })
}
const mockProvider = (status = 201) => {
  provider = vi.fn(async (_key: string, _body: unknown, _options?: R2PutOptions) => {
    if (status >= 400) throw new Error("private provider failure")
    return {} as R2Object
  })
  return provider
}

describe("authenticated CDN upload", () => {
  it("owns the existing shared multipart descriptor", () => {
    const { method, path, auth, bodyMode } = dashboardEndpoints.dashboardCdnUpload
    expect(cdnUploadRuntimeRoutes).toEqual([{ method, path }])
    expect({ auth, bodyMode }).toEqual({ auth: "user", bodyMode: "multipart" })
  })

  it.each(CDN_UPLOAD_EXTENSIONS)("writes R2 media and returns API URLs for .%s", async (extension) => {
    const provider = mockProvider()
    const response = await run(request(`original-private-name.${extension.toUpperCase()}`))
    const body = await response!.json() as { url: string; filename: string }
    expect(response?.status).toBe(200)
    expect(body.filename).toMatch(new RegExp(`^embed_[0-9a-f-]{36}\\.${extension}$`, "u"))
    expect(body.url).toBe(`https://api.clashk.ing/v2/media/${body.filename}`)
    expect(provider.mock.calls[0]?.[0]).toBe(`uploads/${body.filename}`)
    expect(provider.mock.calls[0]?.[2]).toMatchObject({ customMetadata: { visibility: "public-media", filename: body.filename } })
    expect(await new Response(provider.mock.calls[0]?.[1] as ReadableStream).text()).toBe("file contents")
    expect(JSON.stringify(body)).not.toContain("original-private-name")
    expect(JSON.stringify(body)).not.toContain("test-only")
  })

  it("authenticates before consuming malformed multipart or contacting R2", async () => {
    const provider = mockProvider()
    const incoming = new Request("https://api.clashk.ing/v2/cdn/upload", { method: "POST", body: "malformed" })
    await expect(run(incoming, false)).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(incoming.bodyUsed).toBe(false)
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects a missing file and unsupported or missing extensions", async () => {
    const provider = mockProvider()
    await expect(run(request())).rejects.toMatchObject({ _tag: "InvalidRequest", message: "File is required" })
    for (const name of ["file.exe", "file", "file.png.exe"]) {
      await expect(run(request(name))).rejects.toMatchObject({ _tag: "InvalidRequest", status: 415 })
    }
    expect(provider).not.toHaveBeenCalled()
  })

  it("allows exactly 25 MiB but rejects a larger file even within the multipart cap", async () => {
    const provider = mockProvider()
    expect((await run(request("file.pdf", new Uint8Array(MAX_DASHBOARD_UPLOAD))))?.status).toBe(200)
    provider.mockClear()
    await expect(run(request("file.pdf", new Uint8Array(MAX_DASHBOARD_UPLOAD + 1)))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(provider).not.toHaveBeenCalled()
  })

  it.each([undefined, "1"])("caps actual streamed multipart overhead with Content-Length %s", async (declared) => {
    const provider = mockProvider()
    let cancelled = false
    const incoming = new Request("https://api.clashk.ing/v2/cdn/upload", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", ...(declared ? { "content-length": declared } : {}) },
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) }, cancel() { cancelled = true } }),
      duplex: "half",
    } as RequestInit)
    await expect(run(incoming)).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(cancelled).toBe(true)
    expect(provider).not.toHaveBeenCalled()
  })

  it("does not broaden image-only base and giveaway filename validation", async () => {
    const provider = mockProvider()
    for (const filename of ["base_123.pdf", "giveaway_123.svg", "embed_../bad.png", "embed_invalid.png"]) {
      await expect(Effect.runPromise(uploadMediaFile({ MEDIA: { put: provider } }, filename, new File(["x"], "x.png"))))
        .rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    expect(provider).not.toHaveBeenCalled()
  })

  it("maps provider failures without exposing their body", async () => {
    mockProvider(500)
    await expect(run(request("file.png"))).rejects.toMatchObject({ _tag: "UpstreamUnavailable", message: "File upload failed" })
  })

  it("ignores unrelated requests without authentication or uploads", async () => {
    const provider = mockProvider()
    expect(await run(new Request("https://api.clashk.ing/v2/cdn/upload"), false)).toBeUndefined()
    expect(provider).not.toHaveBeenCalled()
  })
})
