// @ts-expect-error The runtime package does not ship TypeScript declarations in this workspace.
import pg from "pg"
import { describe, expect, it } from "vitest"

// The operator is a standalone ESM script rather than a Worker TypeScript module.
// @ts-expect-error JavaScript operator scripts intentionally have no declaration output.
import { importLegacyBases, parseLegacyBaseRows } from "../../../../scripts/import-legacy-bases.mjs"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned with-test-timescale.sh")

describe("offline legacy base importer against authoritative Goose migrations", () => {
  it("is idempotent, keeps incomplete rows, preserves earliest creation and deduplicates mention identities", async () => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const link = "https://link.clashofclans.com/en?action=OpenLayout&id=IMPORT18"
      const parsed = parseLegacyBaseRows([
        { message_id: "7550000000000000001", base_link: link, created_at: "2026-09-02T00:00:00Z", downloaders: ["<@7550000000000000012>", "<@7550000000000000012>"] },
        { message_id: "7550000000000000001", base_link: link, created_at: "2026-09-01T00:00:00Z", downloaders: ["<@7550000000000000013>"] },
      ])
      const first = await importLegacyBases(client, parsed)
      expect(first).toMatchObject({ insertedBases: 1, existingBases: 0, insertedDownloaders: 2,
        verification: [{ messageId: "7550000000000000001", downloadCount: 2 }] })
      const second = await importLegacyBases(client, parsed)
      expect(second).toMatchObject({ insertedBases: 0, existingBases: 1, insertedDownloaders: 0,
        verification: [{ messageId: "7550000000000000001", downloadCount: 2 }] })
      const stored = await client.query("SELECT server_id,channel_id,description,created_at::text FROM bases WHERE message_id=$1", ["7550000000000000001"])
      expect(stored.rows[0]).toMatchObject({ server_id: null, channel_id: null, description: "", created_at: "2026-09-01 00:00:00+00" })
    } finally { await client.end() }
  })
})
