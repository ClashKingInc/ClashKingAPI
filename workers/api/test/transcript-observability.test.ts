import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("keeps provider invocation URL logs and automatic traces explicitly disabled", () => {
  const configuration = readFileSync("wrangler.jsonc","utf8")
  expect(configuration).toMatch(/"logs"\s*:\s*\{\s*"enabled"\s*:\s*true,\s*"invocation_logs"\s*:\s*false\s*\}/u)
  expect(configuration).toMatch(/"traces"\s*:\s*\{\s*"enabled"\s*:\s*false\s*\}/u)
  // A new environment/tail/logpush configuration requires an explicit privacy
  // audit; it must not silently override this Worker's bearer-URL protection.
  expect(configuration).not.toMatch(/"(?:env|tail_consumers|logpush)"\s*:/u)
})
