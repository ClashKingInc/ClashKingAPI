/** Pinned ABI from @bokuweb/zstd-wasm 0.0.27, dist/esm/zstd.js.
 * Instantiate the bundled module, never compile downloaded bytes in Workers.
 * The wrapper bounds allocations before decompression and releases every pointer.
 */
export const MAX_ARCHIVE_FRAME_BYTES = 2 * 1024 * 1024
export const MAX_ARCHIVE_JSON_BYTES = 8 * 1024 * 1024
const MAX_WASM_BYTES = 64 * 1024 * 1024

interface ZstdExports {
  f: WebAssembly.Memory
  g: () => void
  h: (result: number) => number
  n: () => number
  o: (context: number) => number
  q: (context: number, output: number, capacity: number, input: number, length: number, dictionary: number, dictionaryLength: number) => number
  s: (length: number) => number
  t: (pointer: number) => void
}

export const createArchiveDecoder = (module: WebAssembly.Module, dictionary: Uint8Array) => {
  let memory: WebAssembly.Memory | undefined
  const abort = (): never => { throw new Error("Archive decoder aborted") }
  const instance = new WebAssembly.Instance(module, { a: {
    a: abort,
    b: () => undefined,
    c: abort,
    d: abort,
    e: (requested: number) => {
      if (!memory || requested > MAX_WASM_BYTES) return 0
      try {
        memory.grow(Math.max(0, Math.ceil((requested - memory.buffer.byteLength) / 65_536)))
        return 1
      } catch { return 0 }
    },
  } })
  for (const name of ["g", "h", "n", "o", "q", "s", "t"]) {
    if (typeof instance.exports[name] !== "function") throw new Error("Unsupported Zstandard ABI")
  }
  if (!(instance.exports.f instanceof WebAssembly.Memory)) throw new Error("Unsupported Zstandard memory")
  const wasm = instance.exports as unknown as ZstdExports
  memory = wasm.f
  wasm.g()
  const allocate = (length: number) => {
    const pointer = wasm.s(length)
    if (!pointer) throw new Error("Archive decoder allocation failed")
    return pointer
  }
  return (compressed: Uint8Array): Uint8Array => {
    if (compressed.byteLength === 0 || compressed.byteLength > MAX_ARCHIVE_FRAME_BYTES) {
      throw new Error("Archive frame exceeds supported size")
    }
    let input = 0, dict = 0, output = 0, context = 0
    try {
      input = allocate(compressed.byteLength)
      new Uint8Array(wasm.f.buffer).set(compressed, input)
      dict = allocate(dictionary.byteLength)
      new Uint8Array(wasm.f.buffer).set(dictionary, dict)
      output = allocate(MAX_ARCHIVE_JSON_BYTES)
      context = wasm.n()
      if (!context) throw new Error("Archive decoder context allocation failed")
      const size = wasm.q(context, output, MAX_ARCHIVE_JSON_BYTES, input, compressed.byteLength, dict, dictionary.byteLength)
      if (wasm.h(size) || size < 0 || size > MAX_ARCHIVE_JSON_BYTES) {
        throw new Error("Archive frame is invalid or exceeds decoded size limit")
      }
      return new Uint8Array(wasm.f.buffer, output, size).slice()
    } finally {
      if (context) wasm.o(context)
      if (input) wasm.t(input)
      if (dict) wasm.t(dict)
      if (output) wasm.t(output)
    }
  }
}
