import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"
import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("decodes the production dictionary inside workerd with static WASM imports", async () => {
  const dictionary = readFileSync("internal/wararchive/war-json.zdict")
  const compressed = zstdCompressSync("dictionary round trip", { dictionary })
  const result = await build({
    stdin: { contents: `
      import { createArchiveDecoder } from "./workers/api/src/war-archive-codec.ts";
      import wasm from "./zstd.wasm";
      import dictionary from "./dictionary.bin";
      const decode = createArchiveDecoder(wasm, new Uint8Array(dictionary));
      export default { fetch() {
        const frame = Uint8Array.from(atob("${compressed.toString("base64")}"), c => c.charCodeAt(0));
        return new Response(decode(frame));
      }};
    `, resolveDir: process.cwd() },
    external: ["./zstd.wasm", "./dictionary.bin"], bundle: true, write: false, format: "esm", platform: "browser",
  })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Archive test bundle missing")
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modulesRoot: "/archive-test",
    modules: [
      { type: "ESModule", path: "/archive-test/index.js", contents: script },
      { type: "CompiledWasm", path: "/archive-test/zstd.wasm", contents: readFileSync("node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm") },
      { type: "Data", path: "/archive-test/dictionary.bin", contents: dictionary },
    ],
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
  }))
  try {
    const response = await runtime.dispatchFetch("https://archive.test")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("dictionary round trip")
  } finally { await runtime.dispose() }
}, 30_000)
