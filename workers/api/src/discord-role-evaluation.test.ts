import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { evaluateDiscordNickname, evaluateDiscordRoles, type DiscordNicknameAccount, type DiscordNicknameEvaluationInput, type DiscordRoleAccount, type DiscordRoleEvaluationInput, type DiscordRoleRule } from "./discord-role-evaluation.js"

const serverId = "123456789012345678", userId = "223456789012345678"
const account = (overrides: Partial<DiscordRoleAccount> = {}): DiscordRoleAccount => ({
  tag: "#P0Y", userId, isVerified: false, clan: { tag: "#Q0Y", rank: "member" },
  townHallLevel: 18, builderHallLevel: 10, league: "Titan I", builderLeague: "Diamond", ...overrides,
})
const rule = (overrides: Partial<DiscordRoleRule> = {}): DiscordRoleRule => ({
  id: "rule", server_id: serverId, type: "clan_role", option: "leader", role_id: "leader-role", mode: "both", ...overrides,
})
const input = (overrides: Partial<DiscordRoleEvaluationInput> = {}): DiscordRoleEvaluationInput => ({
  serverId, userId, rules: [rule()], accounts: [account()], familyClans: [{ tag: "#Q0Y", category: "War" }],
  flairNonFamily: false, currentRoleIds: [], ...overrides,
})
const evaluate = (overrides: Partial<DiscordRoleEvaluationInput> = {}) => Effect.runPromise(evaluateDiscordRoles(input(overrides)))

const nicknameAccount = (overrides: Partial<DiscordNicknameAccount> = {}): DiscordNicknameAccount => ({
  tag: "#P0Y", userId, name: "Player", clan: { tag: "#Q0Y", name: "Family", rank: "member" },
  townHallLevel: 18, trophies: 5000, warStars: 1234, league: "Titan I", ...overrides,
})
const nicknameInput = (overrides: Partial<DiscordNicknameEvaluationInput> = {}): DiscordNicknameEvaluationInput => ({
  serverId, userId, settings: { change_nickname: true, auto_eval_nickname: false, nickname_rule: "[{player_clan_abbreviation}] {player_name}", non_family_nickname_rule: "{player_name}" },
  automatic: false, discordName: "Discord", discordDisplayName: "Existing", accounts: [nicknameAccount()],
  familyClans: [{ tag: "#Q0Y", abbreviation: "CK" }], ...overrides,
})
const nickname = (overrides: Partial<DiscordNicknameEvaluationInput> = {}) => Effect.runPromise(evaluateDiscordNickname(nicknameInput(overrides)))

