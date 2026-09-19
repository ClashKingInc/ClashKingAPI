import { InvalidRequest } from "./errors.js"

const invalid = () => new InvalidRequest({ message: "baseLink must be a valid Clash layout link" })
const localePath = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/iu
const layoutId = /^[A-Za-z0-9:_-]{1,2048}$/u

/** Accept official Clash layout links across locale paths and discard URL-only
 * presentation/tracking differences before persistence or Discord rendering. */
export const normalizeBaseLink = (input: string): string => {
  if (input.length > 8192) throw invalid()
  let url: URL
  try { url = new URL(input.trim()) } catch { throw invalid() }
  if (url.protocol !== "https:" || url.hostname !== "link.clashofclans.com" || url.port
    || url.username || url.password || !localePath.test(url.pathname)) throw invalid()

  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => (key.toLowerCase() === "action" || key.toLowerCase() === "id")
    && key !== key.toLowerCase())) throw invalid()
  if (url.searchParams.getAll("action").length !== 1 || url.searchParams.get("action") !== "OpenLayout"
    || url.searchParams.getAll("id").length !== 1) throw invalid()
  const id = url.searchParams.get("id") ?? ""
  if (id !== id.trim() || !layoutId.test(id)) throw invalid()

  const canonical = new URL("https://link.clashofclans.com/en")
  canonical.searchParams.set("action", "OpenLayout")
  canonical.searchParams.set("id", id)
  return canonical.toString()
}
