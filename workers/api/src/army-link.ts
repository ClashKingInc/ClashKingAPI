import { Effect } from "effect"

import { InvalidRequest } from "./errors.js"

/** Matches the canonical share-code ordering owned by DevKit's army-hash-v2 contract. */
export const normalizeArmyLink = (input: string): string => {
  const invalid = () => new InvalidRequest({ message: "armyLink must be a valid Clash army link or share code" })
  if (input.length > 8192) throw invalid()
  let payload = input.trim()
  if (payload.startsWith("https://")) {
    let url: URL
    try { url = new URL(payload) } catch { throw invalid() }
    if (url.hostname !== "link.clashofclans.com" || url.port || url.username || url.password
      || url.searchParams.get("action") !== "CopyArmy" || url.searchParams.getAll("army").length !== 1) throw invalid()
    payload = url.searchParams.get("army") ?? ""
  }
  if (!payload || !/^[hidus0-9xpe_-]+$/u.test(payload)) throw invalid()
  const sections = [...payload.matchAll(/([hidus])([^hidus]*)/gu)]
  if (sections.map((part) => part[0]).join("") !== payload) throw invalid()
  const integer = (value: string) => {
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n < 0 || n > 2_147_483_647) throw invalid()
    return n
  }
  const heroes: Array<{ id: number; pet: number; equipment: number[] }> = []
  const items = new Map<string, Map<number, number>>()
  for (const [, marker, body] of sections) {
    if (!body) throw invalid()
    for (const part of body.split("-")) {
      if (marker === "h") {
        const match = /^(\d+)(?:p(\d+))?(?:e(\d+(?:_\d+)*))?$/u.exec(part)
        if (!match) throw invalid()
        heroes.push({ id: integer(match[1]!), pet: match[2] === undefined ? -1 : integer(match[2]),
          equipment: match[3]?.split("_").map(integer).sort((a, b) => a - b) ?? [] })
      } else {
        const match = /^(\d+)x(\d+)$/u.exec(part)
        if (!match) throw invalid()
        const count = integer(match[1]!), id = integer(match[2]!)
        const section = items.get(marker!) ?? new Map<number, number>()
        const total = count + (section.get(id) ?? 0)
        if (count < 1 || total > 65535) throw invalid()
        section.set(id, total)
        items.set(marker!, section)
      }
    }
  }
  heroes.sort((a, b) => a.id - b.id || a.pet - b.pet
    || (a.equipment.join("_") < b.equipment.join("_") ? -1 : a.equipment.join("_") > b.equipment.join("_") ? 1 : 0))
  const parts = heroes.length ? ["h" + heroes.map((hero) => `${hero.id}${hero.pet >= 0 ? `p${hero.pet}` : ""}${hero.equipment.length ? `e${hero.equipment.join("_")}` : ""}`).join("-")] : []
  for (const marker of ["i", "d", "u", "s"]) {
    const section = items.get(marker)
    if (section?.size) parts.push(marker + [...section].sort(([a], [b]) => a - b).map(([id, count]) => `${count}x${id}`).join("-"))
  }
  return parts.join("")
}

export const hashNormalizedArmy = (shareCode: string) => Effect.promise(async () => {
  const code = new TextEncoder().encode(shareCode)
  const bytes = new Uint8Array(code.length + 1)
  bytes[0] = 2
  bytes.set(code, 1)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
})

export const parseArmyLinkQuery = (query: URLSearchParams) => Effect.try({
  try: () => {
    const links = query.getAll("armyLink")
    if (links.length !== 1) throw new InvalidRequest({ message: "armyLink is required exactly once" })
    const shareCode = normalizeArmyLink(links[0]!)
    const timeQuery = new URLSearchParams(query)
    timeQuery.delete("armyLink")
    return { shareCode, timeQuery }
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid armyLink" }),
})
