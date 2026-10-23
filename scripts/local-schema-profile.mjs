import { statSync } from "node:fs"
import { join } from "node:path"

// The schema repository owns the inventory. Validate its shape and files,
// rather than maintaining a second, inevitably stale list in the API repo.
export function validateLocalSchemaProfile(image, migrations, schemaRoot) {
  if (!/^timescale\/timescaledb:[A-Za-z0-9._-]+@sha256:[a-f0-9]{64}$/u.test(image ?? "")) {
    throw new Error("Authoritative schema profile requires a digest-pinned Timescale image")
  }
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new Error("Authoritative schema profile has no migrations")
  }
  for (const [index, file] of migrations.entries()) {
    const match = /^(\d{3,})_[a-z0-9_]+\.sql$/u.exec(file)
    if (!match || Number(match[1]) !== index + 1) {
      throw new Error(`Invalid or non-contiguous schema migration at position ${index + 1}: ${file}`)
    }
    let isFile = false
    try { isFile = statSync(join(schemaRoot, "database/timescale", file)).isFile() } catch {}
    if (!isFile) throw new Error(`Authoritative schema migration is missing: ${file}`)
  }
}
