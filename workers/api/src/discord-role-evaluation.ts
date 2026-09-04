import type { ServerRole, ServerSettings } from "@clashking/api-contracts"
import { Effect } from "effect"
import { InvalidRequest } from "./errors.js"

export type DiscordRoleRule = Pick<typeof ServerRole.Type,
  "id" | "server_id" | "clan_tag" | "type" | "option" | "role_id" | "mode">

/** Internal immutable projection, not a new HTTP contract. The API snapshot
 * owner supplies canonical links joined to current player/clan facts. Never
 * derive isVerified from a Discord role, token toggle or another account.
 */
export interface DiscordRoleAccount {
  readonly tag: string
  readonly userId: string
  readonly isVerified: boolean
  readonly clan: { readonly tag: string; readonly rank: "member" | "elder" | "co_leader" | "leader" } | null
  readonly townHallLevel: number
  readonly builderHallLevel: number
  readonly league: string
  readonly builderLeague: string
}
export interface DiscordRoleEvaluationInput {
  readonly serverId: string
  readonly userId: string
  readonly rules: ReadonlyArray<DiscordRoleRule>
  readonly accounts: ReadonlyArray<DiscordRoleAccount>
  readonly familyClans: ReadonlyArray<{ readonly tag: string; readonly category?: string }>
  readonly flairNonFamily: boolean
  readonly currentRoleIds: ReadonlyArray<string>
}
export interface DiscordRoleEvaluation {
  readonly matchedRuleIds: ReadonlyArray<string>
  readonly desiredRoleIds: ReadonlyArray<string>
  readonly addRoleIds: ReadonlyArray<string>
  readonly removeRoleIds: ReadonlyArray<string>
}

const invalid = (message: string) => new InvalidRequest({ message })
const sorted = (values: Iterable<string>) => [...new Set(values)].sort()

export interface DiscordNicknameAccount {
  readonly tag: string
  readonly userId: string
  readonly name: string
  readonly clan: { readonly tag: string; readonly name: string; readonly rank: "member" | "elder" | "co_leader" | "leader" } | null
  readonly townHallLevel: number
  readonly trophies: number
  readonly warStars: number
  readonly league: string
}
export interface DiscordNicknameEvaluationInput {
  readonly serverId: string
  readonly userId: string
  readonly settings: Required<Pick<typeof ServerSettings.Type, "change_nickname" | "auto_eval_nickname">>
    & Pick<typeof ServerSettings.Type, "nickname_rule" | "non_family_nickname_rule">
  readonly automatic: boolean
  /** API resolves global name with username fallback, never a literal null. */
  readonly discordName: string
  readonly discordDisplayName: string
  readonly accounts: ReadonlyArray<DiscordNicknameAccount>
  readonly familyClans: ReadonlyArray<{ readonly tag: string; readonly abbreviation?: string }>
  /** Already resolved by the snapshot owner; this does not invent a SQL field. */
  readonly preferredAccountTag?: string
}
export type DiscordNicknameEvaluation =
  | { readonly status: "skipped"; readonly reason: "disabled" | "automatic_disabled" | "no_accounts" }
  | { readonly status: "unchanged" | "change"; readonly accountTag: string; readonly nickname: string }

/** Pure nickname planning, independent of account verification and linking
 * policy. Provider permission/hierarchy checks and journal/delivery belong to
 * the caller. Blank output fails closed instead of implicitly clearing a nick.
 */
