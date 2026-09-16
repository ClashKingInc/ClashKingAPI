import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("package exports", () => {
  it("provides the mobile-only Expo contract entrypoint", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8")) as {
      exports: Record<string,{ types:string; import:string }>
    }
    expect(manifest.exports["./expo"]).toEqual({ types:"./dist/expo.d.ts",import:"./dist/expo.js" })
    const entry = await import("./expo.js")
    expect(entry).toHaveProperty("AuthEmailEndpoint")
    expect(entry).toHaveProperty("ArmySearchEndpoint")
    expect(entry).toHaveProperty("ArmyTimelineEndpoint")
    expect(entry).toHaveProperty("WarHitratesEndpoint")
    expect(entry).toHaveProperty("WarSummaryEndpoint")
    expect(entry).not.toHaveProperty("StatsItemsQuery")
    expect(entry).toHaveProperty("AppConfigResponse")
    expect(entry).not.toHaveProperty("adminEndpoints")
    expect(entry).not.toHaveProperty("botEndpoints")
    expect(entry).not.toHaveProperty("persistentRuntimeEndpoints")
    expect(entry).not.toHaveProperty("TicketMessageEventEndpoint")
    expect(entry).not.toHaveProperty("RosterActionEndpoint")
  })

  it("requires explicit opt-in to the reference-only deferred runtime entrypoint", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, { types: string; import: string }>
    }
    expect(manifest.exports["./deferred-runtime"]).toEqual({
      types: "./dist/deferred-runtime.d.ts", import: "./dist/deferred-runtime.js",
    })
    const entry = await import("./deferred-runtime.js")
    expect(entry).toHaveProperty("TicketMessageEventEndpoint")
    expect(entry).toHaveProperty("RosterActionEndpoint")
    expect(entry).not.toHaveProperty("endpoints")
    expect(entry).not.toHaveProperty("botEndpoints")
  })
})
