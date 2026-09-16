import { Effect } from "effect"

import type { UserPrincipal } from "./auth.js"
import { recordSuccessfulProxySearch } from "./mobile-persistence.js"
import { readBoundedJson } from "./request-body.js"
import { recordProxyWarActivity } from "./proxy-war-activity.js"
import { seedObservedClanProfile } from "./proxy-clan-profile.js"

/** Run in a separate waitUntil scope so reading the clone never holds up the
 * passthrough response and its database connection outlives the foreground scope.
 */
export const observeProxySearch = (principal: UserPrincipal, request: Request, response: Response) => {
  const url = new URL(request.url)
  const warActivity = /^\/proxy\/v1\/clans\/[^/]+\/currentwar$/u.test(url.pathname)
  if (request.method !== "GET" || response.status !== 200 || (!warActivity && !/^\/proxy\/v1\/(players|clans)\/[^/]+$/u.test(url.pathname))) return Effect.void
  // Clone before any asynchronous layer acquisition lets the foreground start
  // consuming the response; cloning later would race its first body read.
  let snapshot: Response
  try { snapshot = response.clone() }
  catch { return Effect.void }
  return Effect.gen(function* () {
    const body = yield* readBoundedJson(snapshot).pipe(Effect.timeout("8 seconds"))
    if (warActivity) yield* recordProxyWarActivity(principal, url.pathname, body)
    else yield* Effect.all([
      recordSuccessfulProxySearch(principal, url.pathname.slice("/proxy".length) + url.search, response.status, body),
      seedObservedClanProfile(principal, url.pathname, body),
    ], { concurrency: "unbounded", discard: true })
  }).pipe(Effect.catchCause(() => Effect.sync(() => {
    console.warn(JSON.stringify({ event: warActivity ? "proxy_war_activity_not_saved" : "proxy_recent_search_not_saved" }))
  })))
}
