import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"

import { DashboardMiscExternal } from "./dashboard-misc-runtime.js"
import { resolveDiscohook } from "./discohook.js"
import { WorkerEnvironment } from "./environment.js"
import { UpstreamUnavailable } from "./errors.js"
import { queryClanSearch } from "./public-search.js"
import { staticMaxLevel, staticNames } from "./static-metadata.js"

export const dashboardMiscExternalLayer = Layer.effect(DashboardMiscExternal, Effect.gen(function* () {
  const bindings = yield* WorkerEnvironment
  return DashboardMiscExternal.of({
    searchClans: (query) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, Array.isArray(value) ? value.join(",") : String(value))
      }
      return queryClanSearch(bindings, params).pipe(
        Effect.flatMap((value) => Schema.decodeUnknownEffect(dashboardEndpoints.dashboardClanSearch.response)(value).pipe(
          Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Invalid clan search response" })),
        )),
      )
    },
    staticNames,
    staticMaxLevel,
    discohook: (url) => resolveDiscohook(url).pipe(
      Effect.flatMap((value) => Schema.decodeUnknownEffect(dashboardEndpoints.dashboardDiscohookResolve.response)(value).pipe(
        Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Invalid Discohook response" })),
      )),
    ),
  })
}))
