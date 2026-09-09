import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { strFromU8, unzipSync } from "fflate"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("streams a valid XLSX inside workerd without Node filesystem APIs", async () => {
  const result = await build({ stdin: { contents: `
    import { createWarWorkbookStream, XLSX_MIME } from "./workers/api/src/war-export-workbook.ts";
    export default { fetch() { return new Response(createWarWorkbookStream({
      name: "War Stats", rows: [["War Statistics"], [], ["Player", "Stars"], ["=NotAFormula", 3]],
      titleColumns: 10, boldRows: [3]
    }), {headers: {"content-type": XLSX_MIME}}) }};
  `, resolveDir: fileURLToPath(new URL("../../../../", import.meta.url)) }, bundle: true, write: false, format: "esm", platform: "browser" })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Workbook test bundle missing")
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-08-22" }))
  try {
    const response = await runtime.dispatchFetch("https://exports.test")
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!)
    expect(xml).toContain('t="inlineStr"')
    expect(xml).toContain("=NotAFormula")
    expect(xml).toContain('<c r="B4" s="0"><v>3</v></c>')
  } finally { await runtime.dispose() }
}, 30_000)
