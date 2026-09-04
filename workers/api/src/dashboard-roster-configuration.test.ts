import { rosterConfigurationEndpoints } from "@clashking/api-contracts"
import { expect, it } from "vitest"
import { dashboardRosterConfigurationRoutes } from "./dashboard-roster-configuration.js"

it("declares each shared roster configuration endpoint exactly once for the route inventory", () => {
  const declared = dashboardRosterConfigurationRoutes.map(({ method, path }) => `${method} ${path}`).sort()
  expect(declared).toEqual(Object.values(rosterConfigurationEndpoints).map(({ method, path }) => `${method} ${path}`).sort())
  expect(new Set(declared).size).toBe(5)
})
