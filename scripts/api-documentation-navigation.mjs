import source from "./api-documentation-navigation.source.json" with { type: "json" }

export const primaryFeatureTagOrder = Object.freeze([...source.primaryTagOrder])
export const normalizeDocumentationPath = path => path.replaceAll(/\{[^}]+\}/gu, "{}")
const key = (method, path) => method.toUpperCase() + " " + normalizeDocumentationPath(path)
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"])
const original = new Map(source.operations.map(([method, path, tags]) => [
  key(method === "QUERY" ? "POST" : method, path), tags,
]))
// These are current operations absent from Go's published spec, including
// previously undocumented handlers and intentionally new retained features.
// This only assigns navigation; it never adds paths or changes authorization.
const additions = new Map([
  ["GET /v2/app/config", "Mobile App"],
  ["GET /v2/app/posts", "Mobile App"],
  ["GET /v2/app/updates/manifest", "Mobile App"],
  ["GET /v2/auth/export", "App Authentication"],
  ["DELETE /v2/auth/me", "App Authentication"],
  ["GET /v2/health", "Health"],
  ["GET /v2/leaderboard/{}/clan/capital-gold", "Leaderboard"],
  ["GET /v2/player/{}/legend/{}/battlelog", "Player"],
  ["GET /v2/player/{}/league/history", "Player"],
  ["GET /v2/player/{}/ranked/{}/battlelog", "Player"],
  ["GET /v2/ranked/{}/groups/{}", "Player"],
  ["GET /v2/stats/armies", "Stats"],
  ["GET /v2/stats/armies/detail", "Stats"],
  ["GET /v2/stats/armies/timeline", "Stats"],
  ["GET /v2/stats/league/hit-rates", "Stats"],
  ["GET /v2/stats/league/tournaments/{}/tiers/{}", "Stats"],
  ["GET /v2/stats/legend/days", "Stats"],
  ["GET /v2/media/{}", "Media"],
  ["POST /v2/roster/account-groups/query", "Roster Builder"],
  ["POST /v2/roster/ai/usage", "Roster Builder"],
  ["POST /v2/roster/members/query", "Roster Builder"],
  ["POST /v2/roster/membership-changes/validate", "Roster Builder"],
  ["POST /v2/roster/refresh-batch", "Roster Builder"],
  ["POST /v2/roster/views/preview", "Roster Builder"],
  ["POST /v2/server/{}/rosters/{}/discord-identity/refresh", "Roster Builder"],
  ["GET /v2/ticket-transcripts/{}", "Ticket Transcripts"],
  ["GET /v2/ticket-transcripts/{}/attachments/{}", "Ticket Transcripts"],
])
const additionalTag = (method, path) => additions.get(key(method, path))
  ?? (path.startsWith("/v2/admin/") ? "Admin" : undefined)
  ?? (path.startsWith("/proxy/v1/") ? "Clash API Proxy" : undefined)
  // Two original generic static-data operations had no tag at all.
  ?? (path.startsWith("/v2/static/") ? "Static Data" : undefined)

/** Pure public-doc projection. Run after public route filtering. */
export function applyFeatureNavigation(document) {
  const used = new Set()
  const paths = Object.fromEntries(Object.entries(document.paths).map(([path, pathItem]) => [
    path,
    Object.fromEntries(Object.entries(pathItem).map(([method, operation]) => {
      if (method.toLowerCase() === "query") throw new Error("QUERY is not a supported documentation method: " + path)
      if (!methods.has(method)) return [method, operation]
      const tag = additionalTag(method, path)
      const originalTags = original.get(key(method, path))
      const tags = originalTags?.length ? originalTags : (tag ? [tag] : undefined)
      if (!tags?.length) throw new Error("Missing API documentation feature mapping: " + method.toUpperCase() + " " + path)
      for (const value of tags) used.add(value)
      return [method, { ...operation, tags: [...tags] }]
    })),
  ]))
  const tagNames = [
    ...source.tagOrder.filter(name => used.has(name)),
    ...[...used].filter(name => !source.tagOrder.includes(name)).sort(),
  ]
  return { ...document, paths, tags: tagNames.map(name => ({ name })) }
}
