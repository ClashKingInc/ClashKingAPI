import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema } from "effect"

import { botEndpoints } from "./bot.js"
import { expoEndpoints } from "./expo.js"
import { ProxyLeagueGroupEndpoint, ProxyPlayerEndpoint } from "./proxy.js"

describe("baseline user-only Clash proxy contracts", () => {
  it.each([null, undefined, "Completed"])("accepts official achievement completionInfo %s", completionInfo => {
    const response = {
      tag: "#2J8V28GV0", name: "Player", townHallLevel: 18, expLevel: 200,
      trophies: 5000, bestTrophies: 6000, warStars: 1000, attackWins: 25, defenseWins: 1,
      heroes: [], troops: [], spells: [], achievements: [{
        name: "Bigger & Better", stars: 3, value: 18, target: 15,
        info: "Upgrade your Town Hall", village: "home",
        ...(completionInfo === undefined ? {} : { completionInfo }),
      }],
    }
    expect(Schema.decodeUnknownSync(ProxyPlayerEndpoint.response)(response)).toEqual(response)
    expect(() => Schema.decodeUnknownSync(ProxyPlayerEndpoint.response)({
      ...response, achievements: [{ ...response.achievements[0], completionInfo: 42 }],
    })).toThrow()
  })

  it("accepts a ranked group containing a clanless member", () => {
    const response = {
      members: [{
        playerTag: "#PLAYER", playerName: "Player", clanTag: null, clanName: null,
        leagueTrophies: 242, attackWinCount: 12, attackLoseCount: 0,
        defenseWinCount: 0, defenseLoseCount: 6,
      }],
      attackLogs: [], defenseLogs: [],
    }
    expect(Schema.decodeUnknownSync(ProxyLeagueGroupEndpoint.response)(response)).toEqual(response)
  })
  it("requires a user for every advertised proxy operation", () => {
    const proxyEndpoints = Object.values(expoEndpoints).filter(({ path }) => path.startsWith("/proxy/v1/"))
    expect(proxyEndpoints).toHaveLength(18)
    expect(proxyEndpoints.every(({ auth }) => auth === "user")).toBe(true)
    expectTypeOf(ProxyPlayerEndpoint.auth).toEqualTypeOf<"user">()
  })

  it("does not advertise proxy access in the Bot client map", () => {
    expectTypeOf<Extract<keyof typeof botEndpoints, "proxyPlayer" | "proxyCapitalRaidSeasons">>().toEqualTypeOf<never>()
    expect(Object.values(botEndpoints).some(({ path }) => path.startsWith("/proxy/v1/"))).toBe(false)
  })
})
