// Project the exact Go dependency snapshot; never downloads or modifies asset sources.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const dependency = JSON.parse(execFileSync("go", ["list", "-m", "-json", "github.com/clashkinginc/clashy.go"], { encoding: "utf8" }))
if (dependency.Replace) throw new Error("A replaced/dirty clashy.go dependency is not a release metadata source")
const read = (path) => readFileSync(resolve(dependency.Dir, path), "utf8")
const source = read("static/static_data.json")
const translationsSource = read("static/translations.json")
const constants = read("constants.go")
const data = JSON.parse(source)
const translations = JSON.parse(translationsSource)
const names = (constant) => {
  const body = constants.match(new RegExp(`${constant} = \\[\\]string\\{([\\s\\S]*?)\\n\\t\\}`))?.[1]
  if (body === undefined) throw new Error(`Missing generated constant ${constant}`)
  return [...body.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(([name]) => JSON.parse(name))
}
const sections = ["buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment",
  "decorations", "obstacles", "sceneries", "skins", "capital_house_parts", "capital_leagues", "helpers",
  "war_leagues", "league_tiers", "builder_leagues", "achievements"]
const project = (item) => ({
  id: item._id ?? null, name: item.name ?? "", village: item.village ?? "", type: item.type ?? "", category: item.category ?? "",
  icon: typeof item.icon === "string" ? item.icon : "", isSuperTroop: item.super_troop != null,
  names: translations[item.TID?.name] ?? {},
  levels: (item.levels ?? []).map((level) => typeof level === "number" ? { level, townHall: null } : {
    level: level.level ?? 0, townHall: level.required_townhall ?? null,
  }),
})
const sha256 = (value) => createHash("sha256").update(value).digest("hex")
const output = {
  source: { module: dependency.Path, version: dependency.Version, sum: dependency.Sum,
    staticSha256: sha256(source), translationsSha256: sha256(translationsSource), constantsSha256: sha256(constants) },
  roster: { troops: [...names("ElixirTroopOrder"), ...names("DarkElixirTroopOrder")],
    spells: [...names("ElixirSpellOrder"), ...names("DarkElixirSpellOrder")], heroes: names("HomeBaseHeroOrder") },
  sections: Object.fromEntries(sections.map((section) => [section, data[section].map(project)])),
}
const target = "workers/api/src/static-metadata-data.json"
const approvalTarget = "workers/api/src/ticket-approval-static-data.json"
const approvalSerialized = JSON.stringify({ source: output.source, equipmentOrder: names("EquipmentOrder"),
  equipmentHeroes: Object.fromEntries(data.equipment.map(item => [item.name, item.hero])) }, null, 2) + "\n"
// One item per line keeps the generated projection reviewable without the full combat-stat bundle.
const serialized = JSON.stringify(output).replaceAll('},{"id":', '},\n{"id":') + "\n"
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== serialized) throw new Error("Worker static metadata differs from the pinned Go dependency; regenerate")
  if (readFileSync(approvalTarget, "utf8") !== approvalSerialized) throw new Error("Ticket approval metadata differs from the pinned Go dependency; regenerate")
  console.log(`Verified ${target} against ${dependency.Path}@${dependency.Version}`)
} else if (process.argv.includes("--patch")) {
  process.stdout.write(`*** Begin Patch\n*** Add File: ${target}\n${serialized.trimEnd().split("\n").map((line) => `+${line}`).join("\n")}\n*** Add File: ${approvalTarget}\n${approvalSerialized.trimEnd().split("\n").map(line => `+${line}`).join("\n")}\n*** End Patch`)
} else if (process.argv.includes("--ticket-approval-patch")) {
  process.stdout.write(`*** Begin Patch\n*** Add File: ${approvalTarget}\n${approvalSerialized.trimEnd().split("\n").map(line => `+${line}`).join("\n")}\n*** End Patch`)
} else {
  throw new Error("Use --check, --patch or --ticket-approval-patch and apply the returned patch")
}
