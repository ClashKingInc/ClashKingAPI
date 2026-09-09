import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Plugin } from "vite"

/** Node-only test adapter. Production Wrangler uses CompiledWasm/Data modules;
 * war-archive-runtime.test.ts verifies those imports inside workerd directly. */
export const archiveAssetsPlugin = (): Plugin => ({
  name: "clashking-test-archive-assets",
  enforce: "pre",
  resolveId(source, importer) {
    if ((!source.endsWith(".wasm") && !source.endsWith(".zdict")) || !importer) return undefined
    const path = resolve(dirname(importer), source)
    const encoded = readFileSync(path).toString("base64")
    const bytes = `Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0))`
    const code = `export default ${path.endsWith(".wasm") ? `new WebAssembly.Module(${bytes})` : `${bytes}.buffer`};`
    // A native data module also works when Vitest externalizes node_modules;
    // a virtual protocol is delegated to Node by Vitest and cannot be loaded.
    return { id: `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`, external: true }
  },
})
