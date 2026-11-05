import { DecimalSnowflake, TicketButton, TicketButtonSettings, TicketPanelMessage, TicketPanelActivity, TicketMessageTemplates, dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { lockServerDiscordResources } from "./discord-managed-resources.js"
import { ticketPanelActionsError } from "./ticket-panel-actions.js"
import { ticketTemplateQuestionError } from "./ticket-rich-template.js"
import { ticketQuestionError } from "./ticket-application-form.js"
import { ticketStatusLogChannel } from "./ticket-log-settings.js"
import { executeTicketDashboardAction } from "./ticket-dashboard-jobs.js"
import { DiscordApi } from "./discord-api.js"
import { publishDashboardTicketPanel } from "./ticket-panel-publications.js"
import { Forbidden, Conflict, DatabaseFailure, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"

export const dashboardTicketOperationIds = ["publishTicketPanel", "ticketPanels", "ticketDashboardAction", "ticketDashboardJob", "ticketMessageLibrary", "updateTicketMessageLibrary", "createTicketPanel", "deleteTicketPanel", "createTicketButton", "deleteTicketButton", "updateTicketButtonAppearance", "updateTicketPanel", "updateTicketButtonSettings", "updateTicketApproveMessages"] as const
const JsonObject = Schema.JsonObject
type Button = Schema.Schema.Type<typeof TicketButton>
const StoredTicketButton = Schema.Struct({ id: Schema.String, ...TicketButton.fields })
type StoredButton = Schema.Schema.Type<typeof StoredTicketButton>
interface PanelRow { readonly id: string; readonly name: string; readonly server_id: string; readonly components: unknown; readonly data: unknown; readonly updated_at: string }
const text = (value: unknown): string => typeof value === "string" ? value : ""
const optional = (key: string, value: unknown) => value === undefined || value === null ? {} : { [key]: value }
const stored = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Stored ticket configuration failed schema validation" })))
const requestBody = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new InvalidRequest({ message: "Ticket request failed schema validation" })))
const categoryFields = { open_category: "open-category", sleep_category: "sleep-category", closed_category: "closed-category", status_change_log: "status_change_log", ticket_button_click_log: "ticket_button_click_log" } as const
const emptySettings = { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false, th_min: 0, num_apply: 1, naming: "", account_apply: false, player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [], townhall_requirements: {} } as const
const listSettingFields = ["questions", "mod_role", "no_ping_mod_role", "apply_clans", "roles_to_add", "roles_to_remove"] as const
const normalizedPanelColumns = `panel.id::text,panel.server_id,panel.name,panel.updated_at::text,COALESCE((
  SELECT jsonb_agg(CASE
    WHEN component.value->'emoji' = 'null'::jsonb THEN component.value - 'emoji'::text
    WHEN jsonb_typeof(component.value->'emoji') = 'object' THEN jsonb_set(component.value,'{emoji}',CASE
      WHEN component.value->'emoji'->'id' = 'null'::jsonb THEN (component.value->'emoji') - 'id'::text
      WHEN jsonb_typeof(component.value->'emoji'->'id') = 'number' THEN jsonb_set(component.value->'emoji','{id}',to_jsonb(component.value->'emoji'->>'id'))
      ELSE component.value->'emoji' END)
    ELSE component.value END ORDER BY component.ordinality)
  FROM jsonb_array_elements(panel.components) WITH ORDINALITY component(value,ordinality)
),'[]'::jsonb) AS components,COALESCE((
  SELECT jsonb_object_agg(entry.key,CASE
    WHEN entry.key IN ('open-category','sleep-category','closed-category','status_change_log','ticket_button_click_log','ticket_close_log')
      AND jsonb_typeof(entry.value) = 'number' THEN to_jsonb(entry.value #>> '{}')
    ELSE entry.value END)
  FROM jsonb_each(panel.data) entry
),'{}'::jsonb) AS data`

const normalizeStoredSettings = (saved: Record<string, Schema.Json>) => {
  const normalized: Record<string, unknown> = { ...emptySettings, ...saved }
  for (const field of listSettingFields) {
    const value = saved[field]
    if (value === null) normalized[field] = []
    else if (typeof value === "string") normalized[field] = [value]
  }
  if (saved.townhall_requirements === null) normalized.townhall_requirements = {}
  normalized.num_apply = 1
  normalized.apply_clans = []
  normalized.townhall_requirements = {}
  return normalized
}

