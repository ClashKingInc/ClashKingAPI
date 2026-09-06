import { rosterConfigurationEndpoints } from "@clashking/api-contracts/deferred-runtime"
import { expect, it } from "vitest"
import { dashboardRosterConfigurationRoutes } from "./dashboard-roster-configuration.js"

it("preserves the five deferred configuration descriptors for isolated reference tests", () => {
  const declared = dashboardRosterConfigurationRoutes.map(({ method, path }) => `${method} ${path}`).sort()
  expect(declared).toEqual(Object.values(rosterConfigurationEndpoints).map(({ method, path }) => `${method} ${path}`).sort())
  expect(new Set(declared).size).toBe(5)
})
