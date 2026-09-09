import { dashboardEndpoints, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { executeDashboardServerCore } from "../../src/dashboard-server-core.js"
import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { ServerAuthorization } from "../../src/server-authorization.js"
import type { WorkerBindings } from "../../src/environment.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const serverId = "1334567890123456789", channelId = "2334567890123456789"
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, DISCORD_BOT_TOKEN: "test-only", DISCORD_CLIENT_ID: "999", API_BOT_TOKEN: "test-only" } as WorkerBindings
const layer = Layer.mergeAll(databaseLayer(bindings),
  Layer.succeed(DiscordApi, { request: (path) => Effect.succeed(path === "/users/@me" ? { id: "3334567890123456789" } : path === `/channels/${channelId}` ? { id: channelId, guild_id: serverId, type: 0 } : path === `/guilds/${serverId}/webhooks` ? [{ id: "4334567890123456789", type: 1, channel_id: channelId, user: { id: "3334567890123456789" } }] : path === "/webhooks/4334567890123456789" ? { id: "4334567890123456789", type: 1, channel_id: channelId } : []), token: () => Effect.die("Unexpected OAuth") }),
  Layer.succeed(DiscordCredentials, { accessToken: () => Effect.die("Unexpected credentials") }),
  Layer.succeed(ServerAuthorization, { require: () => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} }), resolve: () => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} }) }),
)
const execute = (endpoint: AnyEndpoint, body: unknown = {}, path: Readonly<Record<string, string>> = { serverId }) => executeDashboardServerCore({
  endpoint, body, path, query: {}, bindings, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing"),
})