const approvalMessages = (messages: ReadonlyArray<{ readonly name: string; readonly message: string }>) =>
  messages.filter(message => message.name.trim() !== "")

const panelValue = (row: PanelRow) => Effect.gen(function* () {
  const data = yield* stored(JsonObject, row.data)
  const storedComponents = yield* stored(Schema.Array(StoredTicketButton), row.components)
  const components: ReadonlyArray<Button> = storedComponents.map(({ id: _id, ...button }) => button)
  const settings: Record<string, Schema.Schema.Type<typeof TicketButtonSettings>> = {}
  for (const [key, value] of Object.entries(data)) if (key.endsWith("_settings")) {
    const saved = yield* stored(JsonObject, value)
    settings[key.slice(0, -"_settings".length)] = yield* stored(TicketButtonSettings, normalizeStoredSettings(saved))
  }
  const messages = Array.isArray(data.approve_messages) ? data.approve_messages : []
  const decoded = yield* stored(dashboardEndpoints.updateTicketApproveMessages.body, { messages })
  const categories = Object.fromEntries(Object.entries(categoryFields).flatMap(([output, source]) => data[source] === undefined || data[source] === null ? [] : [[output, data[source]]]))
  const statusLog = ticketStatusLogChannel(data)
  if (statusLog) categories.status_change_log = statusLog
  const panelMessage = data.panel_message == null ? undefined : yield* stored(TicketPanelMessage, data.panel_message)
  const sql = yield* SqlClient.SqlClient
  const publication = (yield* sql<{ channel_id: string; message_id: string; source_updated_at: string }>`SELECT channel_id,message_id,source_updated_at::text FROM ticket_panel_publications WHERE panel_id=${row.id}::uuid AND state='active'`)[0]
  return { draftUpdatedAt: row.updated_at, publication: publication ? { channelId: publication.channel_id, messageId: publication.message_id, sourceUpdatedAt: publication.source_updated_at } : null, name: row.name, server_id: row.server_id, components, button_settings: settings, ...optional("embed_name", data.embed_name), ...optional("panel_message", panelMessage), ...categories,
    applicant_can_close: data.applicant_can_close === true, transcripts_enabled: data.transcripts_enabled !== false, approve_messages: approvalMessages(decoded.messages) }
})

