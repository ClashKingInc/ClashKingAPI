import { describe, expect, it } from "vitest"
import { giveawayRaceScore, giveawayRoleWeight } from "./giveaway-outcomes.js"

describe("giveaway weighted sampling", () => {
  it("uses the highest applicable role boost and defaults to one", () => {
    const boosts = [{ value:2,roles:["one"] },{ value:5,roles:["one","two"] },{ value:9,roles:["three"] }]
    expect(giveawayRoleWeight(boosts,["one"])).toBe(5)
    expect(giveawayRoleWeight(boosts,["none"])).toBe(1)
  })
  it("stays finite across every positive finite weight extreme and open uniform endpoint", () => {
    for (const weight of [Number.MIN_VALUE,1,Number.MAX_VALUE]) {
      for (const uniform of [Number.EPSILON,0.5,1-Number.EPSILON]) expect(giveawayRaceScore(weight,uniform)).toSatisfy(Number.isFinite)
    }
  })
  it("is deterministic for an already persisted uniform draw", () => {
    expect(giveawayRaceScore(7,0.123456789)).toBe(giveawayRaceScore(7,0.123456789))
  })
})
