import assert from "node:assert/strict"
import test from "node:test"

import { parseLegacyBaseRows, validLayoutLink } from "./import-legacy-bases.mjs"

test("accepts only canonical OpenLayout links and exact mention downloader identities", () => {
  assert.equal(validLayoutLink("https://link.clashofclans.com/en?action=OpenLayout&id=TH17"), true)
  for (const link of ["http://link.clashofclans.com/en?action=OpenLayout&id=x", "https://evil.test/en?action=OpenLayout&id=x",
    "https://link.clashofclans.com/en?action=CopyArmy&id=x", "https://link.clashofclans.com/en?action=OpenLayout"]) assert.equal(validLayoutLink(link), false)
  const parsed = parseLegacyBaseRows([{ message_id: "20", base_link: "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
    created_at: "2026-01-02T00:00:00Z", downloaders: ["<@123>", "<@123>", "123", "<@!456>", "prefix <@789>"] }])
  assert.deepEqual(parsed.rows[0].downloaders, ["123"])
})

test("merges restartable duplicate identities deterministically and reports invalid rows", () => {
  const link = "https://link.clashofclans.com/en?action=OpenLayout&id=TH17"
  const parsed = parseLegacyBaseRows([
    { message_id: "20", base_link: link, created_at: "2026-01-03T00:00:00Z", downloaders: ["<@2>"] },
    { message_id: "20", base_link: link, created_at: "2026-01-02T00:00:00Z", downloaders: ["<@1>"] },
    { message_id: "nope", base_link: link, created_at: "2026-01-01T00:00:00Z", downloaders: [] },
  ])
  assert.deepEqual(parsed.rows, [{ messageId: "20", baseLink: link, createdAt: "2026-01-02T00:00:00.000Z", downloaders: ["1", "2"] }])
  assert.deepEqual(parsed.skipped, [{ index: 2, reason: "invalid message_id" }])
})