export const executeDashboardTickets = (input: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = text(input.path.serverId), operation = input.endpoint.operationId
  if (operation === "ticketDashboardAction" || operation === "ticketDashboardJob") return yield* executeTicketDashboardAction(input)
  if (operation === "ticketMessageLibrary") {
    const row = (yield* sql<{ templates: unknown; revision: string }>`SELECT templates,updated_at::text AS revision FROM ticket_message_libraries WHERE server_id=${serverId}`)[0]
    return { items: yield* stored(TicketMessageTemplates, row?.templates ?? []), revision: row?.revision ?? null }
  }
  if (operation === "updateTicketMessageLibrary") {
    const body = yield* Schema.decodeUnknownEffect(dashboardEndpoints.updateTicketMessageLibrary.body)(input.body, { onExcessProperty: "error" }).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid shared message library" })))
    if (new TextEncoder().encode(JSON.stringify(body.items)).byteLength > 450000) return yield* new InvalidRequest({ message: "The shared message library is too large" })
    for (const template of body.items) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(template.id)) return yield* new InvalidRequest({ message: "Invalid message template identity" })
      const questionError = ticketTemplateQuestionError(template)
      if (questionError) return yield* new InvalidRequest({ message: questionError })
    }
    yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServerDiscordResources(serverId)
      const current = (yield* sql<{ revision: string }>`SELECT updated_at::text AS revision FROM ticket_message_libraries WHERE server_id=${serverId} FOR UPDATE`)[0]
      if ((current?.revision ?? null) !== body.expected_revision) return yield* new Conflict({ message: "Message library changed; reload before saving" })
      yield* sql`INSERT INTO ticket_message_libraries(server_id,templates) VALUES(${serverId},${JSON.stringify(body.items)}::jsonb)
        ON CONFLICT(server_id) DO UPDATE SET templates=excluded.templates,updated_at=clock_timestamp()`
    }))
    return { message: "Message library saved" }
  }
  if (operation === "publishTicketPanel") {
    if (input.principal.kind !== "user") return yield* new Forbidden({ message: "A dashboard user session is required" })
    const body = yield* requestBody(dashboardEndpoints.publishTicketPanel.body, input.body)
    return yield* publishDashboardTicketPanel(serverId, text(input.path.panelName), input.principal.userId, body.nonce, body.expectedUpdatedAt, body.channelId)
  }
  if (operation === "ticketPanels") {
    const rows = yield* sql.unsafe<PanelRow>(`SELECT ${normalizedPanelColumns} FROM ticket_panels panel WHERE panel.server_id=$1 AND panel.archived_at IS NULL ORDER BY panel.name`, [serverId])
    const embeds = yield* sql<{ name: string }>`SELECT name FROM server_custom_embeds WHERE server_id = ${serverId} AND name <> '' ORDER BY name`
    // Totals cover all history; only the detailed list is bounded. The join to
    // panels and server predicate keep applicant data in the authorized guild.
    const activities = yield* sql<{ panel_id: string; activity: unknown }>`
      WITH history AS (
        SELECT t.* FROM tickets t JOIN ticket_panels p ON p.id=t.panel_id AND p.server_id=t.server_id
        WHERE t.server_id=${serverId} AND p.archived_at IS NULL
      ), ranked AS (
        SELECT h.*,row_number() OVER (PARTITION BY panel_id ORDER BY created_at DESC,id DESC) AS position FROM history h
      ), accounts AS (
        SELECT h.id,h.panel_id,a.tag,COALESCE(snapshot.value->>'name',player.name) AS name,(snapshot.value->>'townhall_level')::integer AS townhall_level
        FROM history h CROSS JOIN LATERAL unnest(h.applicant_accounts) a(tag)
        LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(h.application_accounts) WHERE value->>'tag'=a.tag LIMIT 1) snapshot ON true
        LEFT JOIN basic_player player ON player.tag=a.tag
      ), townhalls AS (
        SELECT a.panel_id,a.townhall_level AS level,count(*)::integer AS count FROM accounts a
        GROUP BY a.panel_id,a.townhall_level
      )
      SELECT p.id::text AS panel_id,jsonb_build_object(
        'total',count(h.id),'open',count(h.id) FILTER (WHERE h.status='open'),
        'sleeping',count(h.id) FILTER (WHERE h.status='sleep' OR (h.status='closed' AND h.conversation_deleted_at IS NULL)),
        'closed',count(h.id) FILTER (WHERE h.status='closed' AND h.conversation_deleted_at IS NOT NULL),
        'deleted',count(h.id) FILTER (WHERE h.status='delete'),'applicants',count(DISTINCT h.applicant_user_id),
        'accounts',(SELECT count(*) FROM accounts a WHERE a.panel_id=p.id),
        'townhalls',COALESCE((SELECT jsonb_agg(jsonb_build_object('level',th.level,'count',th.count) ORDER BY th.level DESC NULLS LAST)
          FROM townhalls th WHERE th.panel_id=p.id),'[]'::jsonb),
        'recent',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'status',CASE WHEN r.status='closed' AND r.conversation_deleted_at IS NULL THEN 'sleep' ELSE r.status END,
          'channel_id',r.channel_id,'applicant_user_id',r.applicant_user_id,'created_at',r.created_at,'closed_at',r.closed_at,
          'applicant_username',COALESCE(member.data->>'nick',member.data->'user'->>'global_name',member.data->'user'->>'username',
            (SELECT context->>'actorLabel' FROM ticket_runtime_operations WHERE ticket_id=r.id AND server_id=r.server_id AND action='open' ORDER BY created_at LIMIT 1)),
          'applicant_avatar_url',CASE WHEN member.data->>'avatar' IS NOT NULL THEN
            'https://cdn.discordapp.com/guilds/'||r.server_id||'/users/'||r.applicant_user_id||'/avatars/'||(member.data->>'avatar')||'.png'
            WHEN member.data->'user'->>'avatar' IS NOT NULL THEN
            'https://cdn.discordapp.com/avatars/'||r.applicant_user_id||'/'||(member.data->'user'->>'avatar')||'.png' ELSE NULL END,
          'active_job_id',(SELECT job.id FROM ticket_dashboard_jobs job WHERE job.ticket_id=r.id AND job.server_id=r.server_id AND job.state IN ('pending','running') ORDER BY job.created_at LIMIT 1),
          'assigned_clan_tag',r.assigned_clan_tag,'transcript_path',(SELECT job.result->>'transcript_path' FROM ticket_dashboard_jobs job
            WHERE job.ticket_id=r.id AND job.server_id=r.server_id AND job.action IN ('capture_transcript','delete_ticket') AND job.state='completed' AND job.result->>'transcript_path' IS NOT NULL ORDER BY job.created_at DESC LIMIT 1),
          'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'tag',a.tag,'name',a.name,'townhall_level',a.townhall_level) ORDER BY a.tag)
            FROM accounts a WHERE a.id=r.id),'[]'::jsonb))
          ORDER BY r.created_at DESC,r.id DESC) FROM ranked r
          LEFT JOIN discord_cache.guilds guild ON guild.id=r.server_id AND guild.available AND guild.metadata_complete AND guild.members_complete
          LEFT JOIN discord_cache.gateway_shards shard ON shard.application_id=guild.application_id AND shard.shard_id=guild.shard_id
            AND shard.generation=guild.generation AND shard.healthy AND shard.heartbeat_at>now()-interval '45 seconds'
          LEFT JOIN discord_cache.members member ON member.guild_id=r.server_id AND member.user_id=r.applicant_user_id AND shard.application_id IS NOT NULL
          WHERE r.panel_id=p.id AND r.position<=100),'[]'::jsonb)
      ) AS activity FROM ticket_panels p LEFT JOIN history h ON h.panel_id=p.id
      WHERE p.server_id=${serverId} AND p.archived_at IS NULL GROUP BY p.id`
    const byPanel = new Map(activities.map(row => [row.panel_id,row.activity]))
    return { items: yield* Effect.forEach(rows, row => Effect.gen(function* () {
      return { ...yield* panelValue(row), activity: yield* stored(TicketPanelActivity, byPanel.get(row.id)) }
    })), total: rows.length, available_embeds: embeds.map((row) => row.name), townhall_requirement_fields: ["BK", "AQ", "GW", "RC", "WARST"] }
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    if (operation === "createTicketPanel") {
      const body = yield* requestBody(dashboardEndpoints.createTicketPanel.body, input.body), name = body.name.trim()
      if (name === "") return yield* new InvalidRequest({ message: "Panel name cannot be empty" })
      const rows = yield* sql<{ name: string }>`INSERT INTO ticket_panels(server_id,name,components,data) VALUES(${serverId},${name},'[]'::jsonb,'{}'::jsonb) ON CONFLICT(server_id,name) WHERE archived_at IS NULL DO NOTHING RETURNING name`
      if (rows.length === 0) return yield* new Conflict({ message: "A panel with this name already exists" })
      return { message: "Panel created successfully" }
    }
    const name = text(input.path.panelName)
    if (operation === "deleteTicketPanel") {
      const rows = yield* sql<{ name: string }>`UPDATE ticket_panels SET archived_at=now(),updated_at=now() WHERE server_id=${serverId} AND name=${name} AND archived_at IS NULL RETURNING name`
      if (rows.length === 0) return yield* new NotFound({ message: "Panel not found" })
      return { message: "Panel deleted successfully" }
    }
    const rows = yield* sql.unsafe<PanelRow>(`SELECT ${normalizedPanelColumns} FROM ticket_panels panel WHERE panel.server_id=$1 AND panel.name=$2 AND panel.archived_at IS NULL FOR UPDATE`, [serverId,name])
    const row = rows[0]
    if (row === undefined) return yield* new NotFound({ message: "Panel not found" })
    const parsed = yield* stored(JsonObject, row.data), data: Record<string, Schema.Json> = { ...parsed }
    let components: ReadonlyArray<StoredButton> = yield* stored(Schema.Array(StoredTicketButton), row.components)
    const customId = text(input.path.customId)
    if (customId && !components.some(button => button.custom_id === customId)) {
      return yield* new NotFound({ message: "Ticket button not found" })
    }
    let message: string
    switch (operation) {
      case "createTicketButton": {
        const body = yield* requestBody(dashboardEndpoints.createTicketButton.body, input.body)
        if (components.length >= 5) return yield* new InvalidRequest({ message: "A panel can have at most 5 buttons" })
        const id = crypto.randomUUID(), custom_id = `ck:ticket:open:${row.id}:${id}`
        components = [...components, { id,type:2,custom_id,style:body.style,label:body.label,...(body.emoji == null ? {} : { emoji:body.emoji }) }]
        data[`${custom_id}_settings`] = { ...emptySettings, naming: "{ticket_count}-{user}" }
        message = "Button added successfully"
        break
      }
      case "deleteTicketButton":
        components = components.filter((button) => button.custom_id !== customId)
        delete data[`${customId}_settings`]
        message = "Button deleted successfully"
        break
      case "updateTicketButtonAppearance": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketButtonAppearance.body, input.body)
        components = components.map((button) => button.custom_id !== customId ? button : { id: button.id, custom_id: button.custom_id, type: button.type, style: body.style, label: body.label, ...(body.emoji == null ? {} : { emoji: body.emoji }) })
        message = "Button appearance updated successfully"
        break
      }
      case "updateTicketPanel": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketPanel.body, input.body)
        for (const [field, storedField] of Object.entries(categoryFields)) {
          const value = body[field as keyof typeof categoryFields]
          if (value === undefined) continue
          if (value === null || value === "") delete data[storedField]
          else data[storedField] = yield* requestBody(DecimalSnowflake, value)
        }
        // Accept old clients, but persist only the single canonical setting.
        if (body.status_change_log !== undefined || body.ticket_close_log !== undefined) {
          const value = body.status_change_log !== undefined ? body.status_change_log : body.ticket_close_log
          if (value === null || value === "") delete data.status_change_log
          else data.status_change_log = yield* requestBody(DecimalSnowflake, value)
          delete data.ticket_close_log
        }
        if (body.transcripts_enabled !== undefined) data.transcripts_enabled = body.transcripts_enabled
        if (body.applicant_can_close !== undefined) data.applicant_can_close = body.applicant_can_close
        if (body.embed_name !== undefined) {
          if (body.embed_name === null || body.embed_name === "") delete data.embed_name
          else data.embed_name = body.embed_name
        }
        if (body.panel_message !== undefined) {
          if (body.panel_message === null) delete data.panel_message
          else {
            // Decode the original nested value strictly: do not silently drop
            // user-supplied components, mention policies or webhook identity.
            const original = (input.body as Record<string, unknown>).panel_message
            const native = yield* Schema.decodeUnknownEffect(TicketPanelMessage)(original, { onExcessProperty: "error" }).pipe(
              Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket panel message" })))
            const actionError = ticketPanelActionsError(row.id, native.components, components)
            if (actionError) return yield* new InvalidRequest({ message: actionError })
            data.panel_message = yield* requestBody(JsonObject, native)
            delete data.embed_name
          }
        }
        message = "Panel updated successfully"
        break
      }
      case "updateTicketButtonSettings": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketButtonSettings.body, input.body)
        const questionError = ticketQuestionError(body)
        if (questionError) return yield* new InvalidRequest({ message: questionError })
        if (body.opening_message != null) yield* Schema.decodeUnknownEffect(TicketPanelMessage)(
          (input.body as Record<string, unknown>).opening_message, { onExcessProperty: "error" }).pipe(
            Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket opening message" })))
        for (const roleId of [...body.mod_role, ...body.no_ping_mod_role, ...body.roles_to_add, ...body.roles_to_remove]) yield* requestBody(DecimalSnowflake, roleId)
        if ([...body.mod_role,...body.no_ping_mod_role].includes(serverId)) return yield* new InvalidRequest({message:"The everyone role cannot be configured as ticket staff"})
        if (!Number.isSafeInteger(body.th_min) || body.th_min < 0 || body.th_min > 18) return yield* new InvalidRequest({ message: "Invalid minimum Town Hall" })
        data[`${customId}_settings`] = { ...body, naming: body.naming || "{ticket_count}-{user}", num_apply: 1,
          apply_clans: [], townhall_requirements: {}, hero_min_percent: body.account_apply ? body.hero_min_percent ?? 0 : 0,
          th_min: body.account_apply ? body.th_min : 0, player_info: body.account_apply && body.player_info }
        message = "Button settings updated successfully"
        break
      }
      case "updateTicketApproveMessages": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketApproveMessages.body, input.body)
        data.approve_messages = approvalMessages(body.messages)
        message = "Approve messages updated successfully"
        break
      }
      default: return yield* Effect.die(new Error(`Unexpected ticket operation ${operation}`))
    }
    yield* sql`UPDATE ticket_panels SET components = ${JSON.stringify(components)}::jsonb, data = ${JSON.stringify(data)}::jsonb, updated_at = now() WHERE id = ${row.id}::uuid`
    return { message }
  }))
}).pipe(Effect.mapError((cause) => cause instanceof Conflict || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Ticket configuration operation failed" })))
