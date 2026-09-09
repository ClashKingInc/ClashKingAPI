import { expect, it } from "vitest"

import { expoEndpoints, LinksActivityEndpoint } from "./expo.js"

it("exports the authenticated app activity endpoint", () => {
  expect(LinksActivityEndpoint).toMatchObject({
    method: "PATCH",
    path: "/v2/links/:userId/last-login",
    auth: "user-or-bot",
    bodyMode: "none",
  })
  expect(expoEndpoints.linksActivity).toBe(LinksActivityEndpoint)
})
