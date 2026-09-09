import { strToU8, Zip, ZipDeflate } from "fflate"

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const MAX_EXPORT_ROWS = 20_000
export const MAX_EXPORT_WARS = 1_000
const MAX_XML_BYTES = 8 * 1024 * 1024
type Cell = string | number
export interface ExportSheet {
  readonly name: string
  readonly rows: ReadonlyArray<ReadonlyArray<Cell>>
  readonly titleColumns: number
  readonly boldRows: ReadonlyArray<number>
  readonly sectionRows?: ReadonlyArray<number>
  readonly boldFirstColumnRows?: ReadonlyArray<number>
}
// oxlint-disable-next-line eslint/no-control-regex -- XML 1.0 forbids these control characters.
const escapeXml = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")
const column = (index: number): string => String.fromCharCode(65 + index)

function* worksheetChunks(sheet: ExportSheet): Generator<Uint8Array> {
  yield strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${sheet.titleColumns}" width="18" customWidth="1"/></cols><sheetData>`)
  for (const [index, cells] of sheet.rows.entries()) {
    const row = index + 1
    const style = row === 1 ? 2 : sheet.sectionRows?.includes(row) ? 3 : sheet.boldRows.includes(row) ? 1 : 0
    yield strToU8(`<row r="${row}">${cells.map((value, col) => {
      const ref = `${column(col)}${row}`
      const cellStyle = col === 0 && sheet.boldFirstColumnRows?.includes(row) ? 1 : style
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Export contains a non-finite number")
        return `<c r="${ref}" s="${cellStyle}"><v>${value}</v></c>`
      }
      if (value.length > 32_767) throw new Error("Export contains an oversized text cell")
      return `<c r="${ref}" s="${cellStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
    }).join("")}</row>`)
  }
  yield strToU8(`</sheetData><mergeCells count="1"><mergeCell ref="A1:${column(sheet.titleColumns - 1)}1"/></mergeCells></worksheet>`)
}

/** Preflight then pull-driven ZIP: never materializes worksheet XML or the full binary. */
export const createWarWorkbookStream = (sheet: ExportSheet): ReadableStream<Uint8Array> => {
  if (sheet.rows.length > MAX_EXPORT_ROWS + 20) throw new Error("Export exceeds the supported row count")
  let size = 0
  for (const chunk of worksheetChunks(sheet)) {
    size += chunk.byteLength
    if (size > MAX_XML_BYTES) throw new Error("Export exceeds the supported workbook size; request fewer hits")
  }
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4">${[0, 1, 2, 3].map((fontId) => `<xf numFmtId="0" fontId="${fontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`).join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  }
  let controller: ReadableStreamDefaultController<Uint8Array>
  const zip = new Zip((error, chunk, final) => {
    if (error) { controller.error(error); return }
    if (chunk.byteLength) controller.enqueue(chunk)
    if (final) controller.close()
  })
  function* produce() {
    for (const [name, bytes] of Object.entries(files)) {
      const file = new ZipDeflate(name, { level: 1 })
      zip.add(file)
      yield
      file.push(bytes, true)
      yield
    }
    const worksheet = new ZipDeflate("xl/worksheets/sheet1.xml", { level: 1 })
    zip.add(worksheet)
    yield
    for (const chunk of worksheetChunks(sheet)) { worksheet.push(chunk); yield }
    worksheet.push(new Uint8Array(), true)
    yield
    zip.end()
  }
  const steps = produce()
  return new ReadableStream({
    start(value) { controller = value },
    pull() {
      try {
        while ((controller.desiredSize ?? 0) > 0) if (steps.next().done) break
      } catch (cause) { controller.error(cause); zip.terminate() }
    },
    cancel() { zip.terminate(); steps.return() },
  })
}

export const safeExportFilename = (value: string): string => value.replaceAll(" ", "_")
  .replace(/[^A-Za-z0-9_.-]/gu, "_").slice(0, 180)