describe("pure retained nickname planning", () => {
  it("renders a family nickname without requiring verification", async () => {
    expect(await nickname()).toEqual({ status: "change", accountTag: "#P0Y", nickname: "[CK] Player" })
  })
  it.each([
    ["discord_name", "Discord"], ["discord_display_name", "Existing"], ["player_name", "Player"],
    ["player_tag", "#P0Y"], ["player_townhall", "18"], ["player_townhall_small", "¹⁸"],
    ["player_warstars", "1234"], ["player_role", "Member"], ["player_clan", "Family"],
    ["player_clan_abbreviation", "CK"], ["player_league", "Titan I"],
  ])("renders retained placeholder %s", async (key, expected) => {
    expect(await nickname({ settings: { change_nickname: true, auto_eval_nickname: false, nickname_rule: `{${key}}` } }))
      .toMatchObject({ nickname: expected })
  })
  it.each([["elder", "Elder"], ["co_leader", "Co-Leader"], ["leader", "Leader"]] as const)("uses the retained %s display label", async (rank, expected) => {
    expect(await nickname({ accounts: [nicknameAccount({ clan: { tag: "#Q0Y", name: "Family", rank } })],
      settings: { change_nickname: true, auto_eval_nickname: false, nickname_rule: "{player_role}" } })).toMatchObject({ nickname: expected })
  })
  it("prefers an available main account even outside the family, using the subject's family template", async () => {
    expect(await nickname({ preferredAccountTag: "#G0Y", accounts: [nicknameAccount(), nicknameAccount({ tag: "#G0Y", name: "Other", clan: null })] }))
      .toEqual({ status: "change", accountTag: "#G0Y", nickname: "[] Other" })
  })
  it("ignores an unavailable preferred account and chooses family before a stronger outsider", async () => {
    expect(await nickname({ preferredAccountTag: "#MISSING", accounts: [nicknameAccount({ tag: "#G0Y", clan: null, townHallLevel: 19 }), nicknameAccount()] }))
      .toMatchObject({ accountTag: "#P0Y", nickname: "[CK] Player" })
  })
  it("orders candidates by town hall, then trophies, then tag without mutating the snapshot", async () => {
    const value = nicknameInput({ accounts: [nicknameAccount({ tag: "#Z", townHallLevel: 17, trophies: 6000 }),
      nicknameAccount({ tag: "#Y", trophies: 4999 }), nicknameAccount({ tag: "#B" }), nicknameAccount({ tag: "#A" })] })
    const before = JSON.stringify(value)
    const result = await Effect.runPromise(evaluateDiscordNickname(value))
    expect(result).toMatchObject({ accountTag: "#A" })
    expect(await nickname({ ...value, accounts: [...value.accounts].reverse() })).toEqual(result)
    expect(JSON.stringify(value)).toBe(before)
  })
  it("uses the non-family template and strongest account when none is family", async () => {
    expect(await nickname({ accounts: [nicknameAccount({ clan: null }), nicknameAccount({ tag: "#G0Y", name: "Higher", clan: null, trophies: 5100 })] }))
      .toEqual({ status: "change", accountTag: "#G0Y", nickname: "Higher" })
  })
  it("renders absent clan fields as empty strings", async () => {
    expect(await nickname({ accounts: [nicknameAccount({ clan: null })], settings: { change_nickname: true, auto_eval_nickname: false,
      non_family_nickname_rule: "{player_role}/{player_clan}/{player_clan_abbreviation}" } })).toMatchObject({ nickname: "//" })
  })
  it("defaults an unset convention to the unchanged Discord display name", async () => {
    expect(await nickname({ settings: { change_nickname: true, auto_eval_nickname: false } })).toEqual({ status: "unchanged", accountTag: "#P0Y", nickname: "Existing" })
  })
  it("does not expand placeholders inside player data or inherited object properties", async () => {
    expect(await nickname({ accounts: [nicknameAccount({ name: "{player_tag}" })], settings: { change_nickname: true, auto_eval_nickname: false,
      nickname_rule: "{player_name}{constructor}" } })).toMatchObject({ nickname: "{player_tag}{constructor}" })
  })
  it("preserves unknown template tokens literally", async () => {
    expect(await nickname({ settings: { change_nickname: true, auto_eval_nickname: false, nickname_rule: "{unknown}" } })).toMatchObject({ nickname: "{unknown}" })
  })
  it("bounds Unicode output to 32 code points before checking for a change", async () => {
    const desired = "😀".repeat(32)
    expect(await nickname({ discordDisplayName: desired, accounts: [nicknameAccount({ name: `${desired}extra` })],
      settings: { change_nickname: true, auto_eval_nickname: false, nickname_rule: "{player_name}" } }))
      .toEqual({ status: "unchanged", accountTag: "#P0Y", nickname: desired })
  })
  it.each(["", "   ", "{player_clan}"])("rejects blank rendered output %s without clearing a nickname", async nickname_rule => {
    const result = await Effect.runPromise(evaluateDiscordNickname(nicknameInput({ accounts: [nicknameAccount({ clan: null })],
      settings: { change_nickname: true, auto_eval_nickname: false, non_family_nickname_rule: nickname_rule } })).pipe(Effect.flip))
    expect(result).toMatchObject({ _tag: "InvalidRequest", message: "Nickname template rendered an empty nickname" })
  })
  it("skips disabled nickname changes", async () => {
    expect(await nickname({ settings: { change_nickname: false, auto_eval_nickname: true } })).toEqual({ status: "skipped", reason: "disabled" })
  })
  it("gates automatic nickname work separately from manual evaluation", async () => {
    expect(await nickname({ automatic: true })).toEqual({ status: "skipped", reason: "automatic_disabled" })
    expect(await nickname({ automatic: true, settings: { change_nickname: true, auto_eval_nickname: true, nickname_rule: "{player_name}" } })).toMatchObject({ status: "change" })
  })
  it("does not clear a nickname when there are no linked accounts", async () => {
    expect(await nickname({ accounts: [] })).toEqual({ status: "skipped", reason: "no_accounts" })
  })
  it.each(["foreign-owner", "duplicate-account", "duplicate-clan", "missing-server", "invalid-hall", "invalid-trophies", "invalid-stars"])("rejects %s snapshots", async kind => {
    const overrides: Partial<DiscordNicknameEvaluationInput> = kind === "foreign-owner" ? { accounts: [nicknameAccount({ userId: "other" })] }
      : kind === "duplicate-account" ? { accounts: [nicknameAccount(), nicknameAccount()] }
      : kind === "duplicate-clan" ? { familyClans: [{ tag: "#Q0Y" }, { tag: "#Q0Y" }] }
      : kind === "missing-server" ? { serverId: "" }
      : kind === "invalid-hall" ? { accounts: [nicknameAccount({ townHallLevel: 0 })] }
      : kind === "invalid-trophies" ? { accounts: [nicknameAccount({ trophies: Number.NaN })] }
      : { accounts: [nicknameAccount({ warStars: -1 })] }
    expect(await Effect.runPromise(evaluateDiscordNickname(nicknameInput(overrides)).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
  })
})

describe("per-account verified leadership", () => {
  it.each(["leader", "co_leader"] as const)("requires the qualifying %s account itself to be verified", async rank => {
    for (const verified of [false, true]) {
      const result = await evaluate({ rules: [rule({ option: rank })],
        accounts: [account({ isVerified: verified, clan: { tag: "#Q0Y", rank } })] })
      expect(result.addRoleIds).toEqual(verified ? ["leader-role"] : [])
    }
  })
  it.each(["member", "elder", "leader", "co_leader"] as const)("a verified %s in another clan cannot validate an unverified leader", async rank => {
    const result = await evaluate({ rules: [rule({ clan_tag: "#Q0Y" })], accounts: [
      account({ clan: { tag: "#Q0Y", rank: "leader" } }),
      account({ tag: "#G0Y", isVerified: true, clan: { tag: "#R0Y", rank } }),
    ], familyClans: [{ tag: "#Q0Y" }, { tag: "#R0Y" }], currentRoleIds: ["leader-role", "unrelated"] })
    expect(result).toEqual({ matchedRuleIds: [], desiredRoleIds: [], addRoleIds: [], removeRoleIds: ["leader-role"] })
  })
  it("a verified ordinary member in the same clan cannot validate an unverified leader", async () => {
    const result = await evaluate({ accounts: [account({ clan: { tag: "#Q0Y", rank: "leader" } }),
      account({ tag: "#G0Y", isVerified: true })] })
    expect(result.desiredRoleIds).toEqual([])
  })
  it("qualifies unscoped family leadership from the verified ranked family account", async () => {
    const result = await evaluate({ accounts: [account(), account({ tag: "#G0Y", isVerified: true, clan: { tag: "#Q0Y", rank: "leader" } })] })
    expect(result.addRoleIds).toEqual(["leader-role"])
  })
  it("does not treat a leader as a co-leader or elder", async () => {
    for (const option of ["co_leader", "elder"]) {
      expect((await evaluate({ rules: [rule({ option })], accounts: [account({ isVerified: true, clan: { tag: "#Q0Y", rank: "leader" } })] })).addRoleIds).toEqual([])
    }
  })
  it("does not extend a family-wide rule to a non-family clan", async () => {
    expect((await evaluate({ accounts: [account({ isVerified: true, clan: { tag: "#R0Y", rank: "leader" } })] })).addRoleIds).toEqual([])
  })
  it("uses an explicit clan rule's exact scope instead of an unrelated family-clan list", async () => {
    expect((await evaluate({ rules: [rule({ clan_tag: "#R0Y" })],
      accounts: [account({ isVerified: true, clan: { tag: "#R0Y", rank: "leader" } })] })).addRoleIds).toEqual(["leader-role"])
  })
})

describe("unverified accounts retain ordinary eligibility", () => {
  it.each(["member", "elder", "co_leader", "leader"] as const)("clan membership applies to unverified %s", async rank => {
    expect((await evaluate({ rules: [rule({ option: "member", clan_tag: "#Q0Y" })],
      accounts: [account({ clan: { tag: "#Q0Y", rank } })] })).addRoleIds).toEqual(["leader-role"])
  })
  it.each([undefined, "#Q0Y"])("elder eligibility remains independent of verification for scope %s", async clan_tag => {
    expect((await evaluate({ rules: [rule({ option: "elder", ...(clan_tag === undefined ? {} : { clan_tag }) })],
      accounts: [account({ clan: { tag: "#Q0Y", rank: "elder" } })] })).addRoleIds).toEqual(["leader-role"])
  })
  it.each([
    ["townhall", "18"], ["builderhall", "10"], ["league", "Titan I"],
    ["builder_league", "Diamond"], ["clan_category", "War"], ["family", "family"],
  ] as const)("preserves unverified %s eligibility", async (type, option) => {
    expect((await evaluate({ rules: [rule({ type, option })] })).addRoleIds).toEqual(["leader-role"])
  })
  it("applies flair_non_family only to hall/league rules", async () => {
    const rules = [rule({ type: "townhall", option: "18" })], accounts = [account({ clan: null })]
    expect((await evaluate({ rules, accounts })).addRoleIds).toEqual([])
    expect((await evaluate({ rules, accounts, flairNonFamily: true })).addRoleIds).toEqual(["leader-role"])
  })
  it("keeps not-family semantics for zero or wholly non-family accounts, not mixed accounts", async () => {
    const rules = [rule({ type: "family", option: "not_family" })]
    expect((await evaluate({ rules, accounts: [] })).addRoleIds).toEqual(["leader-role"])
    expect((await evaluate({ rules, accounts: [account({ clan: null })] })).addRoleIds).toEqual(["leader-role"])
    expect((await evaluate({ rules, accounts: [account(), account({ tag: "#G0Y", clan: null })] })).addRoleIds).toEqual([])
  })
})

describe("normalized modes and deterministic role deltas", () => {
  it.each(["league", "builder_league"] as const)("rejects unmigrated personal-best %s criteria without planning removal", async type => {
    const result = await Effect.runPromise(evaluateDiscordRoles(input({
      rules: [rule({ type, option: "5000_personal_best" })], currentRoleIds: ["leader-role"],
    })).pipe(Effect.flip))
    expect(result).toMatchObject({ _tag: "InvalidRequest", message: "Personal-best role thresholds require an explicit canonical migration" })
  })
  it.each(["add", "remove", "both"] as const)("preserves %s mode for matching and nonmatching rules", async mode => {
    const rules = [rule({ type: "townhall", option: "18", mode })]
    expect((await evaluate({ rules })).addRoleIds).toEqual(mode === "remove" ? [] : ["leader-role"])
    expect((await evaluate({ rules, currentRoleIds: ["leader-role", "unrelated"] })).removeRoleIds).toEqual([])
    expect((await evaluate({ rules, accounts: [], currentRoleIds: ["leader-role", "unrelated"] })).removeRoleIds)
      .toEqual(mode === "add" ? [] : ["leader-role"])
  })
  it("unions matching rules before deciding removal of their shared role", async () => {
    const rules = [rule(), rule({ id: "ordinary", type: "townhall", option: "18", mode: "remove" })]
    const result = await evaluate({ rules, currentRoleIds: ["leader-role"] })
    expect(result).toEqual({ matchedRuleIds: ["ordinary"], desiredRoleIds: ["leader-role"], addRoleIds: [], removeRoleIds: [] })
    expect(await evaluate({ rules: [...rules].reverse(), currentRoleIds: ["leader-role"] })).toEqual(result)
  })
  it("does not mutate inputs and produces the same stable output on replay", async () => {
    const value = input({ rules: [rule({ id: "z", type: "townhall", option: "18", role_id: "z" }),
      rule({ id: "a", type: "builderhall", option: "10", role_id: "a" })] })
    const before = JSON.stringify(value)
    const first = await Effect.runPromise(evaluateDiscordRoles(value))
    expect(first.addRoleIds).toEqual(["a", "z"])
    expect(await Effect.runPromise(evaluateDiscordRoles(value))).toEqual(first)
    expect(JSON.stringify(value)).toBe(before)
  })
  it.each(["foreign-server", "foreign-owner", "duplicate-account", "duplicate-rule", "duplicate-clan",
    "unscoped-member", "bad-rank", "retired-family", "bad-hall", "bad-scope", "achievement", "status"])(
    "fails closed on %s instead of planning destructive removal", async kind => {
      const value = input({ currentRoleIds: ["leader-role"] })
      const overrides: Partial<DiscordRoleEvaluationInput> = kind === "foreign-server" ? { rules: [rule({ server_id: "other" })] }
        : kind === "foreign-owner" ? { accounts: [account({ userId: "other" })] }
        : kind === "duplicate-account" ? { accounts: [account(), account({ isVerified: true })] }
        : kind === "duplicate-rule" ? { rules: [rule(), rule()] }
        : kind === "duplicate-clan" ? { familyClans: [{ tag: "#Q0Y" }, { tag: "#Q0Y" }] }
        : kind === "unscoped-member" ? { rules: [rule({ option: "member" })] }
        : kind === "bad-rank" ? { rules: [rule({ option: "coLeader" })] }
        : kind === "retired-family" ? { rules: [rule({ type: "family", option: "only_family" })] }
        : kind === "bad-hall" ? { rules: [rule({ type: "townhall", option: "th18" })] }
        : kind === "bad-scope" ? { rules: [rule({ type: "townhall", option: "18", clan_tag: "#Q0Y" })] }
        : { rules: [rule({ type: kind === "achievement" ? "achievement" : "status" })] }
      expect(await Effect.runPromise(evaluateDiscordRoles({ ...value, ...overrides }).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
    },
  )
})
