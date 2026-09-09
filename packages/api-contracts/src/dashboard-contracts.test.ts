import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  DashboardBillingUsage,
  DashboardCdnUploadResponse,
  DashboardClanSearchResponse,
  DashboardCurrentDatesResponse,
  DashboardCwlBonusRecipientsResponse,
  DashboardDiscohookResolveResponse,
  DashboardLinkedAccount,
  DashboardStaticMaxLevelResponse,
} from "./dashboard-misc.js"
import {
  DashboardApplyRosterMembershipChangesEndpoint,
  DashboardCreateRosterResponse,
  DashboardDeleteRosterViewEndpoint,
  DashboardPreviewRosterViewEndpoint,
  DashboardRoster,
  DashboardServerClanMember,
} from "./dashboard-roster.js"
import {
  BaseCreateFailure,
  DashboardAccessConfig,
  DiscordChannel,
  Giveaway,
  RemoveServerClanEndpoint,
  SearchBannedPlayersResponse,
  ServerSettings,
  ServerSettingsUpdate,
  TicketButtonSettings,
} from "./dashboard-server.js"

const decode = <A, I, R>(schema: Schema.Schema<A, I, R>, input: unknown) =>
  Schema.decodeUnknownSync(schema)(input)

describe("Dashboard response contracts", () => {
  it("decodes representative billing, linked-account, and search responses", () => {
    const billingUsage = {
      serverId: "123",
      serverSpentUsd: 1.25,
      serverLimitUsd: 5,
      userSpentUsd: 2.5,
      userLimitUsd: 10,
      globalFreeAvailable: true,
      subscriptionActive: false,
      assignedSubscriberCount: 0,
      paidLimitUsd: 0,
      paidSpentUsd: 0,
      paidRemainingUsd: 0,
      resetsAt: "2026-10-01T00:00:00Z",
    }
    const linkedAccount = {
      user_id: "42",
      player_tag: "#P0Y",
      order_index: 0,
      is_verified: true,
      hidden: false,
      added_at: "2026-09-03T12:00:00Z",
      verified_at: "2026-09-03T12:01:00Z",
      last_login: null,
    }
    const clanSearch = {
      items: [{
        name: "ClashKing",
        tag: "#2L0",
        badge: "https://cdn.clashk.ing/badge.png",
        clanLevel: 20,
        members: 45,
      }],
      pagination: { limit: 25, hasMore: true, nextCursor: "next-page" },
    }

    expect(decode(DashboardBillingUsage, billingUsage)).toEqual(billingUsage)
    expect(decode(DashboardLinkedAccount, linkedAccount)).toEqual(linkedAccount)
    expect(decode(DashboardClanSearchResponse, clanSearch)).toEqual(clanSearch)
  })

  it.each([
    "serverLimitUsd",
    "userLimitUsd",
    "paidLimitUsd",
    "paidRemainingUsd",
  ])("rejects a missing %s billing budget field", (missingField) => {
    const billingUsage: Record<string, unknown> = {
      serverId: "123",
      serverSpentUsd: 1.25,
      serverLimitUsd: 5,
      userSpentUsd: 2.5,
      userLimitUsd: 10,
      globalFreeAvailable: true,
      subscriptionActive: false,
      assignedSubscriberCount: 0,
      paidLimitUsd: 0,
      paidSpentUsd: 0,
      paidRemainingUsd: 0,
      resetsAt: "2026-10-01T00:00:00Z",
    }
    Reflect.deleteProperty(billingUsage, missingField)

    expect(() => decode(DashboardBillingUsage, billingUsage)).toThrow()
  })

  it.each([
    ["invalid boolean", { is_verified: "true" }],
    ["invalid timestamp", { added_at: 1_788_436_800 }],
  ])("rejects linked accounts with an %s", (_label, invalidField) => {
    expect(() => decode(DashboardLinkedAccount, {
      user_id: "42",
      player_tag: "#P0Y",
      order_index: 0,
      is_verified: true,
      hidden: false,
      added_at: "2026-09-03T12:00:00Z",
      ...invalidField,
    })).toThrow()
  })

  it("rejects malformed clan-search pagination", () => {
    expect(() => decode(DashboardClanSearchResponse, {
      items: [],
      pagination: { limit: 25, hasMore: "yes", nextCursor: null },
    })).toThrow()
  })

  it("decodes representative event, static-data, upload, and Discohook responses", () => {
    const currentDates = {
      season: "2026-09",
      raid: "2026-09-04",
      legend: "2026-09-03",
      "clan-games": "2026-09",
    }
    const cwlRecipients = { items: [{ playerTag: "#P0Y", medalCount: 75 }] }
    const maxLevel = { name: "Barbarian", max_level: 13 }
    const upload = { url: "https://cdn.clashk.ing/file.png", filename: "file.png" }
    const discohook = { resolvedUrl: "https://discohook.org/?data=payload" }

    expect(decode(DashboardCurrentDatesResponse, currentDates)).toEqual(currentDates)
    expect(decode(DashboardCwlBonusRecipientsResponse, cwlRecipients)).toEqual(cwlRecipients)
    expect(decode(DashboardStaticMaxLevelResponse, maxLevel)).toEqual(maxLevel)
    expect(decode(DashboardCdnUploadResponse, upload)).toEqual(upload)
    expect(decode(DashboardDiscohookResolveResponse, discohook)).toEqual(discohook)
  })

  it("rejects malformed event, static-data, upload, and Discohook responses", () => {
    expect(() => decode(DashboardCwlBonusRecipientsResponse, {
      items: [{ playerTag: "#P0Y", medalCount: "75" }],
    })).toThrow()
    expect(() => decode(DashboardCurrentDatesResponse, {
      season: "2026-09",
      raid: "2026-09-04",
      legend: "2026-09-03",
    })).toThrow()
    expect(() => decode(DashboardStaticMaxLevelResponse, {
      name: "Barbarian",
      max_level: "13",
    })).toThrow()
    expect(() => decode(DashboardCdnUploadResponse, {
      url: "https://cdn.clashk.ing/file.png",
    })).toThrow()
    expect(() => decode(DashboardDiscohookResolveResponse, {})).toThrow()
  })

  it("decodes a representative roster and rejects malformed core roster state", () => {
    const roster = {
      id: "roster-1",
      server_id: "123",
      alias: "CWL",
      roster_type: "clan",
      signup_scope: "clan-only",
      members: [{
        name: "Matt",
        tag: "#P0Y",
        townhall: 17,
        hero_level_sum: 335,
        hitrate: 0.74,
        added_at: "2026-09-01T12:00:00Z",
        last_updated: "2026-09-03T12:00:00Z",
        is_in_family: true,
        member_status: "active",
        error_details: null,
      }],
      clan_name: "ClashKing",
      clan_badge: "https://cdn.clashk.ing/badge.png",
      columns: ["name", "townhall"],
      sort: [{ columnId: "townhall", direction: "desc" }],
      signup_questions: [{
        id: "availability",
        label: "Available for every round?",
        type: "boolean",
        required: true,
        order: 0,
      }],
      created_at: "2026-09-03T12:00:00Z",
      updated_at: "2026-09-03T12:00:00Z",
      revision: 1,
    }

    expect(decode(DashboardRoster, roster)).toEqual(roster)
    expect(() => decode(DashboardRoster, {
      ...roster,
      members: [{ ...roster.members[0], townhall: "17" }],
    })).toThrow()
  })

  it("rejects a bare roster where the create response envelope is required", () => {
    const bareRoster = {
      id: "roster-1",
      server_id: "123",
      alias: "CWL",
      roster_type: "clan",
      signup_scope: "clan-only",
      members: [],
      columns: [],
      sort: [],
      created_at: "2026-09-03T12:00:00Z",
      updated_at: "2026-09-03T12:00:00Z",
      revision: 1,
    }

    expect(() => decode(DashboardCreateRosterResponse, bareRoster)).toThrow()
  })

  it("rejects the old nested roster-view preview body", () => {
    expect(() => decode(DashboardPreviewRosterViewEndpoint.body, {
      view: {
        name: "CWL",
        sourceCode: "return rows",
        sourceVersion: 1,
      },
      rosterIds: ["roster-1"],
    })).toThrow()
  })

  it.each(["townhall", "role", "trophies"])("rejects a server clan member missing %s", (missingField) => {
    const member: Record<string, unknown> = {
      tag: "#P0Y",
      name: "Matt",
      clan_tag: "#2L0",
      clan_name: "ClashKing",
      townhall: 17,
      role: "member",
      trophies: 5_000,
    }
    Reflect.deleteProperty(member, missingField)

    expect(() => decode(DashboardServerClanMember, member)).toThrow()
  })

  it("rejects snake_case roster membership bodies", () => {
    expect(() => decode(DashboardApplyRosterMembershipChangesEndpoint.body, {
      server_id: "123",
      changes: [{
        action: "move",
        player_tag: "#P0Y",
        from_roster_id: "roster-1",
        to_roster_id: "roster-2",
      }],
      expected_revisions: { "roster-1": 1, "roster-2": 2 },
    })).toThrow()
  })

  it("decodes an empty 204 roster-view delete response as undefined", () => {
    expect(decode(DashboardDeleteRosterViewEndpoint.response, undefined)).toBeUndefined()
  })

  it("decodes representative server access and rejects malformed access levels", () => {
    const access = {
      server_id: "123",
      roles: [{ id: "456", name: "Admin", color: 0, position: 1 }],
      grants: [{ role_id: "456", section: "settings", access_level: "manage" }],
      sections: ["settings"],
    }

    expect(decode(DashboardAccessConfig, access)).toEqual(access)
    expect(() => decode(DashboardAccessConfig, {
      ...access,
      grants: [{ role_id: "456", section: "settings", access_level: "owner" }],
    })).toThrow()
  })

  it("keeps Discord channel types aligned with the normalized Go response", () => {
    expect(decode(DiscordChannel, { id: "1", name: "general", type: "text" })).toEqual({
      id: "1",
      name: "general",
      type: "text",
    })
    expect(() => decode(DiscordChannel, { id: "1", name: "general", type: 0 })).toThrow()
  })

  it("requires an explicit boolean in settings responses and accepts only optional boolean updates", () => {
    const settings = {server_id:"123",server:"123",name:"ClashKing",countdowns:{},server_roles:[]}
    for (const value of [false,true]) {
      expect(decode(ServerSettings,{...settings,require_api_token_when_linking:value}).require_api_token_when_linking).toBe(value)
      expect(decode(ServerSettingsUpdate,{require_api_token_when_linking:value})).toEqual({require_api_token_when_linking:value})
    }
    expect(decode(ServerSettingsUpdate,{})).toEqual({})
    for (const value of [null,"false",0]) expect(()=>decode(ServerSettingsUpdate,{require_api_token_when_linking:value})).toThrow()
    expect(()=>decode(ServerSettings,settings)).toThrow()
  })

  it("rejects a numeric embed color in normalized server settings", () => {
    expect(() => decode(ServerSettings, {
      server_id: "123",
      server: 123,
      name: "ClashKing",
      embed_color: 16_711_680,
      countdowns: {},
      server_roles: [],
    })).toThrow()
  })

  it("rejects legacy full-ban records from the banned-player search response", () => {
    expect(() => decode(SearchBannedPlayersResponse, {
      items: [{ VillageTag: "#P" }],
    })).toThrow()
  })

  it("accepts the nested town hall requirement editor shape", () => {
    expect(decode(TicketButtonSettings, {
      questions: [],
      mod_role: [],
      no_ping_mod_role: [],
      private_thread: true,
      th_min: 16,
      num_apply: 1,
      naming: "ticket-{user}",
      account_apply: true,
      player_info: true,
      apply_clans: [],
      roles_to_add: [],
      roles_to_remove: [],
      townhall_requirements: { "16": { BK: 95 } },
    }).townhall_requirements).toEqual({ "16": { BK: 95 } })
  })

  it.each([
    ["a successful database insert", { databaseInserted: true }],
    ["an unknown cleanup state", { discordMessageCleanup: "unknown" }],
  ])("rejects base-create failures with %s", (_label, invalidField) => {
    expect(() => decode(BaseCreateFailure, {
      code: "internal_error",
      message: "Discord message creation failed",
      databaseInserted: false,
      discordMessageCreated: false,
      discordMessageCleanup: "notNeeded",
      retryable: true,
      ...invalidField,
    })).toThrow()
  })

  it("requires access roles to be an array along with grants and sections", () => {
    const access = {
      server_id: "123",
      roles: [],
      grants: [],
      sections: [],
    }

    expect(decode(DashboardAccessConfig, access)).toEqual(access)
    expect(() => decode(DashboardAccessConfig, {
      server_id: "123",
      roles: [],
    })).toThrow()
  })

  it("rejects legacy snake-case-only giveaway responses", () => {
    expect(() => decode(Giveaway, {
      id: "giveaway-1",
      server_id: "123",
      prize: "Gold Pass",
      status: "ongoing",
      start: "2026-09-03T12:00:00Z",
      end: "2026-09-04T12:00:00Z",
      winners: 1,
      mentions: [],
      text_above_embed: "Enter now",
      text_in_embed: "Good luck",
      text_on_end: "Ended",
      profile_picture_required: false,
      coc_account_required: false,
      roles_mode: "none",
      roles: [],
      boosters: [],
      entries: [],
      winners_list: [],
      updated: false,
      created_at: "2026-09-03T12:00:00Z",
      updated_at: "2026-09-03T12:00:00Z",
    })).toThrow()
  })

  it("uses the plural server-clans removal path", () => {
    expect(RemoveServerClanEndpoint.path).toBe("/v2/server/:serverId/clans/:clanTag")
  })
})
