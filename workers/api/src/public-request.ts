import { endpoints } from "@clashking/api-contracts"

const matchers = Object.values(endpoints).map((endpoint) => ({
  auth: endpoint.auth,
  method: endpoint.method,
  path: endpoint.path,
  pattern: new RegExp(`^${endpoint.path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replaceAll(/:[A-Za-z0-9_]+/gu, "[^/]+")}$`, "u"),
}))

/** A public request stays public even when a caller attaches a scoped session.
 * Conflicting contracts fail closed. OAuth and billing retain their own guards.
 */
export const isOpenPublicRequest = (request: Request): boolean => {
  const url = new URL(request.url)
  const method = request.method === "OPTIONS"
    ? request.headers.get("access-control-request-method") ?? "GET"
    : request.method
  const matches = matchers.filter((endpoint) => endpoint.method === method && endpoint.pattern.test(url.pathname))
  return matches.length > 0 && matches.every((endpoint) => endpoint.auth === "public"
    && !endpoint.path.startsWith("/v2/auth/") && !endpoint.path.startsWith("/v2/billing/"))
}
