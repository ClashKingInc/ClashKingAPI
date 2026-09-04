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
const trackingEvents: unknown[] = []
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, DISCORD_BOT_TOKEN: "test-only", API_BOT_TOKEN: "test-only", TRACKING: { fetch: async (request: Request) => { trackingEvents.push(await request.json()); return Response.json({ published: true }) } } } as WorkerBindings
const layer = Layer.mergeAll(databaseLayer(bindings),
  Layer.succeed(DiscordApi, { request: (path) => Effect.succeed(path === "/users/@me" ? { id: "3334567890123456789" } : path === `/channels/${channelId}` ? { id: channelId, guild_id: serverId, type: 0 } : path === `/guilds/${serverId}/webhooks` ? [{ id: "4334567890123456789", type: 1, channel_id: channelId, user: { id: "3334567890123456789" } }] : path === "/webhooks/4334567890123456789" ? { id: "4334567890123456789", type: 1, channel_id: channelId } : []), token: () => Effect.die("Unexpected OAuth") }),
  Layer.succeed(DiscordCredentials, { accessToken: () => Effect.die("Unexpected credentials") }),
  Layer.succeed(ServerAuthorization, { require: () => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} }), resolve: () => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} }) }),
)
const execute = (endpoint: AnyEndpoint, body: unknown = {}, path: Readonly<Record<string, string>> = { serverId }) => executeDashboardServerCore({
  endpoint, body, path, query: {}, bindings, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing"),
})

describe("Dashboard server SQL against authoritative Goose schema", () => {
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
  it("round-trips giveaway multipart settings, weighted entries and reroll history", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Integration server') ON CONFLICT DO NOTHING`
      const body = new FormData()
      for (const [key,value] of Object.entries({ prize: "Gold Pass", channel_id: channelId, winners: "1", now: "true", end_time: "2099-10-01T12:00:00Z", roles_json: JSON.stringify([channelId]), boosters_json: JSON.stringify([{ value: 2, roles: [channelId] }]) })) body.set(key,value)
      const created = Schema.decodeUnknownSync(dashboardEndpoints.createServerGiveaway.response)(yield* execute(dashboardEndpoints.createServerGiveaway, body))
      const path = { serverId, giveawayId: created.giveawayId }
      body.set("prize","Updated Prize")
      yield* execute(dashboardEndpoints.updateServerGiveaway, body, path)
      const listed = Schema.decodeUnknownSync(dashboardEndpoints.serverGiveaways.response)(yield* execute(dashboardEndpoints.serverGiveaways))
      expect(listed.upcoming[0]).toMatchObject({ prize: "Updated Prize", channelId, roles: [channelId], updated: true })
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
      yield* execute(dashboardEndpoints.updateServerReminder, { custom_text: "Attack", point_threshold: 0, roles: [] }, path)
      const listed = Schema.decodeUnknownSync(dashboardEndpoints.serverReminders.response)(yield* execute(dashboardEndpoints.serverReminders))
      expect(listed.capital_reminders[0]).toMatchObject({ channel_id: channelId, clan_tag: "#P0Y", roles: [], point_threshold: 0, townhall_filter: [16,17], custom_text: "Attack" })
      const raw = yield* sql<{ minutes_remaining: number; data: { channel: string }; roles: string[] }>`SELECT minutes_remaining,data,roles FROM reminders WHERE id=${created.reminder_id}::uuid`
      expect(raw[0]?.minutes_remaining).toBe(90)
      expect(raw[0]?.data.channel).toBe(channelId)
      yield* execute(dashboardEndpoints.deleteServerReminder, {}, path)
      expect(trackingEvents.slice(-3)).toEqual(["created","updated","deleted"].map((action) => ({ clan_tag: "#P0Y", type: "Clan Capital", action, reminder_id: created.reminder_id })))
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
      for (const invalid of [[{ name: "", message: "Rejected" }], [...templates, { name: "26th", message: "Rejected" }],
        [{ name: "Duplicate", message: "One" }, { name: " Duplicate ", message: "Two" }], [{ name: "Too long", message: "x".repeat(2001) }]]) {
        expect(yield* execute(dashboardEndpoints.updateTicketApproveMessages, { messages: invalid }, panelPath).pipe(Effect.flip))
          .toMatchObject({ _tag: "InvalidRequest" })
      }
      yield* execute(dashboardEndpoints.updateTicketApproveMessages, { messages: templates }, panelPath)
      const saved = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels)).items.find((item) => item.name === panelName)
      expect(saved?.server_id).toBe(serverId)
      expect(saved?.open_category).toBe(channelId)
      expect(saved?.components[0]?.label).toBe("Join family")
      expect(saved?.button_settings[customId]).toMatchObject({ mod_role: [channelId], num_apply: 25, naming: "{ticket_count}-{user}", townhall_requirements: { "14": { BK: 60 } } })
      expect(saved?.approve_messages).toEqual(templates)
      yield* execute(dashboardEndpoints.deleteTicketButton, {}, buttonPath)
      const withoutButton = Schema.decodeUnknownSync(dashboardEndpoints.ticketPanels.response)(yield* execute(dashboardEndpoints.ticketPanels)).items.find((item) => item.name === panelName)
      expect(withoutButton?.components).toEqual([])
      expect(withoutButton?.button_settings).toEqual({})
      yield* execute(dashboardEndpoints.deleteTicketPanel, {}, panelPath)
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
      const ledger = yield* sql<{ resource_id: string }>`SELECT resource_id FROM discord_managed_resources WHERE resource_id='4334567890123456789'`
      expect(ledger).toHaveLength(0)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
