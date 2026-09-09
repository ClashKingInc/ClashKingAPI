import { Effect } from "effect"
import type { WorkerBindings } from "./environment.js"
import { Forbidden, InvalidRequest } from "./errors.js"

type CookieBindings = Pick<WorkerBindings, "WEB_ALLOWED_ORIGINS">
export const webRefreshCookieName = "ck_web_refresh"

export function requireWebOrigin(request: Request, bindings: CookieBindings) {
  const origin = request.headers.get("origin") ?? ""
  return origin !== "" && bindings.WEB_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin)
    ? Effect.succeed(origin)
    : Effect.fail(new Forbidden({ message: "Browser origin is not allowed" }))
}

export function validateWebRedirect(request: Request, bindings: CookieBindings, redirect: string) {
  return Effect.gen(function* () {
    const origin = yield* requireWebOrigin(request, bindings)
    const url = yield* Effect.try({ try: () => new URL(redirect),
      catch: () => new InvalidRequest({ message: "Invalid Discord redirect URI" }) })
    if (url.origin !== origin || url.username !== "" || url.password !== "") {
      return yield* new Forbidden({ message: "Discord redirect URI is not allowed" })
    }
  })
}

export function readWebRefreshCookie(request: Request): string {
  const values = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim())
    .filter((value) => value.startsWith(`${webRefreshCookieName}=`))
  // Ambiguous duplicate cookies must not pick an attacker-controlled path variant.
  return values.length === 1 ? values[0]!.slice(webRefreshCookieName.length + 1).trim() : ""
}

export function webRefreshCookie(token?: string): string {
  // Direct API calls from explicitly allowed remote previews can be cross-site.
  // Every web auth route checks Origin first; this cookie is always host-only.
  const attributes = [`${webRefreshCookieName}=${token ?? ""}`, "Path=/v2/auth/web", "HttpOnly", "Secure",
    "SameSite=None"]
  attributes.push(`Max-Age=${token === undefined ? 0 : 30 * 86400}`,
    `Expires=${new Date(token === undefined ? 0 : Date.now() + 30 * 86400 * 1000).toUTCString()}`)
  return attributes.join("; ")
}
