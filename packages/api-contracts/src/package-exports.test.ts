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
    expect(entry).toHaveProperty("StatsArmiesRequest")
    expect(entry).toHaveProperty("AppConfigResponse")
    expect(entry).not.toHaveProperty("adminEndpoints")
    expect(entry).not.toHaveProperty("botEndpoints")
    expect(entry).not.toHaveProperty("persistentRuntimeEndpoints")
  })
})
