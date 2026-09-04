import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readDashboardMultipart, uploadMediaFile } from "./dashboard-upload.js"

afterEach(() => vi.unstubAllGlobals())
describe("Dashboard R2 upload boundary", () => {
  it("writes only public media keys and uses the canonical API read URL", async () => {
    const put = vi.fn(async () => ({ key: "uploads/base_123.png" }) as R2Object)
    const network = vi.fn(); vi.stubGlobal("fetch", network)
    expect(await Effect.runPromise(uploadMediaFile({ MEDIA: { put } }, "base_123.png", new File(["image"], "image.png"))))
      .toEqual({ url: "https://api.clashk.ing/v2/media/base_123.png", filename: "base_123.png" })
    expect(put).toHaveBeenCalledWith("uploads/base_123.png", expect.any(ReadableStream), expect.objectContaining({
      customMetadata: { visibility: "public-media", filename: "base_123.png" }, onlyIf: { etagDoesNotMatch: "*" },
    }))
    expect(network).not.toHaveBeenCalled()
  })
  it("rejects path traversal before network access", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    await expect(Effect.runPromise(uploadMediaFile({}, "base_../foreign.png", new File(["x"], "image.png")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("enforces declared and streamed multipart limits", async () => {
    const declared = new Request("https://api.clashk.ing", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "100" }, body: "x" })
    await expect(Effect.runPromise(readDashboardMultipart(declared, 10))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    const streamed = new Request("https://api.clashk.ing", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body: "01234567890123456789" })
    await expect(Effect.runPromise(readDashboardMultipart(streamed, 10))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
  })
})