describe("Dashboard server SQL against authoritative Goose schema", () => {
  it("lists a bot-present guild without creating settings, then explicitly activates it", async () => {
    const discoveredServerId = "1334567890123456791"
    const discovered = { id: discoveredServerId, name: "New Discord server", owner: true, permissions: "8", features: [] }
    const principal = { kind: "user" as const, userId: "3334567890123456789" }
    const guildLayer = Layer.mergeAll(
      databaseLayer(bindings),
      Layer.succeed(DiscordApi, {
        request: (path) => path.startsWith("/users/@me/guilds") ? Effect.succeed([discovered]) : Effect.die(`Unexpected Discord request ${path}`),
        token: () => Effect.die("Unexpected OAuth"),
      }),
      Layer.succeed(DiscordCredentials, { accessToken: () => Effect.succeed("oauth-token") }),
      Layer.succeed(ServerAuthorization, {
        require: () => Effect.succeed({ principal, manager: true, sections: {} }),
        resolve: () => Effect.succeed({ principal, manager: true, sections: {} }),
      }),
    )
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const generation = "00000000-0000-4000-8000-000000000101"
      yield* sql`INSERT INTO discord_cache.gateway_shards (application_id, shard_id, shard_count, generation, healthy, heartbeat_at)
        VALUES (${bindings.DISCORD_CLIENT_ID}, 0, 1, ${generation}::uuid, true, now())`
      yield* sql`INSERT INTO discord_cache.guilds (id, data, application_id, shard_id, generation, available, metadata_complete, updated_at)
        VALUES (${discoveredServerId}, ${JSON.stringify(discovered)}::jsonb, ${bindings.DISCORD_CLIENT_ID}, 0, ${generation}::uuid, true, true, now())`
      const result = Schema.decodeUnknownSync(dashboardEndpoints.dashboardGuilds.response)(yield* executeDashboardServerCore({
        endpoint: dashboardEndpoints.dashboardGuilds, body: {}, path: {}, query: {}, bindings, principal,
        request: new Request("https://api.clashk.ing/v2/guilds"),
      }))
      expect(result).toEqual([expect.objectContaining({
        id: discoveredServerId, name: "New Discord server", has_bot: true, inactive: true,
      })])
      expect(result[0]).not.toHaveProperty("last_command_at")
      expect(yield* sql<{ id: string }>`SELECT id FROM servers WHERE id = ${discoveredServerId}`).toEqual([])
      yield* executeDashboardServerCore({
        endpoint: dashboardEndpoints.reactivateServer, body: {}, path: { serverId: discoveredServerId }, query: {}, bindings, principal,
        request: new Request(`https://api.clashk.ing/v2/server/${discoveredServerId}/reactivate`, { method: "POST" }),
      })
      expect(yield* sql<{ id: string; name: string; last_command_at: Date | null }>`
        SELECT id, name, last_command_at FROM servers WHERE id = ${discoveredServerId}
      `).toEqual([{ id: discoveredServerId, name: "New Discord server", last_command_at: expect.any(Date) }])
    }).pipe(Effect.provide(guildLayer), Effect.scoped))
  })

  it("defaults the linking token policy off and preserves it when omitted from partial settings updates", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const policyServerId="1334567890123456790",path={serverId:policyServerId}
      yield* sql`INSERT INTO servers (id,name) VALUES (${policyServerId},'Default-off linking policy')`
      const read=()=>execute(dashboardEndpoints.serverSettings,{},path).pipe(Effect.map(Schema.decodeUnknownSync(dashboardEndpoints.serverSettings.response)))
      expect((yield* read()).require_api_token_when_linking).toBe(false)
      yield* execute(dashboardEndpoints.updateServerSettings,{require_api_token_when_linking:true},path)
      expect((yield* read()).require_api_token_when_linking).toBe(true)
      yield* execute(dashboardEndpoints.updateServerSettings,{family_label:"Unrelated update"},path)
      expect((yield* read()).require_api_token_when_linking).toBe(true)
      expect(yield* execute(dashboardEndpoints.updateServerSettings,{require_api_token_when_linking:null},path).pipe(Effect.flip)).toMatchObject({_tag:"InvalidRequest"})
      expect((yield* read()).require_api_token_when_linking).toBe(true)
      yield* execute(dashboardEndpoints.updateServerSettings,{require_api_token_when_linking:false},path)
      expect((yield* read()).require_api_token_when_linking).toBe(false)
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
  it("repairs retained server logs without violating the nullable-scope unique key", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Integration server') ON CONFLICT DO NOTHING`
      yield* sql`INSERT INTO server_logs (server_id,clan_tag,type,webhook_id,disabled,disabled_reason)
        VALUES (${serverId},NULL,'reddit_feed','4334567890123456790',true,'Destination was deleted')`
      yield* execute(dashboardEndpoints.saveServerLogs, { channel_id: channelId, log_types: ["reddit_feed"] })
      const afterSave = yield* sql<{ disabled: boolean; disabled_reason: string | null }>`
        SELECT disabled,disabled_reason FROM server_logs WHERE server_id=${serverId} AND clan_tag IS NULL AND type='reddit_feed'`
      expect(afterSave).toEqual([{ disabled: false, disabled_reason: null }])
      yield* sql`UPDATE server_logs SET disabled=true,disabled_reason='Destination was deleted'
        WHERE server_id=${serverId} AND clan_tag IS NULL AND type='reddit_feed'`
      yield* execute(dashboardEndpoints.updateServerLogsState, { log_types: ["reddit_feed"], disabled: false })
      const afterEnable = yield* sql<{ disabled: boolean; disabled_reason: string | null }>`
        SELECT disabled,disabled_reason FROM server_logs WHERE server_id=${serverId} AND clan_tag IS NULL AND type='reddit_feed'`
      expect(afterEnable).toEqual([{ disabled: false, disabled_reason: null }])
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
  it("round-trips giveaway multipart settings, weighted entries and reroll history", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Integration server') ON CONFLICT DO NOTHING`
      const body = new FormData()
      for (const [key,value] of Object.entries({ prize: "Gold Pass", channel_id: channelId, winners: "1", now: "true", end_time: "2099-10-01T12:00:00Z", roles_json: JSON.stringify([channelId]), boosters_json: JSON.stringify([{ value: 2, roles: [channelId] }]) })) body.set(key,value)
      const created = Schema.decodeUnknownSync(dashboardEndpoints.createServerGiveaway.response)(yield* execute(dashboardEndpoints.createServerGiveaway, body))
      const path = { serverId, giveawayId: created.giveawayId }
      yield* sql`UPDATE giveaways SET disabled=true,disabled_reason='Destination was deleted' WHERE id=${created.giveawayId}`
      body.set("prize","Updated Prize")
      yield* execute(dashboardEndpoints.updateServerGiveaway, body, path)
      const listed = Schema.decodeUnknownSync(dashboardEndpoints.serverGiveaways.response)(yield* execute(dashboardEndpoints.serverGiveaways))
      expect(listed.upcoming[0]).toMatchObject({ prize: "Updated Prize", channelId, roles: [channelId], updated: true, disabled: false, disabled_reason: null })
      const single = Schema.decodeUnknownSync(dashboardEndpoints.serverGiveaway.response)(yield* execute(dashboardEndpoints.serverGiveaway, {}, path))
      expect(single.id).toBe(created.giveawayId)
      const otherId = "5334567890123456789"
      yield* sql`UPDATE giveaways SET status='ended',message_id='6334567890123456789',entries=${JSON.stringify([channelId,otherId,otherId])}::jsonb,winners_list=${JSON.stringify([{ user_id: channelId, status: "winner" }])}::jsonb WHERE id=${created.giveawayId}`
      const entries = Schema.decodeUnknownSync(dashboardEndpoints.giveawayEntries.response)(yield* execute(dashboardEndpoints.giveawayEntries,{},path))
      expect(entries.totalEntries).toBe(3)
      expect(entries.entrants[1]).toEqual({ userId: otherId, entries: 2, winChance: 66.67 })
      const rerolled = Schema.decodeUnknownSync(dashboardEndpoints.rerollGiveaway.response)(yield* execute(dashboardEndpoints.rerollGiveaway,{ user_ids_to_replace: [channelId] },path))
      expect(rerolled.newWinners).toEqual([otherId])
      const raw = yield* sql<{ winners_list: { user_id: string; status: string }[] }>`SELECT winners_list FROM giveaways WHERE id=${created.giveawayId}`
      expect(raw[0]?.winners_list[0]).toMatchObject({ user_id: channelId, status: "rerolled" })
      yield* execute(dashboardEndpoints.deleteServerGiveaway,{},path)
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
  it("creates, partially updates, lists and deletes reminders with exact IDs and post-commit events", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Integration server') ON CONFLICT DO NOTHING`
      const created = Schema.decodeUnknownSync(dashboardEndpoints.createServerReminder.response)(yield* execute(dashboardEndpoints.createServerReminder, { type: "Clan Capital", clan_tag: "poy", channel_id: channelId, time: "1.5hr", roles: ["leader", "coLeader"], townhall_filter: [16,17], point_threshold: 2000 }))
      expect(created.server_id).toBe(serverId)
      const path = { serverId, reminderId: created.reminder_id }
      yield* sql`UPDATE reminders SET disabled=true,disabled_reason='Destination was deleted' WHERE id=${created.reminder_id}::uuid`
      yield* execute(dashboardEndpoints.updateServerReminder, { custom_text: "Attack", point_threshold: 0, roles: [] }, path)
      const listed = Schema.decodeUnknownSync(dashboardEndpoints.serverReminders.response)(yield* execute(dashboardEndpoints.serverReminders))
      expect(listed.capital_reminders[0]).toMatchObject({ channel_id: channelId, clan_tag: "#P0Y", roles: [], point_threshold: 0, townhall_filter: [16,17], custom_text: "Attack", disabled: false, disabled_reason: null })
      const raw = yield* sql<{ minutes_remaining: number; data: { channel: string }; roles: string[] }>`SELECT minutes_remaining,data,roles FROM reminders WHERE id=${created.reminder_id}::uuid`
      expect(raw[0]?.minutes_remaining).toBe(90)
      expect(raw[0]?.data.channel).toBe(channelId)
      yield* execute(dashboardEndpoints.deleteServerReminder, {}, path)
      yield* execute(dashboardEndpoints.deleteServerReminder, {}, path).pipe(Effect.flip, Effect.map((failure) => expect(failure._tag).toBe("NotFound")))
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
  it("round-trips normalized settings, category order, roles, panel and embeds with exact IDs", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Integration server') ON CONFLICT DO NOTHING`
      yield* execute(dashboardEndpoints.updateServerSettings, { family_label: "Family", embed_color: 12345, autoeval: true, autoeval_triggers: ["townhall_change"] })
      const settings = Schema.decodeUnknownSync(dashboardEndpoints.serverSettings.response)(yield* execute(dashboardEndpoints.serverSettings))
      expect(settings.server_id).toBe(serverId)
      expect(settings.embed_color).toBe("12345")
      expect(settings.autoeval_triggers).toEqual(["townhall_change"])
      const category = Schema.decodeUnknownSync(dashboardEndpoints.createClanCategory.response)(yield* execute(dashboardEndpoints.createClanCategory, { name: "Competitive" })).category
      expect(category.serverId).toBe(serverId)
      yield* execute(dashboardEndpoints.renameClanCategory, { name: "CWL" }, { serverId, categoryId: category.id })
      const reordered = Schema.decodeUnknownSync(dashboardEndpoints.reorderClanCategories.response)(yield* execute(dashboardEndpoints.reorderClanCategories, { categoryIds: [category.id] }))
      expect(reordered.items[0]?.name).toBe("CWL")
      const role = Schema.decodeUnknownSync(dashboardEndpoints.createServerRole.response)(yield* execute(dashboardEndpoints.createServerRole, { type: "family", option: "family", role_id: channelId, mode: "both" })).role
      expect(role.server_id).toBe(serverId)
      expect(role.role_id).toBe(channelId)
      yield* execute(dashboardEndpoints.updateServerPanel, { buttons: ["Rules"], button_color: "Green", welcome_channel: channelId })
      const panel = Schema.decodeUnknownSync(dashboardEndpoints.serverPanel.response)(yield* execute(dashboardEndpoints.serverPanel))
      expect(panel.welcome_channel).toBe(channelId)
      yield* execute(dashboardEndpoints.createServerEmbed, { name: "Welcome", data: { content: "Hello", application_id: channelId } })
      const embeds = Schema.decodeUnknownSync(dashboardEndpoints.serverEmbeds.response)(yield* execute(dashboardEndpoints.serverEmbeds))
      expect(embeds.items[0]?.data.application_id).toBe(channelId)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("runs all nine ticket operations without losing Discord IDs or button settings", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Integration server') ON CONFLICT (id) DO NOTHING`
      const panelName = "Family applications", panelPath = { serverId, panelName }
      yield* execute(dashboardEndpoints.createTicketPanel, { name: panelName })
      yield* execute(dashboardEndpoints.createTicketButton, { label: "Apply", style: 1, emoji: { name: "⚔️" } }, panelPath)
      const first = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels))
      const customId = first.items.find((item) => item.name === panelName)?.components[0]?.custom_id
      if (customId === undefined) return yield* Effect.die(new Error("Ticket button was not persisted"))
      expect(customId).toMatch(/^Family applications_\d+$/)
      expect(first.items[0]).not.toHaveProperty("id")
      expect(first.items[0]?.components[0]).not.toHaveProperty("id")
      const buttonPath = { ...panelPath, customId }
      for (const roleField of ["mod_role","no_ping_mod_role"]) {
        const unsafeSettings={questions:[],mod_role:[],no_ping_mod_role:[],private_thread:false,th_min:0,num_apply:1,
          naming:"ticket-{user}",account_apply:false,player_info:false,apply_clans:[],roles_to_add:[],roles_to_remove:[],townhall_requirements:{},new_message:null,[roleField]:[serverId]}
        expect(yield* execute(dashboardEndpoints.updateTicketButtonSettings,unsafeSettings,buttonPath).pipe(Effect.flip)).toMatchObject({_tag:"InvalidRequest"})
      }
      yield* execute(dashboardEndpoints.updateTicketButtonAppearance, { label: "Join family", style: 3, emoji: null }, buttonPath)
      yield* execute(dashboardEndpoints.updateTicketPanel, { open_category: channelId, status_change_log: channelId, embed_name: "Welcome" }, panelPath)
      yield* execute(dashboardEndpoints.updateTicketButtonSettings, { questions: ["Why us?"], mod_role: [channelId], no_ping_mod_role: [], private_thread: true, th_min: 14, num_apply: 0, naming: "", account_apply: true, player_info: true, apply_clans: ["#P0Y"], roles_to_add: [channelId], roles_to_remove: [], townhall_requirements: { "14": { BK: 60 } }, new_message: null }, buttonPath)
      const templates = Array.from({ length: 25 }, (_, index) => ({ name: `Template ${index + 1}`, message: `Message ${index + 1}` }))
      yield* execute(dashboardEndpoints.updateTicketApproveMessages, { messages: [{ name: " ", message: "Skipped" }, ...templates] }, panelPath)
      const saved = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels)).items.find((item) => item.name === panelName)
      expect(saved?.server_id).toBe(serverId)
      expect(saved?.open_category).toBe(channelId)
      expect(saved?.components[0]?.label).toBe("Join family")
      expect(saved?.button_settings[customId]).toMatchObject({ mod_role: [channelId], num_apply: 25, naming: "{ticket_count}-{user}", townhall_requirements: { "14": { BK: 60 } } })
      expect(saved?.approve_messages).toEqual(templates.slice(0, 1))
      yield* execute(dashboardEndpoints.deleteTicketButton, {}, buttonPath)
      const withoutButton = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels)).items.find((item) => item.name === panelName)
      expect(withoutButton?.components).toEqual([])
      expect(withoutButton?.button_settings).toEqual({})
      yield* execute(dashboardEndpoints.deleteTicketPanel, {}, panelPath)
      expect(yield* sql`SELECT name FROM ticket_panels WHERE server_id=${serverId} AND name=${panelName} AND archived_at IS NULL`).toEqual([])
      // Archiving frees the active (server_id, name) identity for recreation.
      yield* execute(dashboardEndpoints.createTicketPanel, { name: panelName })
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("normalizes legacy ticket settings and emoji IDs before response validation", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const panelName = "Legacy applications", customId = "legacy_apply"
      yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Integration server') ON CONFLICT (id) DO NOTHING`
      yield* sql`INSERT INTO ticket_panels (id, server_id, name, components, data)
        VALUES (
          '00000000-0000-4000-8000-000000000201'::uuid,
          ${serverId},
          ${panelName},
          jsonb_build_array(
            jsonb_build_object(
              'id', '00000000-0000-4000-8000-000000000202',
              'custom_id', ${customId}::text,
              'label', 'Apply',
              'style', 1,
              'type', 2,
              'emoji', jsonb_build_object('id', 1234567890123456789::numeric, 'name', 'custom')
            ),
            jsonb_build_object(
              'id', '00000000-0000-4000-8000-000000000203',
              'custom_id', 'legacy_null_emoji',
              'label', 'Ask',
              'style', 2,
              'type', 2,
              'emoji', NULL
            )
          ),
          jsonb_build_object(
            ${`${customId}_settings`}::text,
            jsonb_build_object(
              'questions', NULL,
              'mod_role', ${channelId}::text,
              'apply_clans', NULL,
              'roles_to_add', NULL,
              'roles_to_remove', NULL,
              'townhall_requirements', NULL,
              'private_thread', false,
              'account_apply', false,
              'player_info', false
            ),
            'open-category', 3234567890123456789::numeric
          )
        )`

      const result = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels))
      const panel = result.items.find((item) => item.name === panelName)
      expect(panel?.components[0]?.emoji?.id).toBe("1234567890123456789")
      expect(panel?.components[1]).not.toHaveProperty("emoji")
      expect(panel?.open_category).toBe("3234567890123456789")
      expect(panel?.button_settings[customId]).toMatchObject({
        questions: [],
        mod_role: [channelId],
        apply_clans: [],
        roles_to_add: [],
        roles_to_remove: [],
        townhall_requirements: {},
      })
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("creates, lists, replaces and deletes autoboards with normalized targets and nullable SQL weekdays", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name, autoboard_limit) VALUES (${serverId}, 'Integration server', 10) ON CONFLICT (id) DO UPDATE SET autoboard_limit=10`
      const capabilities = Schema.decodeUnknownSync(dashboardEndpoints.autoboardCapabilities.response)(yield* execute(dashboardEndpoints.autoboardCapabilities))
      expect(capabilities.boardTypes).toHaveLength(5)
      const created = Schema.decodeUnknownSync(dashboardEndpoints.createAutoboard.response)(yield* execute(dashboardEndpoints.createAutoboard, { boardType: "sample-family-overview", targetScope: "family", targets: [], deliveryMode: "send", channelId, enabled: true, intervalMinutes: null, schedule: { kind: "daily", timeOfDay: "12:00", weekdays: null } })).item
      expect(created.channelId).toBe(channelId)
      const raw = yield* sql<{ schedule_weekdays: ReadonlyArray<number> | null }>`SELECT schedule_weekdays FROM autoboards WHERE id=${created.id}::uuid`
      expect(raw[0]?.schedule_weekdays).toBeNull()
      const replaced = Schema.decodeUnknownSync(dashboardEndpoints.replaceAutoboard.response)(yield* execute(dashboardEndpoints.replaceAutoboard, { boardType: "sample-clan-activity", targetScope: "custom", targets: [" #P0Y ", "#P0Y", "#Q0Y"], deliveryMode: "refresh", channelId, enabled: false, intervalMinutes: 15, schedule: null }, { serverId, autoboardId: created.id })).item
      expect(replaced.targets).toEqual(["#P0Y", "#Q0Y"])
      expect(replaced.nextRunAt).toBeNull()
      const listed = Schema.decodeUnknownSync(dashboardEndpoints.serverAutoboards.response)(yield* execute(dashboardEndpoints.serverAutoboards))
      expect(listed.refreshCount).toBe(1)
      expect(listed.sendCount).toBe(0)
      yield* execute(dashboardEndpoints.deleteAutoboard, {}, { serverId, autoboardId: created.id })
      const targets = yield* sql<{ target: string }>`SELECT target FROM autoboard_targets WHERE autoboard_id=${created.id}::uuid`
      expect(targets).toHaveLength(0)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