export const evaluateDiscordNickname = (input: DiscordNicknameEvaluationInput): Effect.Effect<DiscordNicknameEvaluation, InvalidRequest> =>
  Effect.gen(function* () {
    if (!input.serverId || !input.userId || typeof input.automatic !== "boolean"
      || typeof input.settings.change_nickname !== "boolean" || typeof input.settings.auto_eval_nickname !== "boolean"
      || typeof input.discordName !== "string" || typeof input.discordDisplayName !== "string") {
      return yield* invalid("Nickname evaluation requires an explicit subject, policy and Discord identity snapshot")
    }
    if (new Set(input.accounts.map(account => account.tag)).size !== input.accounts.length
      || input.accounts.some(account => !account.tag || account.userId !== input.userId
        || !Number.isSafeInteger(account.townHallLevel) || account.townHallLevel < 1
        || !Number.isSafeInteger(account.trophies) || account.trophies < 0
        || !Number.isSafeInteger(account.warStars) || account.warStars < 0)
      || new Set(input.familyClans.map(clan => clan.tag)).size !== input.familyClans.length) {
      return yield* invalid("Nickname evaluation requires unique subject-owned accounts and complete player facts")
    }
    if (!input.settings.change_nickname) return { status: "skipped", reason: "disabled" } as const
    if (input.automatic && !input.settings.auto_eval_nickname) return { status: "skipped", reason: "automatic_disabled" } as const
    if (input.accounts.length === 0) return { status: "skipped", reason: "no_accounts" } as const
    const clans = new Map(input.familyClans.map(clan => [clan.tag, clan]))
    const family = input.accounts.filter(account => account.clan !== null && clans.has(account.clan.tag))
    const candidates = family.length > 0 ? family : input.accounts
    // Tag breaks exact hall/trophy ties deterministically; never mutate input.
    const account = input.accounts.find(item => item.tag === input.preferredAccountTag)
      ?? [...candidates].sort((a, b) => b.townHallLevel - a.townHallLevel || b.trophies - a.trophies
        || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))[0]!
    const template = (family.length > 0 ? input.settings.nickname_rule : input.settings.non_family_nickname_rule)
      ?? "{discord_display_name}"
    const rankNames = { member: "Member", elder: "Elder", co_leader: "Co-Leader", leader: "Leader" }
    const values: Readonly<Record<string, string>> = {
      discord_name: input.discordName, discord_display_name: input.discordDisplayName,
      player_name: account.name, player_tag: account.tag, player_townhall: String(account.townHallLevel),
      player_townhall_small: String(account.townHallLevel).replace(/\d/gu, digit => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]!),
      player_warstars: String(account.warStars), player_role: account.clan === null ? "" : rankNames[account.clan.rank],
      player_clan: account.clan?.name ?? "", player_clan_abbreviation: account.clan === null ? "" : clans.get(account.clan.tag)?.abbreviation ?? "",
      player_league: account.league,
    }
    // Render once so account names containing placeholders stay literal. The
    // code-point bound preserves Python's slicing without splitting surrogates.
    const nickname = [...template.replace(/\{([^{}]+)\}/gu, (token, key: string) =>
      Object.hasOwn(values, key) ? values[key]! : token)].slice(0, 32).join("")
    if (!nickname.trim()) return yield* invalid("Nickname template rendered an empty nickname")
    return { status: nickname === input.discordDisplayName ? "unchanged" : "change", accountTag: account.tag, nickname }
  })

/** Pure eligibility and delta planning. No SQL, provider calls, clock, token
 * verification, nickname changes or local state. The caller must validate a
 * complete/fresh snapshot, journal atomically, and enforce Discord hierarchy
 * and concurrency at delivery. This plan never replaces the full role list.
 */
