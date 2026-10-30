import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

import { loadLocalApiSecrets } from "./local-api-keychain.mjs"

const target = resolve(process.argv[2] ?? "")
if (basename(target) !== ".dev.vars") throw new Error("Provide the Bot worker .dev.vars path")

const original = readFileSync(target, "utf8")
const lines = original.split("\n")
const replacements = new Map([
  ["CLASHKING_API_BASE_URL", "http://127.0.0.1:8787"],
  ["CLASHKING_API_TOKEN", loadLocalApiSecrets().API_BOT_TOKEN],
])
const counts = new Map([...replacements.keys()].map((key) => [key, 0]))
const updated = lines.map((line) => {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=/u.exec(line)
  if (match === null || !replacements.has(match[1])) return line
  counts.set(match[1], (counts.get(match[1]) ?? 0) + 1)
  return `${match[1]}=${replacements.get(match[1])}`
})
for (const [key, count] of counts) if (count !== 1) throw new Error(`Expected exactly one ${key} entry; found ${count}`)

const temporary = join(dirname(target), `.dev.vars.${process.pid}.tmp`)
const mode = statSync(target).mode
writeFileSync(temporary, updated.join("\n"), { mode })
chmodSync(temporary, mode)
renameSync(temporary, target)
console.log(JSON.stringify({ event: "local_bot_api_config_synced", keys: [...replacements.keys()] }))
