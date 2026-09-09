import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { createArchiveDecoder, MAX_ARCHIVE_FRAME_BYTES, MAX_ARCHIVE_JSON_BYTES } from "./war-archive-codec.js"

const dictionary = readFileSync("workers/api/assets/war-json.zdict")
const module = new WebAssembly.Module(readFileSync("node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm"))
describe("war archive dictionary codec", () => {
  it("decodes the real archive dictionary, repeatedly without retaining prior output", () => {
    const decode = createArchiveDecoder(module, dictionary)
    const source = Buffer.from('{"type":"cwl","clan":{"tag":"#ABC","members":[]}}')
    const compressed = zstdCompressSync(source, { dictionary })
    for (let index = 0; index < 20; index++) expect(decode(compressed)).toEqual(new Uint8Array(source))
  })
  it("rejects corrupt frames and survives a subsequent valid decode", () => {
    const decode = createArchiveDecoder(module, dictionary)
    expect(() => decode(new Uint8Array([1, 2, 3]))).toThrow("invalid")
    expect(new TextDecoder().decode(decode(zstdCompressSync("valid", { dictionary })))).toBe("valid")
  })
  it("bounds both compressed and decompressed sizes", () => {
    const decode = createArchiveDecoder(module, dictionary)
    expect(() => decode(new Uint8Array(MAX_ARCHIVE_FRAME_BYTES + 1))).toThrow("supported size")
    expect(() => decode(zstdCompressSync(Buffer.alloc(MAX_ARCHIVE_JSON_BYTES + 1), { dictionary }))).toThrow("decoded size limit")
  })
})