export const evaluateDiscordRoles = (input: DiscordRoleEvaluationInput): Effect.Effect<DiscordRoleEvaluation, InvalidRequest> =>
  Effect.gen(function* () {
    if (!input.serverId || !input.userId || typeof input.flairNonFamily !== "boolean") {
      return yield* invalid("Role evaluation requires explicit server, subject and flair policy")
    }
    if (new Set(input.accounts.map(account => account.tag)).size !== input.accounts.length
      || input.accounts.some(account => account.userId !== input.userId || typeof account.isVerified !== "boolean")) {
      return yield* invalid("Role evaluation requires unique accounts owned by the subject with explicit verification evidence")
    }
    if (new Set(input.rules.map(rule => rule.id)).size !== input.rules.length
      || new Set(input.familyClans.map(clan => clan.tag)).size !== input.familyClans.length) {
      return yield* invalid("Role evaluation snapshot contains duplicate rules or clans")
    }
    const clans = new Map(input.familyClans.map(clan => [clan.tag, clan]))
    const isFamily = (account: DiscordRoleAccount) => account.clan !== null && clans.has(account.clan.tag)
    const hasFamily = input.accounts.some(isFamily)
    const desired = new Set<string>()
    const additions = new Set<string>()
    const removable = new Set<string>()
    const matched = new Set<string>()
    for (const rule of input.rules) {
      if (rule.server_id !== input.serverId || !rule.id || !rule.role_id.trim() || !rule.option.trim()
        || !["add", "remove", "both"].includes(rule.mode)
        || rule.clan_tag != null && rule.type !== "clan_role") {
        return yield* invalid("Role rule does not belong to the canonical server configuration")
      }
      let qualifies = false
      if (rule.type === "family") {
        if (rule.option !== "family" && rule.option !== "not_family") return yield* invalid("Unsupported family role option")
        qualifies = rule.option === "family" ? hasFamily : !hasFamily
      } else if (rule.type === "clan_role") {
        if (!["member", "elder", "co_leader", "leader"].includes(rule.option)
          || rule.option === "member" && rule.clan_tag == null) return yield* invalid("Unsupported clan role option or scope")
        qualifies = input.accounts.some(account => {
          if (account.clan === null
            || (rule.clan_tag == null ? !isFamily(account) : rule.clan_tag !== account.clan.tag)) return false
          // A clan membership role applies to every rank. Elder/leadership
          // rules match exactly; neither rank nor verification crosses accounts.
          if (rule.option === "member") return true
          if (account.clan.rank !== rule.option) return false
          return rule.option === "elder" || account.isVerified === true
        })
      } else if (rule.type === "clan_category") {
        qualifies = input.accounts.some(account => account.clan !== null
          && clans.get(account.clan.tag)?.category === rule.option)
      } else if (rule.type === "townhall" || rule.type === "builderhall") {
        // Dashboard writes numeric strings, not retired th/bh aliases.
        if (!/^[1-9]\d*$/u.test(rule.option) || !Number.isSafeInteger(Number(rule.option))) {
          return yield* invalid("Unsupported hall role option")
        }
        const level = Number(rule.option)
        qualifies = input.accounts.some(account => (isFamily(account) || input.flairNonFamily)
          && (rule.type === "townhall" ? account.townHallLevel : account.builderHallLevel) === level)
      } else if (rule.type === "league" || rule.type === "builder_league") {
        // These old keys represent threshold semantics, not league names.
        // Until the canonical configuration defines their migration, treating
        // them as an ordinary mismatch would silently revoke an existing role.
        if (/^[0-9]+_personal_best$/u.test(rule.option)) {
          return yield* invalid("Personal-best role thresholds require an explicit canonical migration")
        }
        qualifies = input.accounts.some(account => (isFamily(account) || input.flairNonFamily)
          && (rule.type === "league" ? account.league : account.builderLeague) === rule.option)
      } else {
        // The canonical table permits achievement/status, but the retained
        // evaluator supplies no semantics for them. Never silently interpret
        // an unknown rule as a reason to remove a member's existing role.
        return yield* invalid(`Role evaluation is not implemented for ${rule.type}`)
      }
      if (rule.mode !== "add") removable.add(rule.role_id)
      if (qualifies) {
        matched.add(rule.id)
        desired.add(rule.role_id)
        if (rule.mode !== "remove") additions.add(rule.role_id)
      }
    }
    const current = new Set(input.currentRoleIds)
    // A matching rule protects the role from a nonmatching rule for that same
    // role. Remove-only never grants; add-only never revokes. Unmanaged roles
    // do not appear in the delta and remain the executor's responsibility.
    return {
      matchedRuleIds: sorted(matched), desiredRoleIds: sorted(desired),
      addRoleIds: sorted([...additions].filter(roleId => !current.has(roleId))),
      removeRoleIds: sorted([...removable].filter(roleId => current.has(roleId) && !desired.has(roleId))),
    }
  })
