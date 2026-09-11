#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import pg from "pg"

const mention = /^<@([0-9]+)>$/u
const snowflake = /^[0-9]+$/u

export function validLayoutLink(value) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "link.clashofclans.com" &&
      url.searchParams.getAll("action").length === 1 && url.searchParams.get("action") === "OpenLayout" &&
      url.searchParams.getAll("id").length === 1 && (url.searchParams.get("id")?.length ?? 0) > 0
  } catch { return false }
}

export function parseLegacyBaseRows(value) {
  if (!Array.isArray(value)) throw new Error("Legacy base export must be a JSON array")
  const accepted = new Map(), skipped = []
  for (const [index, raw] of value.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { skipped.push({ index, reason: "row is not an object" }); continue }
    const messageId = raw.message_id, baseLink = raw.base_link, createdAt = raw.created_at
    if (typeof messageId !== "string" || !snowflake.test(messageId)) { skipped.push({ index, reason: "invalid message_id" }); continue }
    if (!validLayoutLink(baseLink)) { skipped.push({ index, messageId, reason: "invalid base_link" }); continue }
    const date = new Date(createdAt)
    if ((typeof createdAt !== "string" && !(createdAt instanceof Date)) || Number.isNaN(date.valueOf())) { skipped.push({ index, messageId, reason: "invalid created_at" }); continue }
    if (!Array.isArray(raw.downloaders)) { skipped.push({ index, messageId, reason: "downloaders must be an array" }); continue }
    const downloaders = [...new Set(raw.downloaders.flatMap((entry) => {
      const match = typeof entry === "string" ? mention.exec(entry.trim()) : null
      return match === null ? [] : [match[1]]
    }))].sort()
    const previous = accepted.get(messageId)
    if (previous !== undefined) {
      if (previous.baseLink !== baseLink) { skipped.push({ index, messageId, reason: "duplicate message_id has a different base_link" }); continue }
      previous.createdAt = previous.createdAt < date.toISOString() ? previous.createdAt : date.toISOString()
      previous.downloaders = [...new Set([...previous.downloaders, ...downloaders])].sort()
      continue
    }
    accepted.set(messageId, { messageId, baseLink, createdAt: date.toISOString(), downloaders })
  }
  return { inputRows: value.length, rows: [...accepted.values()].sort((a, b) => a.messageId.localeCompare(b.messageId)), skipped }
}

export async function importLegacyBases(client, parsed) {
  const result = { insertedBases: 0, existingBases: 0, insertedDownloaders: 0, skippedConflicts: [], verification: [] }
  await client.query("BEGIN")
  try {
    for (const row of parsed.rows) {
      const inserted = await client.query(`INSERT INTO bases(base_link,message_id,created_at,server_id,channel_id,description)
        VALUES ($1,$2,$3,NULL,NULL,'') ON CONFLICT (message_id) DO NOTHING RETURNING id::text`, [row.baseLink, row.messageId, row.createdAt])
      let baseId = inserted.rows[0]?.id
      if (baseId === undefined) {
        const existing = await client.query("SELECT id::text,base_link FROM bases WHERE message_id=$1", [row.messageId])
        if (existing.rows[0]?.base_link !== row.baseLink) {
          result.skippedConflicts.push({ messageId: row.messageId, reason: "existing SQL base has a different base_link" })
          continue
        }
        baseId = existing.rows[0].id
        result.existingBases++
      } else result.insertedBases++
      if (row.downloaders.length > 0) {
        const downloader = await client.query(`INSERT INTO base_downloaders(base_id,user_id)
          SELECT $1::bigint,user_id FROM unnest($2::text[]) user_id ON CONFLICT (base_id,user_id) DO NOTHING RETURNING user_id`, [baseId, row.downloaders])
        result.insertedDownloaders += downloader.rowCount
      }
    }
    const ids = parsed.rows.map((row) => row.messageId)
    if (ids.length > 0) {
      const verified = await client.query(`SELECT base.message_id,count(downloader.user_id)::integer AS download_count
        FROM bases base LEFT JOIN base_downloaders downloader ON downloader.base_id=base.id
        WHERE base.message_id=ANY($1::text[]) GROUP BY base.id ORDER BY base.message_id`, [ids])
      result.verification = verified.rows.map((row) => ({ messageId: row.message_id, downloadCount: Number(row.download_count) }))
    }
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

const parseArguments = (argv) => {
  const options = { dryRun: false, allowRemote: false, input: undefined }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === "--dry-run") options.dryRun = true
    else if (value === "--allow-remote") options.allowRemote = true
    else if (value === "--input") options.input = argv[++index]
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (!options.input) throw new Error("Usage: node scripts/import-legacy-bases.mjs --input EXPORT.json [--dry-run] [--allow-remote]")
  return options
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const parsed = parseLegacyBaseRows(JSON.parse(await readFile(resolve(options.input), "utf8")))
  const summary = { inputRows: parsed.inputRows, validBases: parsed.rows.length,
    validDownloaderIdentities: parsed.rows.reduce((sum, row) => sum + row.downloaders.length, 0), skipped: parsed.skipped }
  if (options.dryRun) { console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2)); return }
  const connectionString = process.env.LEGACY_BASE_IMPORT_DATABASE_URL
  if (!connectionString) throw new Error("LEGACY_BASE_IMPORT_DATABASE_URL is required unless --dry-run is used")
  const target = new URL(connectionString)
  if (!options.allowRemote && !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Remote database imports require --allow-remote")
  const client = new pg.Client({ connectionString })
  await client.connect()
  try { console.log(JSON.stringify({ mode: "import", ...summary, ...await importLegacyBases(client, parsed) }, null, 2)) }
  finally { await client.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
