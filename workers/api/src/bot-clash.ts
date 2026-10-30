import { botClashEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { AuthIdentity } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { InvalidRequest } from "./errors.js"
import { proxyRequest } from "./proxy.js"

/** Fixed paths, fixed service binding and allowlisted queries; no caller URL forwarding. */
export const dispatchBotClash = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  const url = new URL(request.url)
  if (request.method !== "GET" || !url.pathname.startsWith("/v2/bot/clash/")) return undefined
  const parts = url.pathname.split("/")
  const endpoint = Object.values(botClashEndpoints).find(candidate => {
    const expected = candidate.path.split("/")
    return expected.length === parts.length && expected.every((part,index) => part.startsWith(":") || part === parts[index])
  })
  if (!endpoint) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const template = endpoint.path.split("/")
  for (let index = 0; index < template.length; index++) {
    if (!template[index]!.startsWith(":")) continue
    const value = yield* Effect.try({ try: () => decodeURIComponent(parts[index]!), catch: () => new InvalidRequest({ message: "Invalid Clash path encoding" }) })
    const valid = template[index] === ":seasonId" ? /^[1-9][0-9]{0,15}$/u.test(value)
      : template[index] === ":locationId" ? /^(?:global|[0-9]{1,12})$/u.test(value) : /^#[0289PYLQGRJCUV]{1,15}$/u.test(value)
    if (!valid) return yield* new InvalidRequest({ message: "Invalid Clash path parameter" })
  }
  const supportsLimit = /(?:capitalraidseasons|warlog|rankings\/players(?:-builder-base)?)$/u.test(url.pathname)
  const leagueGroup = url.pathname.startsWith("/v2/bot/clash/leaguegroup/")
  if (leagueGroup && (url.searchParams.getAll("playerTag").length !== 1 || !/^#[0289PYLQGRJCUV]{1,15}$/u.test(url.searchParams.get("playerTag") ?? ""))) {
    return yield* new InvalidRequest({message:"A valid playerTag is required for the league group"})
  }
  for (const [key,value] of url.searchParams) {
    if (leagueGroup && key === "playerTag") continue
    if (key !== "limit" || !supportsLimit || !/^[1-9][0-9]{0,2}$/u.test(value) || Number(value)>200 || url.searchParams.getAll(key).length !== 1) {
      return yield* new InvalidRequest({ message: "Invalid Clash query parameter" })
    }
  }
  url.pathname = url.pathname.replace("/v2/bot/clash/", "/proxy/v1/")
  return yield* proxyRequest(new Request(url,request),bindings)
})
